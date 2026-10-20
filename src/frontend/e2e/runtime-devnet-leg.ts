/**
 * Devnet leg of the runtime-image E2E, stage 7 (see e2e/runtime/README.md at
 * the repo root). Only run with E2E_DEVNET=1.
 *
 * Runs on the host against a disposable local yaci-devkit devnet (protocol
 * magic 42) and the devnet BE container. It calls the FE's own
 * `buildRegistrySubmissionTx` + `signAndSubmitTx` with an Evolution seed-wallet
 * client pointed at the devkit's Blockfrost-compatible yaci-store API, so the
 * label-1984 tx that lands on chain is exactly what the product builds.
 *
 *   npx tsx e2e/runtime-devnet-leg.ts submit --devkit-url <http://127.0.0.1:P/api/v1> --oracle --out-dir
 *   npx tsx e2e/runtime-devnet-leg.ts check  --be-url --oracle --out-dir --timeout-s
 *
 * `submit` evaluates three vetoes before it constructs any client or makes any
 * other request, in this order: V1 the devkit URL is http on 127.0.0.1 or
 * localhost; V3 `config.blockfrostProjectId` is the dummy `devnet` (set by
 * run.sh, read by config.ts at module load); V2 `<devkit-url>/genesis` reports
 * network magic 42. If any fails nothing is built, signed or submitted.
 *
 * Every label prints exactly once as `PASS <label>` or `FAIL <label> — <detail>`
 * at line start; the last line is `DEVNET-LEG <mode>: PASS|FAIL`. Exit 0 iff no
 * FAIL. Every expected hash and CBOR comes from the oracle file, expected.json,
 * replay.txt (stage 5's label CBOR per tx hash) or the submission; none is a
 * literal.
 * CommonJS under tsx (no "type" in e2e/package.json): no top-level await.
 */

import * as fs from "fs";
import * as path from "path";
import * as Bytes from "@evolution-sdk/evolution/Bytes";
import { Client, TransactionMetadatum, type Chain } from "@evolution-sdk/evolution";
import { buildRegistrySubmissionTx, signAndSubmitTx } from "../lib/cardano/transaction-builder";
import { encodeVerificationMetadata } from "../lib/cardano/metadata-encoder";
import { config } from "../lib/config";
import type { ConnectedWallet, Cip30Api } from "../lib/types/wallet";

const COMPILER_VERSION = "v1.1.24";
const VALIDATOR = "fixture.vault";
const DEVNET_MAGIC = 42;
// yaci-devkit's published test mnemonic (devkit docs and startup log); its
// default accounts exist only on a local devkit devnet. Not a secret.
const DEVKIT_MNEMONIC =
  "test test test test test test test test test test test test test test test test test test test test test test test sauce";
const ENVS = [
  { name: "default", requestEnv: undefined as string | undefined, oracleEnv: "", account: 0 },
  { name: "preview", requestEnv: "preview" as string | undefined, oracleEnv: "preview", account: 1 },
];

interface OracleBuild { env: string; unapplied_hash: string; applied_hashes: string[] }
interface Oracle {
  compiler: string;
  parameters: { title: string; cbor: string }[];
  builds: OracleBuild[];
}
interface Expected { env: string; txHash: string; rawHash: string; finalHash: string }
interface Inputs { sourceUrl: string; commit: string; sourcePath: string }
interface DevnetTx { env: string; txHash: string; slot: number }

let failures = 0;

function pass(label: string): void {
  console.log(`PASS ${label}`);
}

function fail(label: string, detail: string): void {
  failures++;
  console.log(`FAIL ${label} — ${detail.replace(/\s+/g, " ").slice(0, 600)}`);
}

