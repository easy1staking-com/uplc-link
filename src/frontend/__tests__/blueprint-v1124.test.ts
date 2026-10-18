/**
 * Aiken v1.1.24 blueprint shapes through the FE parameter builder: the eight
 * `fixture.vault` parameters resolve, classify, encode (form, deep-link
 * decode, CBOR mode) and hash exactly as `aiken blueprint apply` does.
 *
 * Provenance:
 * - fixtures/blueprint-v1124-{default,preview}.json and
 *   fixtures/blueprint-v1124-oracle.json: T-404 fixture project
 *   examples/aiken-v1.1.24 (Aiken v1.1.24+bacbeb3, aiken-lang/stdlib v4.0.0),
 *   built without `--env` and with `--env preview`; the oracle's parameter
 *   CBORs and applied_hashes come from chaining `aiken blueprint apply`
 *   (see examples/aiken-v1.1.24/README.md). Never hand-edited.
 * - Variant hashes (KEY / SCR payee, MIX minimum): Aiken v1.1.24+bacbeb3,
 *   `aiken blueprint apply -m fixture -v vault <cbor>` chained from the
 *   committed fixture blueprints — params 1–6 = the oracle CBORs, then the
 *   variant (MIX is applied after KEY); hash of `fixture.vault.spend`.
 */

import {
  classifySchema,
  describeSchema,
  emptyFormValue,
} from "../lib/blueprint/schema";
import { resolveSchema } from "../lib/blueprint/resolve";
import {
  encodeFormValue,
  payloadToCborHex,
  EncodeError,
  type ParamPayload,
} from "../lib/blueprint/encode";
import { decodeCborToFormValue } from "../lib/blueprint/decode";
import { encodeParameterState } from "../lib/blueprint/param-state";
import { applyPayloadsAndHash } from "../lib/blueprint/apply-params";
import {
  matchWellKnown,
  buildAddressFormValue,
  buildOutputReferenceFormValue,
  type WellKnownMatch,
} from "../lib/blueprint/well-known";
import type {
  BlueprintDefinitions,
  BlueprintPreamble,
  BlueprintSchema,
  FormValue,
} from "../lib/blueprint/types";

import defaultJson from "./fixtures/blueprint-v1124-default.json";
import previewJson from "./fixtures/blueprint-v1124-preview.json";
import oracleJson from "./fixtures/blueprint-v1124-oracle.json";

interface Blueprint {
  preamble: BlueprintPreamble;
  validators: {
    title: string;
    hash: string;
    compiledCode: string;
    parameters?: { title?: string; schema: BlueprintSchema }[];
    datum?: { schema: BlueprintSchema };
    redeemer?: { schema: BlueprintSchema };
  }[];
  definitions: BlueprintDefinitions;
}

interface Oracle {
  parameters: { title: string; cbor: string }[];
  builds: { env: string; unapplied_hash: string; applied_hashes: string[] }[];
}

const ORACLE = oracleJson as unknown as Oracle;
const VALIDATOR = "fixture.vault.spend";

const ENVS: { env: string; blueprint: Blueprint; build: string }[] = [
  { env: "default", blueprint: defaultJson as unknown as Blueprint, build: "" },
  { env: "preview", blueprint: previewJson as unknown as Blueprint, build: "preview" },
];

/** Per parameter, in order: definitions key, classification, smart widget, empty form kind. */
const EXPECTED: {
  ref: string;
  kind: string;
  widget: WellKnownMatch | null;
  empty: FormValue["kind"];
}[] = [
  { ref: "ByteArray", kind: "bytes", widget: null, empty: "bytes" },
  { ref: "Int", kind: "integer", widget: null, empty: "int" },
  { ref: "Pair<Int,ByteArray>", kind: "tuple", widget: null, empty: "tuple" },
  { ref: "Tuple<<ByteArray,Int>>", kind: "tuple", widget: null, empty: "tuple" },
  { ref: "Option<Option<Int>>", kind: "constructor", widget: null, empty: "constr" },
  {
    ref: "cardano/transaction/OutputReference",
    kind: "constructor",
    widget: { widget: "output-reference", txIdNested: false },
    empty: "constr",
  },
  {
    ref: "cardano/address/Address",
    kind: "constructor",
    widget: { widget: "address" },
    empty: "constr",
  },
  { ref: "Value", kind: "map", widget: null, empty: "map" },
];

