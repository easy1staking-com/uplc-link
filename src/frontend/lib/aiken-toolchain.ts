/**
 * Aiken toolchain: run the requested compiler by absolute path, installing it
 * from its GitHub release first when absent; one install+build at a time.
 *
 * Versions live where aikup 0.0.11 installs them, `<home>/.aiken/versions/<tag>/`
 * (see lib/aiken-release.ts), so versions preinstalled with aikup are found.
 *
 * Guarantees:
 * - Nothing shared is touched. The build execs the version's own binary by
 *   absolute path, never a PATH lookup or the `~/.aiken/bin/aiken` symlink,
 *   which is never created, removed or re-pointed. aikup is not used, and no
 *   request goes to the GitHub API.
 * - A present version (a regular file at its binary path) runs with no
 *   request and no extraction.
 * - An absent version is downloaded from `<base>/<tag>/<asset>` and its
 *   SHA-256 verified against the release's `.sha256` sidecar or, for legacy
 *   releases that publish none, the pinned table. With no checksum available
 *   the download is refused before any request.
 * - Installs are atomic. The archive is extracted into a temp dir
 *   `versions/.download-<tag>-<random>` on the same filesystem and moved into
 *   place in one step: a rename for a cargo-dist directory, a hard link for a
 *   legacy single-file binary (rename would silently replace an existing
 *   file, a link never does). A destination that already exists, because a
 *   concurrent installer won, is used as it is. The temp dir is removed on
 *   every outcome. So processes sharing one Aiken home no longer corrupt each
 *   other: each sees no binary or a complete one, never a re-pointed symlink.
 * - Within ONE Node process, install+build pairs run one at a time, in
 *   arrival order. The lock lives on `globalThis`, so it is shared by every
 *   `createAikenToolchain` instance and survives a Next.js module
 *   re-evaluation in the same process. It is released on success, install
 *   failure, build failure and timeout alike. Across processes nothing is
 *   serialised: two may download the same version, and the one that loses
 *   the rename uses the winner's binary.
 *
 * Lock scope is install+build only: the caller's `git clone`/`git checkout`
 * and plutus.json extraction stay outside it, and a rejected release tag
 * never takes it.
 *
 * Not covered: an already-present binary is trusted as it is, and temp dirs
 * left behind by a crashed process are not swept.
 */

import { execFile } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { AIKEN_RELEASE_BASE_URL, aikenReleaseAsset } from "./aiken-release";
import { toAikenReleaseTag } from "./aiken-version";

export type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export interface AikenToolchainOptions {
  home?: string;
  execFile?: ExecFileFn;
  timeoutMs?: number;
  maxBuffer?: number;
  releaseBaseUrl?: string;
}

// No shell: arguments are passed as arrays, never interpolated into a command line
const execFileAsync: ExecFileFn = promisify(execFile);

// Each download, extraction and build is bounded so a stalled server or a
// runaway build can't tie up the request indefinitely.
const EXEC_TIMEOUT_MS = 300_000;
const MAX_EXEC_BUFFER = 10 * 1024 * 1024;

const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_SIDECAR_BYTES = 4 * 1024;
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

// A move whose destination already exists: rename(2) onto a non-empty
// directory or a non-directory, link(2) onto anything.
const COLLISION_CODES = new Set(["EEXIST", "ENOTEMPTY", "ENOTDIR"]);

// Process-wide FIFO mutex: the tail of a promise chain, keyed by a registered
// symbol so a re-evaluated copy of this module still finds the same lock.
const LOCK_KEY = Symbol.for("uplc-link.aiken-toolchain.lock");
type LockHolder = typeof globalThis & { [LOCK_KEY]?: Promise<void> };

