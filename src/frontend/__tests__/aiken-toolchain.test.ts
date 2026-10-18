/**
 * Aiken toolchain: one install+build at a time per Node process.
 *
 * aikup has no per-request state: every `aikup install <tag>` — even "already
 * installed" — removes ~/.aiken/bin/aiken and re-creates it as a symlink to
 * that tag's binary, and `aiken build` resolves the symlink only when it is
 * exec'd. So a second request's install landing between the first request's
 * install and build makes the first build run with the wrong compiler.
 *
 * The race is FORCED, not hoped for: the injected execFile delegates to the
 * real child_process.execFile against executable fake `aikup`/`aiken` scripts
 * in a temp HOME (so PATH lookup and symlink resolution really happen at exec
 * time), and it only schedules the competitor — it launches request B in the
 * exact gap after A's install has completed and before A's build is exec'd.
 * Without the lock B's install re-points the symlink in that gap and A's
 * plutus.json reports B's compiler: that is the fail-first.
 *
 * Every compiler version asserted here is read from the plutus.json the build
 * actually wrote. No network, and the real ~/.aiken is never touched.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createAikenToolchain, ExecFileFn } from '../lib/aiken-toolchain';

const realExecFile: ExecFileFn = promisify(execFile);

// Mirrors aikup's layout for cargo-dist musl assets: versions/<tag>/<asset-dir>/aiken
const ASSET_DIR = 'aiken-x86_64-unknown-linux-musl';
const GATE_MS = 1500;
const STALL_MS = 15_000;

// Shape-valid fake tags only; never a real release.
const V_A = 'v9.9.1';
const V_B = 'v9.9.2';
const V_BOOM = 'v9.9.3'; // build writes "boom" to stderr and exits 1
const V_SLEEP = 'v9.9.4'; // build is `exec sleep 30`
const V_MISSING = 'v9.9.9'; // not installed: fake aikup exits 1

const FAKE_AIKUP = `#!/bin/sh
# Fake aikup with the real switch semantics: every install removes the
# symlink and re-points it, even when the version is already installed.
if [ "$1" != "install" ] || [ -z "$2" ]; then
  echo "fake aikup: usage: aikup install <tag>" >&2
  exit 2
fi
target="$HOME/.aiken/versions/$2/${ASSET_DIR}/aiken"
if [ ! -f "$target" ]; then
  echo "fake aikup: no release found for $2" >&2
  exit 1
fi
rm -f "$HOME/.aiken/bin/aiken"
ln -s "$target" "$HOME/.aiken/bin/aiken"
echo "fake aikup: switched $2"
`;

function fakeAiken(tag: string, buildBody: string): string {
  return `#!/bin/sh
case "$1" in
  --version)
    echo "aiken ${tag}+fake"
    ;;
  build)
${buildBody}
    ;;
  *)
    echo "fake aiken: unsupported command $1" >&2
    exit 2
    ;;
esac
`;
}

function writesPlutusJson(tag: string): string {
  const json = JSON.stringify({
    preamble: { compiler: { name: 'Aiken', version: `${tag}+fake` } },
    validators: [],
  });
  return `    printf '%s\\n' '${json}' > plutus.json`;
}

async function writeExecutable(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  await fs.chmod(file, 0o755);
}

/** Temp HOME with the fake aikup on PATH and one fake aiken per installed version. */
async function createFixtureHome(root: string): Promise<string> {
  const home = path.join(root, 'home');
  await writeExecutable(path.join(home, '.aiken', 'bin', 'aikup'), FAKE_AIKUP);
  const versions: Array<[string, string]> = [
    [V_A, writesPlutusJson(V_A)],
    [V_B, writesPlutusJson(V_B)],
    [V_BOOM, '    echo boom >&2\n    exit 1'],
    [V_SLEEP, '    exec sleep 30'],
  ];
  for (const [tag, buildBody] of versions) {
    await writeExecutable(
      path.join(home, '.aiken', 'versions', tag, ASSET_DIR, 'aiken'),
      fakeAiken(tag, buildBody)
    );
  }
  return home;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type Outcome<T> =
  | { status: 'ok'; value: T }
  | { status: 'error'; error: Error }
  | { status: 'stalled' };

/**
 * Wait for `p`, but never longer than the stall bound: a leaked lock must fail
 * with a named message instead of hanging `npm test`.
 */
async function withinStall<T>(p: Promise<T>, label: string): Promise<Outcome<T>> {
  let timer: NodeJS.Timeout | undefined;
  const stalled = new Promise<Outcome<T>>(resolve => {
    timer = setTimeout(() => resolve({ status: 'stalled' }), STALL_MS);
  });
  const settled = p.then(
    (value): Outcome<T> => ({ status: 'ok', value }),
    (error): Outcome<T> => ({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) })
  );
  const outcome = await Promise.race([settled, stalled]);
  clearTimeout(timer);
  if (outcome.status === 'stalled') {
    console.log(`queue stalled: ${label} did not settle within ${STALL_MS} ms`);
  }
  return outcome;
}

