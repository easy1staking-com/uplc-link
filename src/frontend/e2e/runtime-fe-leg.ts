/**
 * FE leg of the runtime-image E2E (see e2e/runtime/README.md at the repo root).
 *
 * Runs on the host against the FE container's real /api/verify and the BE
 * container's public API; it imports the FE's own modules (relative paths, so
 * tsx resolves @evolution-sdk/evolution from this package's node_modules).
 *
 *   npx tsx e2e/runtime-fe-leg.ts prepare --fe-url --oracle --source-url --commit --source-path --out-dir
 *   npx tsx e2e/runtime-fe-leg.ts check   --fe-url --be-url --oracle --out-dir --timeout-s
 *
 * Every label prints exactly once as `PASS <label>` or `FAIL <label> — <detail>`
 * at line start; the last line is `FE-LEG <mode>: PASS|FAIL`. Exit 0 iff no FAIL.
 * Every expected hash and CBOR comes from the oracle file; none is a literal.
 * CommonJS under tsx (no "type" in e2e/package.json): no top-level await.
 */

import * as fs from "fs";
import * as path from "path";
import * as Data from "@evolution-sdk/evolution/Data";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import { TransactionMetadatum } from "@evolution-sdk/evolution";
import { payloadToCborHex, type ParamPayload } from "../lib/blueprint/encode";
import { applyPayloadsAndHash } from "../lib/blueprint/apply-params";
import { encodeVerificationMetadata, chunkMetadata } from "../lib/cardano/metadata-encoder";

const COMPILER_VERSION = "v1.1.24";
const VALIDATOR = "fixture.vault";
const ENVS = [
  { name: "default", requestEnv: undefined as string | undefined, oracleEnv: "", n: 1 },
  { name: "preview", requestEnv: "preview" as string | undefined, oracleEnv: "preview", n: 2 },
];

interface OracleBuild { env: string; unapplied_hash: string; applied_hashes: string[] }
interface Oracle {
  compiler: string;
  parameters: { title: string; cbor: string }[];
  builds: OracleBuild[];
}
interface Expected { env: string; txHash: string; rawHash: string; finalHash: string }

let failures = 0;

function pass(label: string): void {
  console.log(`PASS ${label}`);
}

function fail(label: string, detail: string): void {
  failures++;
  console.log(`FAIL ${label} — ${detail.replace(/\s+/g, " ").slice(0, 600)}`);
}

