/**
 * PV11 UPLC (builtins 87–105, Value constants) and node-layout Data encoding,
 * checked through the FE's own entry points against Aiken ground truth.
 * Pins the fix for IntersectMBO/evolution-sdk#666.
 *
 * Provenance:
 * - uplc-pv11/vectors.json: produced with the Aiken v1.1.24 oracle. Entries
 *   whose `source` starts with "derived" are derived, not Aiken output.
 * - MIXED: `aiken uplc encode <file> --hex --cbor` (aiken v1.1.24+bacbeb3) of
 *     (program 1.1.0 [[(lam p (builtin unionValue)) (con data (I 1))] (con integer 42)])
 *     (program 1.1.0 [[(lam p (con value [])) (con data (I 1))] (con integer 42)])
 * - ENC: `aiken uplc eval` (aiken v1.1.24+bacbeb3) of
 *     (program 1.1.0 [(builtin serialiseData) (con data (X))])
 *   with X in: Constr 128 [I 1, List [I 2]] | Constr 1000 [] |
 *   I -18446744073709551616 | I 18446744073709551615 | I 18446744073709551616 |
 *   I -<2^600 in decimal> | Map [(I 1, I 2), (B #aa, List [])] | B #<ab x 65>.
 */

import vectors from './uplc-pv11/vectors.json';
import fixture from './fixtures/parameterized-validator.json';
import * as UPLC from '@evolution-sdk/evolution/UPLC';
import * as Bytes from '@evolution-sdk/evolution/Bytes';
import * as Data from '@evolution-sdk/evolution/Data';
import { applyParamsAndHash } from '../lib/cardano/script-hash';
import { applyPayloadsAndHash, applyPayloadsToScript } from '../lib/blueprint/apply-params';
import { payloadToCborHex } from '../lib/blueprint/encode';

interface ApplyVector {
  case: string;
  script: string;
  params: string[];
  expected_inner_flat?: string;
  expected_hash?: string;
}

const MIXED: { name: string; script: string; single: string }[] = [
  { name: 'unionValue', script: '4501010027c1', single: '4e0101003327c09801010100481501' },
  { name: 'value-const', script: '4501010024e9', single: '4e0101003324e89801010100481501' },
];

const ENC: { name: string; data: Data.Data; cbor: string }[] = [
  { name: 'constr128', data: Data.constr(128n, [1n, Data.list([2n])]), cbor: 'd8668218809f019f02ffff' },
  { name: 'constr1000-empty', data: Data.constr(1000n, []), cbor: 'd866821903e880' },
  { name: 'int -2^64', data: Data.int(-(2n ** 64n)), cbor: '3bffffffffffffffff' },
  { name: 'int 2^64-1', data: Data.int(2n ** 64n - 1n), cbor: '1bffffffffffffffff' },
  { name: 'int 2^64', data: Data.int(2n ** 64n), cbor: 'c249010000000000000000' },
  {
    name: 'int -2^600',
    data: Data.int(-(2n ** 600n)),
    cbor: 'c35f5840' + 'ff'.repeat(64) + '4b' + 'ff'.repeat(11) + 'ff',
  },
  { name: 'map', data: Data.map([[1n, 2n], [Data.bytearray('aa'), Data.list([])]]), cbor: 'a2010241aa80' },
  { name: 'bytes65', data: Data.bytearray('ab'.repeat(65)), cbor: '5f5840' + 'ab'.repeat(64) + '41abff' },
];

function check(label: string, run: () => string | null): boolean {
  try {
    const failure = run();
    if (failure === null) {
      console.log(`✅ SUCCESS: ${label}`);
      return true;
    }
    console.log(`❌ FAILURE: ${label}: ${failure}`);
    return false;
  } catch (e) {
    console.log(`❌ FAILURE: ${label}: threw ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function expectEqual(actual: string, expected: string): string | null {
  return actual === expected ? null : `${actual} != ${expected}`;
}

function expectThrow(run: () => unknown): string | null {
  try {
    run();
  } catch {
    return null;
  }
  return 'did not throw';
}

function dataPayloads(params: string[]) {
  return params.map((p) => ({ kind: 'data' as const, data: Data.fromCBORHex(p) }));
}

function innerFlat(scriptCbor: string): string {
  return Bytes.toHex(UPLC.decodeDoubleCborHexToFlat(scriptCbor));
}

function testUplcPv11(): boolean {
  let ok = true;

  for (const { id, name, cbor, flat } of vectors.builtins) {
    ok = check(`builtin ${id} ${name}`, () =>
      expectEqual(UPLC.toFlatHex(UPLC.fromCborHexToProgram(cbor)), flat)
    ) && ok;
  }

  for (const { case: name, cbor, flat } of vectors.values_ok) {
    ok = check(`values_ok ${name}`, () =>
      expectEqual(UPLC.toFlatHex(UPLC.fromCborHexToProgram(cbor)), flat)
    ) && ok;
  }

  for (const { case: name, cbor } of vectors.values_reject) {
    ok = check(`values_reject ${name} fromCborHexToProgram throws`, () =>
      expectThrow(() => UPLC.fromCborHexToProgram(cbor))
    ) && ok;
    ok = check(`values_reject ${name} applyParamsAndHash throws`, () =>
      expectThrow(() => applyParamsAndHash(cbor, ['01'], 'V3'))
    ) && ok;
  }

  for (const v of vectors.apply as ApplyVector[]) {
    const { case: name, script, params, expected_inner_flat, expected_hash } = v;
    if (expected_inner_flat !== undefined) {
      ok = check(`apply ${name} applyParamsAndHash inner flat`, () =>
        expectEqual(innerFlat(applyParamsAndHash(script, params, 'V3').scriptCbor), expected_inner_flat)
      ) && ok;
      ok = check(`apply ${name} applyPayloadsAndHash inner flat`, () =>
        expectEqual(innerFlat(applyPayloadsAndHash(script, dataPayloads(params), 'V3').scriptCbor), expected_inner_flat)
      ) && ok;
    }
    if (expected_hash !== undefined) {
      ok = check(`apply ${name} applyParamsAndHash hash`, () =>
        expectEqual(applyParamsAndHash(script, params, 'V3').hash, expected_hash)
      ) && ok;
      ok = check(`apply ${name} applyPayloadsAndHash hash`, () =>
        expectEqual(applyPayloadsAndHash(script, dataPayloads(params), 'V3').hash, expected_hash)
      ) && ok;
    }
  }

  // Mixed path (Data + raw constant) on Value-builtin scripts.
  for (const { name, script, single } of MIXED) {
    ok = check(`mixed ${name}`, () =>
      expectEqual(
        UPLC.applySingleCborEncoding(
          applyPayloadsToScript(script, [
            { kind: 'data', data: Data.fromCBORHex('01') },
            { kind: 'raw', type: 'Integer', value: 42n },
          ])
        ),
        single
      )
    ) && ok;
  }

  // Node-layout Data encoding on the metadata and apply paths.
  for (const { name, data, cbor } of ENC) {
    ok = check(`enc ${name} payloadToCborHex`, () =>
      expectEqual(payloadToCborHex({ kind: 'data', data }), cbor)
    ) && ok;
    ok = check(`enc ${name} applied script embeds node layout`, () =>
      applyPayloadsToScript(fixture.compiledCode, [{ kind: 'data', data }]).includes(cbor)
        ? null
        : `applied script does not contain ${cbor}`
    ) && ok;
  }

  return ok;
}

if (require.main === module) {
  process.exit(testUplcPv11() ? 0 : 1);
}

export { testUplcPv11 };
