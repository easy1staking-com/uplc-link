// Mobile QA sweep — persisted harness (T-207/T-208), folded from the
// T-301/T-302/T-303/T-304 development-session harnesses.
//
// Proves zero horizontal overflow at 360/390/768/1024px across every route +
// key interaction state, plus the T-301 responsive-chrome assertions
// (hamburger/drawer/footer grid), the T-302 verify-page assertions (ribbon
// absence, hash break-all + copy button, input width), and the T-303
// registry assertions (pill/button single-line, input width).
//
// Prereqs:
//   ss -ltnp | grep :3461          (kill any stale PID first — see README)
//   cd src/frontend && npm run build
//   cd src/frontend && PORT=3461 npm start   (leave running)
//
// Then, from this directory:
//   node mobile-sweep.mjs 2>&1 | tee artifacts/mobile-sweep.log
//
// Target server: E2E_BASE_URL env var if set, else
// http://localhost:${E2E_PORT || 3461}.
//
// Exits 0 iff all checks pass. Writes artifacts/mobile-sweep-summary.json
// (per width x state pass/fail + offender list) and
// artifacts/<route>-<width>[-<state>].png screenshots.
//
// Self-test mode (proves the fixed/sticky guard actually fires — see README):
//   E2E_SELF_TEST_FIXED=1 node mobile-sweep.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const ARTIFACTS = path.join(__dirname, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3461}`;

const WIDTHS = [
  { w: 360, h: 740 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
];

// ---- fixtures ----
const crp = readFileSync(path.join(FIXTURES, 'crp-response.json'), 'utf8');
const crpObj = JSON.parse(crp);
const sundae = readFileSync(path.join(FIXTURES, 'sundae-response.json'), 'utf8');
const statsFixture = readFileSync(path.join(FIXTURES, 'stats.json'), 'utf8');
const searchEnvFixture = readFileSync(path.join(FIXTURES, 'search-env.json'), 'utf8');
const byHashFixture = readFileSync(path.join(FIXTURES, 'byhash.json'), 'utf8');
const BYHASH_HASH = 'c5a1debe56333bcbc5cfe66a7ae0026cbb262b5900e81408d7660e06';

const releases = JSON.stringify([{ tag_name: 'v1.1.3' }, { tag_name: 'v1.0.26-alpha' }]);

const TX_HASH = 'a'.repeat(64);
const byTxHashDto = JSON.stringify({
  txHash: TX_HASH,
  sourceUrl: 'https://github.com/easy1staking-com/cardano-recurring-payment',
  commitHash: '35f1a0d51c8663782ab052f869d5c82b756e8615',
  sourcePath: null, compilerType: 'aiken', compilerVersion: 'v1.1.3', env: null,
  status: 'VERIFIED', errorMessage: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  scripts: crpObj.results.map(r => ({
    scriptName: r.validator, moduleName: r.validatorModule, validatorName: r.validatorName,
    purpose: r.purposes[0] || 'spend', rawHash: r.hash,
    finalHash: null, plutusVersion: r.plutusVersion || 'v3',
    parameterizationStatus: r.parameters?.length ? 'COMPLETE' : 'NONE_REQUIRED',
    requiredParameters: r.parameters || null,
    providedParameters: r.parameters?.length ? r.parameters.map(() => '581c' + 'ab'.repeat(28)) : null,
  })),
});

// ---- bookkeeping ----
let totalChecks = 0;
let totalPassed = 0;
const failures = [];
const summary = {}; // key `${width}::${state}` -> { pass, offenders }

const check = (name, ok, detail = '') => {
  totalChecks++;
  if (ok) totalPassed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push({ name, detail });
  return ok;
};

// Element-rect AND text-node overflow probe, excluding descendants of
// overflow-x-auto containers (deliberately-scrolling <pre>/build-log blocks).
const overflowProbe = () => {
  const inOverflowContainer = (el) => {
    let cur = el;
    while (cur) {
      if (cur.classList && cur.classList.contains('overflow-x-auto')) return true;
      cur = cur.parentElement;
    }
    return false;
  };
  const widths = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  const elementOffenders = [...document.querySelectorAll('body *')]
    .filter(el => !inOverflowContainer(el))
    .filter(el => el.getBoundingClientRect().right > window.innerWidth + 0.5)
    .slice(0, 30)
    .map(el => `${el.tagName}.${String(el.className).slice(0, 70)} right=${Math.round(el.getBoundingClientRect().right)} text=${(el.textContent || '').slice(0, 40).replace(/\n/g, ' ')}`);
  const textOffenders = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    if (inOverflowContainer(n.parentElement)) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    const rect = r.getBoundingClientRect();
    if (rect.right > window.innerWidth + 0.5) {
      textOffenders.push(`right=${Math.round(rect.right)} <${n.parentElement.tagName}.${String(n.parentElement.className).slice(0, 60)}> "${n.textContent.slice(0, 50).replace(/\n/g, ' ')}"`);
    }
  }
  return { widths, elementOffenders, textOffenders };
};

