/**
 * Aiken version handling.
 *
 * Aiken reports its version with build metadata (e.g. "v1.1.21+42babe5" in
 * plutus.json preambles and on-chain verification metadata), but GitHub
 * releases — what aikup installs and what the version dropdown shows — are
 * tagged without it (e.g. "v1.1.21").
 */

const RELEASE_TAG_PATTERN = /^v?\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?$/;

/**
 * Convert a compiler version to an installable release tag by stripping
 * build metadata ("+<hash>") and validating the shape.
 * Returns null when the input can't be a release tag.
 */
export function toAikenReleaseTag(version: string): string | null {
  let tag = version.trim();
  const buildMetaIdx = tag.indexOf('+');
  if (buildMetaIdx >= 0) {
    tag = tag.slice(0, buildMetaIdx);
  }
  if (!RELEASE_TAG_PATTERN.test(tag)) {
    return null;
  }
  return tag.startsWith('v') ? tag : `v${tag}`;
}

/**
 * Offline fallback for the version dropdown, used only when the GitHub
 * releases API is unreachable.
 *
 * Every entry MUST be a real aiken-lang/aiken *release* tag: aikup installs
 * from release assets, so an entry with no published release (or a wrong tag
 * spelling) offers a build that fails at `aikup install`. `v1.0.29` was such
 * an entry — the released tag is `v1.0.29-alpha`.
 *
 * This list cannot be verified offline: the shape regex accepts spellings that
 * do not exist upstream, so only a live check against the releases API can
 * confirm it. Re-check it if you edit it.
 */
export const FALLBACK_AIKEN_VERSIONS = [
  'v1.1.22',
  'v1.1.21',
  'v1.1.19',
  'v1.1.17',
  'v1.1.0',
  'v1.0.29-alpha',
] as const;

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/aiken-lang/aiken/releases';

/**
 * Fetch every aiken release tag, following pagination.
 *
 * A single `per_page` request silently truncates once upstream passes that
 * many releases, and it drops the OLDEST first — precisely the versions a
 * verification service needs, since old contracts were built with old
 * compilers. Page until a short page comes back.
 *
 * `fetchImpl` and `perPage` are injectable so the pagination path can be
 * tested with a forced small page size; the defect is latent at today's
 * release count and would otherwise be unobservable.
 */
export async function fetchAikenReleaseTags(
  fetchImpl: typeof fetch = fetch,
  perPage = 100,
  maxPages = 20
): Promise<string[]> {
  const tags: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchImpl(
      `${GITHUB_RELEASES_URL}?per_page=${perPage}&page=${page}`
    );
    if (!response.ok) {
      throw new Error(`GitHub releases API returned ${response.status}`);
    }
    const releases = await response.json();
    if (!Array.isArray(releases)) {
      throw new Error('GitHub releases API returned a non-array payload');
    }
    for (const release of releases) {
      const tag = release?.tag_name;
      if (typeof tag === 'string' && tag.startsWith('v')) {
        tags.push(tag);
      }
    }
    // A short page is the last page.
    if (releases.length < perPage) {
      break;
    }
  }
  return tags;
}
