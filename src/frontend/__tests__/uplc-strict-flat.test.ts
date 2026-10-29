/**
 * Strict Flat decoding at the FE's apply entry points: input after the final
 * filler, a missing final filler and `constr` before version 1.1.0 are refused.
 * Pins that the Evolution release T-408 consumes carries
 * IntersectMBO/evolution-sdk#691 (T-227) and #702.
 *
 * Provenance:
 * - Reject flats: upstream #691's test (commit dcd54c13), "a trailing byte"
 *   01010048008100, "a filler that ends mid-byte" 0101004800a0, "no final
 *   filler" 01010016; and the #702 release note, (program 1.0.0 (constr 0)) =
 *   0100008001. Each is wrapped twice in a CBOR bytestring here.
 * - Reference semantics: Plutus `PlutusCore.Flat` (`postAlignedDecoder` +
 *   `strictDecoder`, `decodeTerm`'s 1.1.0 gate). Aiken v1.1.23 `uplc decode`
 *   accepts three of the four, so Aiken is not the oracle for the rejections.
 * - Control: `aiken uplc encode <file> --hex` (aiken v1.1.23+8949565) of
 *     (program 1.1.0 [(delay (error)) (con data (I 1))])  = 0101003164c101010001
 *     (program 1.1.0 (delay (error)))                     = 0101001601
 */

import * as UPLC from '@evolution-sdk/evolution/UPLC';
import * as Bytes from '@evolution-sdk/evolution/Bytes';
import * as Data from '@evolution-sdk/evolution/Data';
import { applyParamsAndHash } from '../lib/cardano/script-hash';
import { applyPayloadsAndHash, applyPayloadsToScript } from '../lib/blueprint/apply-params';

const REJECT: { name: string; cbor: string; message: string }[] = [
  { name: 'trailing-byte', cbor: '484701010048008100', message: '8 trailing bits after its final filler' },
  { name: 'filler-mid-byte', cbor: '47460101004800a0', message: '5 trailing bits after its final filler' },
  { name: 'no-final-filler', cbor: '454401010016', message: 'missing its final filler' },
  { name: 'constr-before-1.1.0', cbor: '46450100008001', message: "'constr' is not allowed before version 1.1.0" },
];

// Flat 010100160001: a final filler spanning two bytes, accepted by Plutus and upstream.
const CONTROL = '4746010100160001';

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

function expectThrowWith(run: () => unknown, message: string): string | null {
  try {
    run();
  } catch (e) {
    if (e instanceof Error && e.message.includes(message)) return null;
    return `threw ${e instanceof Error ? e.message : String(e)}`;
  }
  return 'did not throw';
}

function innerFlat(scriptCbor: string): string {
  return Bytes.toHex(UPLC.decodeDoubleCborHexToFlat(scriptCbor));
}

function testUplcStrictFlat(): boolean {
  let ok = true;

  for (const { name, cbor, message } of REJECT) {
    ok = check(`strict-flat ${name} fromCborHexToProgram`, () =>
      expectThrowWith(() => UPLC.fromCborHexToProgram(cbor), message)
    ) && ok;
    ok = check(`strict-flat ${name} applyParamsAndHash`, () =>
      expectThrowWith(() => applyParamsAndHash(cbor, ['01'], 'V3'), message)
    ) && ok;
    ok = check(`strict-flat ${name} applyPayloadsAndHash`, () =>
      expectThrowWith(
        () => applyPayloadsAndHash(cbor, [{ kind: 'data', data: Data.fromCBORHex('01') }], 'V3'),
        message
      )
    ) && ok;
    ok = check(`strict-flat ${name} applyPayloadsToScript-mixed`, () =>
      expectThrowWith(
        () =>
          applyPayloadsToScript(cbor, [
            { kind: 'data', data: Data.fromCBORHex('01') },
            { kind: 'raw', type: 'Integer', value: 42n },
          ]),
        message
      )
    ) && ok;
  }

  ok = check('strict-flat control fromCborHexToProgram', () =>
    expectEqual(UPLC.toFlatHex(UPLC.fromCborHexToProgram(CONTROL)), '0101001601')
  ) && ok;
  ok = check('strict-flat control applyParamsAndHash inner flat', () =>
    expectEqual(innerFlat(applyParamsAndHash(CONTROL, ['01'], 'V3').scriptCbor), '0101003164c101010001')
  ) && ok;
  ok = check('strict-flat control applyPayloadsAndHash inner flat', () =>
    expectEqual(
      innerFlat(applyPayloadsAndHash(CONTROL, [{ kind: 'data', data: Data.fromCBORHex('01') }], 'V3').scriptCbor),
      '0101003164c101010001'
    )
  ) && ok;

  return ok;
}

if (require.main === module) {
  process.exit(testUplcStrictFlat() ? 0 : 1);
}

export { testUplcStrictFlat };