const assertNoOverflow = async (page, label, width, stateKey) => {
  const { widths, elementOffenders, textOffenders } = await page.evaluate(overflowProbe);
  const ok = widths.sw === widths.cw && elementOffenders.length === 0 && textOffenders.length === 0;
  const offenders = [...elementOffenders, ...textOffenders];
  check(`${label}: no horizontal overflow at ${width}px`, ok,
    ok ? '' : `widths=${JSON.stringify(widths)} elOffenders=${elementOffenders.length} textOffenders=${textOffenders.length}\n  ${offenders.join('\n  ')}`);
  summary[`${width}::${stateKey}`] = { pass: ok, offenders, scrollWidth: widths.sw, clientWidth: widths.cw };
  return ok;
};

// Fixed/sticky offender predicate, exactly as specified for T-207: computed
// position fixed|sticky AND display !== 'none' AND visibility !== 'hidden'
// AND parseFloat(opacity) > 0 AND rect.width > 0 && rect.height > 0 AND rect
// intersects the viewport. No `offsetParent` check — offsetParent is always
// null for position:fixed elements, so that conjunct could never fire (the
// bug this harness replaces).
const getFixedStickyOffenders = (page) => page.evaluate(() =>
  [...document.querySelectorAll('body *')].filter(el => {
    const style = getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'sticky') return false;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (!(parseFloat(style.opacity) > 0)) return false;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    if (!(rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight)) return false;
    return true;
  }).map(el => `${el.tagName}#${el.id || ''}.${String(el.className).slice(0, 60)}`));

// The corner ribbon was removed product-wide 2026-08-13 (T-204) — no
// fixed/sticky element should be visible at ANY width now, except (at <768,
// drawer-open state) the drawer overlay itself, which is asserted separately
// in that state's own check. The allowRibbon exception this helper used to
// carry is gone; absence is now unconditional.
const assertNoUnexpectedFixedSticky = async (page, label, width) => {
  const offenders = await getFixedStickyOffenders(page);
  check(`${label}: no unexpected visible fixed/sticky element at ${width}px`, offenders.length === 0, offenders.join(', '));
  return offenders;
};

// Measures each matched element against its own IMMEDIATE container's
// content width (clientWidth minus that container's horizontal padding)
// rather than <main>'s — a page-level input can legitimately sit inside a
// nested padded card and still be "full-width" for the idiom's purposes:
// 100% of the space its own parent actually offers it, not 100% of <main>'s.
const inputWidthMetrics = async (page, selector) => page.evaluate((sel) => {
  const main = document.querySelector('main');
  return [...main.querySelectorAll(sel)].map(el => {
    const parent = el.parentElement;
    const style = getComputedStyle(parent);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const containerContentWidth = parent.clientWidth - paddingLeft - paddingRight;
    const elWidth = el.getBoundingClientRect().width;
    return { containerContentWidth, elWidth };
  });
}, selector);

const assertInputsWide = async (page, label, selector = 'input[type="text"], select, textarea') => {
  const m = await inputWidthMetrics(page, selector);
  const allWide = m.length > 0 && m.every(({ elWidth, containerContentWidth }) => elWidth >= 0.9 * containerContentWidth);
  check(`${label}: every "${selector}" >= 90% of its immediate container's content width`, allWide, JSON.stringify(m));
};

async function newPage(browser, viewport, { clipboard = false } = {}) {
  const context = await browser.newContext({
    viewport,
    permissions: clipboard ? ['clipboard-read', 'clipboard-write'] : [],
  });
  return context.newPage();
}

