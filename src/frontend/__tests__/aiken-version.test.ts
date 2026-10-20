/**
 * Aiken version list: pagination and the offline fallback.
 *
 * The pagination defect is LATENT — aiken has 48 releases and the old code
 * requested per_page=50, so nothing was truncated and nothing observable
 * changes when it is fixed. "The dropdown still shows the same versions" is
 * therefore not evidence of anything: it reads identically whether the fix
 * works or does nothing at all.
 *
 * So this drives fetchAikenReleaseTags with a FORCED SMALL PAGE SIZE against a
 * fake GitHub, which makes the truncation reproducible at any release count.
 * The single-page assertion below is the fail-first: it is exactly what the
 * old one-request implementation did, and it fails against a corpus larger
 * than one page.
 */

import * as av from '../lib/aiken-version';
import { fetchAikenReleaseTags, FALLBACK_AIKEN_VERSIONS, toAikenReleaseTag } from '../lib/aiken-version';

/** Fake releases API: paginates like GitHub, records the pages requested. */
function fakeGitHub(tags: string[], requested: number[] = []) {
  const impl = async (url: string | URL | Request): Promise<Response> => {
    const parsed = new URL(String(url));
    const perPage = Number(parsed.searchParams.get('per_page'));
    const page = Number(parsed.searchParams.get('page'));
    requested.push(page);
    const start = (page - 1) * perPage;
    const slice = tags.slice(start, start + perPage).map(t => ({ tag_name: t }));
    return {
      ok: true,
      status: 200,
      json: async () => slice,
    } as unknown as Response;
  };
  return { impl: impl as unknown as typeof fetch, requested };
}

function check(name: string, cond: boolean): boolean {
  console.log(cond ? `✅ SUCCESS: ${name}` : `❌ FAILURE: ${name}`);
  return cond;
}

async function testAikenVersions(): Promise<boolean> {
  let ok = true;

  // 130 releases, newest first — comfortably more than one page.
  const corpus = Array.from({ length: 130 }, (_, i) => `v1.1.${130 - i}`);

  // --- pagination: every release is recovered across pages ---
  const gh = fakeGitHub(corpus);
  const all = await fetchAikenReleaseTags(gh.impl, 50);
  ok = check(
    `paginates: recovered all ${corpus.length} releases (got ${all.length})`,
    all.length === corpus.length
  ) && ok;
  ok = check(
    'paginates: requested more than one page',
    gh.requested.length > 1
  ) && ok;
  ok = check(
    'paginates: the OLDEST release survives (the one truncation drops first)',
    all[all.length - 1] === corpus[corpus.length - 1]
  ) && ok;
  ok = check('paginates: order preserved', all[0] === corpus[0]) && ok;

  // --- fail-first: a single un-paginated request loses the tail ---
  const single = fakeGitHub(corpus);
  const firstPageOnly = await fetchAikenReleaseTags(single.impl, 50, 1);
  ok = check(
    `fail-first: capped at one page yields only 50 of ${corpus.length} — the old behaviour`,
    firstPageOnly.length === 50 && !firstPageOnly.includes(corpus[corpus.length - 1])
  ) && ok;

  // --- a short final page terminates paging (no spurious extra request) ---
  const exact = fakeGitHub(corpus.slice(0, 100));
  await fetchAikenReleaseTags(exact.impl, 50);
  ok = check(
    'stops paging on a short page (2 full pages + 1 empty = 3 requests)',
    exact.requested.length === 3
  ) && ok;

  // --- non-v tags are filtered out, as before ---
  const mixed = fakeGitHub(['v1.1.9', 'nightly', 'v1.1.8', 'latest']);
  const filtered = await fetchAikenReleaseTags(mixed.impl, 50);
  ok = check(
    'filters non-v tags',
    filtered.length === 2 && filtered.every(t => t.startsWith('v'))
  ) && ok;

  // --- the offline fallback list ---
  // NOTE: this only checks SHAPE. `v1.0.29` — the entry this test accompanies
  // the removal of — is shape-valid but has no upstream release, so no offline
  // test can catch that class. Verify fallback entries against the live
  // releases API when editing them.
  ok = check(
    'fallback: every entry is a well-formed release tag',
    FALLBACK_AIKEN_VERSIONS.every(v => toAikenReleaseTag(v) === v)
  ) && ok;
  ok = check(
    'fallback: no bare v1.0.29 (the released tag is v1.0.29-alpha)',
    !FALLBACK_AIKEN_VERSIONS.includes('v1.0.29' as never)
  ) && ok;
  ok = check(
    'fallback: alpha versions keep their -alpha suffix',
    FALLBACK_AIKEN_VERSIONS.filter(v => v.startsWith('v1.0.')).every(v => v.endsWith('-alpha'))
  ) && ok;
  ok = check(
    'fallback: newest entry (the offline default selection) is v1.1.24',
    FALLBACK_AIKEN_VERSIONS[0] === 'v1.1.24'
  ) && ok;
  ok = check(
    'fallback: includes v1.1.23',
    FALLBACK_AIKEN_VERSIONS.includes('v1.1.23')
  ) && ok;
  // v1.1.18 and v1.1.20 are tags with no GitHub release: their release
  // download 404s (PLAN.md T-211).
  ok = check(
    'fallback: no tag-only v1.1.18 or v1.1.20',
    !FALLBACK_AIKEN_VERSIONS.includes('v1.1.18' as never) &&
      !FALLBACK_AIKEN_VERSIONS.includes('v1.1.20' as never)
  ) && ok;

  return ok;
}

