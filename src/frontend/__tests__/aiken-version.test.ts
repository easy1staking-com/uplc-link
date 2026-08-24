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

  return ok;
}

if (require.main === module) {
  testAikenVersions().then(ok => process.exit(ok ? 0 : 1));
}

export { testAikenVersions };
