/**
 * Blueprint builder tests: schema classification, encode/decode round-trips
 * and parameter application, verified against aiken CLI ground truth.
 *
 * Fixture provenance (generated for this test, tiny single-validator
 * projects built outside the repo):
 *
 * - blueprint-alpha.json — Aiken v1.0.29-alpha+16fb02e, stdlib 1.9.0
 *   (Plutus V2). Parameters: OutputReference (NESTED TransactionId wrapper),
 *   ByteArray, Int. Applied hash produced by chaining
 *   `aiken blueprint apply -m fixture -v spend <cbor>` (v1.0.29-alpha).
 *
 * - blueprint-v11.json — Aiken v1.1.23+8949565, stdlib v2.2.0 (Plutus V3).
 *   Parameters: ByteArray, Int, OutputReference (FLAT transaction_id),
 *   Address, Int. Applied hash produced by chaining
 *   `aiken blueprint apply -m fixture -v fixture <cbor>` (v1.1.23).
 *
 * The param CBOR hexes below are hand-derived per RFC 8949 + Aiken's
 * indefinite-length constr convention and were accepted verbatim by
 * `aiken blueprint apply` when producing the expected hashes.
 */

import * as UPLC from "@evolution-sdk/evolution/UPLC";
import {
  classifySchema,
  describeSchema,
  emptyFormValue,
  EMPTY_FORM_NODE_BUDGET,
} from "../lib/blueprint/schema";
import { resolveSchema, refToDefinitionKey } from "../lib/blueprint/resolve";
import {
  encodeFormValue,
  payloadToCborHex,
  hasRawPayload,
  EncodeError,
} from "../lib/blueprint/encode";
import { encodeParameterState } from "../lib/blueprint/param-state";
import { decodeCborToFormValue } from "../lib/blueprint/decode";
import { applyPayloadsAndHash, applyPayloadsToScript } from "../lib/blueprint/apply-params";
import {
  matchWellKnown,
  buildAddressFormValue,
  buildOutputReferenceFormValue,
} from "../lib/blueprint/well-known";
import type {
  BlueprintDefinitions,
  BlueprintSchema,
  FormValue,
  ParameterState,
} from "../lib/blueprint/types";

import alphaBlueprint from "./fixtures/blueprint-alpha.json";
import v11Blueprint from "./fixtures/blueprint-v11.json";

