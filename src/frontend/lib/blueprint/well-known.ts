/**
 * Smart-widget matching for well-known stdlib types.
 *
 * Matching is keyed on the qualified definition name reached through $ref
 * resolution, with aliases covering both stdlib generations (v1 "aiken/..."
 * and v2 "cardano/..."). Every match also performs a structural shape check;
 * on mismatch the caller falls back to the generic form. Widgets FILL the
 * schema (via the build* helpers below) — they never emit hardcoded CBOR.
 *
 * `Value` is intentionally not matched (opaque, too easy to get wrong).
 */

import type { BlueprintSchema, BlueprintDefinitions, FormValue } from "./types";
import {
  classifySchema,
  type ClassifiedSchema,
  type ConstructorVariant,
} from "./schema";

export type WellKnownMatch =
  | { widget: "address" }
  | { widget: "output-reference"; txIdNested: boolean }
  | { widget: "posix-time" }
  | { widget: "hash-bytes"; expectedBytes: number; label: string };

const ADDRESS_NAMES = new Set([
  "cardano/address/Address",
  "aiken/transaction/credential/Address",
]);

const OUTPUT_REFERENCE_NAMES = new Set([
  "cardano/transaction/OutputReference",
  "aiken/transaction/OutputReference",
]);

/** last path segment of a definitions key */
function lastSegment(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1];
}

function isSingleVariant(
  c: ClassifiedSchema,
  fieldCount: number
): ConstructorVariant | null {
  if (c.kind !== "constructor" || c.variants.length !== 1) return null;
  const v = c.variants[0];
  return v.fields.length === fieldCount ? v : null;
}

/** Credential-shaped: two constructors, each wrapping a single bytes field. */
function isCredentialShape(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions
): boolean {
  const c = classifySchema(schema, definitions);
  if (c.kind !== "constructor" || c.variants.length !== 2) return false;
  return c.variants.every(
    (v) =>
      v.fields.length === 1 &&
      classifySchema(v.fields[0].schema, definitions).kind === "bytes"
  );
}

/** Option-shaped: Some(x) at index 0 with one field, None at index 1 with none. */
function optionVariants(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions
): { some: number; none: number; someSchema: BlueprintSchema } | null {
  const c = classifySchema(schema, definitions);
  if (c.kind !== "constructor" || c.variants.length !== 2) return null;
  const somePos = c.variants.findIndex((v) => v.fields.length === 1);
  const nonePos = c.variants.findIndex((v) => v.fields.length === 0);
  if (somePos < 0 || nonePos < 0) return null;
  return {
    some: somePos,
    none: nonePos,
    someSchema: c.variants[somePos].fields[0].schema,
  };
}

export function matchWellKnown(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions
): WellKnownMatch | null {
  const classified = classifySchema(schema, definitions);
  const refName = classified.refName;
  if (!refName) return null;

  // Address
  if (ADDRESS_NAMES.has(refName)) {
    const v = isSingleVariant(classified, 2);
    if (
      v &&
      isCredentialShape(v.fields[0].schema, definitions) &&
      optionVariants(v.fields[1].schema, definitions) !== null
    ) {
      return { widget: "address" };
    }
    return null;
  }

  // OutputReference — both shapes: alpha nested TransactionId wrapper vs flat bytes
  if (OUTPUT_REFERENCE_NAMES.has(refName)) {
    const v = isSingleVariant(classified, 2);
    if (!v) return null;
    const txId = classifySchema(v.fields[0].schema, definitions);
    const index = classifySchema(v.fields[1].schema, definitions);
    if (index.kind !== "integer") return null;
    if (txId.kind === "bytes") return { widget: "output-reference", txIdNested: false };
    const wrapper = isSingleVariant(txId, 1);
    if (wrapper && classifySchema(wrapper.fields[0].schema, definitions).kind === "bytes") {
      return { widget: "output-reference", txIdNested: true };
    }
    return null;
  }

  const short = lastSegment(refName);

  // POSIXTime (integer milliseconds)
  if (
    (short === "PosixTime" || short === "POSIXTime") &&
    classified.kind === "integer"
  ) {
    return { widget: "posix-time" };
  }

  // Script/credential hashes — length hints on bytes fields
  if (classified.kind === "bytes") {
    if (
      short === "ScriptHash" ||
      short === "VerificationKeyHash" ||
      short === "PubKeyHash" ||
      short === "PolicyId" ||
      refName.includes("Blake2b_224")
    ) {
      return { widget: "hash-bytes", expectedBytes: 28, label: short };
    }
    if (
      short === "TransactionId" ||
      short === "DataHash" ||
      refName.includes("Blake2b_256")
    ) {
      return { widget: "hash-bytes", expectedBytes: 32, label: short };
    }
  }

  return null;
}

