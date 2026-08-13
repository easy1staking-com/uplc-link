// Registry proxy harness (T-207/T-208) — persisted from the T-205
// development-session harness (t205-check.mjs).
//
// Registry purposes[] reader + env/purposes serialization lock, verified
// against production-shaped API responses (per-script `purposes: string[]`,
// top-level `env: string|null`, NO singular `purpose` key).
//
// Self-contained: builds the frontend, boots `next start` on NEXT_PORT with
// BACKEND_URL pointed at an in-process stub HTTP server on STUB_PORT that
// serves the fixed JSON fixtures below, then drives it with Playwright.
//
// Port hygiene: kills any stale listeners on our two chosen ports by PID
// first (next serves as `next-server`, not `next` — name-based pkill misses
// it).
//
// STUB_PORT / NEXT_PORT are env-overridable (default 4205 / 4206).
//
// Usage: node registry-check.mjs
// Exits 0 iff all assertions (A, B, C) plus infra checks pass.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const FRONTEND = path.join(__dirname, '..');
const STUB_PORT = Number(process.env.STUB_PORT) || 4205;
const NEXT_PORT = Number(process.env.NEXT_PORT) || 4206;
const BYHASH_HASH = 'c5a1debe56333bcbc5cfe66a7ae0026cbb262b5900e81408d7660e06';

const sundaeFixture = readFileSync(path.join(FIXTURES, 'search-sundae.json'), 'utf8');
const envFixture = readFileSync(path.join(FIXTURES, 'env-canonical.json'), 'utf8');
const byHashFixture = readFileSync(path.join(FIXTURES, 'byhash.json'), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// ---- Port hygiene ---------------------------------------------------------
function killPort(port) {
  let out = '';
  try {
    out = execSync(`ss -ltnp 2>/dev/null | grep ':${port} ' || true`).toString();
  } catch {
    return;
  }
  const pids = [...out.matchAll(/pid=(\d+)/g)].map(m => m[1]);
  for (const pid of new Set(pids)) {
    try {
      execSync(`kill -9 ${pid}`);
      console.log(`Port hygiene: killed stale PID ${pid} listening on ${port}`);
    } catch {
      // already gone
    }
  }
}
killPort(STUB_PORT);
killPort(NEXT_PORT);

// ---- Stub backend HTTP server ----------------------------------------------
const stubServer = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${STUB_PORT}`);
  res.setHeader('content-type', 'application/json');
  if (url.pathname === '/api/v1/scripts/search') {
    const urlPattern = url.searchParams.get('urlPattern');
    if (urlPattern === 'sundae') {
      res.end(sundaeFixture);
      return;
    }
    if (urlPattern === 'envcase') {
      res.end(envFixture);
      return;
    }
    res.end('[]');
    return;
  }
  if (url.pathname.startsWith('/api/v1/scripts/by-hash/')) {
    res.end(byHashFixture);
    return;
  }
  res.statusCode = 404;
  res.end('{"error":"not found in stub"}');
});
await new Promise(resolve => stubServer.listen(STUB_PORT, resolve));
console.log(`Stub backend listening on ${STUB_PORT}`);

// ---- Build + start Next.js --------------------------------------------------
console.log('Building frontend (npm run build)...');
execSync('npm run build', { cwd: FRONTEND, stdio: 'inherit' });

const nextProc = spawn('npx', ['next', 'start', '-p', String(NEXT_PORT)], {
  cwd: FRONTEND,
  env: { ...process.env, BACKEND_URL: `http://localhost:${STUB_PORT}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let nextLog = '';
nextProc.stdout.on('data', d => (nextLog += d.toString()));
nextProc.stderr.on('data', d => (nextLog += d.toString()));

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return false;
}

const BASE = `http://localhost:${NEXT_PORT}`;
const ready = await waitForServer(`${BASE}/`);
check('Infra: next start became ready', ready, ready ? '' : nextLog.slice(-2000));