const CD28 = "cd".repeat(28);
const EF28 = "ef".repeat(28);
const EE28 = "ee".repeat(28);

const KEY_CBOR = "d8799fd8799f581c" + CD28 + "ffd8799fd8799fd8799f581c" + EF28 + "ffffffff";
const SCR_CBOR = "d8799fd87a9f581c" + CD28 + "ffd8799fd8799fd87a9f581c" + EF28 + "ffffffff";
const MIX_CBOR = "a240a1401a001e8480581c" + EE28 + "a1436162631864";

const VARIANT_HASHES: Record<string, { key: string; mix: string; scr: string }> = {
  default: {
    key: "e7d3e3b9f9eac526ed64f72518dbaf24776939850386646f29a7717c",
    mix: "23d38dbb36e4bfc52782f5df3832aac25a03aa670b0442500526af75",
    scr: "2189ced620b9106b5a9760d4b2f0278444c25408b4e70f610e5456a3",
  },
  preview: {
    key: "1f4ab9ec9e295b41c32c28f5337b1051bb1af14de9f30ccd0556d6e7",
    mix: "f0c35555ccbb0e92594d7c2c203c62001a54efa273e6d761b4ea7324",
    scr: "d5862029b09d9f8f0570a56d846e8488450a36b2d6a4dbec87f17953",
  },
};

/** ADA-only `minimum` entry: empty policy id and empty asset name, typed as "0x". */
const ADA_ENTRY: { key: FormValue; value: FormValue } = {
  key: { kind: "bytes", mode: "hex", text: "0x" },
  value: {
    kind: "map",
    entries: [
      { key: { kind: "bytes", mode: "hex", text: "0x" }, value: { kind: "int", text: "2000000" } },
    ],
  },
};

const MIX_FORM: FormValue = {
  kind: "map",
  entries: [
    ADA_ENTRY,
    {
      key: { kind: "bytes", mode: "hex", text: EE28 },
      value: {
        kind: "map",
        entries: [
          { key: { kind: "bytes", mode: "utf8", text: "abc" }, value: { kind: "int", text: "100" } },
        ],
      },
    },
  ],
};

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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

function expectDeepEqual(actual: unknown, expected: unknown): string | null {
  return deepEqual(actual, expected)
    ? null
    : `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`;
}

function getSpend(bp: Blueprint) {
  const v = bp.validators.find((x) => x.title === VALIDATOR);
  if (!v) throw new Error(`validator ${VALIDATOR} missing`);
  if (!v.parameters || v.parameters.length !== 8) throw new Error("expected 8 parameters");
  return v;
}

function getBuild(build: string) {
  const b = ORACLE.builds.find((x) => x.env === build);
  if (!b) throw new Error(`oracle build env ${JSON.stringify(build)} missing`);
  return b;
}

function paramSchema(bp: Blueprint, i: number): BlueprintSchema {
  return getSpend(bp).parameters![i].schema;
}

/** The FormValues the UI produces for the eight oracle parameters (smart widgets for seed/payee). */
function buildForm(bp: Blueprint): FormValue[] {
  const defs = bp.definitions;
  const payee = buildAddressFormValue(
    { paymentHashHex: CD28, paymentIsScript: false },
    paramSchema(bp, 6),
    defs
  );
  if (!payee) throw new Error("buildAddressFormValue returned null for payee");
  return [
    { kind: "bytes", mode: "hex", text: "ab".repeat(28) },
    { kind: "int", text: "2000000" },
    { kind: "tuple", items: [{ kind: "int", text: "1" }, { kind: "bytes", mode: "hex", text: "cafe" }] },
    { kind: "tuple", items: [{ kind: "bytes", mode: "hex", text: "beef" }, { kind: "int", text: "2" }] },
    {
      kind: "constr",
      variant: 0,
      fields: [{ kind: "constr", variant: 0, fields: [{ kind: "int", text: "7" }] }],
    },
    buildOutputReferenceFormValue("11".repeat(32), "0", false),
    payee,
    { kind: "map", entries: [ADA_ENTRY] },
  ];
}

