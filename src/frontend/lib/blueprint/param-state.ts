/**
 * Bridge between per-parameter builder state (ParameterState) and applicable
 * payloads. Lives outside the page component so the mode-switch semantics —
 * in particular the raw-constant refusal rules — are unit-testable.
 */

import * as Data from "@evolution-sdk/evolution/Data";
import type { BlueprintDefinitions, BlueprintSchema, ParameterState } from "./types";
import { classifySchema } from "./schema";
import { decodeCborToFormValue } from "./decode";
import {
  encodeFormValue,
  normalizeHexInput,
  type ParamPayload,
} from "./encode";

/**
 * Encode one parameter's builder state into an applicable payload.
 * Returns null when the parameter has no (complete) value yet.
 * Throws EncodeError on invalid input.
 *
 * CBOR mode routes through the schema decoder so `#`-typed parameters become
 * raw-constant payloads. A raw-classified schema whose CBOR does not decode
 * is treated as INCOMPLETE — it is never silently applied as Data, which
 * would produce a different (wrong) script hash.
 */
export function encodeParameterState(
  schema: BlueprintSchema | undefined,
  definitions: BlueprintDefinitions,
  state: ParameterState,
  resolveValidatorRef: (hash: string) => string | undefined
): ParamPayload | null {
  if (!schema) {
    // No schema available — only raw CBOR can be applied, as Data
    if (state.mode !== "cbor" || !state.cborHex.trim()) return null;
    return {
      kind: "data",
      data: Data.fromCBORHex(normalizeHexInput(state.cborHex, state.name)),
    };
  }

  if (state.mode === "cbor") {
    if (!state.cborHex.trim()) return null;
    const decoded = decodeCborToFormValue(state.cborHex, schema, definitions);
    if (decoded) {
      return encodeFormValue(schema, definitions, decoded, { resolveValidatorRef });
    }
    // Schema-mismatched CBOR: for Data-level schemas fall back to applying
    // the pasted bytes as plain Data (expert escape hatch); for raw schemas
    // there is no faithful Data application — refuse instead.
    if (classifySchema(schema, definitions).kind === "raw") return null;
    return {
      kind: "data",
      data: Data.fromCBORHex(normalizeHexInput(state.cborHex, state.name)),
    };
  }

  if (!state.formValue) return null;
  return encodeFormValue(schema, definitions, state.formValue, { resolveValidatorRef });
}
