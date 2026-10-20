/**
 * Registry submit readiness: the request a verification ran with, and whether
 * the form still matches it.
 *
 * The verify page snapshots the /api/verify request when `Verify Contract` is
 * clicked; a registry submission anchors that snapshot on chain. These checks
 * pin the projection of the form onto the request (value-identical to the
 * body the page posted before the snapshot existed) and the one output per
 * state of `registrySubmitReadiness`: no snapshot, an unchanged form, and each
 * field changed after verifying.
 */

import {
  toVerifyInputs,
  registrySubmitReadiness,
  type VerifyFormFields,
  type VerifyInputField,
} from '../lib/verify-inputs';

function check(name: string, cond: boolean): boolean {
  console.log(cond ? `✅ SUCCESS: ${name}` : `❌ FAILURE: ${name}`);
  return cond;
}

/** Run one check; a thrown error is a FAILURE line, not an abort. */
function guarded(name: string, fn: () => unknown): boolean {
  try {
    return check(name, Boolean(fn()));
  } catch (e) {
    console.log(`❌ FAILURE: ${name} (threw: ${e instanceof Error ? e.message : String(e)})`);
    return false;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const BASE: VerifyFormFields = {
  repoUrl: 'https://github.com/o/r',
  commitHash: 'a'.repeat(40),
  aikenTag: 'v1.1.24',
  sourcePath: '',
  env: '',
};
const TAIL = '. Verify again to submit to the registry, or restore the verified values.';

const LABELS: Record<VerifyInputField, string> = {
  repoUrl: 'GitHub Repository URL',
  commitHash: 'Commit Hash',
  aikenVersion: 'Aiken Version',
  sourcePath: 'Source Path',
  env: 'Environment',
};

function testVerifyInputs(): boolean {
  let ok = true;
  const verified = toVerifyInputs(BASE);

  // --- projection: the request body the page posted before this module ---
  ok = guarded('projection: blank path and whitespace env are omitted', () =>
    JSON.stringify(toVerifyInputs({ ...BASE, env: '  ' })) ===
    JSON.stringify({ repoUrl: 'https://github.com/o/r', commitHash: 'a'.repeat(40), aikenVersion: 'v1.1.24' })
  ) && ok;
  ok = guarded('projection: path kept verbatim, env trimmed, key order repo/commit/version/path/env', () =>
    JSON.stringify(toVerifyInputs({ ...BASE, sourcePath: 'contracts/x', env: ' preview ' })) ===
    JSON.stringify({
      repoUrl: 'https://github.com/o/r',
      commitHash: 'a'.repeat(40),
      aikenVersion: 'v1.1.24',
      sourcePath: 'contracts/x',
      env: 'preview',
    })
  ) && ok;
  ok = guarded("projection: a null tag gives aikenVersion ''", () =>
    toVerifyInputs({ ...BASE, aikenTag: null }).aikenVersion === ''
  ) && ok;

  // --- ready: the snapshot itself, never the current form ---
  ok = guarded('ready: unchanged form is ready and hands over the verified object itself', () => {
    const r = registrySubmitReadiness(verified, toVerifyInputs({ ...BASE }));
    return r.kind === 'ready' && r.inputs === verified;
  }) && ok;

  // --- stale: one field at a time ---
  const single: [VerifyInputField, Partial<VerifyFormFields>][] = [
    ['repoUrl', { repoUrl: 'https://github.com/o/r2' }],
    ['commitHash', { commitHash: 'b'.repeat(40) }],
    ['aikenVersion', { aikenTag: 'v1.1.23' }],
    ['sourcePath', { sourcePath: 'contracts/x' }],
    ['env', { env: 'preview' }],
  ];
  for (const [field, edit] of single) {
    const label = LABELS[field];
    ok = guarded(`stale: ${field} edited -> changed [${field}] and the exact notice naming only ${label}`, () => {
      const r = registrySubmitReadiness(verified, toVerifyInputs({ ...BASE, ...edit }));
      if (r.kind !== 'stale') return false;
      const others = Object.values(LABELS).filter(l => l !== label);
      return (
        same(r.changed, [field]) &&
        r.notice === `Changed since this verification: ${label}${TAIL}` &&
        others.every(l => !r.notice.includes(l))
      );
    }) && ok;
  }

  // --- stale: two fields, in field order ---
  ok = guarded('stale: commitHash and env edited -> both named, in field order', () => {
    const r = registrySubmitReadiness(verified, toVerifyInputs({ ...BASE, commitHash: 'b'.repeat(40), env: 'preview' }));
    return (
      r.kind === 'stale' &&
      same(r.changed, ['commitHash', 'env']) &&
      r.notice === `Changed since this verification: Commit Hash, Environment${TAIL}`
    );
  }) && ok;

  // --- stale: a version that no longer parses, and a whitespace path ---
  ok = guarded('stale: a null tag is a change of aikenVersion', () => {
    const r = registrySubmitReadiness(verified, toVerifyInputs({ ...BASE, aikenTag: null }));
    return r.kind === 'stale' && same(r.changed, ['aikenVersion']);
  }) && ok;
  ok = guarded("stale: sourcePath ' ' is a change (posted verbatim)", () => {
    const r = registrySubmitReadiness(verified, toVerifyInputs({ ...BASE, sourcePath: ' ' }));
    return r.kind === 'stale' && same(r.changed, ['sourcePath']);
  }) && ok;

  // --- not a change: whitespace-only env ---
  ok = guarded("not a change: env '   ' is still ready", () =>
    registrySubmitReadiness(verified, toVerifyInputs({ ...BASE, env: '   ' })).kind === 'ready'
  ) && ok;

  // --- unverified: no snapshot, no submission ---
  ok = guarded('unverified: a null snapshot is unverified', () =>
    registrySubmitReadiness(null, toVerifyInputs(BASE)).kind === 'unverified'
  ) && ok;

  return ok;
}

if (require.main === module) {
  process.exit(testVerifyInputs() ? 0 : 1);
}

export { testVerifyInputs };