/** Form payloads of the first k parameters (only those are encoded). */
function formPayloads(bp: Blueprint, k: number): ParamPayload[] {
  return buildForm(bp)
    .slice(0, k)
    .map((fv, i) => encodeFormValue(paramSchema(bp, i), bp.definitions, fv));
}

/** CBOR-mode payloads of the first k oracle parameters (only those are encoded). */
function cborModePayloads(bp: Blueprint, k: number): ParamPayload[] {
  return ORACLE.parameters.slice(0, k).map(({ title, cbor }, i) => {
    const payload = encodeParameterState(
      paramSchema(bp, i),
      bp.definitions,
      { name: title, mode: "cbor", formValue: null, cborHex: cbor },
      () => undefined
    );
    if (!payload) throw new Error(`cbor-mode payload for ${title} is null`);
    return payload;
  });
}

function chainHash(bp: Blueprint, payloads: ParamPayload[]): string {
  return applyPayloadsAndHash(getSpend(bp).compiledCode, payloads, "V3").hash;
}

/** Collect every $ref under a schema node. */
function collectRefs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const n = node as BlueprintSchema;
  if (typeof n.$ref === "string") out.push(n.$ref);
  if (n.items !== undefined) collectRefs(n.items, out);
  if (n.keys !== undefined) collectRefs(n.keys, out);
  if (n.values !== undefined) collectRefs(n.values, out);
  if (n.fields !== undefined) collectRefs(n.fields, out);
  if (n.anyOf !== undefined) collectRefs(n.anyOf, out);
  if (n.oneOf !== undefined) collectRefs(n.oneOf, out);
}