const B28 = "00112233445566778899aabbccddeeff00112233445566778899aabb";
const B32 = "8c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd8";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✅ ${name}`);
  } else {
    failures++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface FixtureValidator {
  compiledCode: string;
  hash: string;
  parameters: { title: string; schema: BlueprintSchema }[];
}

function getValidator(bp: unknown, title: string): FixtureValidator {
  const blueprint = bp as {
    validators: (FixtureValidator & { title: string })[];
  };
  const v = blueprint.validators.find((x) => x.title === title);
  if (!v) throw new Error(`validator ${title} not found in fixture`);
  return v;
}

function getDefinitions(bp: unknown): BlueprintDefinitions {
  return (bp as { definitions: BlueprintDefinitions }).definitions;
}

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------
function testResolve() {
  console.log("\n--- $ref resolution ---");
  check(
    "unescapes ~1 and ~0",
    refToDefinitionKey("#/definitions/cardano~1address~1Address") ===
      "cardano/address/Address" &&
      refToDefinitionKey("#/definitions/a~0b") === "a~b"
  );

  const defs = getDefinitions(v11Blueprint);
  const resolved = resolveSchema(
    { $ref: "#/definitions/cardano~1transaction~1OutputReference" },
    defs
  );
  check(
    "resolves OutputReference ref",
    !resolved.dangling && resolved.refName === "cardano/transaction/OutputReference"
  );

  const dangling = resolveSchema({ $ref: "#/definitions/nope" }, defs);
  check("dangling ref reported", dangling.dangling);

  // Cycle safety
  const cyclic: BlueprintDefinitions = {
    A: { $ref: "#/definitions/B" },
    B: { $ref: "#/definitions/A" },
  };
  const cycle = resolveSchema({ $ref: "#/definitions/A" }, cyclic);
  check("ref cycle terminates as dangling", cycle.dangling);
}

// ---------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------
function testClassification() {
  console.log("\n--- classification ---");
  const alphaDefs = getDefinitions(alphaBlueprint);
  const v11Defs = getDefinitions(v11Blueprint);
  const alpha = getValidator(alphaBlueprint, "fixture.spend");
  const v11 = getValidator(v11Blueprint, "fixture.fixture.spend");

  const alphaUtxo = classifySchema(alpha.parameters[0].schema, alphaDefs);
  check(
    "alpha OutputReference classifies as single-variant constructor",
    alphaUtxo.kind === "constructor" && alphaUtxo.variants.length === 1
  );
  if (alphaUtxo.kind === "constructor") {
    const txId = classifySchema(alphaUtxo.variants[0].fields[0].schema, alphaDefs);
    check("alpha transaction_id is NESTED constructor", txId.kind === "constructor");
  }

  const v11Utxo = classifySchema(v11.parameters[2].schema, v11Defs);
  if (v11Utxo.kind === "constructor") {
    const txId = classifySchema(v11Utxo.variants[0].fields[0].schema, v11Defs);
    check("v1.1 transaction_id is FLAT bytes", txId.kind === "bytes");
  } else {
    check("v1.1 OutputReference classifies as constructor", false, v11Utxo.kind);
  }

  check(
    "Data classifies opaque",
    classifySchema({ $ref: "#/definitions/Data" }, v11Defs).kind === "opaque"
  );
  check(
    "raw #integer classifies raw",
    (() => {
      const c = classifySchema({ dataType: "#integer" }, {});
      return c.kind === "raw" && c.raw === "integer";
    })()
  );
  check(
    "raw #pair classifies unsupported",
    classifySchema({ dataType: "#pair" }, {}).kind === "unsupported"
  );
  check(
    "deep recursion guarded as opaque",
    classifySchema({ dataType: "integer" }, {}, 1000).kind === "opaque"
  );
}

// ---------------------------------------------------------------------------
// well-known matching
// ---------------------------------------------------------------------------
function testWellKnown() {
  console.log("\n--- well-known widgets ---");
  const alphaDefs = getDefinitions(alphaBlueprint);
  const v11Defs = getDefinitions(v11Blueprint);
  const alpha = getValidator(alphaBlueprint, "fixture.spend");
  const v11 = getValidator(v11Blueprint, "fixture.fixture.spend");

  const alphaMatch = matchWellKnown(alpha.parameters[0].schema, alphaDefs);
  check(
    "alpha OutputReference matches widget (nested)",
    alphaMatch?.widget === "output-reference" && alphaMatch.txIdNested === true
  );

  const v11Match = matchWellKnown(v11.parameters[2].schema, v11Defs);
  check(
    "v1.1 OutputReference matches widget (flat)",
    v11Match?.widget === "output-reference" && v11Match.txIdNested === false
  );

  const addrMatch = matchWellKnown(v11.parameters[3].schema, v11Defs);
  check("v1.1 Address matches widget", addrMatch?.widget === "address");

  const hashMatch = matchWellKnown(
    { $ref: "#/definitions/aiken~1crypto~1ScriptHash" },
    v11Defs
  );
  check(
    "ScriptHash matches 28-byte hint",
    hashMatch?.widget === "hash-bytes" && hashMatch.expectedBytes === 28
  );

  // PosixTime via a hand-written definitions map (name-keyed, integer shape)
  const ptDefs: BlueprintDefinitions = {
    "aiken/time/PosixTime": { title: "PosixTime", dataType: "integer" },
  };
  const pt = matchWellKnown({ $ref: "#/definitions/aiken~1time~1PosixTime" }, ptDefs);
  check("PosixTime matches widget", pt?.widget === "posix-time");

  // Structural mismatch: right name, wrong shape -> no widget
  const bogusDefs: BlueprintDefinitions = {
    "cardano/address/Address": { dataType: "integer" },
  };
  const bogus = matchWellKnown(
    { $ref: "#/definitions/cardano~1address~1Address" },
    bogusDefs
  );
  check("name match with wrong shape falls back to generic", bogus === null);
}

// ---------------------------------------------------------------------------
// encode + decode round-trips against aiken-accepted CBOR
// ---------------------------------------------------------------------------
interface ParamCase {
  name: string;
  schema: BlueprintSchema;
  value: FormValue;
  expectedCbor: string;
}

function runParamCases(
  label: string,
  cases: ParamCase[],
  definitions: BlueprintDefinitions
) {
  for (const c of cases) {
    let hex = "";
    try {
      hex = payloadToCborHex(encodeFormValue(c.schema, definitions, c.value));
    } catch (e) {
      check(`${label} ${c.name} encodes`, false, String(e));
      continue;
    }
    check(
      `${label} ${c.name} encodes to aiken-accepted CBOR`,
      hex === c.expectedCbor,
      `${hex} != ${c.expectedCbor}`
    );

    // decode -> re-encode round-trip
    const decoded = decodeCborToFormValue(c.expectedCbor, c.schema, definitions);
    if (!decoded) {
      check(`${label} ${c.name} decodes back into form`, false, "decode returned null");
      continue;
    }
    const reencoded = payloadToCborHex(
      encodeFormValue(c.schema, definitions, decoded)
    );
    check(
      `${label} ${c.name} round-trips (decode -> encode)`,
      reencoded === c.expectedCbor,
      `${reencoded} != ${c.expectedCbor}`
    );
  }
}

function alphaCases(): { cases: ParamCase[]; defs: BlueprintDefinitions } {
  const defs = getDefinitions(alphaBlueprint);
  const v = getValidator(alphaBlueprint, "fixture.spend");
  const cases: ParamCase[] = [
    {
      name: "utxo (nested OutputReference)",
      schema: v.parameters[0].schema,
      value: buildOutputReferenceFormValue(B32, "5", true),
      expectedCbor: `d8799fd8799f5820${B32}ff05ff`,
    },
    {
      name: "owner (ByteArray)",
      schema: v.parameters[1].schema,
      value: { kind: "bytes", mode: "hex", text: B28 },
      expectedCbor: `581c${B28}`,
    },
    {
      name: "count (Int)",
      schema: v.parameters[2].schema,
      value: { kind: "int", text: "7" },
      expectedCbor: "07",
    },
  ];
  return { cases, defs };
}

function v11Cases(): { cases: ParamCase[]; defs: BlueprintDefinitions } {
  const defs = getDefinitions(v11Blueprint);
  const v = getValidator(v11Blueprint, "fixture.fixture.spend");
  const address = buildAddressFormValue(
    { paymentHashHex: B28, paymentIsScript: false },
    v.parameters[3].schema,
    defs
  );
  if (!address) throw new Error("buildAddressFormValue returned null");
  const cases: ParamCase[] = [
    {
      name: "owner (ByteArray)",
      schema: v.parameters[0].schema,
      value: { kind: "bytes", mode: "hex", text: B28 },
      expectedCbor: `581c${B28}`,
    },
    {
      name: "count (Int)",
      schema: v.parameters[1].schema,
      value: { kind: "int", text: "42" },
      expectedCbor: "182a",
    },
    {
      name: "utxo (flat OutputReference)",
      schema: v.parameters[2].schema,
      value: buildOutputReferenceFormValue(B32, "1", false),
      expectedCbor: `d8799f5820${B32}01ff`,
    },
    {
      name: "addr (Address, no stake)",
      schema: v.parameters[3].schema,
      value: address,
      expectedCbor: `d8799fd8799f581c${B28}ffd87a80ff`,
    },
    {
      name: "deadline (Int, BigInt > 2^40)",
      schema: v.parameters[4].schema,
      value: { kind: "int", text: "1700000000000" },
      expectedCbor: "1b0000018bcfe56800",
    },
  ];
  return { cases, defs };
}

// ---------------------------------------------------------------------------
// parameter application against aiken blueprint apply ground truth
// ---------------------------------------------------------------------------
function testApply() {
  console.log("\n--- parameter application (aiken ground truth) ---");

  // alpha (v1.0.29-alpha): chained `aiken blueprint apply` produced this hash
  const alpha = getValidator(alphaBlueprint, "fixture.spend");
  const { cases: aCases, defs: aDefs } = alphaCases();
  const alphaPayloads = aCases.map((c) => encodeFormValue(c.schema, aDefs, c.value));
  const alphaApplied = applyPayloadsAndHash(alpha.compiledCode, alphaPayloads, "V2");
  check(
    "alpha applied hash matches aiken v1.0.29-alpha",
    alphaApplied.hash === "c96fae3e691ed473b696661a005a4ab06268e66d0228ca4237d59163",
    alphaApplied.hash
  );

  // v1.1 (v1.1.23): chained `aiken blueprint apply` produced this hash
  const v11 = getValidator(v11Blueprint, "fixture.fixture.spend");
  const { cases: vCases, defs: vDefs } = v11Cases();
  const v11Payloads = vCases.map((c) => encodeFormValue(c.schema, vDefs, c.value));
  const v11Applied = applyPayloadsAndHash(v11.compiledCode, v11Payloads, "V3");
  check(
    "v1.1 applied hash matches aiken v1.1.23",
    v11Applied.hash === "5f8ce966f4a45d26db6384ea7c63672a716f4feb64de6e8f3b617e63",
    v11Applied.hash
  );

  // Unapplied hashes still resolve (sanity vs blueprint hash field)
  const unappliedAlpha = applyPayloadsAndHash(alpha.compiledCode, [], "V2");
  check(
    "alpha unapplied hash matches blueprint",
    unappliedAlpha.hash === alpha.hash,
    unappliedAlpha.hash
  );

  // Raw-constant application: the manual term pipeline must agree byte-for-byte
  // with UPLC.applyParamsToScript for Data params (mixed path forces manual).
  const dataPayload = v11Payloads[1]; // Int 42 as Data
  if (dataPayload.kind !== "data") throw new Error("expected data payload");
  const viaDefault = UPLC.applyParamsToScript(v11.compiledCode, [dataPayload.data]);
  const viaManual = applyPayloadsToScript(v11.compiledCode, [
    dataPayload,
    { kind: "raw", type: "Integer", value: 42n },
  ]);
  const viaManualDataOnlyForced = applyPayloadsToScript(
    UPLC.applyDoubleCborEncoding(v11.compiledCode),
    [dataPayload, { kind: "raw", type: "Integer", value: 42n }]
  );
  check(
    "manual term pipeline is deterministic across CBOR wrapping levels",
    viaManual === viaManualDataOnlyForced
  );
  // The raw-applied script must parse back and contain one more application
  const parsed = UPLC.fromCborHexToProgram(viaManual);
  check("raw-constant-applied script parses as UPLC", parsed.body !== undefined);
  check(
    "raw Integer constant differs from Data-encoded integer",
    viaManual !== UPLC.applyParamsToScript(v11.compiledCode, [dataPayload.data, 42n])
  );
  // Data-only through our helper must equal applyParamsToScript exactly
  const dataOnly = applyPayloadsToScript(v11.compiledCode, [dataPayload]);
  check("data-only path delegates to applyParamsToScript", dataOnly === viaDefault);
}

// ---------------------------------------------------------------------------
// misc encode/decode behaviors
// ---------------------------------------------------------------------------
function testEncodeBehaviors() {
  console.log("\n--- encode/decode behaviors ---");
  const defs = getDefinitions(v11Blueprint);
  const intSchema: BlueprintSchema = { $ref: "#/definitions/Int" };
  const bytesSchema: BlueprintSchema = { $ref: "#/definitions/ByteArray" };

  // BigInt end-to-end: value beyond Number.MAX_SAFE_INTEGER survives intact
  const big = "123456789012345678901234567890";
  const bigHex = payloadToCborHex(
    encodeFormValue(intSchema, defs, { kind: "int", text: big })
  );
  const decodedBig = decodeCborToFormValue(bigHex, intSchema, defs);
  check(
    "BigInt round-trip beyond 2^53",
    decodedBig?.kind === "int" && decodedBig.text === big,
    JSON.stringify(decodedBig)
  );

  // 0x stripping + odd-length rejection
  const stripped = payloadToCborHex(
    encodeFormValue(bytesSchema, defs, { kind: "bytes", mode: "hex", text: "0xAABB" })
  );
  check("0x prefix stripped and lowercased", stripped === "42aabb", stripped);
  let oddRejected = false;
  try {
    encodeFormValue(bytesSchema, defs, { kind: "bytes", mode: "hex", text: "abc" });
  } catch (e) {
    oddRejected = e instanceof EncodeError;
  }
  check("odd-length hex rejected", oddRejected);

  // UTF-8 bytes mode
  const utf8 = payloadToCborHex(
    encodeFormValue(bytesSchema, defs, { kind: "bytes", mode: "utf8", text: "hi" })
  );
  check("utf8 mode encodes text bytes", utf8 === "426869", utf8);

  // Validator ref resolution
  const viaRef = payloadToCborHex(
    encodeFormValue(
      bytesSchema,
      defs,
      { kind: "bytes", mode: "ref", text: "", ref: "someValidator" },
      { resolveValidatorRef: (h) => (h === "someValidator" ? B28 : undefined) }
    )
  );
  check("validator-hash reference resolves", viaRef === `581c${B28}`, viaRef);

  // Non-integer text rejected (no parseInt truncation)
  let floatRejected = false;
  try {
    encodeFormValue(intSchema, defs, { kind: "int", text: "1.5" });
  } catch (e) {
    floatRejected = e instanceof EncodeError;
  }
  check("non-integer text rejected", floatRejected);

  // Schema-mismatched CBOR does not load into form
  const mismatch = decodeCborToFormValue("182a", bytesSchema, defs);
  check("mismatched CBOR refuses form load", mismatch === null);

  // emptyFormValue on a deep constructor terminates and matches shape
  const v11 = getValidator(v11Blueprint, "fixture.fixture.spend");
  const empty = emptyFormValue(v11.parameters[3].schema, defs);
  check(
    "emptyFormValue builds Address default",
    empty.kind === "constr" && empty.fields.length === 2
  );
}

// ---------------------------------------------------------------------------
// review-pass regressions
// ---------------------------------------------------------------------------
function countFormNodes(v: FormValue): number {
  switch (v.kind) {
    case "list":
    case "tuple":
      return 1 + v.items.reduce((n, i) => n + countFormNodes(i), 0);
    case "map":
      return (
        1 +
        v.entries.reduce(
          (n, e) => n + countFormNodes(e.key) + countFormNodes(e.value),
          0
        )
      );
    case "constr":
      return 1 + v.fields.reduce((n, f) => n + countFormNodes(f), 0);
    default:
      return 1;
  }
}

function testReviewRegressions() {
  console.log("\n--- review regressions ---");

  // 1) describeSchema on cyclic list-items definitions must not throw
  const cyclicDefs: BlueprintDefinitions = {
    "types/L": { dataType: "list", items: { $ref: "#/definitions/types~1L" } },
  };
  let cyclicOk = true;
  let label = "";
  try {
    label = describeSchema({ $ref: "#/definitions/types~1L" }, cyclicDefs);
    label += " / " + describeSchema(
      { dataType: "list", items: { $ref: "#/definitions/types~1L" } },
      cyclicDefs
    );
  } catch (e) {
    cyclicOk = false;
    label = String(e);
  }
  check("describeSchema handles cyclic items without throwing", cyclicOk, label);

  // 2) emptyFormValue on a self-referential product type stays bounded
  const treeDefs: BlueprintDefinitions = {
    Int: { dataType: "integer" },
    Tree: {
      title: "Tree",
      anyOf: [
        {
          title: "Node",
          dataType: "constructor",
          index: 0,
          fields: [{ $ref: "#/definitions/Tree" }, { $ref: "#/definitions/Tree" }],
        },
        {
          title: "Leaf",
          dataType: "constructor",
          index: 1,
          fields: [{ $ref: "#/definitions/Int" }],
        },
      ],
    },
  };
  const tree = emptyFormValue({ $ref: "#/definitions/Tree" }, treeDefs);
  const nodeCount = countFormNodes(tree);
  // Budgeted nodes plus their CBOR-paste placeholders on exhausted branches:
  // O(budget), vs ~2^24 without the guard
  check(
    "emptyFormValue on Tree{Node,Leaf} is budget-bounded",
    nodeCount > 0 && nodeCount <= EMPTY_FORM_NODE_BUDGET * 3,
    `${nodeCount} nodes`
  );

  // 3) encodeParameterState must never Data-apply a raw-classified param
  //    whose CBOR does not decode as the raw constant
  const noRef = () => undefined;
  const cborState = (hex: string): ParameterState => ({
    name: "p",
    mode: "cbor",
    formValue: null,
    cborHex: hex,
  });
  const stringSchema: BlueprintSchema = { dataType: "#string" };
  const refused = encodeParameterState(stringSchema, {}, cborState("d8799fff"), noRef);
  check(
    "raw #string with Data-shaped CBOR is refused (no Data fallback)",
    refused === null,
    JSON.stringify(refused)
  );

  const text = encodeParameterState(stringSchema, {}, cborState("6568656c6c6f"), noRef);
  check(
    "raw #string round-trips CBOR text",
    text?.kind === "raw" && text.type === "String" && text.value === "hello",
    JSON.stringify(text)
  );
  const boolTrue = encodeParameterState(
    { dataType: "#boolean" }, {}, cborState("f5"), noRef
  );
  check(
    "raw #boolean round-trips CBOR true",
    boolTrue?.kind === "raw" && boolTrue.type === "Bool" && boolTrue.value === true
  );
  const unit = encodeParameterState({ dataType: "#unit" }, {}, cborState("f6"), noRef);
  check(
    "raw #unit round-trips CBOR null",
    unit?.kind === "raw" && unit.type === "Unit"
  );
  const dataInt = encodeParameterState(
    { dataType: "integer" }, {}, cborState("182a"), noRef
  );
  check(
    "Data-level CBOR still applies as Data",
    dataInt?.kind === "data" && dataInt.data === 42n
  );

  // 4) payloadToCborHex emits faithful CBOR for raw kinds and round-trips
  //    through decode (Form <-> CBOR mode switch coherence)
  const stringHex = payloadToCborHex({ kind: "raw", type: "String", value: "hi" });
  const stringBack = decodeCborToFormValue(stringHex, stringSchema, {});
  check(
    "raw String CBOR carrier round-trips (no lossy Data stand-in)",
    stringHex === "626869" && stringBack?.kind === "text" && stringBack.text === "hi",
    `${stringHex} -> ${JSON.stringify(stringBack)}`
  );
  const boolHex = payloadToCborHex({ kind: "raw", type: "Bool", value: false });
  const unitHex = payloadToCborHex({ kind: "raw", type: "Unit", value: null });
  check(
    "raw Bool/Unit carriers are CBOR simples (not Data constrs)",
    boolHex === "f4" && unitHex === "f6",
    `${boolHex} ${unitHex}`
  );

  // 5) submission gate: raw payloads are flagged
  const rawPayload = encodeFormValue({ dataType: "#integer" }, {}, {
    kind: "int",
    text: "7",
  });
  const dataPayload = encodeFormValue({ dataType: "integer" }, {}, {
    kind: "int",
    text: "7",
  });
  check(
    "hasRawPayload flags raw params for the registry gate",
    hasRawPayload([dataPayload, rawPayload]) && !hasRawPayload([dataPayload])
  );

  // 6) empty UTF-8 bytes input is incomplete, matching empty-hex behavior
  let emptyUtf8Rejected = false;
  try {
    encodeFormValue({ dataType: "bytes" }, {}, { kind: "bytes", mode: "utf8", text: "" });
  } catch (e) {
    emptyUtf8Rejected = e instanceof EncodeError;
  }
  check("empty UTF-8 bytes input rejected like empty hex", emptyUtf8Rejected);
}

function main() {
  console.log("=".repeat(80));
  console.log("Blueprint builder tests");
  console.log("=".repeat(80));

  testResolve();
  testClassification();
  testWellKnown();

  console.log("\n--- encode round-trips: alpha blueprint (v1.0.29-alpha) ---");
  const a = alphaCases();
  runParamCases("alpha", a.cases, a.defs);

  console.log("\n--- encode round-trips: v1.1 blueprint (v1.1.23) ---");
  const v = v11Cases();
  runParamCases("v1.1", v.cases, v.defs);

  testApply();
  testEncodeBehaviors();
  testReviewRegressions();

  console.log();
  if (failures > 0) {
    console.log(`❌ ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("✅ All blueprint builder tests passed");
}

main();
