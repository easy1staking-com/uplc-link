/**
 * Aiken release assets: which archive a release tag publishes for a platform,
 * where its compiler binary lands, and how its integrity is checked.
 *
 * Pure (no I/O). The layout mirrors aikup 0.0.11 (`asset_name` and the
 * switch branch's `src_bin`), so versions preinstalled by `aikup install`
 * are found where aikup put them:
 *
 * - cargo-dist releases (core > 1.0.26): `aiken-<arch>-<os>.tar.gz`, binary at
 *   `versions/<tag>/aiken-<arch>-<os>/aiken`, checksum in the release's
 *   `<asset>.sha256` sidecar. Linux uses musl from core > 1.1.3, gnu before.
 * - legacy releases (core <= 1.0.26): `aiken_<tag>_<os>_<arch>.tar.gz`, binary
 *   at `versions/<tag>/aiken`. They publish no checksum, so only the pinned
 *   linux amd64 hashes below can be verified; anything else is unavailable.
 *
 * Only the core (major, minor, patch) decides; the pre-release suffix does
 * not. Core numbers are compared as BigInt, so a shape-valid tag with huge
 * numbers never overflows.
 */

import { toAikenReleaseTag } from "./aiken-version";

export const AIKEN_RELEASE_BASE_URL = "https://github.com/aiken-lang/aiken/releases/download";

// SHA-256 of aiken_<tag>_linux_amd64.tar.gz for every legacy release.
export const LEGACY_LINUX_X64_SHA256: Readonly<Record<string, string>> = Object.freeze({
  "v1.0.0-alpha": "35d62815086ce085ee4b9733eb68524f28391a1a94e172848d36a25981efa598",
  "v1.0.1-alpha": "7468a796d84690db08f7f2468035b644bc0c2e0089d83a83b53f4b6a2a7ce589",
  "v1.0.2-alpha": "90ee1b631a5e20e0065dca9cf8be9fbcfe969598acb17e418f0ff7fefe909b41",
  "v1.0.3-alpha": "0c9cb312d15cae1631c5dc1def456c4260b294369a03ed31dfd8d6f442b678a2",
  "v1.0.4-alpha": "8a9faea57ba89ae819b909651f0a4369552b410efb25cf68bc7e4055c3fcc71c",
  "v1.0.5-alpha": "1b646a6750d19770a0c112e5c672636c663062b13237560670cf35ff220c0d90",
  "v1.0.6-alpha": "14a6842b2d441fb285840226a370d21a0a0a0b43829c3317380eae41a3941673",
  "v1.0.7-alpha": "a4541b54c1c8f3a5994560b4ed0ef03f5f276b194e1e6cfef20cccbcd64ee514",
  "v1.0.8-alpha": "862f573a00e24a2cfd2ed1af6ecec8e9b5c1cbbd0f1da52b726ddbdee340a16d",
  "v1.0.10-alpha": "f042daaabbe0d384ebceb1e32115a81682f9e9aca08c6040731f89a387bbecfd",
  "v1.0.11-alpha": "d352e53ef2ab17a7956ded93ea73d6c5bc5adcee2b9b25ad6984cfe1e8f0a3b0",
  "v1.0.12-alpha": "7beba9a384a5adada0422ad4eac6fae4647091ad189a9c0739b75676e0991093",
  "v1.0.13-alpha": "854ea2f1d32df9df9a7b9a0ccb6eb0d654a56f6d43364809e67d1a0e2402e8e1",
  "v1.0.14-alpha": "2cd09241ef5ba282594467a4e2e2ec2c69b842f5297f29297011d53b0f0539e5",
  "v1.0.15-alpha": "29de4e3eff7f4071172e1566fe18011611f263d0c0b216710d26499b00b7a8f0",
  "v1.0.16-alpha": "b6cda7c9d75faf253408aea226a07513c139a08f13721e99355829d02408e425",
  "v1.0.17-alpha": "919b4fb418148e1a577c9eb27de6c6e0fd21c93b0a9074836828ec05df875d9f",
  "v1.0.18-alpha": "46e29fc17e4ed01f855f0d93d5fec6ab190dcab3e0c8ad367081a9b771712339",
  "v1.0.19-alpha": "53222b8a9fc805b6964089ce944dd03414b3d1e53defc4b7530d633e3eb7a88b",
  "v1.0.20-alpha": "855b37884c56ee25bc9a071c8f1fad024edb7688d203694bebd7ed48da86e997",
  "v1.0.21-alpha": "7c216b7a22c4f85637be033667e3c2cc3dbba6d6fe1f478e264cefba7571b0ca",
  "v1.0.23-alpha": "c31c8e50faaeb1a62423807f59fb8839a098ff9d6231d78d8ac45ddf42075c18",
  "v1.0.24-alpha": "a1a4d050d2d89a482eb9234fc87f3881c446e329df71ac805834b9bb55836f24",
  "v1.0.25-alpha": "e4c840b89ac3a7252dd02d659d866022738ab80fd6da2cd3b63ae0116a54ee92",
  "v1.0.26-alpha": "fa40726d675083ab9f6be16103f80d58faae1fa6539b7098cb7d3347660dbe61",
});

