/**
 * Aiken toolchain: run the compiler by absolute path, install releases
 * atomically from a checksummed download, one install+build at a time.
 *
 * The old toolchain ran `aikup install <tag>` and then a bare `aiken build`:
 * aikup re-points the shared `~/.aiken/bin/aiken` symlink on every install and
 * calls the GitHub API every time. Now a present version is exec'd by its
 * absolute path with no request at all, and an absent one is downloaded from
 * the release URL, verified, extracted to a temp dir and renamed into place.
 *
 * Everything is forced, not hoped for:
 * - execs go through the real child_process.execFile against executable fake
 *   `aikup`/`aiken` scripts in a temp HOME, and a sentinel symlink
 *   `<home>/.aiken/bin/aiken` (pointing at V_B's binary) is read after every
 *   exec, so re-pointing it is caught even when it is put back later;
 * - a bare `aiken`/`aikup` exec resolves ONLY inside the fixture home, so the
 *   host's real toolchain is never run, and a build that relies on PATH builds
 *   with the sentinel's compiler (V_B) and is caught;
 * - downloads come from an in-process HTTP server on 127.0.0.1 that answers
 *   302 to a second path like GitHub does and records every request path;
 * - fixture archives are made with the system `tar`, laid out from
 *   aikenReleaseAsset() for the host platform, as the real releases are;
 * - the lost rename race is forced by planting the destination right after
 *   the real `tar` returns, and the download race by two instances at once.
 *
 * Every compiler version asserted here is read from the plutus.json the build
 * actually wrote. No network beyond 127.0.0.1, and the real ~/.aiken is never
 * read or written.
 */

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as http from 'http';
import { AddressInfo } from 'net';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createAikenToolchain, ExecFileFn } from '../lib/aiken-toolchain';
import { aikenReleaseAsset, AikenReleaseAsset } from '../lib/aiken-release';

const realExecFile: ExecFileFn = promisify(execFile);

const STALL_MS = 15_000;

// Shape-valid fake tags only; never a real release.
const V_A = 'v9.9.1';
const V_B = 'v9.9.2'; // also the sentinel symlink's target
const V_BOOM = 'v9.9.3'; // build writes "boom" to stderr and exits 1
const V_SLEEP = 'v9.9.4'; // build is `exec sleep 30`
const V_DL = 'v9.9.5'; // absent: served behind a 302 with a correct sidecar
const V_BAD = 'v9.9.6'; // absent: served with a sidecar that does not match
const V_RACE = 'v9.9.7'; // absent: two instances install it at once
const V_LOST = 'v9.9.8'; // absent: a concurrent installer wins the rename
const V_MISSING = 'v9.9.9'; // absent: the download answers 404 (after a 302)
// Real legacy tags, served fake bytes: never installable here.
const V_LEGACY_PINNED = 'v1.0.0-alpha';
const V_LEGACY_UNPINNED = 'v1.0.9-alpha';

function assetOf(tag: string): AikenReleaseAsset {
  return aikenReleaseAsset(tag, process.platform, process.arch);
}

function binaryOf(home: string, tag: string): string {
  return path.join(home, '.aiken', 'versions', tag, ...assetOf(tag).binaryRelPath);
}

// Mirrors aikup's layout (the fake aikup below is only reached by the old code)
const FAKE_AIKUP_TARGET = assetOf(V_A).binaryRelPath.join('/');

const FAKE_AIKUP = `#!/bin/sh
# Fake aikup with the real switch semantics: every install removes the
# symlink and re-points it, even when the version is already installed.
if [ "$1" != "install" ] || [ -z "$2" ]; then
  echo "fake aikup: usage: aikup install <tag>" >&2
  exit 2
fi
target="$HOME/.aiken/versions/$2/${FAKE_AIKUP_TARGET}"
if [ ! -f "$target" ]; then
  echo "fake aikup: no release found for $2" >&2
  exit 1
fi
rm -f "$HOME/.aiken/bin/aiken"
ln -s "$target" "$HOME/.aiken/bin/aiken"
echo "fake aikup: switched $2"
`;

