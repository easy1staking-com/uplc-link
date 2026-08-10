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