/** Run one check; `fn` returns null on success or a failure detail. */
async function check(label: string, fn: () => Promise<string | null> | string | null): Promise<boolean> {
  try {
    const detail = await fn();
    if (detail === null) {
      pass(label);
      return true;
    }
    fail(label, detail);
  } catch (e) {
    fail(label, `threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  return false;
}

function skipped(label: string, reason: string): void {
  fail(label, `skipped: ${reason}`);
}

function parseArgs(argv: string[]): { mode: string; opts: Record<string, string> } {
  const [mode, ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith("--") || rest[i + 1] === undefined) {
      throw new Error(`bad arguments near ${rest[i]}`);
    }
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  return { mode, opts };
}

function need(opts: Record<string, string>, keys: string[]): void {
  for (const k of keys) {
    if (!(k in opts)) throw new Error(`missing --${k}`);
  }
}

function buildFor(oracle: Oracle, oracleEnv: string): OracleBuild {
  const b = oracle.builds.find((x) => x.env === oracleEnv);
  if (!b) throw new Error(`oracle has no build for env "${oracleEnv}"`);
  return b;
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const hexOf = (b: unknown): string => (b instanceof Uint8Array ? Bytes.toHex(b) : `<${typeof b}>`);
const utf8 = (s: string): string => Bytes.toHex(new TextEncoder().encode(s));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function prepare(opts: Record<string, string>): Promise<void> {
  need(opts, ["fe-url", "oracle", "source-url", "commit", "source-path", "out-dir"]);
  const oracle: Oracle = JSON.parse(fs.readFileSync(opts["oracle"], "utf-8"));
  const outDir = opts["out-dir"];
  fs.mkdirSync(outDir, { recursive: true });

  // Always created: a missing file would be bind-mounted as a directory and break BE start
  const replayLines: string[] = [];
  const expected: Expected[] = [];
  const titles = oracle.parameters.map((p) => p.title);
  const cbors = oracle.parameters.map((p) => p.cbor);

  for (const env of ENVS) {
    const L = (name: string) => `${name} ${env.name}`;
    const build = buildFor(oracle, env.oracleEnv);
    let body: Json = null;
    let result: Json = null;

    const verified = await check(L("fe verify"), async () => {
      const req: Record<string, unknown> = {
        repoUrl: opts["source-url"],
        commitHash: opts["commit"],
        aikenVersion: COMPILER_VERSION,
        sourcePath: opts["source-path"],
      };
      if (env.requestEnv !== undefined) req.env = env.requestEnv;
      const res = await fetch(`${opts["fe-url"]}/api/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(600000),
      });
      const text = await res.text();
      try { body = JSON.parse(text); } catch { return `HTTP ${res.status}, non-JSON body: ${text.slice(0, 200)}`; }
      if (res.status !== 200) return `HTTP ${res.status}: ${body?.error ?? text.slice(0, 200)}`;
      if (body.success !== true) return `success=${body.success}: ${body.error ?? ""}`;
      if (body.preamble?.compiler?.version !== oracle.compiler) {
        return `preamble.compiler.version=${body.preamble?.compiler?.version}, oracle ${oracle.compiler}`;
      }
      return null;
    });

    const rawOk = verified
      ? await check(L("fe raw-hash"), () => {
          const matching = (body.results as Json[]).filter((r) => r.validator === VALIDATOR);
          if (matching.length !== 1) return `${matching.length} results named ${VALIDATOR}, expected exactly 1`;
          const r = matching[0];
          if (!(r.purposes ?? []).includes("spend") || !(r.purposes ?? []).includes("else")) {
            return `purposes ${JSON.stringify(r.purposes)} lack spend/else`;
          }
          if (r.hash !== build.unapplied_hash || r.actual !== build.unapplied_hash) {
            return `hash=${r.hash} actual=${r.actual}, oracle unapplied ${build.unapplied_hash}`;
          }
          if (r.plutusVersion !== "V3") return `plutusVersion=${r.plutusVersion}`;
          const got = (r.parameters ?? []).map((p: Json) => p.title);
          if (!eq(got, titles)) return `parameter titles ${JSON.stringify(got)} != oracle ${JSON.stringify(titles)}`;
          result = r;
          return null;
        })
      : (skipped(L("fe raw-hash"), "fe verify failed"), false);

    // Payloads are built from the oracle CBORs alone: they do not need the build
    const payloads: ParamPayload[] = cbors.map((c) => ({ kind: "data", data: Data.fromCBORHex(c) }));

    await check(L("fe param-cbor"), () => {
      for (let i = 0; i < cbors.length; i++) {
        const got = payloadToCborHex({ kind: "data", data: Data.fromCBORHex(cbors[i]) });
        if (got !== cbors[i]) return `${titles[i]}: ${got} != ${cbors[i]}`;
      }
      return null;
    });

    let finalHash = "";
    if (rawOk) {
      await check(L("fe apply"), () => {
        for (let k = 1; k <= payloads.length; k++) {
          const h = applyPayloadsAndHash(result.compiledCode, payloads.slice(0, k), result.plutusVersion).hash;
          if (h !== build.applied_hashes[k - 1]) return `k=${k}: ${h} != ${build.applied_hashes[k - 1]}`;
          finalHash = h;
        }
        return null;
      });
    } else {
      skipped(L("fe apply"), "fe raw-hash failed");
    }

    if (rawOk) {
      await check(L("fe metadata"), () => {
        const txHash = "e2e0" + env.n.toString(16).padStart(60, "0");
        const hex = encodeVerificationMetadata({
          sourceUrl: opts["source-url"],
          commitHash: opts["commit"],
          sourcePath: opts["source-path"],
          compilerVersion: COMPILER_VERSION,
          env: env.requestEnv,
          parameters: { [result.actual]: cbors },
        });
        const d = Data.fromCBORHex(hex) as Json;
        if (!(d && typeof d === "object" && d.index === 0n && Array.isArray(d.fields))) return "not a constr";
        if (d.fields.length !== 6) return `${d.fields.length} fields, expected 6`;
        const f = d.fields;
        const want = [
          utf8(opts["source-url"]),
          opts["commit"].toLowerCase(),
          utf8(opts["source-path"]),
          utf8(COMPILER_VERSION),
          env.requestEnv === undefined ? "" : utf8(env.requestEnv),
        ];
        for (let i = 0; i < 5; i++) {
          if (hexOf(f[i]) !== want[i]) return `field ${i}: ${hexOf(f[i])} != ${want[i]}`;
        }
        const m = f[5];
        if (!(m instanceof Map) || m.size !== 1) return "field 5 is not a one-entry map";
        const [[k, v]] = [...m.entries()];
        if (hexOf(k) !== result.actual) return `map key ${hexOf(k)} != raw hash ${result.actual}`;
        if (!Array.isArray(v) || v.length !== cbors.length) return "map value is not a list of 8";
        for (let i = 0; i < cbors.length; i++) {
          if (hexOf(v[i]) !== cbors[i]) return `param ${i}: ${hexOf(v[i])} != ${cbors[i]}`;
        }

        const labelHex = TransactionMetadatum.toCBORHex(
          TransactionMetadatum.map(
            new Map([[1984n, TransactionMetadatum.array(
              chunkMetadata(hex, 128).map((c) => TransactionMetadatum.bytes(Bytes.fromHex(c))),
            )]]),
          ),
        );
        const back = TransactionMetadatum.fromCBORHex(labelHex) as Json;
        const chunks = back instanceof Map ? back.get(1984n) : undefined;
        if (!Array.isArray(chunks)) return "label CBOR does not decode to {1984: [chunks]}";
        const joined = (chunks as unknown[]).map(hexOf).join("");
        if (joined !== hex) return "reassembled chunks differ from the metadata hex";

        replayLines.push(`${txHash} ${labelHex}`);
        expected.push({ env: env.name, txHash, rawHash: result.actual, finalHash });
        return null;
      });
    } else {
      skipped(L("fe metadata"), "fe raw-hash failed");
    }
  }

  fs.writeFileSync(path.join(outDir, "replay.txt"), replayLines.map((l) => l + "\n").join(""));
  fs.writeFileSync(path.join(outDir, "expected.json"), JSON.stringify(expected, null, 2));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function checkMode(opts: Record<string, string>): Promise<void> {
  need(opts, ["fe-url", "be-url", "oracle", "out-dir", "timeout-s"]);
  const oracle: Oracle = JSON.parse(fs.readFileSync(opts["oracle"], "utf-8"));
  const expected: Expected[] = JSON.parse(fs.readFileSync(path.join(opts["out-dir"], "expected.json"), "utf-8"));
  const cbors = oracle.parameters.map((p) => p.cbor);
  const deadline = Date.now() + Number(opts["timeout-s"]) * 1000;
  const TERMINAL = ["VERIFIED", "FAILED", "REJECTED"];

  const inputs = readInputs(opts);

  for (const env of ENVS) {
    const L = (name: string) => `${name} ${env.name}`;
    const build = buildFor(oracle, env.oracleEnv);
    const exp = expected.find((e) => e.env === env.name);
    if (!exp) {
      for (const n of ["be verified", "be script", "be final-hash", "fe proxy"]) {
        skipped(L(n), "prepare produced no txHash for this env");
      }
      continue;
    }

    // Poll until terminal, an error message (fail fast), or the shared deadline
    let req: Json = null;
    let pollNote = "";
    for (;;) {
      try {
        const res = await fetch(`${opts["be-url"]}/api/v1/verification-requests/by-tx/${exp.txHash}`);
        if (res.status === 200) {
          req = await res.json();
          if (TERMINAL.includes(req.status) || req.errorMessage) break;
        } else {
          pollNote = `last poll HTTP ${res.status}`;
        }
      } catch (e) {
        pollNote = `last poll threw ${e instanceof Error ? e.message : String(e)}`;
      }
      if (Date.now() >= deadline) break;
      await sleep(5000);
    }

    const verifiedOk = await check(L("be verified"), () => {
      if (!req) return `no verification request before the deadline (${pollNote})`;
      if (req.status !== "VERIFIED") return `status=${req.status} errorMessage=${req.errorMessage}`;
      if (req.errorMessage !== null) return `errorMessage=${req.errorMessage}`;
      const wantEnv = env.requestEnv === undefined ? null : env.requestEnv;
      if (req.env !== wantEnv) return `env=${JSON.stringify(req.env)}, expected ${JSON.stringify(wantEnv)}`;
      if (req.sourceUrl !== inputs.sourceUrl) return `sourceUrl=${req.sourceUrl}`;
      if (req.commitHash !== inputs.commit) return `commitHash=${req.commitHash}`;
      if (req.sourcePath !== inputs.sourcePath) return `sourcePath=${req.sourcePath}`;
      if (req.compilerVersion !== COMPILER_VERSION) return `compilerVersion=${req.compilerVersion}`;
      return null;
    });

    const scriptOk = verifiedOk
      ? await check(L("be script"), () => {
          const scripts: Json[] = req.scripts ?? [];
          if (scripts.length !== 1) return `${scripts.length} scripts, expected exactly 1`;
          const s = scripts[0];
          if (s.scriptName !== VALIDATOR) return `scriptName=${s.scriptName}`;
          if (!(s.purposes ?? []).includes("spend") || !(s.purposes ?? []).includes("else")) {
            return `purposes ${JSON.stringify(s.purposes)} lack spend/else`;
          }
          if (s.rawHash !== build.unapplied_hash) return `rawHash=${s.rawHash}, oracle ${build.unapplied_hash}`;
          if (s.parameterizationStatus !== "COMPLETE") return `parameterizationStatus=${s.parameterizationStatus}`;
          if (!eq(s.providedParameters, cbors)) return `providedParameters ${JSON.stringify(s.providedParameters)}`;
          return null;
        })
      : (skipped(L("be script"), "be verified failed"), false);

    if (scriptOk) {
      await check(L("be final-hash"), () => {
        const fh = req.scripts[0].finalHash;
        const last = build.applied_hashes[build.applied_hashes.length - 1];
        if (fh !== last) return `finalHash=${fh}, oracle ${last}`;
        if (fh !== exp.finalHash) return `finalHash=${fh}, FE-computed ${exp.finalHash}`;
        return null;
      });
    } else {
      skipped(L("be final-hash"), "be script failed");
    }

    if (verifiedOk) {
      await check(L("fe proxy"), async () => {
        const res = await fetch(`${opts["fe-url"]}/api/registry?action=byTxHash&txHash=${exp.txHash}`);
        if (res.status !== 200) return `HTTP ${res.status}`;
        const j: Json = await res.json();
        if (j.status !== "VERIFIED") return `status=${j.status}`;
        const last = build.applied_hashes[build.applied_hashes.length - 1];
        if (j.scripts?.[0]?.finalHash !== last) return `scripts[0].finalHash=${j.scripts?.[0]?.finalHash}, oracle ${last}`;
        return null;
      });
    } else {
      skipped(L("fe proxy"), "be verified failed");
    }
  }
}

