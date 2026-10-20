/**
 * Aiken release assets: the asset-name, binary-layout and integrity rules.
 *
 * The expected names are the ones published on aiken-lang/aiken releases and
 * the layout is the one aikup 0.0.11 installs (versions/<tag>/<asset-stem>/aiken
 * for cargo-dist assets, versions/<tag>/aiken for legacy ones). The pinned
 * table is compared against an independent copy AND against its recorded
 * digest, so an edited hash cannot pass by editing both copies the same way.
 */

import { createHash } from 'crypto';
import {
  AIKEN_RELEASE_BASE_URL,
  aikenReleaseAsset,
  AikenReleaseAsset,
  LEGACY_LINUX_X64_SHA256,
} from '../lib/aiken-release';

// `printf '%s %s\n' tag hex` lines, `LC_ALL=C sort`, then `sha256sum`.
const PINNED_TABLE_DIGEST = '22754e9d7f5667ee04c32cea74f3c653515fd39e5e3714ab07d3dae0d7d00069';

const EXPECTED_PINNED: Array<[string, string]> = [
  ['v1.0.0-alpha', '35d62815086ce085ee4b9733eb68524f28391a1a94e172848d36a25981efa598'],
  ['v1.0.1-alpha', '7468a796d84690db08f7f2468035b644bc0c2e0089d83a83b53f4b6a2a7ce589'],
  ['v1.0.2-alpha', '90ee1b631a5e20e0065dca9cf8be9fbcfe969598acb17e418f0ff7fefe909b41'],
  ['v1.0.3-alpha', '0c9cb312d15cae1631c5dc1def456c4260b294369a03ed31dfd8d6f442b678a2'],
  ['v1.0.4-alpha', '8a9faea57ba89ae819b909651f0a4369552b410efb25cf68bc7e4055c3fcc71c'],
  ['v1.0.5-alpha', '1b646a6750d19770a0c112e5c672636c663062b13237560670cf35ff220c0d90'],
  ['v1.0.6-alpha', '14a6842b2d441fb285840226a370d21a0a0a0b43829c3317380eae41a3941673'],
  ['v1.0.7-alpha', 'a4541b54c1c8f3a5994560b4ed0ef03f5f276b194e1e6cfef20cccbcd64ee514'],
  ['v1.0.8-alpha', '862f573a00e24a2cfd2ed1af6ecec8e9b5c1cbbd0f1da52b726ddbdee340a16d'],
  ['v1.0.10-alpha', 'f042daaabbe0d384ebceb1e32115a81682f9e9aca08c6040731f89a387bbecfd'],
  ['v1.0.11-alpha', 'd352e53ef2ab17a7956ded93ea73d6c5bc5adcee2b9b25ad6984cfe1e8f0a3b0'],
  ['v1.0.12-alpha', '7beba9a384a5adada0422ad4eac6fae4647091ad189a9c0739b75676e0991093'],
  ['v1.0.13-alpha', '854ea2f1d32df9df9a7b9a0ccb6eb0d654a56f6d43364809e67d1a0e2402e8e1'],
  ['v1.0.14-alpha', '2cd09241ef5ba282594467a4e2e2ec2c69b842f5297f29297011d53b0f0539e5'],
  ['v1.0.15-alpha', '29de4e3eff7f4071172e1566fe18011611f263d0c0b216710d26499b00b7a8f0'],
  ['v1.0.16-alpha', 'b6cda7c9d75faf253408aea226a07513c139a08f13721e99355829d02408e425'],
  ['v1.0.17-alpha', '919b4fb418148e1a577c9eb27de6c6e0fd21c93b0a9074836828ec05df875d9f'],
  ['v1.0.18-alpha', '46e29fc17e4ed01f855f0d93d5fec6ab190dcab3e0c8ad367081a9b771712339'],
  ['v1.0.19-alpha', '53222b8a9fc805b6964089ce944dd03414b3d1e53defc4b7530d633e3eb7a88b'],
  ['v1.0.20-alpha', '855b37884c56ee25bc9a071c8f1fad024edb7688d203694bebd7ed48da86e997'],
  ['v1.0.21-alpha', '7c216b7a22c4f85637be033667e3c2cc3dbba6d6fe1f478e264cefba7571b0ca'],
  ['v1.0.23-alpha', 'c31c8e50faaeb1a62423807f59fb8839a098ff9d6231d78d8ac45ddf42075c18'],
  ['v1.0.24-alpha', 'a1a4d050d2d89a482eb9234fc87f3881c446e329df71ac805834b9bb55836f24'],
  ['v1.0.25-alpha', 'e4c840b89ac3a7252dd02d659d866022738ab80fd6da2cd3b63ae0116a54ee92'],
  ['v1.0.26-alpha', 'fa40726d675083ab9f6be16103f80d58faae1fa6539b7098cb7d3347660dbe61'],
];

