// Real (unmocked) verify run at 360px — persisted from the T-302
// development-session harness (t302-real-verify.mjs).
//
// SLOW (~6 minutes), network-dependent: no API mocks — this hits the live
// /api/verify route, which does a real git clone + aikup + aiken build.
// NOT part of the fast suite (mobile-sweep.mjs / registry-check.mjs) —
// run it separately and expect it to take several minutes.
//
// Prereqs: same server as mobile-sweep.mjs (see README) — build + start the
// frontend, then point this script at it via E2E_BASE_URL / E2E_PORT.
// Run: node real-verify.mjs
// Exits 0 iff the overflow/copy-button assertions pass after a real verify.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(__dirname, 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3461}`;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/verify`, { waitUntil: 'networkidle' });

  const byLabel = t => page.locator(`xpath=//label[contains(., "${t}")]/following::input[1]`).first();
  await byLabel('Repository').fill('https://github.com/easy1staking-com/cardano-recurring-payment');
  await byLabel('Commit').fill('35f1a0d51c8663782ab052f869d5c82b756e8615');
  await page.waitForFunction(() => document.querySelector('select')?.options.length > 2, { timeout: 20000 });
  await page.selectOption('select', 'v1.1.3');
  await page.fill('textarea', 'd91724ab5029cf78ec8ba07d0eb1a8447e0fe1b7c9e60e0e2d1f0b1c');
  await page.click('button:has-text("Verify")');

  const found = await page.waitForSelector('text=Configure Validator Parameters', { timeout: 360000 })
    .then(() => true)
    .catch((e) => { console.log('real-verify: timed out waiting for results —', e.message); return false; });
  check('real-verify: results rendered within 360s', found);

  if (found) {
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => (d.open = true)));
    await page.waitForTimeout(300);

    const { widths, elementOffenders, textOffenders } = await page.evaluate(overflowProbe);
    const ok = widths.sw === widths.cw && elementOffenders.length === 0 && textOffenders.length === 0;
    check('real-verify: no horizontal overflow at 360px', ok,
      ok ? '' : `widths=${JSON.stringify(widths)}\n  ${[...elementOffenders, ...textOffenders].join('\n  ')}`);

    const copyBtn = page.locator('button[aria-label="Copy hash"]').first();
    check('real-verify: copy button visible', await copyBtn.isVisible().catch(() => false));
  }

  await page.screenshot({ path: path.join(ARTIFACTS, 'real-verify-360.png'), fullPage: true });
} finally {
  await browser.close();
}

console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
