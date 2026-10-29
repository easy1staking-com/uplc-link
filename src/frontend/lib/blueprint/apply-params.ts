/**
 * Apply mixed parameter lists (Data-level + raw UPLC constants) to a
 * compiled script and hash the result.
 *
 * Data-only lists go through `UPLC.applyParamsToScript`. Raw constants are
 * applied by building the application terms directly:
 *   UPLC.fromCborHexToProgram -> UPLC.applyTerm(body, UPLC.constantTerm(...))
 *   -> UPLC.toFlatHex -> UPLC.applyDoubleCborEncoding
 *
 * Both paths pass `CBOR.PLUTUS_DATA_OPTIONS` explicitly rather than relying on
 * the library default: node layout (indefinite lists/constr fields, definite
 * maps), which matches `aiken blueprint apply`.
 *
 * API names verified against @evolution-sdk/evolution 0.8.0 (dist/UPLC.d.ts):
 * constantTerm type tags are capitalized ("Integer", "ByteString", "String",
 * "Unit", "Bool", "Data").
 */

import * as UPLC from "@evolution-sdk/evolution/UPLC";
import * as CBOR from "@evolution-sdk/evolution/CBOR";
import { resolveScriptHash, type PlutusVersion } from "@/lib/cardano/script-hash";
import type { ParamPayload } from "./encode";

/**
 * Apply payloads to an unapplied script (any CBOR wrapping level) and return
 * the applied script as double-CBOR hex.
 */
export function applyPayloadsToScript(
  compiledCode: string,
  params: readonly ParamPayload[]
): string {
  if (params.every((p) => p.kind === "data")) {
    return UPLC.applyParamsToScript(compiledCode, params.map((p) => p.data), CBOR.PLUTUS_DATA_OPTIONS);
  }

  // Mixed / raw constants: build the application terms manually.
  const program = UPLC.fromCborHexToProgram(compiledCode);
  let body = program.body;
  for (const param of params) {
    const argument =
      param.kind === "data"
        ? UPLC.dataConstant(param.data, CBOR.PLUTUS_DATA_OPTIONS)
        : UPLC.constantTerm(param.type, param.value);
    body = UPLC.applyTerm(body, argument);
  }
  const applied = new UPLC.Program({ version: program.version, body });
  return UPLC.applyDoubleCborEncoding(UPLC.toFlatHex(applied));
}

/**
 * Apply payloads and compute the resulting script hash.
 * Extends lib/cardano/script-hash.ts (applyParamsAndHash) to mixed payloads.
 */
export function applyPayloadsAndHash(
  compiledCode: string,
  params: readonly ParamPayload[],
  version: PlutusVersion
): { scriptCbor: string; hash: string } {
  const scriptCbor = applyPayloadsToScript(compiledCode, params);
  return { scriptCbor, hash: resolveScriptHash(scriptCbor, version) };
}
