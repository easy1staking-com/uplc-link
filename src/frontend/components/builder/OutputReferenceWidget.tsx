"use client";

/**
 * Smart widget for OutputReference parameters: transaction hash + output
 * index. Handles both stdlib shapes (alpha nested TransactionId wrapper and
 * v1.1+ flat bytes) by FILLING the schema via buildOutputReferenceFormValue.
 */

import type { FormValue } from "@/lib/blueprint/types";
import { buildOutputReferenceFormValue } from "@/lib/blueprint/well-known";

interface OutputReferenceWidgetProps {
  value: FormValue;
  onChange: (value: FormValue) => void;
  /** alpha stdlib wraps transaction_id in a TransactionId constructor */
  txIdNested: boolean;
}

/** Read the current tx hash / index back out of the schema-shaped value. */
function readParts(value: FormValue, nested: boolean): { txHash: string; index: string } {
  if (value.kind === "constr" && value.fields.length === 2) {
    const [txIdField, indexField] = value.fields;
    let txHash = "";
    if (nested) {
      if (
        txIdField.kind === "constr" &&
        txIdField.fields.length === 1 &&
        txIdField.fields[0].kind === "bytes"
      ) {
        txHash = txIdField.fields[0].text;
      }
    } else if (txIdField.kind === "bytes") {
      txHash = txIdField.text;
    }
    const index = indexField.kind === "int" ? indexField.text : "";
    return { txHash, index };
  }
  return { txHash: "", index: "" };
}

const HEX64_RE = /^[0-9a-fA-F]{64}$/;

export function OutputReferenceWidget({
  value,
  onChange,
  txIdNested,
}: OutputReferenceWidgetProps) {
  const { txHash, index } = readParts(value, txIdNested);

  const update = (nextTxHash: string, nextIndex: string) => {
    onChange(
      buildOutputReferenceFormValue(
        nextTxHash.trim().replace(/^0x/i, "").toLowerCase(),
        nextIndex.trim(),
        txIdNested
      )
    );
  };

  const txHashValid = txHash === "" || HEX64_RE.test(txHash);
  const indexValid = index === "" || /^\d+$/.test(index);

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Transaction hash</label>
        <input
          type="text"
          value={txHash}
          onChange={(e) => update(e.target.value, index)}
          placeholder="64-hex transaction id..."
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
        />
        {!txHashValid && (
          <p className="text-xs text-orange-400 mt-0.5">
            Expected a 32-byte (64 hex chars) transaction hash
          </p>
        )}
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Output index</label>
        <input
          type="text"
          inputMode="numeric"
          value={index}
          onChange={(e) => update(txHash, e.target.value)}
          placeholder="0"
          className="w-32 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
        />
        {!indexValid && (
          <p className="text-xs text-orange-400 mt-0.5">Must be a non-negative integer</p>
        )}
      </div>
    </div>
  );
}
