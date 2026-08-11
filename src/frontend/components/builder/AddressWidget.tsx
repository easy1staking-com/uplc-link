"use client";

/**
 * Smart widget for stdlib Address parameters: paste a bech32 address and the
 * widget FILLS the underlying schema (payment/stake credential constructors)
 * via buildAddressFormValue — it never emits hardcoded CBOR.
 */

import { useState } from "react";
import * as EvoAddress from "@evolution-sdk/evolution/Address";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import type { BlueprintSchema, FormValue } from "@/lib/blueprint/types";
import { buildAddressFormValue, type DecodedAddress } from "@/lib/blueprint/well-known";
import type { BuilderContext } from "./context";

interface AddressWidgetProps {
  schema: BlueprintSchema;
  value: FormValue;
  onChange: (value: FormValue) => void;
  ctx: BuilderContext;
}

/** Extract a display summary from the current (schema-shaped) form value. */
function summarize(value: FormValue): { payment?: string; stake?: string } | null {
  if (value.kind !== "constr" || value.fields.length !== 2) return null;
  const credentialHex = (v: FormValue | undefined): string | undefined => {
    if (!v || v.kind !== "constr" || v.fields.length !== 1) return undefined;
    const inner = v.fields[0];
    if (inner.kind === "bytes") return inner.text || undefined;
    // Referenced<Credential>::Inline wrapper
    return credentialHex(inner);
  };
  const payment = credentialHex(value.fields[0]);
  const stakeOpt = value.fields[1];
  let stake: string | undefined;
  if (stakeOpt.kind === "constr" && stakeOpt.fields.length === 1) {
    stake = credentialHex(stakeOpt.fields[0]);
  }
  return { payment, stake };
}

export function AddressWidget({ schema, value, onChange, ctx }: AddressWidgetProps) {
  const [bech32, setBech32] = useState("");
  const [error, setError] = useState<string>("");

  const handleBech32 = (input: string) => {
    setBech32(input);
    setError("");
    const trimmed = input.trim();
    if (!trimmed) return;

    const details = EvoAddress.getAddressDetails(trimmed);
    if (!details) {
      setError("Not a recognizable Shelley address (pointer/Byron addresses are unsupported)");
      return;
    }

    const decoded: DecodedAddress = {
      paymentHashHex: Bytes.toHex(details.paymentCredential.hash),
      paymentIsScript: details.paymentCredential._tag === "ScriptHash",
      stakeHashHex: details.stakingCredential
        ? Bytes.toHex(details.stakingCredential.hash)
        : undefined,
      stakeIsScript: details.stakingCredential
        ? details.stakingCredential._tag === "ScriptHash"
        : undefined,
    };

    const filled = buildAddressFormValue(decoded, schema, ctx.definitions);
    if (!filled) {
      setError("Address schema shape not recognized — use the manual form");
      return;
    }
    onChange(filled);
  };

  const summary = summarize(value);

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={bech32}
        onChange={(e) => handleBech32(e.target.value)}
        placeholder="addr1... / addr_test1... (bech32)"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {summary && (summary.payment || summary.stake) && (
        <div className="text-xs text-gray-500 space-y-0.5">
          {summary.payment && (
            <p>
              payment: <span className="font-mono break-all">{summary.payment}</span>
            </p>
          )}
          <p>
            stake:{" "}
            {summary.stake ? (
              <span className="font-mono break-all">{summary.stake}</span>
            ) : (
              <span>none</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
