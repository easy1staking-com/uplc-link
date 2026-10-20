/**
 * Browser leg of the runtime-image E2E (see e2e/runtime/README.md at the repo root).
 *
 * Drives headless Chromium (Playwright library API) against the FE container's
 * production bundle and the BE holding the two injected, rebuilt records:
 *
 *   node e2e/runtime-browser-leg.mjs --fe-url --oracle --source-url --commit --source-path --out-dir
 *
 * Reads `<out-dir>/expected.json` (written by runtime-fe-leg.ts `prepare`) for
 * each env's txHash. Every expected hash and CBOR comes from the oracle file at
 * run time; none is a literal. Every request the page makes to another origin
 * is aborted (never answered with a stand-in). A redirect hop from an FE
 * response is not routed (Playwright calls a route only for the first URL of a
 * redirect chain), so it would reach the network, and it would fail
 * `browser no-blockfrost` only if the other origin answered it.
 * Nothing is built, signed or submitted; the
 * only clicks are `Verify Contract`, `+ Add entry` and `Share Verification`.
 *
 * Every label prints exactly once as `PASS <label>` or `FAIL <label> — <detail>`
 * at line start; the last line is `BROWSER-LEG: PASS|FAIL`. Exit 0 iff no FAIL.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';

const ENVS = [
  { name: 'default', env: '', oracleEnv: '' },
  { name: 'preview', env: 'preview', oracleEnv: 'preview' },
];
const VALIDATOR = 'fixture.vault';
const VERSION = 'v1.1.24';
const PAYEE = 'addr_test1vrxumnwdehxumnwdehxumnwdehxumnwdehxumnwdehxumng5y82j7';
const NOTE_B = 'Matched: 1 | Unmatched Actual: 0 | Unmatched Expected: 0';
const VERIFY_TIMEOUT_MS = 600000;

let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail) {
  failures++;
  console.log(`FAIL ${label} — ${String(detail).replace(/\s+/g, ' ').slice(0, 600)}`);
}

function skipped(label, reason) {
  fail(label, `skipped: ${reason}`);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad arguments near ${argv[i]}`);
    opts[argv[i].slice(2)] = argv[i + 1];
  }
  for (const k of ['fe-url', 'oracle', 'source-url', 'commit', 'source-path', 'out-dir']) {
    if (!(k in opts)) throw new Error(`missing --${k}`);
  }
  return opts;
}

// ---------------------------------------------------------------- browser plumbing

// BEGIN plumbing
// Observation, independent of the route guard below: every http(s) request the
// page emits is recorded by Request object; "foreign" = origin other than the FE.
const observed = []; // { request, url, host, foreign, failed, finished, responded }
const nonHttp = new Set();
const blocked = new Set(); // hosts the guard aborted (for INFO lines only)

function observe(context, feOrigin) {
  const find = (request) => observed.find((r) => r.request === request);
  context.on('request', (request) => {
    const url = request.url();
    let u;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      if (!nonHttp.has(u.protocol)) {
        nonHttp.add(u.protocol);
        console.log(`INFO non-http ${u.protocol}`);
      }
      return;
    }
    observed.push({
      request,
      url,
      host: u.host,
      foreign: u.origin !== feOrigin,
      failed: false,
      finished: false,
      responded: false,
    });
  });
  context.on('requestfailed', (request) => {
    const r = find(request);
    if (r) r.failed = true;
  });
  context.on('requestfinished', (request) => {
    const r = find(request);
    if (r) r.finished = true;
  });
  context.on('response', (response) => {
    const r = find(response.request());
    if (r) r.responded = true;
  });
}

async function newContext(browser, feOrigin, extra = {}) {
  const context = await browser.newContext(extra);
  context.setDefaultTimeout(20000);
  observe(context, feOrigin);
  // Same-origin requests continue to the real FE; everything else is aborted
  await context.route('**/*', (route) => {
    const url = route.request().url();
    let origin = '';
    let host = '';
    try {
      const u = new URL(url);
      origin = u.origin;
      host = u.host || u.protocol;
    } catch {
      host = url.slice(0, 40);
    }
    const allowed = origin === feOrigin;
    if (allowed) return route.continue();
    blocked.add(host);
    return route.abort();
  });
  return context;
}
// END plumbing