function describe<T>(outcome: Outcome<T>): string {
  if (outcome.status === 'ok') return 'resolved';
  if (outcome.status === 'error') return `rejected: ${outcome.error.message.split('\n')[0]}`;
  return `queue stalled (> ${STALL_MS} ms)`;
}

/** The compiler that actually produced the plutus.json in `dir`. */
async function compilerIn(dir: string): Promise<string> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(dir, 'plutus.json'), 'utf-8'));
    return String(data?.preamble?.compiler?.version ?? '<no compiler in plutus.json>');
  } catch (error) {
    return `<no plutus.json: ${error instanceof Error ? error.message : String(error)}>`;
  }
}

function check(name: string, cond: boolean): boolean {
  console.log(cond ? `✅ SUCCESS: ${name}` : `❌ FAILURE: ${name}`);
  return cond;
}

async function testAikenToolchain(): Promise<boolean> {
  let ok = true;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aiken-toolchain-test-'));
  try {
    const home = await createFixtureHome(root);
    const workDir = (name: string) => fs.mkdir(path.join(root, name)).then(() => path.join(root, name));

    // --- S1 race (fail-first): B's install forced into the gap between A's install and A's build ---
    {
      const dirA = await workDir('s1-a');
      const dirB = await workDir('s1-b');
      let competitorLaunched = false;
      let competitorBeforeABuild = false;
      let outcomeB: Promise<Outcome<string>> | undefined;
      let markBInstalled!: () => void;
      const bInstalled = new Promise<void>(resolve => { markBInstalled = resolve; });

      // Two instances on one home: the lock must be per process, not per instance.
      let tcB: ReturnType<typeof createAikenToolchain>;
      const exec: ExecFileFn = async (file, args, options) => {
        if (file === 'aiken' && options.cwd === dirA) {
          competitorBeforeABuild = competitorLaunched;
        }
        const result = await realExecFile(file, args, options);
        if (file === 'aikup' && args[1] === V_B) {
          markBInstalled();
        }
        if (file === 'aikup' && args[1] === V_A && !competitorLaunched) {
          // A's install has completed and A's build has not been exec'd yet.
          // Never await B itself here: under the lock B waits for A.
          outcomeB = withinStall(tcB.installAndBuild(V_B, ['build'], dirB), 'S1 request B');
          competitorLaunched = true;
          await Promise.race([bInstalled, delay(GATE_MS)]);
        }
        return result;
      };
      const tcA = createAikenToolchain({ home, execFile: exec });
      tcB = createAikenToolchain({ home, execFile: exec });

      const outcomeA = await withinStall(tcA.installAndBuild(V_A, ['build'], dirA), 'S1 request A');
      const settledB = outcomeB ? await outcomeB : undefined;
      const seenA = await compilerIn(dirA);
      const seenB = await compilerIn(dirB);

      ok = check(
        `S1 race: competitor launched before A's aiken build (launched=${competitorLaunched}, before A's build=${competitorBeforeABuild})`,
        competitorBeforeABuild
      ) && ok;
      ok = check(
        `S1 race: A built with its own compiler (expected ${V_A}+fake, A observed ${seenA}; A ${describe(outcomeA)})`,
        seenA === `${V_A}+fake`
      ) && ok;
      ok = check(
        `S1 race: B built with its own compiler (expected ${V_B}+fake, B observed ${seenB}; B ${settledB ? describe(settledB) : 'never started'})`,
        seenB === `${V_B}+fake`
      ) && ok;
    }

    // --- S2: install failure releases the lock ---
    {
      const dirA = await workDir('s2-a');
      const dirB = await workDir('s2-b');
      const tc = createAikenToolchain({ home, execFile: realExecFile });
      const pA = withinStall(tc.installAndBuild(V_MISSING, ['build'], dirA), 'S2 request A');
      const pB = withinStall(tc.installAndBuild(V_B, ['build'], dirB), 'S2 request B');
      const [outcomeA, outcomeB] = await Promise.all([pA, pB]);
      const seenB = await compilerIn(dirB);
      ok = check(
        `S2 install failure: A rejects with "Failed to install Aiken version ${V_MISSING}:" (A ${describe(outcomeA)})`,
        outcomeA.status === 'error' && outcomeA.error.message.startsWith(`Failed to install Aiken version ${V_MISSING}:`)
      ) && ok;
      ok = check(
        `S2 install failure: queued B completes with its own compiler (B ${describe(outcomeB)}, B observed ${seenB})`,
        outcomeB.status === 'ok' && seenB === `${V_B}+fake`
      ) && ok;
    }

    // --- S3: build failure releases the lock ---
    {
      const dirA = await workDir('s3-a');
      const dirB = await workDir('s3-b');
      const tc = createAikenToolchain({ home, execFile: realExecFile });
      const pA = withinStall(tc.installAndBuild(V_BOOM, ['build'], dirA), 'S3 request A');
      const pB = withinStall(tc.installAndBuild(V_B, ['build'], dirB), 'S3 request B');
      const [outcomeA, outcomeB] = await Promise.all([pA, pB]);
      const seenB = await compilerIn(dirB);
      ok = check(
        `S3 build failure: A rejects with "Build failed:" containing "boom" (A ${describe(outcomeA)})`,
        outcomeA.status === 'error'
          && outcomeA.error.message.startsWith('Build failed:')
          && outcomeA.error.message.includes('boom')
      ) && ok;
      ok = check(
        `S3 build failure: queued B completes with its own compiler (B ${describe(outcomeB)}, B observed ${seenB})`,
        outcomeB.status === 'ok' && seenB === `${V_B}+fake`
      ) && ok;
    }

    // --- S4: exec timeout releases the lock ---
    {
      const dirA = await workDir('s4-a');
      const dirB = await workDir('s4-b');
      const tc = createAikenToolchain({ home, execFile: realExecFile, timeoutMs: 1000 });
      const started = Date.now();
      const pA = withinStall(tc.installAndBuild(V_SLEEP, ['build'], dirA), 'S4 request A');
      const pB = withinStall(tc.installAndBuild(V_B, ['build'], dirB), 'S4 request B');
      const [outcomeA, outcomeB] = await Promise.all([pA, pB]);
      const elapsed = Date.now() - started;
      const seenB = await compilerIn(dirB);
      ok = check(
        `S4 timeout: A (build sleeps 30 s, timeout 1000 ms) rejects (A ${describe(outcomeA)})`,
        outcomeA.status === 'error'
      ) && ok;
      ok = check(
        `S4 timeout: queued B completes with its own compiler (B ${describe(outcomeB)}, B observed ${seenB})`,
        outcomeB.status === 'ok' && seenB === `${V_B}+fake`
      ) && ok;
      ok = check(`S4 timeout: scenario finished in < ${STALL_MS} ms (took ${elapsed} ms)`, elapsed < STALL_MS) && ok;
    }

    // --- S5: the release-tag guard refuses before any exec ---
    {
      const dir = await workDir('s5');
      const calls: string[] = [];
      const counting: ExecFileFn = async (file, args, options) => {
        calls.push(`${file} ${args.join(' ')}`);
        return realExecFile(file, args, options);
      };
      const tc = createAikenToolchain({ home, execFile: counting });
      for (const tag of ['--help', 'v1.1.21+abc']) {
        const outcome = await withinStall(tc.installAndBuild(tag, ['build'], dir), `S5 ${tag}`);
        ok = check(`S5 guard: "${tag}" is rejected (${describe(outcome)})`, outcome.status === 'error') && ok;
      }
      ok = check(
        `S5 guard: zero exec calls for rejected tags (recorded ${calls.length}${calls.length ? `: ${calls.join('; ')}` : ''})`,
        calls.length === 0
      ) && ok;
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  return ok;
}

if (require.main === module) {
  testAikenToolchain().then(ok => process.exit(ok ? 0 : 1));
}

export { testAikenToolchain };
