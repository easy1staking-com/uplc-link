/**
 * Test script hashing and parameter application against aiken CLI ground truth.
 *
 * The fixture's appliedHash was produced with:
 *   aiken blueprint apply -m config -v config <paramCborHex>
 * using aiken v1.1.23.
 */

import { resolveScriptHash, applyParamsAndHash } from '../lib/cardano/script-hash';
import fixture from './fixtures/parameterized-validator.json';
import { applyPayloadsAndHash, applyPayloadsToScript } from '../lib/blueprint/apply-params';
import * as Data from '@evolution-sdk/evolution/Data';

/**
 * Map-parameter oracle: hashes produced by `aiken blueprint apply`
 * (aiken v1.1.23+8949565) over a one-parameter blueprint wrapping this
 * fixture's compiledCode with an opaque `Data` parameter schema.
 * Aiken applies a map as a definite-length map, not as a list of pairs.
 */
const MAP_ORACLE: { cbor: string; hash: string }[] = [
  { cbor: 'a141aa01', hash: '9091c82c1ac0a38fba787befc61ded191ad35a97b9cc5ae331b1f89c' },
  { cbor: 'a0', hash: '93fbd2ee91bb503b9503b912a21b35a803280581ee84d737fa9a779e' },
];

function testScriptHash(): boolean {
  const version = fixture.plutusVersion as 'V1' | 'V2' | 'V3';
  let ok = true;

  const unapplied = resolveScriptHash(fixture.compiledCode, version);
  if (unapplied === fixture.hash) {
    console.log('✅ SUCCESS: Unapplied script hash matches blueprint hash');
  } else {
    console.log(`❌ FAILURE: Unapplied hash ${unapplied} != blueprint ${fixture.hash}`);
    ok = false;
  }

  const { hash: applied } = applyParamsAndHash(fixture.compiledCode, [fixture.paramCborHex], version);
  if (applied === fixture.appliedHash) {
    console.log('✅ SUCCESS: Applied script hash matches aiken blueprint apply');
  } else {
    console.log(`❌ FAILURE: Applied hash ${applied} != aiken ${fixture.appliedHash}`);
    ok = false;
  }

  for (const { cbor, hash } of MAP_ORACLE) {
    const { hash: viaParams } = applyParamsAndHash(fixture.compiledCode, [cbor], version);
    if (viaParams === hash) {
      console.log(`✅ SUCCESS: applyParamsAndHash(${cbor}) matches aiken blueprint apply`);
    } else {
      console.log(`❌ FAILURE: applyParamsAndHash(${cbor}) hash ${viaParams} != aiken ${hash}`);
      ok = false;
    }

    const { hash: viaPayloads } = applyPayloadsAndHash(
      fixture.compiledCode,
      [{ kind: 'data', data: Data.fromCBORHex(cbor) }],
      version
    );
    if (viaPayloads === hash) {
      console.log(`✅ SUCCESS: applyPayloadsAndHash(${cbor}) matches aiken blueprint apply`);
    } else {
      console.log(`❌ FAILURE: applyPayloadsAndHash(${cbor}) hash ${viaPayloads} != aiken ${hash}`);
      ok = false;
    }
  }

  // Mixed path (Data + raw constant): the map must be embedded as a definite map.
  const mixed = applyPayloadsToScript(fixture.compiledCode, [
    { kind: 'data', data: Data.fromCBORHex('a141aa01') },
    { kind: 'raw', type: 'Integer', value: 42n },
  ]);
  if (!fixture.compiledCode.includes('a141aa01') && mixed.includes('a141aa01') && !mixed.includes('bf41aa01ff')) {
    console.log('✅ SUCCESS: mixed-path map param is embedded as a definite map (a141aa01)');
  } else {
    console.log('❌ FAILURE: mixed-path map param is not embedded as definite map a141aa01');
    ok = false;
  }

  return ok;
}

if (require.main === module) {
  process.exit(testScriptHash() ? 0 : 1);
}

export { testScriptHash };