function testEnv(env: string, bp: Blueprint, build: string): boolean {
  let ok = true;
  const titles = ORACLE.parameters.map((p) => p.title);

  ok = check(`titles ${env}`, () => {
    const actual = getSpend(bp).parameters!.map((p) => p.title ?? "");
    if (actual.join(",") !== titles.join(",")) return `${actual.join(",")} != ${titles.join(",")}`;
    return expectEqual(bp.preamble.plutusVersion ?? "", "v3");
  }) && ok;

  ok = check(`refs ${env} every $ref resolves`, () => {
    const refs: string[] = [];
    for (const def of Object.values(bp.definitions)) collectRefs(def, refs);
    for (const v of bp.validators) {
      for (const p of v.parameters ?? []) collectRefs(p.schema, refs);
      if (v.datum) collectRefs(v.datum.schema, refs);
      if (v.redeemer) collectRefs(v.redeemer.schema, refs);
    }
    if (refs.length === 0) return "no $ref seen";
    const dangling = refs.filter((r) => resolveSchema({ $ref: r }, bp.definitions).dangling);
    return dangling.length === 0 ? null : `dangling: ${dangling.join(", ")}`;
  }) && ok;

  for (let i = 0; i < 8; i++) {
    const title = titles[i];
    const exp = EXPECTED[i];

    ok = check(`resolve ${env} ${title}`, () => {
      const r = resolveSchema(paramSchema(bp, i), bp.definitions);
      if (r.dangling) return "dangling";
      return expectEqual(r.refName ?? "", exp.ref);
    }) && ok;

    ok = check(`classify ${env} ${title}`, () => {
      const defs = bp.definitions;
      const c = classifySchema(paramSchema(bp, i), defs);
      if (c.kind !== exp.kind) return `kind ${c.kind} != ${exp.kind}`;
      if (describeSchema(paramSchema(bp, i), defs) === "") return "describeSchema is empty";
      if (title === "minimum") {
        if (c.kind !== "map") return "not a map";
        const keys = classifySchema(c.keys, defs);
        if (keys.kind !== "bytes") return `keys ${keys.kind} != bytes`;
        const values = classifySchema(c.values, defs);
        if (values.kind !== "map") return `values ${values.kind} != map`;
        const innerKeys = classifySchema(values.keys, defs).kind;
        if (innerKeys !== "bytes") return `inner keys ${innerKeys} != bytes`;
        const innerValues = classifySchema(values.values, defs).kind;
        if (innerValues !== "integer") return `inner values ${innerValues} != integer`;
      }
      return null;
    }) && ok;

    ok = check(`widget ${env} ${title}`, () =>
      expectDeepEqual(matchWellKnown(paramSchema(bp, i), bp.definitions), exp.widget)
    ) && ok;

    ok = check(`empty-form ${env} ${title}`, () =>
      expectEqual(emptyFormValue(paramSchema(bp, i), bp.definitions).kind, exp.empty)
    ) && ok;

    ok = check(`form ${env} ${title}`, () =>
      expectEqual(
        payloadToCborHex(encodeFormValue(paramSchema(bp, i), bp.definitions, buildForm(bp)[i])),
        ORACLE.parameters[i].cbor
      )
    ) && ok;
  }

  ok = check(`form ${env} payee manual`, () => {
    const manual: FormValue = {
      kind: "constr",
      variant: 0,
      fields: [
        { kind: "constr", variant: 0, fields: [{ kind: "bytes", mode: "hex", text: CD28 }] },
        { kind: "constr", variant: 1, fields: [] },
      ],
    };
    return expectEqual(
      payloadToCborHex(encodeFormValue(paramSchema(bp, 6), bp.definitions, manual)),
      ORACLE.parameters[6].cbor
    );
  }) && ok;

  for (let i = 0; i < 8; i++) {
    const title = titles[i];

    ok = check(`decode ${env} ${title}`, () => {
      const cbor = ORACLE.parameters[i].cbor;
      const decoded = decodeCborToFormValue(cbor, paramSchema(bp, i), bp.definitions);
      if (!decoded) return "decoded is null";
      return expectEqual(
        payloadToCborHex(encodeFormValue(paramSchema(bp, i), bp.definitions, decoded)),
        cbor
      );
    }) && ok;

    ok = check(`cbor-mode ${env} ${title}`, () => {
      const cbor = ORACLE.parameters[i].cbor;
      const payload = encodeParameterState(
        paramSchema(bp, i),
        bp.definitions,
        { name: title, mode: "cbor", formValue: null, cborHex: cbor },
        () => undefined
      );
      if (!payload) return "payload is null";
      return expectEqual(payloadToCborHex(payload), cbor);
    }) && ok;
  }

  ok = check(`unapplied ${env}`, () => {
    const spend = getSpend(bp);
    const hash = applyPayloadsAndHash(spend.compiledCode, [], "V3").hash;
    const expected = getBuild(build).unapplied_hash;
    if (hash !== expected) return `${hash} != oracle ${expected}`;
    return expectEqual(spend.hash, expected);
  }) && ok;

  for (let k = 1; k <= 8; k++) {
    ok = check(`chain form ${env} k=${k}`, () =>
      expectEqual(chainHash(bp, formPayloads(bp, k)), getBuild(build).applied_hashes[k - 1])
    ) && ok;
  }

  for (let k = 1; k <= 8; k++) {
    ok = check(`chain cbor-mode ${env} k=${k}`, () =>
      expectEqual(
        chainHash(bp, cborModePayloads(bp, k)),
        getBuild(build).applied_hashes[k - 1]
      )
    ) && ok;
  }

  const keyPayee = () => {
    const fv = buildAddressFormValue(
      { paymentHashHex: CD28, paymentIsScript: false, stakeHashHex: EF28, stakeIsScript: false },
      paramSchema(bp, 6),
      bp.definitions
    );
    if (!fv) throw new Error("buildAddressFormValue returned null (KEY)");
    return encodeFormValue(paramSchema(bp, 6), bp.definitions, fv);
  };
  const scrPayee = () => {
    const fv = buildAddressFormValue(
      { paymentHashHex: CD28, paymentIsScript: true, stakeHashHex: EF28, stakeIsScript: true },
      paramSchema(bp, 6),
      bp.definitions
    );
    if (!fv) throw new Error("buildAddressFormValue returned null (SCR)");
    return encodeFormValue(paramSchema(bp, 6), bp.definitions, fv);
  };
  const mixMinimum = () => encodeFormValue(paramSchema(bp, 7), bp.definitions, MIX_FORM);
  const hashes = VARIANT_HASHES[env];

  ok = check(`variant ${env} payee stake-key cbor`, () =>
    expectEqual(payloadToCborHex(keyPayee()), KEY_CBOR)
  ) && ok;
  ok = check(`variant ${env} payee stake-key k=7`, () =>
    expectEqual(chainHash(bp, [...formPayloads(bp, 6), keyPayee()]), hashes.key)
  ) && ok;

  ok = check(`variant ${env} payee script cbor`, () =>
    expectEqual(payloadToCborHex(scrPayee()), SCR_CBOR)
  ) && ok;
  ok = check(`variant ${env} payee script k=7`, () =>
    expectEqual(chainHash(bp, [...formPayloads(bp, 6), scrPayee()]), hashes.scr)
  ) && ok;

  ok = check(`variant ${env} minimum ada+asset cbor`, () =>
    expectEqual(payloadToCborHex(mixMinimum()), MIX_CBOR)
  ) && ok;
  ok = check(`variant ${env} minimum ada+asset k=8`, () =>
    expectEqual(
      chainHash(bp, [...formPayloads(bp, 6), keyPayee(), mixMinimum()]),
      hashes.mix
    )
  ) && ok;

  return ok;
}