function check(name: string, cond: boolean): boolean {
  console.log(cond ? `✅ SUCCESS: ${name}` : `❌ FAILURE: ${name}`);
  return cond;
}

function show(asset: AikenReleaseAsset): string {
  return JSON.stringify(asset);
}

function same(a: AikenReleaseAsset, b: AikenReleaseAsset): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cargoDist(stem: string): AikenReleaseAsset {
  return { assetName: `${stem}.tar.gz`, binaryRelPath: [stem, 'aiken'], integrity: { kind: 'sidecar' } };
}

function legacy(assetName: string, integrity: AikenReleaseAsset['integrity']): AikenReleaseAsset {
  return { assetName, binaryRelPath: ['aiken'], integrity };
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function throws(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function testAikenRelease(): Promise<boolean> {
  let ok = true;

  ok = check(
    `base URL is ${AIKEN_RELEASE_BASE_URL}`,
    AIKEN_RELEASE_BASE_URL === 'https://github.com/aiken-lang/aiken/releases/download'
  ) && ok;

  // cargo-dist, linux x64: musl iff core > 1.1.3
  const linuxX64: Array<[string, string]> = [
    ['v1.1.24', 'aiken-x86_64-unknown-linux-musl'],
    ['v1.1.4', 'aiken-x86_64-unknown-linux-musl'],
    ['v1.1.3', 'aiken-x86_64-unknown-linux-gnu'],
    ['v1.0.29-alpha', 'aiken-x86_64-unknown-linux-gnu'],
    ['v1.0.28-alpha', 'aiken-x86_64-unknown-linux-gnu'],
  ];
  for (const [tag, stem] of linuxX64) {
    const asset = aikenReleaseAsset(tag, 'linux', 'x64');
    ok = check(`${tag} linux x64 → ${stem} cargo-dist with sidecar (got ${show(asset)})`, same(asset, cargoDist(stem))) && ok;
  }

  // legacy, linux x64: pinned
  for (const tag of ['v1.0.26-alpha', 'v1.0.0-alpha']) {
    const asset = aikenReleaseAsset(tag, 'linux', 'x64');
    const expected = legacy(`aiken_${tag}_linux_amd64.tar.gz`, { kind: 'pinned', sha256: LEGACY_LINUX_X64_SHA256[tag] });
    ok = check(
      `${tag} linux x64 → legacy, pinned (got ${show(asset)})`,
      same(asset, expected) && /^[0-9a-f]{64}$/.test(LEGACY_LINUX_X64_SHA256[tag] ?? '')
    ) && ok;
  }

  // an injected pinned table (the toolchain's test seam) replaces the real one
  {
    const hex = sha256Hex('v0.9.1 fixture');
    const asset = aikenReleaseAsset('v0.9.1', 'linux', 'x64', { 'v0.9.1': hex });
    ok = check(
      `v0.9.1 linux x64 with an injected table → legacy, pinned with that hex (got ${show(asset)})`,
      same(asset, legacy('aiken_v0.9.1_linux_amd64.tar.gz', { kind: 'pinned', sha256: hex }))
    ) && ok;
  }
  {
    const asset = aikenReleaseAsset('v0.9.1', 'linux', 'x64');
    ok = check(
      `v0.9.1 linux x64 with the default table → legacy, integrity unavailable (got ${show(asset)})`,
      same(asset, legacy('aiken_v0.9.1_linux_amd64.tar.gz', { kind: 'unavailable' }))
    ) && ok;
  }

  // legacy elsewhere, or an unpinned legacy-range tag: unavailable
  const unavailable: Array<[string, string, string, string]> = [
    ['v1.0.26-alpha', 'linux', 'arm64', 'aiken_v1.0.26-alpha_linux_arm64.tar.gz'],
    ['v1.0.26-alpha', 'darwin', 'x64', 'aiken_v1.0.26-alpha_darwin_amd64.tar.gz'],
    ['v1.0.0-alpha', 'darwin', 'arm64', 'aiken_v1.0.0-alpha_darwin_arm64.tar.gz'],
    ['v1.0.9-alpha', 'linux', 'x64', 'aiken_v1.0.9-alpha_linux_amd64.tar.gz'],
    ['v1.0.26', 'linux', 'x64', 'aiken_v1.0.26_linux_amd64.tar.gz'],
  ];
  for (const [tag, platform, arch, assetName] of unavailable) {
    const asset = aikenReleaseAsset(tag, platform, arch);
    ok = check(
      `${tag} ${platform} ${arch} → legacy, integrity unavailable (got ${show(asset)})`,
      same(asset, legacy(assetName, { kind: 'unavailable' }))
    ) && ok;
  }

  // other platforms of a cargo-dist release
  const others: Array<[string, string, string]> = [
    ['linux', 'arm64', 'aiken-aarch64-unknown-linux-musl'],
    ['darwin', 'arm64', 'aiken-aarch64-apple-darwin'],
    ['darwin', 'x64', 'aiken-x86_64-apple-darwin'],
  ];
  for (const [platform, arch, stem] of others) {
    const asset = aikenReleaseAsset('v1.1.24', platform, arch);
    ok = check(`v1.1.24 ${platform} ${arch} → ${stem}.tar.gz (got ${show(asset)})`, same(asset, cargoDist(stem))) && ok;
  }
  {
    const asset = aikenReleaseAsset('v1.1.3', 'linux', 'arm64');
    ok = check(
      `v1.1.3 linux arm64 → gnu by the same rule (got ${show(asset)})`,
      same(asset, cargoDist('aiken-aarch64-unknown-linux-gnu'))
    ) && ok;
  }

  // unsupported platforms and non-canonical tags throw
  const rejected: Array<[string, string, string]> = [
    ['v1.1.24', 'win32', 'x64'],
    ['v1.1.24', 'linux', 'ia32'],
    ['v1.0.0-alpha', 'win32', 'x64'],
    ['--help', 'linux', 'x64'],
    ['v1.1.24+abc', 'linux', 'x64'],
    ['1.1.24', 'linux', 'x64'],
    [' v1.1.24', 'linux', 'x64'],
    ['v1.1.24/../x', 'linux', 'x64'],
    ['..', 'linux', 'x64'],
    ['', 'linux', 'x64'],
  ];
  for (const [tag, platform, arch] of rejected) {
    const message = throws(() => aikenReleaseAsset(tag, platform, arch));
    ok = check(`${JSON.stringify(tag)} ${platform} ${arch} throws (${message ?? 'did not throw'})`, message !== null) && ok;
  }

  // huge core numbers: no overflow, cargo-dist musl
  {
    const tag = 'v99999999999999999999.0.0';
    let outcome: string;
    let passed = false;
    try {
      const asset = aikenReleaseAsset(tag, 'linux', 'x64');
      outcome = show(asset);
      passed = same(asset, cargoDist('aiken-x86_64-unknown-linux-musl'));
    } catch (error) {
      outcome = `threw: ${error instanceof Error ? error.message : String(error)}`;
    }
    ok = check(`${tag} → musl cargo-dist without throwing (${outcome})`, passed) && ok;
  }

  // the pinned table
  {
    const expected = Object.fromEntries(EXPECTED_PINNED);
    const actualKeys = Object.keys(LEGACY_LINUX_X64_SHA256).sort();
    const expectedKeys = Object.keys(expected).sort();
    ok = check(
      `pinned table deep-equals the ${EXPECTED_PINNED.length} contract pairs (has ${actualKeys.length})`,
      EXPECTED_PINNED.length === 25
        && JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)
        && expectedKeys.every(k => LEGACY_LINUX_X64_SHA256[k] === expected[k])
    ) && ok;
    const lines = Object.entries(LEGACY_LINUX_X64_SHA256)
      .map(([tag, hex]) => `${tag} ${hex}\n`)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .join('');
    const digest = createHash('sha256').update(lines).digest('hex');
    ok = check(`pinned table digest is ${PINNED_TABLE_DIGEST} (got ${digest})`, digest === PINNED_TABLE_DIGEST) && ok;
    ok = check('pinned table is frozen', Object.isFrozen(LEGACY_LINUX_X64_SHA256)) && ok;
  }

  return ok;
}

if (require.main === module) {
  testAikenRelease().then(ok => process.exit(ok ? 0 : 1));
}

export { testAikenRelease };