export type AikenIntegrity =
  | { kind: "sidecar" }
  | { kind: "pinned"; sha256: string }
  | { kind: "unavailable" };

export interface AikenReleaseAsset {
  /** Release asset file name, under `<base>/<tag>/`. */
  assetName: string;
  /**
   * Binary path segments relative to `versions/<tag>/`. The first segment is
   * the archive's top-level entry, the one moved into place on install.
   */
  binaryRelPath: string[];
  integrity: AikenIntegrity;
}

type Core = [bigint, bigint, bigint];

const LAST_LEGACY: Core = [1n, 0n, 26n];
const LAST_GNU: Core = [1n, 1n, 3n];

function coreOf(tag: string): Core {
  const match = /^v(\d+)\.(\d+)\.(\d+)/.exec(tag);
  if (!match) throw new Error(`Invalid Aiken release tag: ${tag}`);
  return [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])];
}

function compareCore(a: Core, b: Core): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The release asset for `tag` on a Node `process.platform` / `process.arch`.
 * Throws unless `tag` is already a canonical release tag, and on any platform
 * or architecture Aiken publishes no Unix tarball for.
 */
export function aikenReleaseAsset(tag: string, platform: string, arch: string, legacyPinned: Readonly<Record<string, string>> = LEGACY_LINUX_X64_SHA256): AikenReleaseAsset {
  if (toAikenReleaseTag(tag) !== tag) {
    throw new Error(`Invalid Aiken release tag: ${tag}`);
  }
  if (platform !== "linux" && platform !== "darwin") {
    throw new Error(`Unsupported platform for Aiken releases: ${platform}`);
  }
  if (arch !== "x64" && arch !== "arm64") {
    throw new Error(`Unsupported architecture for Aiken releases: ${arch}`);
  }

  const core = coreOf(tag);
  if (compareCore(core, LAST_LEGACY) <= 0) {
    const legacyOs = platform;
    const legacyArch = arch === "x64" ? "amd64" : "arm64";
    const pinned = platform === "linux" && arch === "x64"
      && Object.prototype.hasOwnProperty.call(legacyPinned, tag)
      ? legacyPinned[tag]
      : undefined;
    return {
      assetName: `aiken_${tag}_${legacyOs}_${legacyArch}.tar.gz`,
      binaryRelPath: ["aiken"],
      integrity: pinned === undefined ? { kind: "unavailable" } : { kind: "pinned", sha256: pinned },
    };
  }

  const distArch = arch === "x64" ? "x86_64" : "aarch64";
  const distOs = platform === "darwin"
    ? "apple-darwin"
    : `unknown-linux-${compareCore(core, LAST_GNU) > 0 ? "musl" : "gnu"}`;
  const stem = `aiken-${distArch}-${distOs}`;
  return {
    assetName: `${stem}.tar.gz`,
    binaryRelPath: [stem, "aiken"],
    integrity: { kind: "sidecar" },
  };
}
