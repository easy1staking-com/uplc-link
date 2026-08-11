"use client";

/**
 * Expert-mode CBOR input: paste hex, get a live structured decode preview,
 * and (when the value parses against the parameter's schema) load it back
 * into the friendly form.
 */

import * as Data from "@evolution-sdk/evolution/Data";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import type { BlueprintSchema, FormValue } from "@/lib/blueprint/types";
import type { BlueprintDefinitions } from "@/lib/blueprint/types";
import { decodeCborToFormValue } from "@/lib/blueprint/decode";

interface CborInputProps {
  hex: string;
  onChange: (hex: string) => void;
  /** when provided, enables "load into form" on successful schema parse */
  schema?: BlueprintSchema;
  definitions?: BlueprintDefinitions;
  onLoadIntoForm?: (value: FormValue) => void;
}

type DisplayJson =
  | string
  | number
  | { int: string }
  | { bytes: string }
  | { constructor: number; fields: DisplayJson[] }
  | { map: { k: DisplayJson; v: DisplayJson }[] }
  | DisplayJson[];

function dataToDisplay(data: Data.Data): DisplayJson {
  if (typeof data === "bigint") return { int: data.toString() };
  if (data instanceof Uint8Array) return { bytes: Bytes.toHex(data) };
  if (data instanceof Map) {
    return {
      map: [...data.entries()].map(([k, v]) => ({
        k: dataToDisplay(k),
        v: dataToDisplay(v),
      })),
    };
  }
  if (Data.isConstr(data)) {
    return {
      constructor: Number(data.index),
      fields: data.fields.map(dataToDisplay),
    };
  }
  return data.map(dataToDisplay);
}

function tryDecode(hexRaw: string): { preview?: string; error?: string } {
  const hex = hexRaw.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (hex === "") return {};
  if (!/^[0-9a-fA-F]+$/.test(hex)) return { error: "Invalid hex characters" };
  if (hex.length % 2 !== 0) return { error: "Odd number of hex digits" };
  try {
    const data = Data.fromCBORHex(hex.toLowerCase());
    return { preview: JSON.stringify(dataToDisplay(data), null, 2) };
  } catch {
    return { error: "Not decodable as CBOR Plutus Data" };
  }
}

export function CborInput({
  hex,
  onChange,
  schema,
  definitions,
  onLoadIntoForm,
}: CborInputProps) {
  const { preview, error } = tryDecode(hex);

  const loadable =
    schema && definitions && onLoadIntoForm && preview
      ? decodeCborToFormValue(hex, schema, definitions)
      : null;

  return (
    <div className="space-y-1">
      <textarea
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        placeholder="CBOR hex (e.g. d8799f...ff, 581c..., 182a)"
        rows={2}
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {preview && (
        <details open className="text-xs">
          <summary className="cursor-pointer text-gray-400">Decoded structure</summary>
          <pre className="mt-1 p-2 bg-zinc-950 border border-zinc-800 rounded overflow-x-auto text-gray-300">
            {preview}
          </pre>
        </details>
      )}
      {loadable && (
        <button
          type="button"
          onClick={() => onLoadIntoForm!(loadable)}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
        >
          Load into form
        </button>
      )}
    </div>
  );
}