function info(line: string): void {
  console.log(`INFO ${line}`);
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf-8"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/**
 * V1, V3, V2 in that order. V1 and V3 make no request; V2 is the first and
 * only request before a client exists. Returns the genesis on success or the
 * failed veto with its observed value.
 */
async function devnetGuard(devkitUrl: string): Promise<{ genesis: Json } | { veto: string }> {
  let url: URL;
  try {
    url = new URL(devkitUrl);
  } catch {
    return { veto: `V1 --devkit-url is not a URL: ${devkitUrl}` };
  }
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    return { veto: `V1 --devkit-url must be http on 127.0.0.1 or localhost, got protocol ${url.protocol} host ${url.hostname}` };
  }
  if (config.blockfrostProjectId !== "devnet") {
    return { veto: `V3 Blockfrost project id must be "devnet", got ${JSON.stringify(config.blockfrostProjectId)}` };
  }
  let genesis: Json;
  try {
    const res = await fetch(`${devkitUrl}/genesis`, { signal: AbortSignal.timeout(10000) });
    if (res.status !== 200) return { veto: `V2 GET ${devkitUrl}/genesis returned HTTP ${res.status}` };
    genesis = await res.json();
  } catch (e) {
    return { veto: `V2 GET ${devkitUrl}/genesis threw ${e instanceof Error ? e.message : String(e)}` };
  }
  if (genesis?.network_magic !== DEVNET_MAGIC) {
    return { veto: `V2 genesis network_magic must be ${DEVNET_MAGIC}, got ${JSON.stringify(genesis?.network_magic)}` };
  }
  return { genesis };
}

