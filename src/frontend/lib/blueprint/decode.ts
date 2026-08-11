/**
 * CBOR hex + schema -> FormValue (best-effort).
 *
 * Drives round-tripping (CBOR paste -> "load into form") and deep-link
 * prefill of stored parameters into the friendly form. Returns null whenever
 * the CBOR does not structurally match the schema — callers then fall back to
 * CBOR mode.
 */

import * as Data from "@evolution-sdk/evolution/Data";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import * as CBOR from "@evolution-sdk/evolution/CBOR";
import type { BlueprintSchema, BlueprintDefinitions, FormValue } from "./types";
import { classifySchema, MAX_SCHEMA_DEPTH } from "./schema";
import { normalizeHexInput } from "./encode";

function dataToFormValue(
  data: Data.Data,
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions,
  depth: number
): FormValue | null {
  if (depth > MAX_SCHEMA_DEPTH) return null;
  const classified = classifySchema(schema, definitions, depth);

  switch (classified.kind) {
    case "integer":
      return typeof data === "bigint" ? { kind: "int", text: data.toString() } : null;
    case "bytes":
      return data instanceof Uint8Array
        ? { kind: "bytes", mode: "hex", text: Bytes.toHex(data) }
        : null;
    case "list": {
      if (!Array.isArray(data)) return null;
      const items: FormValue[] = [];
      for (const item of data) {
        const decoded = dataToFormValue(item, classified.items, definitions, depth + 1);
        if (!decoded) return null;
        items.push(decoded);
      }
      return { kind: "list", items };
    }
    case "tuple": {
      if (!Array.isArray(data) || data.length !== classified.items.length) return null;
      const items: FormValue[] = [];
      for (let i = 0; i < data.length; i++) {
        const decoded = dataToFormValue(
          data[i],
          classified.items[i],
          definitions,
          depth + 1
        );
        if (!decoded) return null;
        items.push(decoded);
      }
      return { kind: "tuple", items };
    }
    case "map": {
      if (!(data instanceof Map)) return null;
      const entries: { key: FormValue; value: FormValue }[] = [];
      for (const [k, v] of data.entries()) {
        const key = dataToFormValue(k, classified.keys, definitions, depth + 1);
        const value = dataToFormValue(v, classified.values, definitions, depth + 1);
        if (!key || !value) return null;
        entries.push({ key, value });
      }
      return { kind: "map", entries };
    }
    case "constructor": {
      if (!Data.isConstr(data)) return null;
      const variantPos = classified.variants.findIndex(
        (v) => BigInt(v.index) === data.index && v.fields.length === data.fields.length
      );
      if (variantPos < 0) return null;
      const variant = classified.variants[variantPos];
      const fields: FormValue[] = [];
      for (let i = 0; i < variant.fields.length; i++) {
        const decoded = dataToFormValue(
          data.fields[i],
          variant.fields[i].schema,
          definitions,
          depth + 1
        );
        if (!decoded) return null;
        fields.push(decoded);
      }
      return { kind: "constr", variant: variantPos, fields };
    }
    case "opaque":
      // Keep opaque nodes as CBOR (re-encoded with default options).
      try {
        return { kind: "cbor", hex: Data.toCBORHex(data) };
      } catch {
        return null;
      }
    case "raw":
      // Top-level raw handling happens in decodeCborToFormValue.
      return null;
    case "unsupported":
      return null;
  }
}

/**
 * Decode a CBOR-encoded parameter into a FormValue for the given schema.
 * Returns null when the hex is not valid CBOR or does not match the schema.
 */
export function decodeCborToFormValue(
  cborHex: string,
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions
): FormValue | null {
  let hex: string;
  try {
    hex = normalizeHexInput(cborHex, "");
  } catch {
    return null;
  }
  if (hex === "") return null;

  const classified = classifySchema(schema, definitions);

  // Raw constants: stored/pasted CBOR carries the underlying primitive value.
  // string/boolean/unit are carried as plain CBOR text / true/false / null
  // (see payloadToCborHex) — those are not valid Plutus Data, so parse them
  // at the CBOR level before attempting a Data decode.
  if (classified.kind === "raw") {
    switch (classified.raw) {
      case "string":
      case "boolean":
      case "unit": {
        let value: CBOR.CBOR;
        try {
          value = CBOR.fromCBORHex(hex);
        } catch {
          return null;
        }
        if (classified.raw === "string" && typeof value === "string") {
          return { kind: "text", text: value };
        }
        if (classified.raw === "boolean" && typeof value === "boolean") {
          return { kind: "bool", value };
        }
        if (classified.raw === "unit" && value === null) {
          return { kind: "unit" };
        }
        return null;
      }
      case "integer":
      case "bytes":
      case "data": {
        let data: Data.Data;
        try {
          data = Data.fromCBORHex(hex);
        } catch {
          return null;
        }
        if (classified.raw === "integer") {
          return typeof data === "bigint" ? { kind: "int", text: data.toString() } : null;
        }
        if (classified.raw === "bytes") {
          return data instanceof Uint8Array
            ? { kind: "bytes", mode: "hex", text: Bytes.toHex(data) }
            : null;
        }
        return { kind: "cbor", hex };
      }
    }
  }

  let data: Data.Data;
  try {
    data = Data.fromCBORHex(hex);
  } catch {
    return null;
  }

  return dataToFormValue(data, schema, definitions, 0);
}