function withAikenLock<T>(task: () => Promise<T>): Promise<T> {
  const holder = globalThis as LockHolder;
  const previous = holder[LOCK_KEY] ?? Promise.resolve();
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  // The chain only ever holds `released` promises, which never reject, so a
  // failed holder cannot break the queue for later waiters.
  holder[LOCK_KEY] = previous.then(() => released);
  return previous.then(async () => {
    try {
      return await task();
    } finally {
      release();
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

async function isRegularFile(file: string): Promise<boolean> {
  try {
    return (await fs.lstat(file)).isFile();
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") return false;
    throw error;
  }
}

export function createAikenToolchain(options: AikenToolchainOptions = {}) {
  const run = options.execFile ?? execFileAsync;
  const limits = {
    timeout: options.timeoutMs ?? EXEC_TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? MAX_EXEC_BUFFER,
  };
  const env: NodeJS.ProcessEnv = options.home === undefined
    ? { ...process.env }
    : { ...process.env, HOME: options.home };
  const versionsDir = path.resolve(options.home ?? os.homedir(), ".aiken", "versions");
  const releaseBaseUrl = (options.releaseBaseUrl ?? AIKEN_RELEASE_BASE_URL).replace(/\/+$/, "");
  const releaseProtocol = new URL(releaseBaseUrl).protocol;

  /**
   * GET `url` (redirects followed) into memory, at most `maxBytes`. Errors name
   * `url` and the HTTP status, never the redirect target (a signed URL).
   */
  async function download(url: string, maxBytes: number): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(limits.timeout) });
    } catch (error) {
      throw new Error(`GET ${url} failed: ${errorMessage(error)}`);
    }
    try {
      // Never accept a redirect to another protocol (e.g. https → http)
      if (new URL(response.url).protocol !== releaseProtocol) {
        throw new Error(`GET ${url} was redirected to another protocol`);
      }
      if (!response.ok) {
        throw new Error(`GET ${url} answered HTTP ${response.status}`);
      }
      const declared = Number(response.headers.get("content-length") ?? NaN);
      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error(`GET ${url}: ${declared} bytes exceeds the ${maxBytes}-byte limit`);
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch (error) {
            throw new Error(`GET ${url} failed: ${errorMessage(error)}`);
          }
          if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error(`GET ${url}: body exceeds the ${maxBytes}-byte limit`);
          }
          chunks.push(chunk.value);
        }
      }
      return Buffer.concat(chunks);
    } catch (error) {
      await response.body?.cancel().catch(() => undefined);
      throw error;
    }
  }

  /** The SHA-256 a release publishes in `<asset>.sha256`: `<64 hex> *<asset>`. */
  async function sidecarSha256(url: string): Promise<string> {
    const token = (await download(url, MAX_SIDECAR_BYTES)).toString("utf-8").trim().split(/\s+/)[0] ?? "";
    if (!SHA256_HEX.test(token)) {
      throw new Error(`${url} holds no SHA-256 checksum`);
    }
    return token.toLowerCase();
  }

  /** Absolute path of `tag`'s compiler, downloading and installing it if absent. */
  async function ensureInstalled(tag: string): Promise<string> {
    const asset = aikenReleaseAsset(tag, process.platform, process.arch);
    const installDir = path.join(versionsDir, tag);
    // Defence in depth: the guarded tag is exactly one segment under versions/
    if (path.dirname(installDir) !== versionsDir || path.basename(installDir) !== tag) {
      throw new Error(`refusing install directory ${installDir}`);
    }
    const binary = path.join(installDir, ...asset.binaryRelPath);
    if (await isRegularFile(binary)) {
      console.log(`Using installed Aiken ${tag} at ${binary}`);
      return binary;
    }
    if (asset.integrity.kind === "unavailable") {
      throw new Error(`no published or pinned SHA-256 for ${asset.assetName}; refusing to download it`);
    }

    await fs.mkdir(versionsDir, { recursive: true });
    // A leading "." can never equal a release tag
    const tmp = await fs.mkdtemp(path.join(versionsDir, `.download-${tag}-`));
    try {
      const assetUrl = `${releaseBaseUrl}/${tag}/${asset.assetName}`;
      console.log(`Downloading Aiken ${tag} from ${assetUrl}`);
      const archive = await download(assetUrl, MAX_ASSET_BYTES);
      const expected = asset.integrity.kind === "pinned"
        ? asset.integrity.sha256.toLowerCase()
        : await sidecarSha256(`${assetUrl}.sha256`);
      const actual = createHash("sha256").update(archive).digest("hex");
      if (actual !== expected) {
        throw new Error(`SHA-256 mismatch for ${assetUrl}: expected ${expected}, got ${actual}`);
      }

      const archivePath = path.join(tmp, asset.assetName);
      await fs.writeFile(archivePath, archive);
      await run("tar", ["-xzf", archivePath, "-C", tmp], { env, ...limits });
      if (!(await isRegularFile(path.join(tmp, ...asset.binaryRelPath)))) {
        throw new Error(`${asset.assetName} has no regular file ${asset.binaryRelPath.join("/")}`);
      }

      await fs.mkdir(installDir, { recursive: true });
      const entry = asset.binaryRelPath[0];
      const source = path.join(tmp, entry);
      const destination = path.join(installDir, entry);
      try {
        if ((await fs.lstat(source)).isDirectory()) {
          await fs.rename(source, destination);
        } else {
          await fs.link(source, destination);
        }
      } catch (error) {
        if (!COLLISION_CODES.has(errorCode(error) ?? "")) throw error;
        // A concurrent installer won: use its binary, never replace it
        if (!(await isRegularFile(binary))) {
          throw new Error(`${destination} already exists but ${binary} is not a regular file`);
        }
        console.log(`Using installed Aiken ${tag} at ${binary}`);
        return binary;
      }
      console.log(`Installed Aiken ${tag} at ${binary}`);
      return binary;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  async function installAndBuild(releaseTag: string, buildArgs: string[], workDir: string): Promise<string> {
    // Only an exact release tag may reach a path, a URL or an exec (never an
    // option, never "+<build>" metadata, never a path separator)
    if (toAikenReleaseTag(releaseTag) !== releaseTag) {
      throw new Error(`Invalid Aiken release tag: ${releaseTag}`);
    }

    return withAikenLock(async () => {
      let aiken: string;
      try {
        aiken = await ensureInstalled(releaseTag);
      } catch (error) {
        throw new Error(`Failed to install Aiken version ${releaseTag}: ${errorMessage(error)}`);
      }

      // Build the contract with that version's own binary, by absolute path
      console.log(`Building contract with Aiken ${releaseTag} in ${workDir} (aiken ${buildArgs.join(" ")})...`);
      try {
        const { stdout, stderr } = await run(aiken, buildArgs, { cwd: workDir, env, ...limits });
        const buildOutput = stdout + stderr;
        console.log(`Build output:\n${buildOutput}`);
        return buildOutput;
      } catch (error: any) {
        const buildOutput = String(error.stdout ?? "") + String(error.stderr ?? "");
        throw new Error(`Build failed: ${buildOutput}`);
      }
    });
  }

  return { installAndBuild };
}
