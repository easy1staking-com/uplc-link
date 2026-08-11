/**
 * FormValue -> Evolution `Data` / raw-constant encoding.
 *
 * Integers are BigInt end-to-end (never parseInt/parseFloat). Data-level
 * parameters become Evolution `Data` values; `#`-typed parameters become
 * tagged raw-constant payloads applied as UPLC constant terms.
 *
 * CBOR hex for display / registry storage is produced with
 * BACKEND_CBOR_OPTIONS (byte-identity with the registry metadata format).
 * Script application never goes through these bytes — the `Data` values are
 * handed to UPLC application directly, which uses Evolution's default
 * Aiken-compatible encoding.
 */

import * as Data from "@evolution-sdk/evolution/Data";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import * as CBOR from "@evolution-sdk/evolution/CBOR";
import type * as UPLC from "@evolution-sdk/evolution/UPLC";
import { BACKEND_CBOR_OPTIONS } from "@/lib/cardano/metadata-encoder";
import type { BlueprintSchema, BlueprintDefinitions, FormValue } from "./types";
import { classifySchema } from "./schema";

/** A fully-encoded parameter, ready for script application. */
export type ParamPayload =
  | { kind: "data"; data: Data.Data }
  | { kind: "raw"; type: UPLC.DataType; value: UPLC.ConstantValue };

export class EncodeError extends Error {
  /** Path into the form tree, e.g. "utxo / transaction_id" */
  readonly path: string;
  constructor(path: string, message: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = "EncodeError";
    this.path = path;
  }
}

export interface EncodeContext {
  /**
   * Resolve a validator-hash reference (bytes field in "ref" mode) to the
   * referenced validator's current hash hex. Return undefined when unknown.
   */
  resolveValidatorRef?: (validatorHash: string) => string | undefined;
}

const HEX_RE = /^[0-9a-fA-F]*$/;
const INT_RE = /^-?\d+$/;

export function normalizeHexInput(raw: string, path: string): string {
  const cleaned = raw.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!HEX_RE.test(cleaned)) throw new EncodeError(path, "Invalid hex string");
  if (cleaned.length % 2 !== 0)
    throw new EncodeError(path, "Hex string has odd length");
  return cleaned.toLowerCase();
}

export function utf8ToHex(text: string): string {
  return Bytes.toHex(new TextEncoder().encode(text));
}

export function parseIntegerText(text: string, path: string): bigint {
  const trimmed = text.trim();
  if (!INT_RE.test(trimmed))
    throw new EncodeError(path, "Enter a whole number (arbitrary precision)");
  return BigInt(trimmed);
}

function bytesValueToHex(
  value: FormValue & { kind: "bytes" },
  ctx: EncodeContext,
  path: string
): string {
  switch (value.mode) {
    case "hex":
      if (value.text.trim() === "") throw new EncodeError(path, "Value is required");
      return normalizeHexInput(value.text, path);
    case "utf8":
      // Consistent with hex mode: an untouched empty input is "not provided",
      // not an intentional empty bytestring (paste CBOR `40` for that).
      if (value.text === "") throw new EncodeError(path, "Value is required");
      return utf8ToHex(value.text);
    case "ref": {
      if (!value.ref) throw new EncodeError(path, "Select a validator to reference");
      const hash = ctx.resolveValidatorRef?.(value.ref);
      if (!hash)
        throw new EncodeError(path, "Referenced validator hash is not available yet");
      return normalizeHexInput(hash, path);
    }
  }
}

function joinPath(path: string, segment: string): string {
  return path ? `${path} / ${segment}` : segment;
}

/** Encode a Data-level node. Throws EncodeError on invalid/missing input. */
function encodeDataValue(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions,
  value: FormValue,
  ctx: EncodeContext,
  path: string,
  depth: number
): Data.Data {
  const classified = classifySchema(schema, definitions, depth);

  switch (classified.kind) {
    case "integer": {
      if (value.kind !== "int")
        throw new EncodeError(path, "Form value does not match integer schema");
      return Data.int(parseIntegerText(value.text, path));
    }
    case "bytes": {
      if (value.kind !== "bytes")
        throw new EncodeError(path, "Form value does not match bytes schema");
      return Data.bytearray(bytesValueToHex(value, ctx, path));
    }
    case "list": {
      if (value.kind !== "list")
        throw new EncodeError(path, "Form value does not match list schema");
      return Data.list(
        value.items.map((item, i) =>
          encodeDataValue(
            classified.items,
            definitions,
            item,
            ctx,
            joinPath(path, `[${i}]`),
            depth + 1
          )
        )
      );
    }
    case "tuple": {
      if (value.kind !== "tuple")
        throw new EncodeError(path, "Form value does not match tuple schema");
      if (value.items.length !== classified.items.length)
        throw new EncodeError(path, "Tuple arity mismatch");
      return Data.list(
        classified.items.map((itemSchema, i) =>
          encodeDataValue(
            itemSchema,
            definitions,
            value.items[i],
            ctx,
            joinPath(path, `[${i}]`),
            depth + 1
          )
        )
      );
    }
    case "map": {
      if (value.kind !== "map")
        throw new EncodeError(path, "Form value does not match map schema");
      return Data.map(
        value.entries.map((entry, i) => {
          const key = encodeDataValue(
            classified.keys,
            definitions,
            entry.key,
            ctx,
            joinPath(path, `key ${i}`),
            depth + 1
          );
          const val = encodeDataValue(
            classified.values,
            definitions,
            entry.value,
            ctx,
            joinPath(path, `value ${i}`),
            depth + 1
          );
          return [key, val] as [Data.Data, Data.Data];
        })
      );
    }
    case "constructor": {
      if (value.kind !== "constr")
        throw new EncodeError(path, "Form value does not match constructor schema");
      const variant = classified.variants[value.variant];
      if (!variant) throw new EncodeError(path, "Unknown constructor variant");
      if (value.fields.length !== variant.fields.length)
        throw new EncodeError(path, "Constructor field count mismatch");
      return Data.constr(
        BigInt(variant.index),
        variant.fields.map((field, i) =>
          encodeDataValue(
            field.schema,
            definitions,
            value.fields[i],
            ctx,
            joinPath(path, field.title ?? `field ${i}`),
            depth + 1
          )
        )
      );
    }
    case "opaque": {
      if (value.kind !== "cbor")
        throw new EncodeError(path, "Opaque parameter requires CBOR hex");
      const hex = normalizeHexInput(value.hex, path);
      if (hex === "") throw new EncodeError(path, "CBOR hex is required");
      try {
        return Data.fromCBORHex(hex);
      } catch {
        throw new EncodeError(path, "Invalid CBOR (could not decode as Plutus Data)");
      }
    }
    case "raw":
      throw new EncodeError(
        path,
        "Raw UPLC constants cannot be nested inside Data values"
      );
    case "unsupported":
      throw new EncodeError(path, "This parameter type cannot be built");
  }
}