export interface DecodedAddress {
  paymentHashHex: string;
  paymentIsScript: boolean;
  stakeHashHex?: string;
  stakeIsScript?: boolean;
}

/**
 * Fill an Address schema from decoded bech32 parts. Walks the actual schema
 * (works for both stdlib generations); returns null when the shape diverges.
 */
export function buildAddressFormValue(
  decoded: DecodedAddress,
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions
): FormValue | null {
  const classified = classifySchema(schema, definitions);
  const addressVariant = isSingleVariant(classified, 2);
  if (!addressVariant) return null;

  const credentialValue = (
    credSchema: BlueprintSchema,
    hashHex: string,
    isScript: boolean
  ): FormValue | null => {
    const c = classifySchema(credSchema, definitions);
    if (c.kind !== "constructor" || c.variants.length !== 2) return null;
    // VerificationKey = constructor index 0, Script = index 1 in both stdlibs
    const wantedIndex = isScript ? 1 : 0;
    const pos = c.variants.findIndex(
      (v) => v.index === wantedIndex && v.fields.length === 1
    );
    if (pos < 0) return null;
    return {
      kind: "constr",
      variant: pos,
      fields: [{ kind: "bytes", mode: "hex", text: hashHex }],
    };
  };

  const payment = credentialValue(
    addressVariant.fields[0].schema,
    decoded.paymentHashHex,
    decoded.paymentIsScript
  );
  if (!payment) return null;

  const option = optionVariants(addressVariant.fields[1].schema, definitions);
  if (!option) return null;

  let stake: FormValue;
  if (decoded.stakeHashHex === undefined) {
    stake = { kind: "constr", variant: option.none, fields: [] };
  } else {
    // Some(x) — x is either Referenced<Credential> (Inline/Pointer) or a
    // bare Credential, depending on stdlib generation.
    const inner = option.someSchema;
    let stakeInner: FormValue | null = null;
    if (isCredentialShape(inner, definitions)) {
      stakeInner = credentialValue(
        inner,
        decoded.stakeHashHex,
        decoded.stakeIsScript === true
      );
    } else {
      const referenced = classifySchema(inner, definitions);
      if (referenced.kind === "constructor") {
        // Inline = constructor index 0 with a single Credential field
        const inlinePos = referenced.variants.findIndex(
          (v) => v.index === 0 && v.fields.length === 1
        );
        if (inlinePos >= 0) {
          const cred = credentialValue(
            referenced.variants[inlinePos].fields[0].schema,
            decoded.stakeHashHex,
            decoded.stakeIsScript === true
          );
          if (cred) {
            stakeInner = { kind: "constr", variant: inlinePos, fields: [cred] };
          }
        }
      }
    }
    if (!stakeInner) return null;
    stake = { kind: "constr", variant: option.some, fields: [stakeInner] };
  }

  return { kind: "constr", variant: 0, fields: [payment, stake] };
}

/**
 * Fill an OutputReference schema (either shape) from tx hash + output index.
 */
export function buildOutputReferenceFormValue(
  txHashHex: string,
  outputIndex: string,
  txIdNested: boolean
): FormValue {
  const txIdValue: FormValue = txIdNested
    ? {
        kind: "constr",
        variant: 0,
        fields: [{ kind: "bytes", mode: "hex", text: txHashHex }],
      }
    : { kind: "bytes", mode: "hex", text: txHashHex };
  return {
    kind: "constr",
    variant: 0,
    fields: [txIdValue, { kind: "int", text: outputIndex }],
  };
}