/** The request inputs the BE must echo back, recorded by `prepare` in inputs.json. */
function readInputs(opts: Record<string, string>): { sourceUrl: string; commit: string; sourcePath: string } {
  return JSON.parse(fs.readFileSync(path.join(opts["out-dir"], "inputs.json"), "utf-8"));
}

function main(): void {
  const { mode, opts } = parseArgs(process.argv.slice(2));
  let work: Promise<void>;
  if (mode === "prepare") {
    work = prepare(opts).then(() =>
      fs.writeFileSync(
        path.join(opts["out-dir"], "inputs.json"),
        JSON.stringify({ sourceUrl: opts["source-url"], commit: opts["commit"], sourcePath: opts["source-path"] }),
      ),
    );
  } else if (mode === "check") {
    work = checkMode(opts);
  } else {
    throw new Error(`unknown mode ${mode} (expected prepare|check)`);
  }
  work.then(
    () => {
      console.log(`FE-LEG ${mode}: ${failures === 0 ? "PASS" : "FAIL"}`);
      process.exit(failures === 0 ? 0 : 1);
    },
    (e) => {
      fail(`infra fe-leg-${mode}`, e instanceof Error ? e.message : String(e));
      console.log(`FE-LEG ${mode}: FAIL`);
      process.exit(1);
    },
  );
}

main();
