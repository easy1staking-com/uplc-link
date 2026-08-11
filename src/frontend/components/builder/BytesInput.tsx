"use client";

/**
 * Bytes field input: hex / UTF-8 toggle with live alternate preview,
 * 0x stripping, odd-length rejection, bech32 detection, 28/32-byte hash
 * hints, and a "use validator hash reference" option.
 */

import * as EvoAddress from "@evolution-sdk/evolution/Address";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import type { FormValue } from "@/lib/blueprint/types";
import type { BuilderContext } from "./context";

type BytesValue = Extract<FormValue, { kind: "bytes" }>;

interface BytesInputProps {
  value: BytesValue;
  onChange: (value: BytesValue) => void;
  ctx: BuilderContext;
  /** expected byte length hint (28 for credential hashes, 32 for tx/data hashes) */
  expectedBytes?: number;
  hintLabel?: string;
}

const BECH32_ADDR_RE = /^(addr|addr_test|stake|stake_test)1[a-z0-9]{10,}$/;

function hexInfo(raw: string): { hex: string; error?: string } {
  const hex = raw.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]*$/.test(hex)) return { hex, error: "Invalid hex characters" };
  if (hex.length % 2 !== 0) return { hex, error: "Odd number of hex digits" };
  return { hex: hex.toLowerCase() };
}

function tryUtf8Preview(hex: string): string | null {
  try {
    const bytes = Bytes.fromHex(hex);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Only preview printable strings (no control characters)
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20 || code === 0x7f) return null;
    }
    return text;
  } catch {
    return null;
  }
}

export function BytesInput({
  value,
  onChange,
  ctx,
  expectedBytes,
  hintLabel,
}: BytesInputProps) {
  const isRef = value.mode === "ref";

  const set = (patch: Partial<BytesValue>) =>
    onChange({ ...value, ...patch } as BytesValue);

  // Analysis of the current text (hex mode only)
  const { hex, error } = value.mode === "hex" ? hexInfo(value.text) : { hex: "" };
  const byteLen = hex.length / 2;
  const utf8Preview = value.mode === "hex" && !error && hex ? tryUtf8Preview(hex) : null;
  const hexPreview =
    value.mode === "utf8" && value.text
      ? Bytes.toHex(new TextEncoder().encode(value.text))
      : null;

  const bech32Details =
    value.mode === "hex" && BECH32_ADDR_RE.test(value.text.trim())
      ? EvoAddress.getAddressDetails(value.text.trim())
      : undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {!isRef && (
          <div className="flex rounded overflow-hidden border border-zinc-700">
            {(["hex", "utf8"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ mode: m })}
                className={`px-2 py-0.5 ${
                  value.mode === m
                    ? "bg-zinc-600 text-white"
                    : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                {m === "hex" ? "Hex" : "UTF-8"}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={isRef}
            onChange={(e) =>
              set(
                e.target.checked
                  ? { mode: "ref", ref: value.ref }
                  : { mode: "hex" }
              )
            }
          />
          Use validator hash reference
        </label>
        {hintLabel && <span className="text-gray-500">{hintLabel}</span>}
      </div>

      {isRef ? (
        <select
          value={value.ref ?? ""}
          onChange={(e) => set({ ref: e.target.value || undefined })}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-zinc-600"
        >
          <option value="">Select a validator...</option>
          {ctx.validators.map((v) => (
            <option key={v.hash} value={v.hash}>
              {v.name} ({v.currentHash.substring(0, 16)}...)
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            type="text"
            value={value.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder={
              value.mode === "hex"
                ? expectedBytes
                  ? `${expectedBytes}-byte hash as hex...`
                  : "Hex bytes (e.g. abc123... or 0xabc123...)"
                : "Text (encoded as UTF-8 bytes)"
            }
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
          />
          <div className="text-xs space-y-0.5">
            {value.mode === "hex" && error && value.text.trim() !== "" && !bech32Details && (
              <p className="text-red-400">{error}</p>
            )}
            {value.mode === "hex" && !error && hex && (
              <p className="text-gray-500">
                {byteLen} byte{byteLen === 1 ? "" : "s"}
                {expectedBytes !== undefined &&
                  (byteLen === expectedBytes ? (
                    <span className="text-green-500 ml-1">
                      matches expected {expectedBytes}-byte hash
                    </span>
                  ) : (
                    <span className="text-orange-400 ml-1">
                      expected {expectedBytes} bytes
                    </span>
                  ))}
                {utf8Preview !== null && (
                  <span className="ml-2 text-gray-500">
                    UTF-8: <span className="font-mono">&quot;{utf8Preview}&quot;</span>
                  </span>
                )}
              </p>
            )}
            {hexPreview !== null && (
              <p className="text-gray-500">
                Hex: <span className="font-mono break-all">{hexPreview}</span>
              </p>
            )}
            {bech32Details && (
              <div className="text-blue-300 space-x-2">
                <span>This looks like a bech32 address —</span>
                <button
                  type="button"
                  className="underline hover:text-blue-200"
                  onClick={() =>
                    set({ mode: "hex", text: Bytes.toHex(bech32Details.paymentCredential.hash) })
                  }
                >
                  use payment credential hash
                </button>
                {bech32Details.stakingCredential && (
                  <button
                    type="button"
                    className="underline hover:text-blue-200"
                    onClick={() =>
                      set({
                        mode: "hex",
                        text: Bytes.toHex(bech32Details.stakingCredential!.hash),
                      })
                    }
                  >
                    use stake credential hash
                  </button>
                )}
                <button
                  type="button"
                  className="underline hover:text-blue-200"
                  onClick={() => set({ mode: "hex", text: bech32Details.address.hex })}
                >
                  use full address bytes
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