function fakeAiken(version: string, buildBody: string): string {
  return `#!/bin/sh
case "$1" in
  --version)
    echo "aiken ${version}"
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

function writesPlutusJson(version: string): string {
  const json = JSON.stringify({
    preamble: { compiler: { name: 'Aiken', version } },
    validators: [],
  });
  return `    printf '%s\\n' '${json}' > plutus.json`;
}

async function writeExecutable(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  await fs.chmod(file, 0o755);
}

/**
 * Temp HOME with the fake aikup, one fake aiken per present version and the
 * sentinel symlink `.aiken/bin/aiken` → V_B's binary.
 */
async function createFixtureHome(root: string): Promise<string> {
  const home = path.join(root, 'home');
  await writeExecutable(path.join(home, '.aiken', 'bin', 'aikup'), FAKE_AIKUP);
  const versions: Array<[string, string]> = [
    [V_A, writesPlutusJson(`${V_A}+fake`)],
    [V_B, writesPlutusJson(`${V_B}+fake`)],
    [V_BOOM, '    echo boom >&2\n    exit 1'],
    [V_SLEEP, '    exec sleep 30'],
  ];
  for (const [tag, buildBody] of versions) {
    await writeExecutable(binaryOf(home, tag), fakeAiken(`${tag}+fake`, buildBody));
  }
  await fs.symlink(binaryOf(home, V_B), path.join(home, '.aiken', 'bin', 'aiken'));
  return home;
}

/** A release archive laid out like the real one, whose aiken writes `version`. */
async function buildArchive(root: string, tag: string, version: string): Promise<Buffer> {
  const asset = assetOf(tag);
  const staging = await fs.mkdtemp(path.join(root, 'archive-'));
  await writeExecutable(path.join(staging, ...asset.binaryRelPath), fakeAiken(version, writesPlutusJson(version)));
  if (asset.binaryRelPath.length > 1) {
    for (const extra of ['CHANGELOG.md', 'LICENSE', 'README.md']) {
      await fs.writeFile(path.join(staging, asset.binaryRelPath[0], extra), `${extra}\n`);
    }
  }
  const out = path.join(staging, asset.assetName);
  await realExecFile('tar', ['-czf', out, '-C', staging, asset.binaryRelPath[0]], {
    env: process.env,
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  return fs.readFile(out);
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

interface Route {
  status: number;
  body?: Buffer | string;
  location?: string;
}

interface FakeReleases {
  baseUrl: string;
  requests: string[];
  route(pathname: string, route: Route): void;
  close(): Promise<void>;
}

/** Release-download server: unknown paths answer 404; every request path is recorded. */
async function startFakeReleases(): Promise<FakeReleases> {
  const routes = new Map<string, Route>();
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const pathname = req.url ?? '';
    requests.push(pathname);
    const route = routes.get(pathname);
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    if (route.location) {
      res.writeHead(route.status, { location: route.location });
      res.end();
      return;
    }
    res.writeHead(route.status, { 'content-type': 'application/octet-stream' });
    res.end(route.body ?? '');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    route: (pathname, route) => { routes.set(pathname, route); },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

interface ExecRecord {
  file: string;
  args: string[];
  cwd?: string;
}

/**
 * The real execFile, recorded. A bare `aiken`/`aikup` resolves only in the
 * fixture home's bin (then /usr/bin:/bin for the scripts' own tools), and an
 * absolute aiken/aikup outside the fixture home is refused: the host's real
 * toolchain can never run, whatever the code under test does.
 */
function recordingExec(
  home: string,
  after?: (record: ExecRecord) => Promise<void>
): { exec: ExecFileFn; calls: ExecRecord[] } {
  const calls: ExecRecord[] = [];
  const exec: ExecFileFn = async (file, args, options) => {
    const record: ExecRecord = { file, args: [...args], cwd: options.cwd };
    calls.push(record);
    let effective = options;
    if (file === 'aiken' || file === 'aikup') {
      effective = { ...options, env: { ...options.env, PATH: `${path.join(home, '.aiken', 'bin')}:/usr/bin:/bin` } };
    } else if (
      (path.basename(file) === 'aiken' || path.basename(file) === 'aikup')
      && !path.resolve(file).startsWith(home + path.sep)
    ) {
      throw new Error(`test refused to exec ${file} outside the fixture home`);
    }
    try {
      return await realExecFile(file, args, effective);
    } finally {
      if (after) await after(record);
    }
  };
  return { exec, calls };
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

function rejectedWith<T>(outcome: Outcome<T>, prefix: string): boolean {
  return outcome.status === 'error' && outcome.error.message.startsWith(prefix);
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

async function isRegularFile(file: string): Promise<boolean> {
  try {
    return (await fs.lstat(file)).isFile();
  } catch {
    return false;
  }
}

/** Leftover temp dirs of interrupted or failed installs. */
async function downloadLeftovers(home: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(home, '.aiken', 'versions')).catch(() => [] as string[]);
  return entries.filter(name => name.startsWith('.download-'));
}

async function sentinelOf(home: string): Promise<string> {
  const link = path.join(home, '.aiken', 'bin', 'aiken');
  try {
    return `${await fs.readlink(link)} (inode ${(await fs.lstat(link)).ino})`;
  } catch (error) {
    return `<${error instanceof Error ? error.message : String(error)}>`;
  }
}

function check(name: string, cond: boolean): boolean {
  console.log(cond ? `✅ SUCCESS: ${name}` : `❌ FAILURE: ${name}`);
  return cond;
}

function list(items: string[]): string {
  return items.length ? items.join(', ') : 'none';
}

function execsOf(calls: ExecRecord[], file: string): string[] {
  return calls.filter(c => path.basename(c.file) === file).map(c => `${c.file} ${c.args.join(' ')}`);
}

async function testAikenToolchain(): Promise<boolean> {
  let ok = true;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aiken-toolchain-test-'));
  const server = await startFakeReleases();
  try {
    const home = await createFixtureHome(root);
    const releaseBaseUrl = server.baseUrl;
    const workDir = (name: string) => fs.mkdir(path.join(root, name)).then(() => path.join(root, name));
    const sentinel = await sentinelOf(home);
    const urlOf = (tag: string) => `/${tag}/${assetOf(tag).assetName}`;

    /** Serve `tag` (optionally behind a 302) with a sidecar of `sidecarHex` (default: the right one). */
    async function serve(tag: string, opts: { redirect?: boolean; sidecarHex?: string; version?: string } = {}) {
      const archive = await buildArchive(root, tag, opts.version ?? `${tag}+fake`);
      const assetPath = urlOf(tag);
      const blobPath = `/blob${assetPath}`;
      if (opts.redirect) {
        server.route(assetPath, { status: 302, location: `${server.baseUrl}${blobPath}` });
        server.route(blobPath, { status: 200, body: archive });
      } else {
        server.route(assetPath, { status: 200, body: archive });
      }
      server.route(`${assetPath}.sha256`, {
        status: 200,
        body: `${opts.sidecarHex ?? sha256(archive)} *${assetOf(tag).assetName}\n`,
      });
      return { assetPath, blobPath, sidecarPath: `${assetPath}.sha256` };
    }

    // --- S1: two present versions on two instances; nothing shared is touched ---
    {
      const dirA = await workDir('s1-a');
      const dirB = await workDir('s1-b');
      const sentinelAfterExec: string[] = [];
      const { exec, calls } = recordingExec(home, async () => { sentinelAfterExec.push(await sentinelOf(home)); });
      // Two instances on one home: the lock must be per process, not per instance.
      const tcA = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const tcB = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const [outcomeA, outcomeB] = await Promise.all([
        withinStall(tcA.installAndBuild(V_A, ['build'], dirA), 'S1 request A'),
        withinStall(tcB.installAndBuild(V_B, ['build'], dirB), 'S1 request B'),
      ]);
      const seenA = await compilerIn(dirA);
      const seenB = await compilerIn(dirB);
      const moved = sentinelAfterExec.filter(s => s !== sentinel);
      const finalSentinel = await sentinelOf(home);

      ok = check(
        `S1: A built with its own compiler (expected ${V_A}+fake, A observed ${seenA}; A ${describe(outcomeA)})`,
        seenA === `${V_A}+fake`
      ) && ok;
      ok = check(
        `S1: B built with its own compiler (expected ${V_B}+fake, B observed ${seenB}; B ${describe(outcomeB)})`,
        seenB === `${V_B}+fake`
      ) && ok;
      ok = check(
        `S1: sentinel .aiken/bin/aiken never re-pointed (before ${sentinel}; after ${calls.length} execs, moved: ${list(moved)}; at end ${finalSentinel})`,
        moved.length === 0 && finalSentinel === sentinel
      ) && ok;
      ok = check(`S1: no aikup exec (got ${list(execsOf(calls, 'aikup'))})`, execsOf(calls, 'aikup').length === 0) && ok;
    }

    // --- P1: a present version is run by absolute path, with no request and no extraction ---
    {
      const dir = await workDir('p1');
      const before = server.requests.length;
      const { exec, calls } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const outcome = await withinStall(tc.installAndBuild(V_A, ['build'], dir), 'P1');
      const requests = server.requests.slice(before);
      const seen = await compilerIn(dir);
      const builds = calls.filter(c => c.cwd === dir).map(c => c.file);
      const expected = binaryOf(home, V_A);

      ok = check(`P1 present: resolves with its own compiler (${describe(outcome)}, observed ${seen})`, outcome.status === 'ok' && seen === `${V_A}+fake`) && ok;
      ok = check(`P1 present: zero HTTP requests (got ${list(requests)})`, requests.length === 0) && ok;
      ok = check(
        `P1 present: no aikup or tar exec (aikup: ${list(execsOf(calls, 'aikup'))}; tar: ${list(execsOf(calls, 'tar'))})`,
        execsOf(calls, 'aikup').length === 0 && execsOf(calls, 'tar').length === 0
      ) && ok;
      ok = check(
        `P1 present: the build exec's file is ${expected} (build execs: ${list(builds)})`,
        builds.length === 1 && builds[0] === expected && path.isAbsolute(builds[0])
      ) && ok;
    }

    // --- P2: an absent cargo-dist version is downloaded (302 like GitHub), verified and installed ---
    {
      const dir1 = await workDir('p2-1');
      const dir2 = await workDir('p2-2');
      const { assetPath, blobPath, sidecarPath } = await serve(V_DL, { redirect: true });
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });

      const before1 = server.requests.length;
      const outcome1 = await withinStall(tc.installAndBuild(V_DL, ['build'], dir1), 'P2 first call');
      const requests1 = server.requests.slice(before1);
      const seen1 = await compilerIn(dir1);
      const before2 = server.requests.length;
      const outcome2 = await withinStall(tc.installAndBuild(V_DL, ['build'], dir2), 'P2 second call');
      const requests2 = server.requests.slice(before2);
      const seen2 = await compilerIn(dir2);
      const expectedRequests = [assetPath, blobPath, sidecarPath].sort();
      const leftovers = await downloadLeftovers(home);
      const finalSentinel = await sentinelOf(home);

      ok = check(`P2 absent: resolves with the downloaded compiler (${describe(outcome1)}, observed ${seen1})`, outcome1.status === 'ok' && seen1 === `${V_DL}+fake`) && ok;
      ok = check(`P2 absent: binary installed at ${binaryOf(home, V_DL)}`, await isRegularFile(binaryOf(home, V_DL))) && ok;
      ok = check(
        `P2 absent: requests are asset + redirect target + sidecar (got ${list(requests1)})`,
        JSON.stringify([...requests1].sort()) === JSON.stringify(expectedRequests)
      ) && ok;
      ok = check(
        `P2 absent: a second call makes zero new requests (${describe(outcome2)}, observed ${seen2}, requests ${list(requests2)})`,
        outcome2.status === 'ok' && seen2 === `${V_DL}+fake` && requests2.length === 0
      ) && ok;
      ok = check(`P2 absent: no .download-* left under versions/ (got ${list(leftovers)})`, leftovers.length === 0) && ok;
      ok = check(`P2 absent: sentinel unchanged (before ${sentinel}, after ${finalSentinel})`, finalSentinel === sentinel) && ok;
    }

    // --- P3: a sidecar mismatch installs nothing and releases the lock ---
    {
      const dirA = await workDir('p3-a');
      const dirB = await workDir('p3-b');
      await serve(V_BAD, { sidecarHex: sha256('not the archive') });
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const pA = withinStall(tc.installAndBuild(V_BAD, ['build'], dirA), 'P3 request A');
      const pB = withinStall(tc.installAndBuild(V_B, ['build'], dirB), 'P3 request B');
      const [outcomeA, outcomeB] = await Promise.all([pA, pB]);
      const seenB = await compilerIn(dirB);
      const leftovers = await downloadLeftovers(home);

      ok = check(
        `P3 mismatch: A rejects with "Failed to install Aiken version ${V_BAD}:" (A ${describe(outcomeA)})`,
        rejectedWith(outcomeA, `Failed to install Aiken version ${V_BAD}:`)
      ) && ok;
      ok = check(`P3 mismatch: ${binaryOf(home, V_BAD)} is absent`, !(await isRegularFile(binaryOf(home, V_BAD)))) && ok;
      ok = check(`P3 mismatch: no .download-* left under versions/ (got ${list(leftovers)})`, leftovers.length === 0) && ok;
      ok = check(
        `P3 mismatch: queued B completes with its own compiler (B ${describe(outcomeB)}, B observed ${seenB})`,
        outcomeB.status === 'ok' && seenB === `${V_B}+fake`
      ) && ok;
    }

    // --- P4: one absent tag, two concurrent instances: one download ---
    {
      const dirA = await workDir('p4-a');
      const dirB = await workDir('p4-b');
      const { assetPath } = await serve(V_RACE);
      const { exec } = recordingExec(home);
      const tcA = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const tcB = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const before = server.requests.length;
      const [outcomeA, outcomeB] = await Promise.all([
        withinStall(tcA.installAndBuild(V_RACE, ['build'], dirA), 'P4 request A'),
        withinStall(tcB.installAndBuild(V_RACE, ['build'], dirB), 'P4 request B'),
      ]);
      const assetRequests = server.requests.slice(before).filter(p => p === assetPath).length;
      const seenA = await compilerIn(dirA);
      const seenB = await compilerIn(dirB);

      ok = check(
        `P4 concurrent: both resolve with the compiler (A ${describe(outcomeA)}, ${seenA}; B ${describe(outcomeB)}, ${seenB})`,
        outcomeA.status === 'ok' && outcomeB.status === 'ok' && seenA === `${V_RACE}+fake` && seenB === `${V_RACE}+fake`
      ) && ok;
      ok = check(`P4 concurrent: the asset is requested exactly once (got ${assetRequests})`, assetRequests === 1) && ok;
    }

    // --- P5: a concurrent installer wins the rename: use its binary ---
    {
      const dir = await workDir('p5');
      await serve(V_LOST);
      const planted = `${V_LOST}+planted`;
      let plantedAfterTar = false;
      const { exec } = recordingExec(home, async record => {
        if (path.basename(record.file) === 'tar' && !plantedAfterTar) {
          plantedAfterTar = true;
          await writeExecutable(binaryOf(home, V_LOST), fakeAiken(planted, writesPlutusJson(planted)));
        }
      });
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const outcome = await withinStall(tc.installAndBuild(V_LOST, ['build'], dir), 'P5');
      const seen = await compilerIn(dir);
      const leftovers = await downloadLeftovers(home);

      ok = check(
        `P5 lost rename: resolves with the winner's binary (planted after tar: ${plantedAfterTar}; ${describe(outcome)}, observed ${seen})`,
        plantedAfterTar && outcome.status === 'ok' && seen === planted
      ) && ok;
      ok = check(`P5 lost rename: no .download-* left under versions/ (got ${list(leftovers)})`, leftovers.length === 0) && ok;
    }

    // --- P6: a legacy tag is verified against the pinned table, never a sidecar ---
    {
      const dir = await workDir('p6');
      const asset = assetOf(V_LEGACY_PINNED);
      // A fake archive WITH a matching sidecar: only the pinned hash refuses it.
      const { assetPath } = await serve(V_LEGACY_PINNED);
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const before = server.requests.length;
      const outcome = await withinStall(tc.installAndBuild(V_LEGACY_PINNED, ['build'], dir), 'P6');
      const requests = server.requests.slice(before);
      const sidecarRequests = requests.filter(p => p.endsWith('.sha256'));
      const leftovers = await downloadLeftovers(home);
      const expectedRequests = asset.integrity.kind === 'pinned' ? [assetPath] : [];

      ok = check(
        `P6 legacy ${asset.integrity.kind}: rejects with "Failed to install Aiken version ${V_LEGACY_PINNED}:" (${describe(outcome)})`,
        rejectedWith(outcome, `Failed to install Aiken version ${V_LEGACY_PINNED}:`)
      ) && ok;
      ok = check(`P6 legacy: no .sha256 request (got ${list(sidecarRequests)})`, sidecarRequests.length === 0) && ok;
      ok = check(
        `P6 legacy: requests are ${list(expectedRequests)} (got ${list(requests)})`,
        JSON.stringify(requests) === JSON.stringify(expectedRequests)
      ) && ok;
      ok = check(
        `P6 legacy: nothing installed (${binaryOf(home, V_LEGACY_PINNED)} absent, leftovers ${list(leftovers)})`,
        !(await isRegularFile(binaryOf(home, V_LEGACY_PINNED))) && leftovers.length === 0
      ) && ok;
    }

    // --- P7: an unpinned legacy tag is refused before any request ---
    {
      const dir = await workDir('p7');
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const before = server.requests.length;
      const outcome = await withinStall(tc.installAndBuild(V_LEGACY_UNPINNED, ['build'], dir), 'P7');
      const requests = server.requests.slice(before);
      ok = check(
        `P7 unpinned legacy: rejects with "Failed to install Aiken version ${V_LEGACY_UNPINNED}:" (${describe(outcome)})`,
        rejectedWith(outcome, `Failed to install Aiken version ${V_LEGACY_UNPINNED}:`)
      ) && ok;
      ok = check(`P7 unpinned legacy: zero requests (got ${list(requests)})`, requests.length === 0) && ok;
    }

    // --- S2: a failed download releases the lock and never leaks the redirect target ---
    {
      const dirA = await workDir('s2-a');
      const dirB = await workDir('s2-b');
      const assetPath = urlOf(V_MISSING);
      const blobPath = `/blob${assetPath}`;
      server.route(assetPath, { status: 302, location: `${server.baseUrl}${blobPath}` }); // blobPath: 404
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const pA = withinStall(tc.installAndBuild(V_MISSING, ['build'], dirA), 'S2 request A');
      const pB = withinStall(tc.installAndBuild(V_B, ['build'], dirB), 'S2 request B');
      const [outcomeA, outcomeB] = await Promise.all([pA, pB]);
      const seenB = await compilerIn(dirB);
      const message = outcomeA.status === 'error' ? outcomeA.error.message : '';
      ok = check(
        `S2 download failure: A rejects with "Failed to install Aiken version ${V_MISSING}:" (A ${describe(outcomeA)})`,
        rejectedWith(outcomeA, `Failed to install Aiken version ${V_MISSING}:`)
      ) && ok;
      ok = check(
        `S2 download failure: the error names ${releaseBaseUrl}${assetPath} and 404, never the redirect target`,
        message.includes(`${releaseBaseUrl}${assetPath}`) && message.includes('404') && !message.includes('/blob/')
      ) && ok;
      ok = check(
        `S2 download failure: queued B completes with its own compiler (B ${describe(outcomeB)}, B observed ${seenB})`,
        outcomeB.status === 'ok' && seenB === `${V_B}+fake`
      ) && ok;
    }

    // --- S3: build failure releases the lock ---
    {
      const dirA = await workDir('s3-a');
      const dirB = await workDir('s3-b');
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
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
      const { exec } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, timeoutMs: 1000, releaseBaseUrl });
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

    // --- S5: the release-tag guard refuses before any exec or request ---
    {
      const dir = await workDir('s5');
      const { exec, calls } = recordingExec(home);
      const tc = createAikenToolchain({ home, execFile: exec, releaseBaseUrl });
      const before = server.requests.length;
      for (const tag of ['--help', 'v1.1.21+abc', ' v9.9.1', '9.9.1', '../v9.9.1', 'v9.9.1/../../x', '..', '']) {
        const outcome = await withinStall(tc.installAndBuild(tag, ['build'], dir), `S5 ${JSON.stringify(tag)}`);
        ok = check(`S5 guard: ${JSON.stringify(tag)} is rejected (${describe(outcome)})`, outcome.status === 'error') && ok;
      }
      const requests = server.requests.slice(before);
      ok = check(
        `S5 guard: zero exec calls for rejected tags (recorded ${calls.length}${calls.length ? `: ${calls.map(c => `${c.file} ${c.args.join(' ')}`).join('; ')}` : ''})`,
        calls.length === 0
      ) && ok;
      ok = check(`S5 guard: zero requests for rejected tags (got ${list(requests)})`, requests.length === 0) && ok;
    }
  } finally {
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
  return ok;
}

if (require.main === module) {
  testAikenToolchain().then(ok => process.exit(ok ? 0 : 1));
}

export { testAikenToolchain };