async function shot(page, outDir, flow) {
  try {
    const dir = path.join(outDir, 'browser');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${flow}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`INFO screenshot ${file}`);
  } catch (e) {
    console.log(`INFO screenshot failed for ${flow}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Run one label; `fn` returns null on success or a failure detail. */
async function lab(flow, label, fn) {
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
  await shot(flow.page, flow.outDir, flow.name);
  return false;
}

// ---------------------------------------------------------------- page helpers

const paramRoot = (page, title) =>
  page.locator('label', { hasText: new RegExp('^' + title + '\\(') }).locator('xpath=../..');
const liveCbor = (root) => root.locator('p', { hasText: /^CBOR:/ }).locator('span');
const textInputs = (root) => root.locator('input[type="text"]');
const actualSpan = (page) =>
  page
    .locator('div', { has: page.locator(':scope > span', { hasText: /^Actual:$/ }) })
    .locator(':scope > span.break-all');

async function waitVerified(page) {
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  const heading = page.getByText('Configure Validator Parameters');
  const errBox = page.locator('p.font-bold', { hasText: /^Error:$/ });
  const loadErr = page.getByText('Failed to load verification data');
  for (;;) {
    if ((await heading.count()) > 0) return;
    if ((await errBox.count()) > 0) {
      throw new Error(`page Error box: ${await errBox.locator('xpath=../p[2]').textContent()}`);
    }
    if ((await loadErr.count()) > 0) {
      throw new Error(`deep link error: ${await loadErr.locator('xpath=..').textContent()}`);
    }
    if (Date.now() >= deadline) throw new Error(`no "Configure Validator Parameters" within ${VERIFY_TIMEOUT_MS / 1000} s`);
    await sleep(1000);
  }
}

/** Poll the Actual span until it equals `want` (<= ms); null on success. */
async function pollActual(page, want, ms = 30000) {
  const loc = actualSpan(page);
  const deadline = Date.now() + ms;
  let last = '<absent>';
  for (;;) {
    const n = await loc.count();
    if (n === 1) {
      last = (await loc.textContent()) ?? '';
      if (last === want) return null;
    } else {
      last = `<${n} Actual spans>`;
    }
    if (Date.now() >= deadline) return `Actual span ${last}, expected ${want}`;
    await sleep(500);
  }
}

async function visible(loc, what, ms = 20000) {
  try {
    await loc.first().waitFor({ state: 'visible', timeout: ms });
    return null;
  } catch {
    return `${what} not visible`;
  }
}

async function selectedTexts(sel) {
  return sel.evaluateAll((els) => els.map((e) => e.options[e.selectedIndex]?.text ?? '<none>'));
}

// ---------------------------------------------------------------- shared checks

async function checkHash(page, build) {
  const miss = await pollActual(page, build.applied_hashes[build.applied_hashes.length - 1]);
  if (miss) return miss;
  let d = await visible(page.getByText('All Hashes Match!'), '"All Hashes Match!"');
  if (d) return d;
  d = await visible(page.getByText(NOTE_B), `"${NOTE_B}"`);
  return d;
}

async function checkSubmitGate(page) {
  let d = await visible(page.getByRole('heading', { name: 'Submit to Registry', exact: true }), 'Submit to Registry heading');
  if (d) return d;
  d = await visible(page.getByText('1 validator with parameters will be registered.'), 'registered-count line');
  if (d) return d;
  d = await visible(page.getByText('Connect your wallet to submit'), '"Connect your wallet to submit"');
  if (d) return d;
  const n = await page.getByRole('button', { name: 'Submit to Registry' }).count();
  return n === 0 ? null : `${n} button(s) named Submit to Registry`;
}

async function checkParams(page, oracle) {
  const bad = [];
  for (const p of oracle.parameters) {
    const root = paramRoot(page, p.title);
    const n = await root.count();
    if (n !== 1) {
      bad.push(`${p.title}: ${n} roots`);
      continue;
    }
    if ((await root.locator('textarea').count()) !== 0) bad.push(`${p.title}: has a textarea`);
    const cb = liveCbor(root);
    const deadline = Date.now() + 10000;
    let got = '<absent>';
    for (;;) {
      if ((await cb.count()) === 1) got = (await cb.textContent()) ?? '';
      if (got === p.cbor || Date.now() >= deadline) break;
      await sleep(300);
    }
    if (got !== p.cbor) bad.push(`${p.title}: CBOR ${got} != oracle ${p.cbor}`);
  }
  const mins = await textInputs(paramRoot(page, 'minimum')).evaluateAll((els) => els.map((e) => e.value));
  if (JSON.stringify(mins) !== JSON.stringify(['0x', '0x', '2000000'])) {
    bad.push(`minimum inputs ${JSON.stringify(mins)}`);
  }
  return bad.length ? bad.join('; ') : null;
}

// ---------------------------------------------------------------- flows

async function manualFlow(browser, o, e, oracle, build) {
  const L = (n) => `browser ${n} ${e.name}`;
  const context = await newContext(browser, o.feOrigin);
  const page = await context.newPage();
  const flow = { page, outDir: o.outDir, name: `manual-${e.name}` };
  const titles = oracle.parameters.map((p) => p.title);
  const rest = ['manual-forms', 'manual-params', 'manual-hash', 'manual-submit-gate'];

  let verified = false;
  await lab(flow, L('manual-raw'), async () => {
    await page.goto(`${o.feUrl}/verify`);
    await page.getByPlaceholder('https://github.com/username/repo').fill(o.sourceUrl);
    await page.getByPlaceholder('abc123def456...').fill(o.commit);
    await page.locator('#aiken-version').fill(VERSION);
    await page.getByPlaceholder('e.g., contracts/my-project').fill(o.sourcePath);
    if (e.env !== '') await page.getByPlaceholder('e.g., mainnet').fill(e.env);
    await page.locator('main textarea').first().fill(build.applied_hashes[build.applied_hashes.length - 1]);
    await page.getByRole('button', { name: 'Verify Contract' }).click();
    await waitVerified(page);
    verified = true;

    const bad = [];
    const resTitles = await page.locator('div.font-medium.text-lg').allTextContents();
    if (resTitles.length !== 1 || resTitles[0] !== VALIDATOR) bad.push(`result titles ${JSON.stringify(resTitles)}`);
    if ((await page.getByText('Purposes: spend, else').count()) < 1) bad.push('Purposes line missing');
    const items = await page.locator('li.text-gray-300').allTextContents();
    if (items.length !== titles.length || !titles.every((t, i) => items[i].startsWith(`- ${t} (`))) {
      bad.push(`requires-parameters items ${JSON.stringify(items)}`);
    }
    const miss = await pollActual(page, build.unapplied_hash);
    if (miss) bad.push(miss);
    if ((await page.getByText('Parameters not provided - showing unparameterized hash').count()) < 1) {
      bad.push('unparameterized-hash note missing');
    }
    return bad.length ? bad.join('; ') : null;
  });
  if (!verified) {
    for (const r of rest) skipped(L(r), 'verification never completed');
    await context.close();
    return;
  }

  await lab(flow, L('manual-forms'), async () => {
    const bad = [];
    for (const t of titles) {
      const root = paramRoot(page, t);
      const n = await root.count();
      if (n !== 1) {
        bad.push(`${t}: ${n} roots`);
        continue;
      }
      for (const b of ['Form', 'CBOR']) {
        if ((await root.getByRole('button', { name: b, exact: true }).count()) !== 1) bad.push(`${t}: no ${b} button`);
      }
      if ((await root.locator('textarea').count()) !== 0) bad.push(`${t}: has a textarea`);
    }
    const nested = paramRoot(page, 'nested').locator('select');
    const sel = await selectedTexts(nested);
    if (sel.length !== 2 || sel.some((s) => s !== 'Some')) bad.push(`nested selects ${JSON.stringify(sel)}`);
    const seed = paramRoot(page, 'seed');
    if ((await seed.getByText('Transaction hash').count()) < 1) bad.push('seed: no Transaction hash');
    if ((await seed.getByText('Output index').count()) < 1) bad.push('seed: no Output index');
    if ((await paramRoot(page, 'payee').locator('input[placeholder^="addr1"]').count()) < 1) bad.push('payee: no addr1... input');
    const minimum = paramRoot(page, 'minimum');
    if ((await minimum.getByRole('button', { name: '+ Add entry' }).count()) < 1) bad.push('minimum: no + Add entry');
    if ((await textInputs(minimum).count()) !== 0) bad.push('minimum: has a text input before entries');
    return bad.length ? bad.join('; ') : null;
  });

  await lab(flow, L('manual-params'), async () => {
    const put = async (title, values) => {
      const inputs = textInputs(paramRoot(page, title));
      for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(values[i]);
    };
    await put('owner', ['ab'.repeat(28)]);
    await put('threshold', ['2000000']);
    await put('pair', ['1', 'cafe']);
    await put('tuple', ['beef', '2']);
    await put('nested', ['7']);
    await put('seed', ['11'.repeat(32), '0']);
    await put('payee', [PAYEE]);
    const minimum = paramRoot(page, 'minimum');
    await minimum.getByRole('button', { name: '+ Add entry' }).first().click();
    await minimum.getByRole('button', { name: '+ Add entry' }).first().click();
    const n = await textInputs(minimum).count();
    if (n !== 3) throw new Error(`minimum has ${n} text inputs after two entries, expected 3`);
    await put('minimum', ['0x', '0x', '2000000']);
    return checkParams(page, oracle);
  });

  await lab(flow, L('manual-hash'), () => checkHash(page, build));
  await lab(flow, L('manual-submit-gate'), () => checkSubmitGate(page));
  await context.close();
}

async function registryFlow(browser, o, e, build, exp) {
  const label = `browser registry-card ${e.name}`;
  if (!exp) return skipped(label, 'expected.json has no txHash for this env');
  const context = await newContext(browser, o.feOrigin);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: o.feOrigin });
  const page = await context.newPage();
  const flow = { page, outDir: o.outDir, name: `registry-${e.name}` };
  await lab(flow, label, async () => {
    const finalHash = build.applied_hashes[build.applied_hashes.length - 1];
    await page.goto(`${o.feUrl}/registry?hash=${finalHash}`);
    const bad = [];
    let d = await visible(page.getByText('Found 1 script', { exact: true }), '"Found 1 script"', 60000);
    if (d) return d;
    const h3 = await page.locator('main h3').allTextContents();
    if (h3.length !== 1 || h3[0] !== VALIDATOR) bad.push(`h3 ${JSON.stringify(h3)}`);
    if ((await page.getByText('Parameterized', { exact: true }).count()) < 1) bad.push('no Parameterized badge');
    const pills = await page.locator('span', { hasText: /^env:/ }).allTextContents();
    const wantPills = e.env === '' ? [] : [`env: ${e.env}`];
    if (JSON.stringify(pills) !== JSON.stringify(wantPills)) bad.push(`env pills ${JSON.stringify(pills)}, expected ${JSON.stringify(wantPills)}`);
    await page.getByRole('button', { name: 'Share Verification' }).click();
    const want = `${o.feOrigin}/verify?txHash=${exp.txHash}`;
    const deadline = Date.now() + 5000;
    let clip = '';
    for (;;) {
      clip = await page.evaluate(() => navigator.clipboard.readText());
      if (clip === want || Date.now() >= deadline) break;
      await sleep(250);
    }
    if (clip !== want) bad.push(`clipboard ${JSON.stringify(clip)} != ${want}`);
    return bad.length ? bad.join('; ') : null;
  });
  await context.close();
}

async function deeplinkFlow(browser, o, e, oracle, build, exp) {
  const L = (n) => `browser ${n} ${e.name}`;
  const all = ['deeplink-meta', 'deeplink-prefill', 'deeplink-params', 'deeplink-hash', 'deeplink-submit-gate'];
  if (!exp) {
    for (const n of all) skipped(L(n), 'expected.json has no txHash for this env');
    return;
  }
  const finalHash = build.applied_hashes[build.applied_hashes.length - 1];
  const url = `${o.feUrl}/verify?txHash=${exp.txHash}`;

  // Crawlers do not run JS: meta must be in the server-rendered HTML
  const metaCtx = await newContext(browser, o.feOrigin, { javaScriptEnabled: false });
  const metaPage = await metaCtx.newPage();
  await lab({ page: metaPage, outDir: o.outDir, name: `meta-${e.name}` }, L('deeplink-meta'), async () => {
    await metaPage.goto(url);
    const bad = [];
    const og = await metaPage.locator('meta[property="og:title"]').first().getAttribute('content');
    const repo = new URL(o.sourceUrl).pathname.replace(/^\//, '').replace(/\.git$/, '');
    const wantTitle = `${repo} @ ${o.commit.slice(0, 8)}`;
    if (!(og ?? '').startsWith(wantTitle)) bad.push(`og:title ${JSON.stringify(og)} does not start with ${wantTitle}`);
    const desc = (await metaPage.locator('meta[name="description"]').first().getAttribute('content')) ?? '';
    for (const frag of [VERSION, '1 script hash', 'VERIFIED']) {
      if (!desc.includes(frag)) bad.push(`description lacks "${frag}"`);
    }
    if (e.env !== '' && !desc.includes(`(env: ${e.env})`)) bad.push(`description lacks "(env: ${e.env})"`);
    if (e.env === '' && desc.includes('(env:')) bad.push('description has "(env:" for the default env');
    if (bad.length) bad.push(`description=${JSON.stringify(desc)}`);
    return bad.length ? bad.join('; ') : null;
  });
  await metaCtx.close();

  const context = await newContext(browser, o.feOrigin);
  const page = await context.newPage();
  const flow = { page, outDir: o.outDir, name: `deeplink-${e.name}` };

  let verified = false;
  await lab(flow, L('deeplink-prefill'), async () => {
    await page.goto(url);
    await waitVerified(page);
    verified = true;
    const bad = [];
    let d = await visible(page.getByText('Loaded from transaction:'), '"Loaded from transaction:"');
    if (d) bad.push(d);
    const val = async (loc) => loc.first().inputValue();
    const got = {
      repo: await val(page.getByPlaceholder('https://github.com/username/repo')),
      commit: await val(page.getByPlaceholder('abc123def456...')),
      path: await val(page.getByPlaceholder('e.g., contracts/my-project')),
      env: await val(page.getByPlaceholder('e.g., mainnet')),
      version: await val(page.locator('#aiken-version')),
      hashes: await val(page.locator('main textarea')),
    };
    const want = { repo: o.sourceUrl, commit: o.commit, path: o.sourcePath, env: e.env, version: VERSION, hashes: finalHash };
    for (const k of Object.keys(want)) {
      if (got[k] !== want[k]) bad.push(`${k} ${JSON.stringify(got[k])} != ${JSON.stringify(want[k])}`);
    }
    d = await visible(
      page.getByText('Parameters have been pre-filled from the verification transaction.'),
      'pre-filled note',
    );
    if (d) bad.push(d);
    return bad.length ? bad.join('; ') : null;
  });

  if (verified) {
    await lab(flow, L('deeplink-params'), () => checkParams(page, oracle));
    await lab(flow, L('deeplink-hash'), () => checkHash(page, build));
    await lab(flow, L('deeplink-submit-gate'), () => checkSubmitGate(page));
  } else {
    for (const n of all.slice(2)) skipped(L(n), 'verification never completed');
  }
  await context.close();
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const feUrl = opts['fe-url'].replace(/\/$/, '');
  const o = {
    feUrl,
    feOrigin: new URL(feUrl).origin,
    sourceUrl: opts['source-url'],
    commit: opts['commit'],
    sourcePath: opts['source-path'],
    outDir: opts['out-dir'],
  };
  const oracle = JSON.parse(fs.readFileSync(opts['oracle'], 'utf-8'));
  let expected = [];
  try {
    expected = JSON.parse(fs.readFileSync(path.join(o.outDir, 'expected.json'), 'utf-8'));
  } catch (err) {
    console.log(`INFO expected.json unreadable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const e of ENVS) {
      const build = oracle.builds.find((b) => b.env === e.oracleEnv);
      if (!build) throw new Error(`oracle has no build for env "${e.oracleEnv}"`);
      const exp = expected.find((x) => x.env === e.name);
      await manualFlow(browser, o, e, oracle, build);
      await registryFlow(browser, o, e, build, exp);
      await deeplinkFlow(browser, o, e, oracle, build, exp);
    }
  } finally {
    await browser.close();
  }

  // BEGIN evaluation
  // Decided from observed requests only, after every context is closed.
  for (const h of blocked) console.log(`INFO blocked ${h}`);
  const foreignReqs = observed.filter((r) => r.foreign);
  const blockfrost = observed.filter((r) => r.host.toLowerCase().includes('blockfrost'));
  const notAborted = foreignReqs.filter((r) => !r.failed || r.finished || r.responded);
  if (observed.length === 0) {
    fail('browser no-blockfrost', 'condition 1 failed: no request was recorded');
  } else if (blockfrost.length > 0) {
    fail('browser no-blockfrost', `condition 2 failed: blockfrost host requested: ${blockfrost.map((r) => r.url).join(', ')}`);
  } else if (notAborted.length > 0) {
    fail(
      'browser no-blockfrost',
      `condition 3 failed: foreign request(s) not aborted (no requestfailed, or finished/responded): ${notAborted.map((r) => r.url).join(', ')}`,
    );
  } else {
    pass('browser no-blockfrost');
  }
  // END evaluation
}

main().then(
  () => {
    console.log(`BROWSER-LEG: ${failures === 0 ? 'PASS' : 'FAIL'}`);
    process.exit(failures === 0 ? 0 : 1);
  },
  (e) => {
    fail('infra browser-leg', e instanceof Error ? e.message : String(e));
    console.log('BROWSER-LEG: FAIL');
    process.exit(1);
  },
);
