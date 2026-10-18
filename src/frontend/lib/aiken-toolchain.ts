/**
 * Aiken toolchain: `aikup install <tag>` followed by `aiken build`, serialised.
 *
 * aikup keeps no per-request state: every `aikup install <tag>` — even for an
 * already installed version — removes `$HOME/.aiken/bin/aiken` and re-creates
 * it as a symlink to that tag's binary, and `aiken build` resolves the symlink
 * only when it is exec'd. Two concurrent requests would otherwise interleave
 * as install A, install B, build A, and A would build with B's compiler (or
 * hit ENOENT in aikup's remove-then-symlink window).
 *
 * Guarantee: within ONE Node process, install+build pairs run one at a time,
 * in arrival order, so every build runs with the compiler its own install
 * selected. The lock lives on `globalThis`, so it is shared by every
 * `createAikenToolchain` instance and survives a Next.js module re-evaluation
 * in the same process. It is released on success, install failure, build
 * failure and exec timeout alike.
 *
 * Not covered: separate processes sharing one writable Aiken home (e.g. two
 * replicas on one volume) are unprotected, because aikup re-points the shared
 * symlink. Deploy ONE Node process per writable Aiken home; separate
 * containers with isolated homes are fine.
 *
 * Lock scope is install+build only: the caller's `git clone`/`git checkout`
 * and plutus.json extraction stay outside it, and a rejected release tag
 * never takes it.
 */

import { execFile } from "child_process";
import { promisify } from "util";
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
}

// No shell: arguments are passed as arrays, never interpolated into a command line
const execFileAsync: ExecFileFn = promisify(execFile);

// Each install and each build is bounded so a runaway build can't tie up the
// request indefinitely.
const EXEC_TIMEOUT_MS = 300_000;
const MAX_EXEC_BUFFER = 10 * 1024 * 1024;

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

export function createAikenToolchain(options: AikenToolchainOptions = {}) {
  const run = options.execFile ?? execFileAsync;
  const limits = {
    timeout: options.timeoutMs ?? EXEC_TIMEOUT_MS,
    maxBuffer: options.maxBuffer ?? MAX_EXEC_BUFFER,
  };
  const env: NodeJS.ProcessEnv = options.home === undefined
    ? { ...process.env, PATH: `${process.env.HOME}/.aiken/bin:${process.env.PATH}` }
    : { ...process.env, HOME: options.home, PATH: `${options.home}/.aiken/bin:${process.env.PATH}` };

  async function installAndBuild(releaseTag: string, buildArgs: string[], workDir: string): Promise<string> {
    // Only an exact release tag may reach aikup (never an option, never "+<build>" metadata)
    if (toAikenReleaseTag(releaseTag) !== releaseTag) {
      throw new Error(`Invalid Aiken release tag: ${releaseTag}`);
    }

    return withAikenLock(async () => {
      // Install specific Aiken version
      console.log(`Installing Aiken ${releaseTag}...`);
      try {
        await run("aikup", ["install", releaseTag], { env, ...limits });
      } catch (error) {
        throw new Error(`Failed to install Aiken version ${releaseTag}: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Build the contract with installed Aiken version
      console.log(`Building contract with Aiken ${releaseTag} in ${workDir} (aiken ${buildArgs.join(" ")})...`);
      try {
        const { stdout, stderr } = await run("aiken", buildArgs, { cwd: workDir, env, ...limits });
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