/** Run one new check; a thrown error is a FAILURE line, not an abort. */
async function guarded(name: string, fn: () => unknown | Promise<unknown>): Promise<boolean> {
  try {
    return check(name, Boolean(await fn()));
  } catch (e) {
    console.log(`❌ FAILURE: ${name} (threw: ${e instanceof Error ? e.message : String(e)})`);
    return false;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const NOT_IN_LIST = (t: string) =>
  `${t} is not in GitHub's release list; verification will fail if it has no published release.`;
const REJECTION = (x: string) =>
  `Not an Aiken release tag: "${x}". Expected a tag like v1.1.21 or v1.0.29-alpha.`;
const FALLBACK_NOTICE =
  'Could not load the release list from GitHub, so the suggestions are a short offline list. You can type any Aiken release tag.';

// The new API is read off the namespace so an unmodified lib yields undefined
// (a FAILURE per check) instead of a compile-time abort.
const lib = av as unknown as {
  loadAikenVersionSuggestions: (f?: typeof fetch) => Promise<{ versions: string[]; source: string; error?: unknown }>;
  describeAikenVersionInput: (
    i: string,
    s: readonly string[],
    src: 'github' | 'fallback' | null
  ) => { tag: string | null; error: string | null; notices: string[] };
  aikenVersionListNotice: (src: 'github' | 'fallback' | null) => string | null;
};
const describe = (i: string, s: readonly string[] = [], src: 'github' | 'fallback' | null = null) =>
  lib.describeAikenVersionInput(i, s, src);

async function testTypedAikenVersion(): Promise<boolean> {
  let ok = true;

  // --- suggestion source ---
  const netErr = new TypeError('Failed to fetch');
  const rejecting = (async () => {
    throw netErr;
  }) as unknown as typeof fetch;
  ok = (await guarded('unreachable API: fallback source, FALLBACK list, the TypeError', async () => {
    const r = await lib.loadAikenVersionSuggestions(rejecting);
    return r.source === 'fallback' && same(r.versions, FALLBACK_AIKEN_VERSIONS) && r.error === netErr;
  })) && ok;
  const rateLimited = (async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;
  ok = (await guarded('rate-limited API (403): resolves to the fallback', async () => {
    const r = await lib.loadAikenVersionSuggestions(rateLimited);
    return r.source === 'fallback' && same(r.versions, FALLBACK_AIKEN_VERSIONS) && r.error instanceof Error;
  })) && ok;
  const nonArray = (async () => ({ ok: true, status: 200, json: async () => ({ message: 'x' }) })) as unknown as typeof fetch;
  ok = (await guarded('non-array JSON body: resolves to the fallback', async () => {
    const r = await lib.loadAikenVersionSuggestions(nonArray);
    return r.source === 'fallback' && same(r.versions, FALLBACK_AIKEN_VERSIONS) && r.error instanceof Error;
  })) && ok;
  ok = (await guarded('reachable API: source github with exactly the fetched versions', async () => {
    const tags = ['v1.1.24', 'v1.1.15', 'v1.0.26-alpha'];
    const r = await lib.loadAikenVersionSuggestions(fakeGitHub(tags).impl);
    return r.source === 'github' && same(r.versions, tags);
  })) && ok;

  // --- acceptance pin ---
  ok = check('acceptance pin: v1.1.15 is NOT in the fallback list', !(FALLBACK_AIKEN_VERSIONS as readonly string[]).includes('v1.1.15')) && ok;
  ok = (await guarded('acceptance pin: v1.1.15 under the fallback list is accepted, no notices', () => {
    const d = describe('v1.1.15', FALLBACK_AIKEN_VERSIONS, 'fallback');
    return d.tag === 'v1.1.15' && d.error === null && d.notices.length === 0;
  })) && ok;

  // --- typed acceptance ---
  ok = (await guarded("typed: '  v1.1.21  ' -> v1.1.21, no notices", () => {
    const d = describe('  v1.1.21  ');
    return d.tag === 'v1.1.21' && d.error === null && d.notices.length === 0;
  })) && ok;
  for (const raw of ['1.1.21', 'v1.1.21+42babe5']) {
    ok = (await guarded(`typed: '${raw}' -> v1.1.21 with the Using-release-tag notice`, () => {
      const d = describe(raw);
      return d.tag === 'v1.1.21' && d.error === null && same(d.notices, ['Using release tag v1.1.21.']);
    })) && ok;
  }
  ok = (await guarded("typed: 'v1.0.29-alpha' -> itself", () => describe('v1.0.29-alpha').tag === 'v1.0.29-alpha' && describe('v1.0.29-alpha').notices.length === 0)) && ok;
  ok = (await guarded('deep-link shape: toAikenReleaseTag(v1.1.21+42babe5) -> v1.1.21, no notices', () => {
    const d = describe(toAikenReleaseTag('v1.1.21+42babe5')!);
    return d.tag === 'v1.1.21' && d.notices.length === 0;
  })) && ok;

  // --- typed rejection ---
  for (const raw of ['', '   ']) {
    ok = (await guarded(`blank '${raw}': no tag, no error, no notices`, () => {
      const d = describe(raw);
      return d.tag === null && d.error === null && d.notices.length === 0;
    })) && ok;
  }
  const rejected = ['latest', 'v1.1', '1.1.x', '--help', 'v1.1.21/../x', 'v1.1.21 v1.1.22', 'v1.1.21;rm -rf /'];
  for (const raw of rejected) {
    ok = (await guarded(`rejects '${raw}' with the exact message`, () => {
      const d = describe(raw);
      return d.tag === null && d.error === REJECTION(raw.trim()) && d.notices.length === 0;
    })) && ok;
  }

  // --- no drift from the server guard ---
  const drift = [...rejected, '  v1.1.21  ', '1.1.21', 'v1.1.21+42babe5', 'v1.0.29-alpha'];
  for (const raw of drift) {
    ok = (await guarded(`no drift: '${raw}' tag equals toAikenReleaseTag`, () => describe(raw).tag === toAikenReleaseTag(raw))) && ok;
  }

  // --- GitHub-list note ---
  const listed = ['v1.1.24', 'v1.1.21'];
  ok = (await guarded("github source, 'v1.1.99' not listed: canonical tag plus the exact note", () => {
    const d = describe('v1.1.99', listed, 'github');
    return d.tag === 'v1.1.99' && d.notices.includes(NOT_IN_LIST('v1.1.99'));
  })) && ok;
  for (const src of ['fallback', null] as const) {
    ok = (await guarded(`source ${src}: no not-in-list note (absence)`, () =>
      !describe('v1.1.99', listed, src).notices.some(n => n.includes("not in GitHub's release list")))) && ok;
  }
  ok = (await guarded("github source, 'v1.1.21' listed: no notices", () => describe('v1.1.21', listed, 'github').notices.length === 0)) && ok;

  // --- list notice ---
  ok = (await guarded('list notice: exact text for fallback', () => lib.aikenVersionListNotice('fallback') === FALLBACK_NOTICE)) && ok;
  ok = (await guarded('list notice: null for github and for null', () => lib.aikenVersionListNotice('github') === null && lib.aikenVersionListNotice(null) === null)) && ok;

  return ok;
}

if (require.main === module) {
  (async () => {
    const a = await testAikenVersions();
    const b = await testTypedAikenVersion();
    process.exit(a && b ? 0 : 1);
  })();
}

export { testAikenVersions, testTypedAikenVersion };