let browser;
if (ready) {
  browser = await chromium.launch();

  // Reads the first pill's text out of the header pills row for every
  // result card on the page (cards = children of main .space-y-4 that
  // contain an h3, excluding the "Found N scripts" summary line).
  const readPillTexts = () =>
    [...document.querySelectorAll('main .space-y-4 > div')]
      .filter(d => d.querySelector('h3'))
      .map(card => {
        const titleBlock = card.querySelector('h3').parentElement;
        const pillsRow = titleBlock.querySelector('div.flex.items-center.gap-2');
        const firstPill = pillsRow ? pillsRow.querySelector('span') : null;
        return firstPill ? firstPill.textContent.trim() : '';
      });

  // Reads { h3Text, pillTexts[] } for every result card — used by the T-208
  // extension to locate a specific card by its h3 and to scan every pill
  // span on the page for empty/whitespace-only text.
  const readCardPills = () =>
    [...document.querySelectorAll('main .space-y-4 > div')]
      .filter(d => d.querySelector('h3'))
      .map(card => {
        const h3 = card.querySelector('h3');
        const titleBlock = h3.parentElement;
        const pillsRow = titleBlock.querySelector('div.flex.items-center.gap-2');
        const pillTexts = pillsRow ? [...pillsRow.querySelectorAll('span')].map(s => s.textContent) : [];
        return { h3Text: h3.textContent.trim(), pillTexts };
      });

  // ---- A: /registry?url=sundae ---------------------------------------------
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/registry?url=sundae`, { waitUntil: 'networkidle' });
    const found = await page
      .waitForSelector('text=Found', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check('A: result cards render ("Found" banner visible)', found);

    const pillTexts = found ? await page.evaluate(readPillTexts) : [];
    check(
      'A: first pill in the first (oracle) card is exactly "spend, mint"',
      pillTexts[0] === 'spend, mint',
      JSON.stringify(pillTexts)
    );
    check(
      'A: every card\'s purpose pill is non-empty',
      pillTexts.length > 0 && pillTexts.every(t => t.length > 0),
      JSON.stringify(pillTexts)
    );

    await page.close();
  }

  // ---- B: /registry?hash=<oracle rawHash> ------------------------------------
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/registry?hash=${BYHASH_HASH}`, { waitUntil: 'networkidle' });
    const found = await page
      .waitForSelector('text=Found', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check('B: result cards render ("Found" banner visible)', found);

    const pillTexts = found ? await page.evaluate(readPillTexts) : [];
    check(
      'B: every card\'s purpose pill is non-empty',
      pillTexts.length > 0 && pillTexts.every(t => t.length > 0),
      JSON.stringify(pillTexts)
    );
    check('B: first pill equals "spend, mint"', pillTexts[0] === 'spend, mint', JSON.stringify(pillTexts));

    await page.close();
  }

  // ---- C: /registry?url=envcase (env regression lock + T-208 extension) -----
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/registry?url=envcase`, { waitUntil: 'networkidle' });
    await page
      .waitForSelector('text=Found', { timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    const envPillVisible = await page
      .locator('text="env: preview"')
      .first()
      .isVisible()
      .catch(() => false);
    check('C: a pill with exact text "env: preview" is visible', envPillVisible);

    // T-208: env-canonical.json fixture now carries a
    // no_purpose_probe.no_purpose_probe script with purposes: [] (production
    // shape — an empty-but-present purposes array). Its card's FIRST pill
    // must be its plutusVersion string (V3) — i.e. no empty/absent-purposes
    // pill precedes it, proving the `script.purposes.length > 0` guard held.
    const cards = await page.evaluate(readCardPills);
    const probeCard = cards.find(c => c.h3Text === 'no_purpose_probe.no_purpose_probe');
    check('C: no_purpose_probe card is present', !!probeCard, JSON.stringify(cards.map(c => c.h3Text)));
    check(
      'C: no_purpose_probe card\'s first pill equals its plutusVersion (V3) — no purposes pill precedes it',
      !!probeCard && probeCard.pillTexts[0] === 'V3',
      probeCard ? JSON.stringify(probeCard.pillTexts) : 'card not found'
    );

    // No pill span in ANY card's pills row may be empty or whitespace-only —
    // this is what the T-208 mutation (rendering the purposes span
    // unconditionally) breaks: an empty purposes array would render a pill
    // with empty text instead of being omitted.
    const allPills = cards.flatMap(c => c.pillTexts);
    const noEmptyPills = allPills.length > 0 && allPills.every(t => t.trim().length > 0);
    check('C: no pill span in any card\'s pills row has empty/whitespace-only text', noEmptyPills, JSON.stringify(cards));

    await page.close();
  }

  await browser.close();
}

nextProc.kill('SIGTERM');
stubServer.close();
// `npx next start` forks the real `next-server` child, which SIGTERM to the
// npx wrapper does not reliably reach — kill by port so re-runs don't hit a
// stale listener.
await new Promise(resolve => setTimeout(resolve, 500));
killPort(NEXT_PORT);

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
