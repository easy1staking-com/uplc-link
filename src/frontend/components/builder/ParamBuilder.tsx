"use client";

/**
 * One validator parameter: Form / CBOR mode switch, schema-driven form with
 * live resulting CBOR hex, or expert CBOR paste with decode preview and
 * "load into form".
 */

import type { BlueprintSchema, FormValue, ParameterState } from "@/lib/blueprint/types";
import { classifySchema, describeSchema, emptyFormValue } from "@/lib/blueprint/schema";
import { encodeFormValue, payloadToCborHex, EncodeError } from "@/lib/blueprint/encode";
import type { BuilderContext } from "./context";
import { SchemaForm } from "./SchemaForm";
import { CborInput } from "./CborInput";

interface ParamBuilderProps {
  title: string;
  schema: BlueprintSchema;
  state: ParameterState;
  onChange: (state: ParameterState) => void;
  ctx: BuilderContext;
  /** resolves validator-hash references for the live CBOR preview */
  resolveValidatorRef: (validatorHash: string) => string | undefined;
}

export function ParamBuilder({
  title,
  schema,
  state,
  onChange,
  ctx,
  resolveValidatorRef,
}: ParamBuilderProps) {
  const classified = classifySchema(schema, ctx.definitions);
  const formCapable = classified.kind !== "opaque" && classified.kind !== "unsupported";

  // Live CBOR preview of the form value
  let liveCbor = "";
  let liveError = "";
  if (state.mode === "form" && state.formValue) {
    try {
      liveCbor = payloadToCborHex(
        encodeFormValue(schema, ctx.definitions, state.formValue, {
          resolveValidatorRef,
        })
      );
    } catch (e) {
      liveError = e instanceof EncodeError ? e.message : String(e);
    }
  }

  const setMode = (mode: "form" | "cbor") => {
    if (mode === state.mode) return;
    if (mode === "cbor") {
      // Carry the current form encoding into the CBOR box when possible
      onChange({ ...state, mode, cborHex: liveCbor || state.cborHex });
    } else {
      onChange({
        ...state,
        mode,
        formValue: state.formValue ?? emptyFormValue(schema, ctx.definitions),
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-y-1">
        <label className="block text-sm font-medium">
          {title}
          <span className="text-gray-500 ml-2 text-xs">
            ({describeSchema(schema, ctx.definitions)})
          </span>
        </label>
        {formCapable && (
          <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
            {(["form", "cbor"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1 ${
                  state.mode === m
                    ? "bg-zinc-600 text-white"
                    : "bg-zinc-800 text-gray-400 hover:bg-zinc-700"
                }`}
              >
                {m === "form" ? "Form" : "CBOR"}
              </button>
            ))}
          </div>
        )}
      </div>

      {state.mode === "form" && formCapable ? (
        <>
          <SchemaForm
            schema={schema}
            value={state.formValue ?? emptyFormValue(schema, ctx.definitions)}
            onChange={(formValue: FormValue) => onChange({ ...state, formValue })}
            ctx={ctx}
          />
          <div className="text-xs">
            {liveCbor && (
              <p className="text-gray-500">
                CBOR:{" "}
                <span className="font-mono break-all text-gray-400">{liveCbor}</span>
              </p>
            )}
            {liveError && state.formValue && (
              <p className="text-orange-400">{liveError}</p>
            )}
          </div>
        </>
      ) : (
        <CborInput
          hex={state.cborHex}
          onChange={(cborHex) => onChange({ ...state, cborHex })}
          schema={formCapable ? schema : undefined}
          definitions={formCapable ? ctx.definitions : undefined}
          onLoadIntoForm={
            formCapable
              ? (formValue) => onChange({ ...state, mode: "form", formValue })
              : undefined
          }
        />
      )}
    </div>
  );
}
