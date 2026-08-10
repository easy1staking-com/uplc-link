/**
 * Script hashing and parameter application for Plutus scripts
 *
 * Pipeline verified against `aiken blueprint apply` output:
 * - blueprint compiledCode is single-CBOR-wrapped flat UPLC
 * - UPLC.applyParamsToScript returns double-CBOR hex
 * - script hash = blake2b-224 over (language tag byte + single-CBOR script bytes)
 */

import * as UPLC from '@evolution-sdk/evolution/UPLC';
import * as Data from '@evolution-sdk/evolution/Data';
import * as Bytes from '@evolution-sdk/evolution/Bytes';
import * as ScriptHash from '@evolution-sdk/evolution/ScriptHash';
import * as PlutusV1 from '@evolution-sdk/evolution/PlutusV1';
import * as PlutusV2 from '@evolution-sdk/evolution/PlutusV2';
import * as PlutusV3 from '@evolution-sdk/evolution/PlutusV3';
import type * as Script from '@evolution-sdk/evolution/Script';

export type PlutusVersion = 'V1' | 'V2' | 'V3';

function toScript(singleCborHex: string, version: PlutusVersion): Script.Script {
  const bytes = Bytes.fromHex(singleCborHex);
  switch (version) {
    case 'V1':
      return new PlutusV1.PlutusV1({ bytes });
    case 'V2':
      return new PlutusV2.PlutusV2({ bytes });
    case 'V3':
      return new PlutusV3.PlutusV3({ bytes });
  }
}

/**
 * Compute the script hash of a compiled Plutus script.
 * Accepts any CBOR encoding level (raw flat, single, or double) and
 * normalizes to single-CBOR before hashing.
 */
export function resolveScriptHash(scriptCborHex: string, version: PlutusVersion): string {
  const single = UPLC.applySingleCborEncoding(scriptCborHex);
  return ScriptHash.toHex(ScriptHash.fromScript(toScript(single, version)));
}

/**
 * Apply CBOR-encoded Plutus Data parameters to a parameterized script
 * and return the applied script (double-CBOR hex) plus its hash.
 *
 * @param compiledCode - unapplied script from plutus.json (any CBOR level)
 * @param paramsCborHex - parameters as CBOR-encoded Plutus Data hex strings
 */
export function applyParamsAndHash(
  compiledCode: string,
  paramsCborHex: string[],
  version: PlutusVersion
): { scriptCbor: string; hash: string } {
  const params = paramsCborHex.map(hex => Data.fromCBORHex(hex));
  const scriptCbor = UPLC.applyParamsToScript(compiledCode, params);
  return { scriptCbor, hash: resolveScriptHash(scriptCbor, version) };
}