/**
 * Encode a top-level parameter into a payload ready for script application.
 */
export function encodeFormValue(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions,
  value: FormValue,
  ctx: EncodeContext = {},
  path = ""
): ParamPayload {
  const classified = classifySchema(schema, definitions);

  if (classified.kind === "raw") {
    switch (classified.raw) {
      case "integer": {
        if (value.kind !== "int")
          throw new EncodeError(path, "Form value does not match #integer schema");
        return {
          kind: "raw",
          type: "Integer",
          value: parseIntegerText(value.text, path),
        };
      }
      case "bytes": {
        if (value.kind !== "bytes")
          throw new EncodeError(path, "Form value does not match #bytes schema");
        return {
          kind: "raw",
          type: "ByteString",
          value: Bytes.fromHex(bytesValueToHex(value, ctx, path)),
        };
      }
      case "string": {
        if (value.kind !== "text")
          throw new EncodeError(path, "Form value does not match #string schema");
        return { kind: "raw", type: "String", value: value.text };
      }
      case "boolean": {
        if (value.kind !== "bool")
          throw new EncodeError(path, "Form value does not match #boolean schema");
        return { kind: "raw", type: "Bool", value: value.value };
      }
      case "unit":
        return { kind: "raw", type: "Unit", value: null };
      case "data": {
        if (value.kind !== "cbor")
          throw new EncodeError(path, "#data parameter requires CBOR hex");
        const hex = normalizeHexInput(value.hex, path);
        if (hex === "") throw new EncodeError(path, "CBOR hex is required");
        try {
          return { kind: "data", data: Data.fromCBORHex(hex) };
        } catch {
          throw new EncodeError(path, "Invalid CBOR (could not decode as Plutus Data)");
        }
      }
    }
  }

  if (classified.kind === "unsupported") {
    throw new EncodeError(path, "This parameter type cannot be built");
  }

  return {
    kind: "data",
    data: encodeDataValue(schema, definitions, value, ctx, path, 0),
  };
}

/** True when any payload is a raw UPLC constant (not Data-level). */
export function hasRawPayload(payloads: readonly ParamPayload[]): boolean {
  return payloads.some((p) => p.kind === "raw");
}

/**
 * CBOR hex for a payload — used for the live preview and for registry
 * metadata storage, encoded with BACKEND_CBOR_OPTIONS for byte-identity with
 * the backend serializer.
 *
 * Raw constants are carried as their FAITHFUL plain-CBOR encodings — integer
 * (major 0/1), bytes (major 2), text (major 3), true/false/null simples —
 * the forms `aiken blueprint apply` accepts and decode.ts round-trips.
 * Text/bool/null are deliberately NOT valid Plutus Data, so they can never
 * be mistaken for a Data-level parameter; no lossy Data stand-ins are
 * emitted. (Registry submission is separately gated for raw params — the
 * on-chain metadata format only carries Data-level parameters.)
 */
export function payloadToCborHex(payload: ParamPayload): string {
  if (payload.kind === "data") {
    return Data.toCBORHex(payload.data, BACKEND_CBOR_OPTIONS);
  }
  const { type, value } = payload;
  if (type === "Integer" && typeof value === "bigint") {
    return Data.toCBORHex(Data.int(value), BACKEND_CBOR_OPTIONS);
  }
  if (type === "ByteString" && value instanceof Uint8Array) {
    return Data.toCBORHex(Data.bytearray(Bytes.toHex(value)), BACKEND_CBOR_OPTIONS);
  }
  if (type === "String" && typeof value === "string") {
    return CBOR.toCBORHex(value);
  }
  if (type === "Bool" && typeof value === "boolean") {
    return CBOR.toCBORHex(value);
  }
  if (type === "Unit") {
    return CBOR.toCBORHex(null);
  }
  throw new EncodeError("", `Cannot serialize raw constant of type ${JSON.stringify(type)}`);
}