function testEmptyBytes(): boolean {
  let ok = true;
  const defs = (defaultJson as unknown as Blueprint).definitions;
  const byteArray: BlueprintSchema = { $ref: "#/definitions/ByteArray" };

  ok = check(`empty-bytes hex "" refused`, () => {
    try {
      encodeFormValue(byteArray, defs, { kind: "bytes", mode: "hex", text: "" });
    } catch (e) {
      return e instanceof EncodeError ? null : `threw non-EncodeError ${String(e)}`;
    }
    return "did not throw";
  }) && ok;

  ok = check(`empty-bytes 0x encodes 40`, () =>
    expectEqual(
      payloadToCborHex(encodeFormValue(byteArray, defs, { kind: "bytes", mode: "hex", text: "0x" })),
      "40"
    )
  ) && ok;

  ok = check(`empty-bytes decode 40`, () =>
    expectDeepEqual(decodeCborToFormValue("40", byteArray, defs), {
      kind: "bytes",
      mode: "hex",
      text: "0x",
    })
  ) && ok;

  ok = check(`empty-bytes cbor-mode 40`, () => {
    const payload = encodeParameterState(
      byteArray,
      defs,
      { name: "owner", mode: "cbor", formValue: null, cborHex: "40" },
      () => undefined
    );
    if (!payload) return "payload is null";
    return expectEqual(payloadToCborHex(payload), "40");
  }) && ok;

  ok = check(`empty-bytes raw #bytes 40`, () => {
    const payload = encodeParameterState(
      { dataType: "#bytes" },
      defs,
      { name: "raw", mode: "cbor", formValue: null, cborHex: "40" },
      () => undefined
    );
    if (!payload) return "payload is null";
    if (payload.kind !== "raw" || payload.type !== "ByteString")
      return `payload ${payload.kind} is not a raw ByteString`;
    if (!(payload.value instanceof Uint8Array)) return "value is not a Uint8Array";
    return payload.value.length === 0 ? null : `length ${payload.value.length} != 0`;
  }) && ok;

  return ok;
}

function testBlueprintV1124(): boolean {
  let ok = true;
  for (const { env, blueprint, build } of ENVS) {
    ok = testEnv(env, blueprint, build) && ok;
  }
  ok = testEmptyBytes() && ok;
  return ok;
}

if (require.main === module) {
  process.exit(testBlueprintV1124() ? 0 : 1);
}

export { testBlueprintV1124 };