async function submit(opts: Record<string, string>): Promise<void> {
  need(opts, ["devkit-url", "oracle", "out-dir"]);
  const devkitUrl = opts["devkit-url"];
  const outDir = opts["out-dir"];

  const guard = await devnetGuard(devkitUrl);
  if ("veto" in guard) {
    fail("devnet guard", guard.veto);
    for (const env of ENVS) {
      skipped(`devnet submit ${env.name}`, "devnet guard failed");
      skipped(`devnet onchain-metadata ${env.name}`, "devnet guard failed");
      skipped(`devnet replay-identity ${env.name}`, "devnet guard failed");
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "devnet.json"), "[]");
    fs.writeFileSync(path.join(outDir, "devnet-txs.txt"), "");
    return;
  }
  pass("devnet guard");

  const g = guard.genesis;
  const chain: Chain = {
    id: 0,
    name: "yaci-devkit",
    networkMagic: g.network_magic,
    epochLength: g.epoch_length,
    slotConfig: { zeroTime: BigInt(g.system_start) * 1000n, zeroSlot: 0n, slotLength: g.slot_length * 1000 },
  };

  const oracle: Oracle = readJson(opts["oracle"]);
  const cbors = oracle.parameters.map((p) => p.cbor);
  const expectedFile = path.join(outDir, "expected.json");
  const inputsFile = path.join(outDir, "inputs.json");
  const devnetTxs: DevnetTx[] = [];

  for (const env of ENVS) {
    const L = (name: string) => `${name} ${env.name}`;
    const missing = [expectedFile, inputsFile].filter((f) => !fs.existsSync(f));
    const exp = missing.length === 0
      ? readJson<Expected[]>(expectedFile).find((e) => e.env === env.name)
      : undefined;
    if (!exp) {
      const reason = missing.length > 0
        ? `${missing.map((f) => path.basename(f)).join(", ")} missing`
        : "expected.json has no entry for this env";
      skipped(L("devnet submit"), reason);
      skipped(L("devnet onchain-metadata"), reason);
      skipped(L("devnet replay-identity"), reason);
      continue;
    }
    const inputs: Inputs = readJson(inputsFile);

    const md = {
      sourceUrl: inputs.sourceUrl,
      commitHash: inputs.commit,
      sourcePath: inputs.sourcePath,
      compilerVersion: COMPILER_VERSION,
      env: env.requestEnv,
      parameters: { [exp.rawHash]: cbors },
    };

    let txHash = "";
    let slot = 0;
    let onchainHex = "";
    const submitted = await check(L("devnet submit"), async () => {
      const client = Client.make(chain)
        .withBlockfrost({ baseUrl: devkitUrl, projectId: config.blockfrostProjectId })
        .withSeed({ mnemonic: DEVKIT_MNEMONIC, accountIndex: env.account });
      const api = new Proxy({}, {
        get() { throw new Error("CIP-30 api must not be used"); },
      }) as unknown as Cip30Api;
      const wallet: ConnectedWallet = { api, client };
      txHash = await signAndSubmitTx(await buildRegistrySubmissionTx(wallet, md));
      if (!/^[0-9a-f]{64}$/.test(txHash)) return `tx hash ${JSON.stringify(txHash)} is not 64 lowercase hex`;

      // Poll until the devkit's yaci-store has indexed the tx
      const deadline = Date.now() + 120000;
      let note = "";
      for (;;) {
        try {
          const res = await fetch(`${devkitUrl}/txs/${txHash}`);
          if (res.status === 200) {
            const j: Json = await res.json();
            if (!Number.isInteger(j.slot) || j.slot <= 0) return `tx ${txHash} indexed with slot ${JSON.stringify(j.slot)}`;
            slot = j.slot;
            return null;
          }
          note = `last poll HTTP ${res.status}`;
        } catch (e) {
          note = `last poll threw ${e instanceof Error ? e.message : String(e)}`;
        }
        if (Date.now() >= deadline) return `tx ${txHash} not indexed by the devkit within 120 s (${note})`;
        await sleep(2000);
      }
    });

    if (submitted) {
      info(`devnet ${env.name} tx ${txHash} slot ${slot}`);
      devnetTxs.push({ env: env.name, txHash, slot });
      await check(L("devnet onchain-metadata"), async () => {
        const res = await fetch(`${devkitUrl}/txs/${txHash}/metadata/cbor`);
        if (res.status !== 200) return `HTTP ${res.status}`;
        const entries: Json[] = await res.json();
        if (!Array.isArray(entries)) return "response is not an array";
        const labelled = entries.filter((e) => e?.label === "1984");
        if (labelled.length !== 1) {
          return `${labelled.length} entries with label "1984" (labels: ${JSON.stringify(entries.map((e) => e?.label))})`;
        }
        const back = TransactionMetadatum.fromCBORHex(labelled[0].metadata) as Json;
        if (!(back instanceof Map) || back.size !== 1 || !back.has(1984n)) {
          return `metadata does not decode to a one-key map {1984: …}`;
        }
        const chunks = back.get(1984n);
        if (!Array.isArray(chunks) || chunks.length === 0) return "label 1984 value is not a non-empty array";
        for (let i = 0; i < chunks.length; i++) {
          if (!(chunks[i] instanceof Uint8Array)) return `chunk ${i} is not bytes`;
          if (chunks[i].length > 64) return `chunk ${i} is ${chunks[i].length} bytes, max 64`;
        }
        const joined = (chunks as unknown[]).map(hexOf).join("");
        if (joined !== encodeVerificationMetadata(md)) return "reassembled chunks differ from encodeVerificationMetadata(md)";
        onchainHex = String(labelled[0].metadata).toLowerCase();
        return null;
      });
      // Byte identity of the builder's on-chain label CBOR with stage 5's replay record
      if (onchainHex === "") {
        skipped(L("devnet replay-identity"), "devnet onchain-metadata failed");
      } else {
        await check(L("devnet replay-identity"), () => {
          const replayFile = path.join(outDir, "replay.txt");
          if (!fs.existsSync(replayFile)) return `${path.basename(replayFile)} missing`;
          const lines = fs.readFileSync(replayFile, "utf-8").split("\n")
            .filter((l) => l.trim() !== "")
            .map((l) => l.trim().split(/\s+/))
            .filter((t) => t[0] === exp.txHash);
          if (lines.length !== 1) return `${lines.length} replay.txt lines for tx ${exp.txHash}, expected exactly 1`;
          const replayHex = (lines[0][1] ?? "").toLowerCase();
          if (replayHex === onchainHex) return null;
          let at = 0;
          while (at < replayHex.length && at < onchainHex.length && replayHex[at] === onchainHex[at]) at++;
          return `on-chain label CBOR (${onchainHex.length} hex chars) != replay.txt (${replayHex.length} hex chars), first difference at hex offset ${at}`;
        });
      }
    } else {
      skipped(L("devnet onchain-metadata"), "devnet submit failed");
      skipped(L("devnet replay-identity"), "devnet submit failed");
    }
  }

  fs.writeFileSync(path.join(outDir, "devnet.json"), JSON.stringify(devnetTxs, null, 2));
  fs.writeFileSync(path.join(outDir, "devnet-txs.txt"), devnetTxs.map((t) => `${t.txHash} ${t.slot}\n`).join(""));
}

