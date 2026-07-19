/**
 * Test script hashing and parameter application against aiken CLI ground truth.
 *
 * The fixture's appliedHash was produced with:
 *   aiken blueprint apply -m config -v config <paramCborHex>
 * using aiken v1.1.23.
 */

import { resolveScriptHash, applyParamsAndHash } from '../lib/cardano/script-hash';
import fixture from './fixtures/parameterized-validator.json';

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

  return ok;
}

if (require.main === module) {
  process.exit(testScriptHash() ? 0 : 1);
}

export { testScriptHash };