async function mockGithub(page) {
  await page.route('**/api.github.com/repos/aiken-lang/aiken/releases*', r =>
    r.fulfill({ contentType: 'application/json', body: releases }));
}
async function mockStats(page) {
  await page.route('**/api/registry?action=stats*', r =>
    r.fulfill({ contentType: 'application/json', body: statsFixture }));
}
async function mockSearchEnv(page) {
  await page.route('**/api/registry?action=search*', r =>
    r.fulfill({ contentType: 'application/json', body: searchEnvFixture }));
}
async function mockByHash(page, { status = 200 } = {}) {
  await page.route('**/api/registry?action=byHash*', r =>
    status === 200
      ? r.fulfill({ contentType: 'application/json', body: byHashFixture })
      : r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal error' }) }));
}

const HAMBURGER = 'header button[aria-label*="menu" i], header button[aria-label*="navigation" i]';

// ============================================================
// Self-test mode: proves the fixed/sticky guard actually fires on a real
// offender, rather than always passing vacuously (the bug the offsetParent
// conjunct caused). Standalone — does not run the full sweep.
// ============================================================
async function runSelfTest() {
  const browser = await chromium.launch();
  const page = await newPage(browser, { width: 360, height: 740 });
  await mockStats(page);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  let ok = true;
  const step = (name, cond, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} self-test: ${name}${detail ? ' — ' + detail : ''}`);
    if (!cond) ok = false;
  };

  // (a) guard passes clean on the unmodified page.
  const clean = await getFixedStickyOffenders(page);
  step('(a) guard reports no offenders before injection', clean.length === 0, JSON.stringify(clean));

  // (b) inject a visible 120x40 position:fixed div at top-left; guard MUST
  // report exactly that offender.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__e2e_fixed_probe';
    Object.assign(d.style, {
      position: 'fixed', top: '0px', left: '0px',
      width: '120px', height: '40px', background: 'red', opacity: '1',
    });
    document.body.appendChild(d);
  });
  const injected = await getFixedStickyOffenders(page);
  step('(b) guard reports exactly the injected offender', injected.length === 1 && injected[0].includes('__e2e_fixed_probe'), JSON.stringify(injected));

  // (c) remove it; guard MUST pass again.
  await page.evaluate(() => document.getElementById('__e2e_fixed_probe')?.remove());
  const removed = await getFixedStickyOffenders(page);
  step('(c) guard passes again after removal', removed.length === 0, JSON.stringify(removed));

  await browser.close();
  console.log(ok ? 'SELF-TEST PASSED' : 'SELF-TEST FAILED');
  process.exit(ok ? 0 : 1);
}

if (process.env.E2E_SELF_TEST_FIXED === '1') {
  await runSelfTest();
}

// ============================================================
// Full sweep
// ============================================================
const browser = await chromium.launch();

for (const { w, h } of WIDTHS) {
  const isMobile = w < 768;

  // ============================================================
  // 1. "/" first paint (stats mocked) + T-301 responsive-chrome assertions
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h });
    await mockStats(p);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => {
      const el = document.querySelector('.text-blue-400');
      return el && el.textContent.trim() !== '--';
    }, { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(200);

    await assertNoOverflow(p, `Home first-paint`, w, 'home-first-paint');
    await assertNoUnexpectedFixedSticky(p, `Home first-paint`, w);

    // T-301: hamburger / inline nav / footer grid, folded in.
    const hamburger = p.locator(HAMBURGER).first();
    if (isMobile) {
      check(`Home first-paint ${w}px: hamburger visible`, await hamburger.isVisible().catch(() => false));
      check(`Home first-paint ${w}px: inline nav links hidden`,
        !(await p.locator('header nav >> text=Verify').first().isVisible().catch(() => false)));
    } else {
      check(`Home first-paint ${w}px: hamburger hidden`, !(await hamburger.isVisible().catch(() => false)));
      check(`Home first-paint ${w}px: inline nav visible`,
        await p.locator('header nav >> text=Verify').first().isVisible().catch(() => false));
    }
    const footerCols = await p.evaluate(() => {
      const grid = document.querySelector('footer .grid');
      return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : -1;
    });
    const expectedCols = isMobile ? 1 : 3;
    check(`Home first-paint ${w}px: footer grid is ${expectedCols} column(s)`, footerCols === expectedCols, `cols=${footerCols}`);

    await p.screenshot({ path: path.join(ARTIFACTS, `home-${w}.png`), fullPage: true });
    await p.close();
  }

  // ============================================================
  // 2. "/" mobile drawer OPEN (only <768) + T-301 drawer assertions
  // ============================================================
  if (isMobile) {
    const p = await newPage(browser, { width: w, height: h });
    await mockStats(p);
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(200);

    const hamburger = p.locator(HAMBURGER).first();
    const hasHamburger = await hamburger.count();
    check(`Home drawer-open ${w}px: hamburger present`, !!hasHamburger);
    if (hasHamburger) {
      await hamburger.click();
      await p.waitForTimeout(300);
      await assertNoOverflow(p, `Home drawer-open`, w, 'home-drawer-open');
      // Drawer overlay itself is expected to be fixed/sticky at this width —
      // the body-wide guard stays exempt for this state; T-301's narrower
      // header/footer-subtree check runs instead, below.

      for (const label of ['Verify', 'Registry', 'Docs']) {
        check(`Home drawer-open ${w}px: drawer shows ${label} link`,
          await p.locator(`header a:has-text("${label}")`).last().isVisible().catch(() => false));
      }
      const stickyOpen = await p.evaluate(() =>
        [...document.querySelectorAll('header, header *, footer, footer *')].filter((el) => {
          const pos = getComputedStyle(el).position;
          return pos === 'fixed' || pos === 'sticky';
        }).length);
      check(`Home drawer-open ${w}px: no fixed/sticky in header/footer with drawer open`, stickyOpen === 0, `count=${stickyOpen}`);

      await p.screenshot({ path: path.join(ARTIFACTS, `home-drawer-open-${w}.png`), fullPage: true });

      await hamburger.click();
      await p.waitForTimeout(300);
      check(`Home drawer-open ${w}px: drawer closes on second click`,
        !(await p.locator('header a:has-text("Registry")').last().isVisible().catch(() => false)));

      await hamburger.click();
      await p.waitForTimeout(300);
      await p.locator('header a:has-text("Verify")').last().click();
      await p.waitForURL('**/verify', { timeout: 15000 });
      await p.waitForTimeout(300);
      check(`Home drawer-open ${w}px: drawer closed after navigating via drawer link`,
        !(await p.locator('header a:has-text("Registry")').last().isVisible().catch(() => false)));
    }
    await p.close();
  }

  // ============================================================
  // 3. "/verify" initial form + T-302 ribbon/input-width assertions
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h });
    await mockGithub(p);
    await p.goto(`${BASE}/verify`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(200);

    await assertNoOverflow(p, `Verify initial`, w, 'verify-initial');
    await assertNoUnexpectedFixedSticky(p, `Verify initial`, w);

    // The removed corner ribbon (T-204, commit 109d7cf) shared its href with
    // the footer's always-present "View on GitHub" link, so an href-only
    // selector now always matches the (legitimate) footer link instead.
    // Scope out <footer> so this asserts ribbon-specifically, not "no GitHub
    // link anywhere on the page".
    const ribbonVisible = await p.evaluate(() =>
      [...document.querySelectorAll('a[href="https://github.com/easy1staking-com/plutus-scan"]')]
        .filter(el => !el.closest('footer'))
        .some(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        }));
    check(`Verify initial ${w}px: ribbon anchor not visible (excluding footer GitHub link)`, !ribbonVisible);

    if (isMobile) {
      // t303 immediate-container variant (NOT t302's <main>-relative one).
      await assertInputsWide(p, `Verify initial ${w}px`, 'input[type="text"], select, textarea');
    }

    await p.screenshot({ path: path.join(ARTIFACTS, `verify-initial-${w}.png`), fullPage: true });
    await p.close();
  }

  // ============================================================
  // 4. "/verify?txHash=..." deep-link, results expanded + T-302 hash/copy
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h }, { clipboard: true });
    await mockGithub(p);
    await p.route('**/api/registry?action=byTxHash*', r =>
      r.fulfill({ contentType: 'application/json', body: byTxHashDto }));
    await p.route('**/api/verify', r =>
      r.fulfill({ contentType: 'application/json', body: crp }));

    await p.goto(`${BASE}/verify?txHash=${TX_HASH}`, { waitUntil: 'networkidle' });
    const found = await p.waitForSelector('text=Configure Validator Parameters', { timeout: 20000 })
      .then(() => true).catch(() => false);
    check(`Verify deep-link ${w}px: results rendered`, found);

    await p.waitForFunction(() => document.querySelectorAll('span.text-green-400').length >= 2, { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
    await p.waitForTimeout(300);

    await assertNoOverflow(p, `Verify deep-link expanded`, w, 'verify-deeplink-expanded');
    await assertNoUnexpectedFixedSticky(p, `Verify deep-link expanded`, w);

    const cardInfo = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('main .space-y-2 > div')].filter(div =>
        div.textContent.includes('Actual:'));
      return cards.map(card => {
        const actualLine = [...card.querySelectorAll('div')].find(d => d.textContent.trim().startsWith('Actual:'));
        const span = actualLine ? [...actualLine.querySelectorAll('span')].find(s => /^[0-9a-f]{20,}$/i.test(s.textContent.trim())) : null;
        const btn = card.querySelector('button[aria-label="Copy hash"]');
        return {
          hasCard: !!actualLine,
          hashText: span ? span.textContent.trim() : null,
          breakAll: span ? getComputedStyle(span).wordBreak === 'break-all' : false,
          hasCopyButton: !!btn,
          copyButtonVisible: btn ? (btn.offsetParent !== null) : false,
        };
      });
    });
    check(`Verify deep-link ${w}px: at least one result card found`, cardInfo.length > 0, `count=${cardInfo.length}`);

    if (isMobile) {
      const allBreakAll = cardInfo.length > 0 && cardInfo.every(c => c.breakAll);
      check(`Verify deep-link ${w}px: every result card Actual hash has break-all in effect`, allBreakAll, JSON.stringify(cardInfo));
      const allCopyVisible = cardInfo.length > 0 && cardInfo.every(c => c.hasCopyButton && c.copyButtonVisible);
      check(`Verify deep-link ${w}px: every result card has a visible copy button`, allCopyVisible, JSON.stringify(cardInfo));
      const fullHashes = cardInfo.length > 0 && cardInfo.every(c => c.hashText && c.hashText.length === 56);
      check(`Verify deep-link ${w}px: Actual hash text is the full 56-char hash (untruncated)`, fullHashes, JSON.stringify(cardInfo.map(c => c.hashText)));

      if (cardInfo.length > 0 && cardInfo[0].hasCopyButton) {
        const firstBtn = p.locator('button[aria-label="Copy hash"]').first();
        await firstBtn.click();
        await p.waitForTimeout(200);
        const clipboardText = await p.evaluate(() => navigator.clipboard.readText()).catch(() => null);
        check(`Verify deep-link ${w}px: clicking copy button puts the exact 56-char hash on the clipboard`,
          clipboardText === cardInfo[0].hashText, `clipboard=${clipboardText} expected=${cardInfo[0].hashText}`);
      } else {
        check(`Verify deep-link ${w}px: clicking copy button puts the exact 56-char hash on the clipboard`, false, 'no copy button found to click');
      }
    } else {
      const copyVisible = await p.locator('button[aria-label="Copy hash"]').first().isVisible().catch(() => false);
      check(`Verify deep-link ${w}px: copy button NOT visible`, !copyVisible);
    }

    await p.screenshot({ path: path.join(ARTIFACTS, `verify-deeplink-${w}.png`), fullPage: true });
    await p.close();
  }

  // ============================================================
  // 5. "/verify" deep-link error state (byTxHash -> 500)
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h });
    await mockGithub(p);
    await p.route('**/api/registry?action=byTxHash*', r =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'internal error' }) }));

    await p.goto(`${BASE}/verify?txHash=${TX_HASH}`, { waitUntil: 'networkidle' });
    const errorVisible = await p.locator('text=Failed to load verification data').first().isVisible().catch(() => false);
    check(`Verify deep-link error ${w}px: error view renders`, errorVisible);

    await assertNoOverflow(p, `Verify deep-link error`, w, 'verify-deeplink-error');
    await assertNoUnexpectedFixedSticky(p, `Verify deep-link error`, w);

    await p.screenshot({ path: path.join(ARTIFACTS, `verify-error-${w}.png`), fullPage: true });
    await p.close();
  }

  // ============================================================
  // 6. "/verify" manual sundae flow — only at 360 and 768
  // ============================================================
  if (w === 360 || w === 768) {
    const p = await newPage(browser, { width: w, height: h });
    await mockGithub(p);
    await p.route('**/api/verify', r => r.fulfill({ contentType: 'application/json', body: sundae }));

    await p.goto(`${BASE}/verify`, { waitUntil: 'networkidle' });
    const byLabel = t => p.locator(`xpath=//label[contains(., "${t}")]/following::input[1]`).first();
    await byLabel('Repository').fill('https://github.com/SundaeSwap-finance/sundae-contracts');
    await byLabel('Commit').fill('edc118880d3baffcb7d5bd277faec2e7dc54c59b');
    await p.selectOption('select', 'v1.0.26-alpha');
    await p.fill('textarea', 'fdf6390e10925e2d3730af90b67c463677a8c357453472dd2da342e5');
    await p.click('button:has-text("Verify")');
    const found = await p.waitForSelector('text=Configure Validator Parameters', { timeout: 20000 })
      .then(() => true).catch(() => false);
    check(`Verify sundae flow ${w}px: results rendered`, found);
    await p.waitForTimeout(500);

    const countParamInputs = async () => {
      const section = p.locator('div:has(> h3:has-text("Configure Validator Parameters"))').first();
      const groups = await section.locator('div.border.border-zinc-700.rounded.p-4').count();
      const inputs = await section.locator('input[type="text"], select, input[type="checkbox"]').count();
      return { groups, inputs };
    };
    const counts = await countParamInputs();
    check(`Verify sundae flow ${w}px: param section shows 7 groups / 17 inputs`, counts.groups === 7 && counts.inputs === 17, JSON.stringify(counts));

    // step 1: initial results render
    await assertNoOverflow(p, `Verify sundae step1 (initial)`, w, 'verify-sundae-step1');
    await p.screenshot({ path: path.join(ARTIFACTS, `verify-sundae-${w}.png`), fullPage: true });

    // step 2: toggle first param to CBOR
    const cborBtn = p.locator('button:has-text("CBOR")').first();
    if (await cborBtn.count()) { await cborBtn.click(); await p.waitForTimeout(300); }
    const ta = p.locator('main textarea').nth(1);
    if (await ta.count()) {
      await ta.fill('d8799f581c' + 'ab'.repeat(28) + 'ff');
      await p.waitForTimeout(400);
    }
    await assertNoOverflow(p, `Verify sundae step2 (CBOR toggle)`, w, 'verify-sundae-step2');

    // step 3: check every "Use validator hash reference" checkbox
    const refBoxes = p.locator('main label:has-text("Use validator hash reference") input[type="checkbox"]');
    const nRef = await refBoxes.count();
    for (let i = 0; i < nRef; i++) {
      await refBoxes.nth(i).check().catch(() => {});
    }
    await p.waitForTimeout(400);
    await assertNoOverflow(p, `Verify sundae step3 (all ref checkboxes)`, w, 'verify-sundae-step3');

    // step 4: expand all details
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
    await p.waitForTimeout(300);
    await assertNoOverflow(p, `Verify sundae step4 (all details expanded)`, w, 'verify-sundae-step4');
    await p.screenshot({ path: path.join(ARTIFACTS, `verify-sundae-expanded-${w}.png`), fullPage: true });

    await p.close();
  }

  // ============================================================
  // 7. "/registry" empty state
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h });
    await p.goto(`${BASE}/registry`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(200);
    await assertNoOverflow(p, `Registry empty`, w, 'registry-empty');
    await assertNoUnexpectedFixedSticky(p, `Registry empty`, w);
    await p.screenshot({ path: path.join(ARTIFACTS, `registry-empty-${w}.png`), fullPage: true });
    await p.close();
  }

  // ============================================================
  // 8. "/registry?url=sundae" (env fixture) — results, then details expanded
  //    + T-303 pill/button/input-width assertions
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h }, { clipboard: true });
    await mockSearchEnv(p);
    await p.goto(`${BASE}/registry?url=sundae`, { waitUntil: 'networkidle' });
    const found = await p.waitForSelector('text=Found', { timeout: 20000 }).then(() => true).catch(() => false);
    check(`Registry env search ${w}px: "Found" banner visible`, found);
    await p.waitForTimeout(300);

    await assertNoOverflow(p, `Registry env search`, w, 'registry-env-search');

    if (isMobile) {
      const cardInfo = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('main .space-y-4 > div')].filter(d => d.querySelector('h3'));
        return cards.map(card => {
          const h3 = card.querySelector('h3');
          const titleBlock = h3.parentElement;
          const pillsRow = [...titleBlock.querySelectorAll('div')].find(d =>
            d.className.includes('items-center') && d.className.includes('gap-2'));
          const pillHeights = pillsRow ? [...pillsRow.querySelectorAll('span')].map(s => s.getBoundingClientRect().height) : [];
          const hashGroups = [...card.querySelectorAll('div.font-mono.text-sm.break-all')];
          const buttonHeights = hashGroups.flatMap(g => [...g.querySelectorAll('button')].map(b => b.getBoundingClientRect().height));
          return { pillCount: pillHeights.length, pillHeights, buttonCount: buttonHeights.length, buttonHeights };
        });
      });
      check(`Registry env search ${w}px: at least one result card found`, cardInfo.length > 0, `count=${cardInfo.length}`);
      const allPillsSingleLine = cardInfo.length > 0 && cardInfo.every(c => c.pillCount > 0 && c.pillHeights.every(h2 => h2 < 30));
      check(`Registry env search ${w}px: every header pill span is single-line (height < 30px)`, allPillsSingleLine, JSON.stringify(cardInfo.map(c => c.pillHeights)));
      const allButtonsSingleLine = cardInfo.length > 0 && cardInfo.every(c => c.buttonCount > 0 && c.buttonHeights.every(h2 => h2 < 32));
      check(`Registry env search ${w}px: every Copy/Share hash-row button is single-line (height < 32px)`, allButtonsSingleLine, JSON.stringify(cardInfo.map(c => c.buttonHeights)));

      await assertInputsWide(p, `Registry env search ${w}px`, 'input[type="text"]');
    }

    await p.screenshot({ path: path.join(ARTIFACTS, `registry-env-${w}.png`), fullPage: true });

    await p.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
    await p.waitForTimeout(300);
    await assertNoOverflow(p, `Registry env search expanded`, w, 'registry-env-search-expanded');
    await assertNoUnexpectedFixedSticky(p, `Registry env search expanded`, w);
    await p.screenshot({ path: path.join(ARTIFACTS, `registry-env-expanded-${w}.png`), fullPage: true });

    await p.close();
  }

  // ============================================================
  // 9. "/registry?hash=..." (byhash fixture) and 500 error state
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h });
    await mockByHash(p, { status: 200 });
    await p.goto(`${BASE}/registry?hash=${BYHASH_HASH}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await assertNoOverflow(p, `Registry byHash`, w, 'registry-byhash');
    await p.screenshot({ path: path.join(ARTIFACTS, `registry-byhash-${w}.png`), fullPage: true });
    await p.close();
  }
  {
    const p = await newPage(browser, { width: w, height: h });
    await mockByHash(p, { status: 500 });
    await p.goto(`${BASE}/registry?hash=deadbeef`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    const errorVisible = await p.locator('div.bg-red-950').first().isVisible().catch(() => false);
    check(`Registry byHash error ${w}px: error box visible`, errorVisible);
    await assertNoOverflow(p, `Registry byHash error`, w, 'registry-byhash-error');
    await p.screenshot({ path: path.join(ARTIFACTS, `registry-byhash-error-${w}.png`), fullPage: true });
    await p.close();
  }

  // ============================================================
  // 10. "/docs" — details closed and open
  // ============================================================
  {
    const p = await newPage(browser, { width: w, height: h });
    await p.goto(`${BASE}/docs`, { waitUntil: 'networkidle' });
    await assertNoOverflow(p, `Docs closed`, w, 'docs-closed');
    await p.screenshot({ path: path.join(ARTIFACTS, `docs-${w}.png`), fullPage: true });

    await p.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
    await p.waitForTimeout(200);
    await assertNoOverflow(p, `Docs open`, w, 'docs-open');
    await assertNoUnexpectedFixedSticky(p, `Docs open`, w);
    await p.screenshot({ path: path.join(ARTIFACTS, `docs-expanded-${w}.png`), fullPage: true });

    await p.close();
  }
}

await browser.close();

writeFileSync(path.join(ARTIFACTS, 'mobile-sweep-summary.json'), JSON.stringify({
  totalChecks, totalPassed, totalFailed: totalChecks - totalPassed,
  failures,
  byWidthState: summary,
}, null, 2));

console.log(`\n=== MOBILE SWEEP COMPLETE: ${totalPassed}/${totalChecks} checks passed, ${failures.length} failed ===`);
process.exit(failures.length === 0 ? 0 : 1);