async function checkMode(opts: Record<string, string>): Promise<void> {
  need(opts, ["be-url", "oracle", "out-dir", "timeout-s"]);
  const devnetTxs: DevnetTx[] = readJson(path.join(opts["out-dir"], "devnet.json"));
  const expected: Expected[] = readJson(path.join(opts["out-dir"], "expected.json"));
  const inputs: Inputs = readJson(path.join(opts["out-dir"], "inputs.json"));
  const oracle: Oracle = readJson(opts["oracle"]);
  const cbors = oracle.parameters.map((p) => p.cbor);
  const deadline = Date.now() + Number(opts["timeout-s"]) * 1000;
  const TERMINAL = ["VERIFIED", "FAILED", "REJECTED"];

  for (const env of ENVS) {
    const L = (name: string) => `${name} ${env.name}`;
    const build = buildFor(oracle, env.oracleEnv);
    const tx = devnetTxs.find((t) => t.env === env.name);
    if (!tx) {
      for (const n of ["devnet verified", "devnet script", "devnet final-hash"]) {
        skipped(L(n), "devnet submit produced no tx for this env");
      }
      continue;
    }
    const exp = expected.find((e) => e.env === env.name);

    // Poll until terminal, an error message (fail fast), or the shared deadline
    let req: Json = null;
    let pollNote = "";
    for (;;) {
      try {
        const res = await fetch(`${opts["be-url"]}/api/v1/verification-requests/by-tx/${tx.txHash}`);
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

    const verifiedOk = await check(L("devnet verified"), () => {
      if (!req) return `no verification request for tx ${tx.txHash} before the deadline (${pollNote})`;
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
      ? await check(L("devnet script"), () => {
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
      : (skipped(L("devnet script"), "devnet verified failed"), false);

    if (scriptOk) {
      await check(L("devnet final-hash"), () => {
        const fh = req.scripts[0].finalHash;
        // the hash after applying all eight oracle parameters (applied_hashes[7])
        const last = build.applied_hashes[cbors.length - 1];
        if (fh !== last) return `finalHash=${fh}, oracle ${last}`;
        if (!exp) return "expected.json has no entry for this env";
        if (fh !== exp.finalHash) return `finalHash=${fh}, FE-computed ${exp.finalHash}`;
        return null;
      });
    } else {
      skipped(L("devnet final-hash"), "devnet script failed");
    }
  }
}

function main(): void {
  let mode = "";
  let work: Promise<void>;
  try {
    const parsed = parseArgs(process.argv.slice(2));
    mode = parsed.mode;
    if (mode === "submit") {
      work = submit(parsed.opts);
    } else if (mode === "check") {
      work = checkMode(parsed.opts);
    } else {
      throw new Error(`unknown mode ${mode} (expected submit|check)`);
    }
  } catch (e) {
    work = Promise.reject(e);
  }
  work.then(
    () => {
      console.log(`DEVNET-LEG ${mode}: ${failures === 0 ? "PASS" : "FAIL"}`);
      process.exit(failures === 0 ? 0 : 1);
    },
    (e) => {
      fail(`infra devnet-leg-${mode}`, e instanceof Error ? e.message : String(e));
      console.log(`DEVNET-LEG ${mode}: FAIL`);
      process.exit(1);
    },
  );
}

main();
