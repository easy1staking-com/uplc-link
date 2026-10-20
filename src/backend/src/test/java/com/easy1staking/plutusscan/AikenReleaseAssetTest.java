package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.service.compiler.AikenReleaseAsset;
import com.easy1staking.plutusscan.service.compiler.AikenReleaseAsset.Integrity;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static java.util.Map.entry;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class AikenReleaseAssetTest {

    private static final String LINUX = "Linux";
    private static final String MAC = "Mac OS X";

    private static AikenReleaseAsset resolve(String tag, String osName, String osArch) throws CompilationException {
        return AikenReleaseAsset.resolve(tag, osName, osArch);
    }

    private static void assertCargoDist(AikenReleaseAsset asset, String stem) {
        assertEquals(stem + ".tar.gz", asset.getAssetName());
        assertEquals(List.of(stem, "aiken"), asset.getBinarySegments());
        assertEquals(Integrity.SIDECAR, asset.getIntegrity());
        assertNull(asset.getPinnedSha256());
    }

    @Test
    public void defaultBaseUrlIsReleasesDownload() {
        assertEquals("https://github.com/aiken-lang/aiken/releases/download", AikenReleaseAsset.RELEASE_BASE_URL);
    }

    @Test
    public void cargoDistOnEveryPlatform() throws Exception {
        assertCargoDist(resolve("v1.1.24", LINUX, "amd64"), "aiken-x86_64-unknown-linux-musl");
        assertCargoDist(resolve("v1.1.24", LINUX, "x86_64"), "aiken-x86_64-unknown-linux-musl");
        assertCargoDist(resolve("v1.1.24", LINUX, "aarch64"), "aiken-aarch64-unknown-linux-musl");
        assertCargoDist(resolve("v1.1.24", LINUX, "arm64"), "aiken-aarch64-unknown-linux-musl");
        assertCargoDist(resolve("v1.1.24", MAC, "aarch64"), "aiken-aarch64-apple-darwin");
        assertCargoDist(resolve("v1.1.24", MAC, "x86_64"), "aiken-x86_64-apple-darwin");
    }

    @Test
    public void linuxLibcSwitchesToMuslAfter113() throws Exception {
        assertCargoDist(resolve("v1.1.3", LINUX, "amd64"), "aiken-x86_64-unknown-linux-gnu");
        assertCargoDist(resolve("v1.1.4", LINUX, "amd64"), "aiken-x86_64-unknown-linux-musl");
        assertCargoDist(resolve("v1.1.0", LINUX, "amd64"), "aiken-x86_64-unknown-linux-gnu");
        // the pre-release suffix is ignored: core (1,1,4) > (1,1,3)
        assertCargoDist(resolve("v1.1.4-rc.1", LINUX, "amd64"), "aiken-x86_64-unknown-linux-musl");
        assertCargoDist(resolve("v1.1.3-rc.1", LINUX, "amd64"), "aiken-x86_64-unknown-linux-gnu");
    }

    @Test
    public void legacyUpTo1026() throws Exception {
        AikenReleaseAsset last = resolve("v1.0.26-alpha", LINUX, "amd64");
        assertEquals("aiken_v1.0.26-alpha_linux_amd64.tar.gz", last.getAssetName());
        assertEquals(List.of("aiken"), last.getBinarySegments());
        assertEquals(Integrity.PINNED, last.getIntegrity());
        assertEquals("fa40726d675083ab9f6be16103f80d58faae1fa6539b7098cb7d3347660dbe61", last.getPinnedSha256());

        AikenReleaseAsset first = resolve("v1.0.0-alpha", LINUX, "x86_64");
        assertEquals("aiken_v1.0.0-alpha_linux_amd64.tar.gz", first.getAssetName());
        assertEquals(Integrity.PINNED, first.getIntegrity());
        assertEquals("35d62815086ce085ee4b9733eb68524f28391a1a94e172848d36a25981efa598", first.getPinnedSha256());

        // core (1,0,26) without a pre-release is still legacy, but unpinned
        AikenReleaseAsset bare = resolve("v1.0.26", LINUX, "amd64");
        assertEquals("aiken_v1.0.26_linux_amd64.tar.gz", bare.getAssetName());
        assertEquals(Integrity.UNAVAILABLE, bare.getIntegrity());

        assertCargoDist(resolve("v1.0.28-alpha", LINUX, "amd64"), "aiken-x86_64-unknown-linux-gnu");
        assertCargoDist(resolve("v1.0.27", LINUX, "amd64"), "aiken-x86_64-unknown-linux-gnu");
    }

    @Test
    public void legacyIntegrityUnavailableOffLinuxX64OrOffTable() throws Exception {
        AikenReleaseAsset arm = resolve("v1.0.0-alpha", LINUX, "aarch64");
        assertEquals("aiken_v1.0.0-alpha_linux_arm64.tar.gz", arm.getAssetName());
        assertEquals(Integrity.UNAVAILABLE, arm.getIntegrity());
        assertNull(arm.getPinnedSha256());

        AikenReleaseAsset mac = resolve("v1.0.0-alpha", MAC, "x86_64");
        assertEquals("aiken_v1.0.0-alpha_darwin_amd64.tar.gz", mac.getAssetName());
        assertEquals(Integrity.UNAVAILABLE, mac.getIntegrity());

        AikenReleaseAsset macArm = resolve("v1.0.0-alpha", MAC, "arm64");
        assertEquals("aiken_v1.0.0-alpha_darwin_arm64.tar.gz", macArm.getAssetName());
        assertEquals(Integrity.UNAVAILABLE, macArm.getIntegrity());

        for (String tag : List.of("v1.0.9-alpha", "v1.0.22-alpha")) {
            AikenReleaseAsset gap = resolve(tag, LINUX, "amd64");
            assertEquals("aiken_" + tag + "_linux_amd64.tar.gz", gap.getAssetName());
            assertEquals(Integrity.UNAVAILABLE, gap.getIntegrity(), tag);
            assertNull(gap.getPinnedSha256(), tag);
        }
    }

    @Test
    public void pinnedTableOverloadIsOnlyASeam() throws Exception {
        String hex = "ab".repeat(32);
        AikenReleaseAsset seamed = AikenReleaseAsset.resolve("v0.9.1", LINUX, "amd64", Map.of("v0.9.1", hex));
        assertEquals("aiken_v0.9.1_linux_amd64.tar.gz", seamed.getAssetName());
        assertEquals(Integrity.PINNED, seamed.getIntegrity());
        assertEquals(hex, seamed.getPinnedSha256());

        // the 3-argument form reads the frozen table, where a fake tag is absent
        AikenReleaseAsset production = resolve("v0.9.1", LINUX, "amd64");
        assertEquals(Integrity.UNAVAILABLE, production.getIntegrity());
        assertNull(production.getPinnedSha256());
    }

    @Test
    public void refusesUnsupportedPlatforms() {
        assertThrows(CompilationException.class, () -> resolve("v1.1.24", "Windows 11", "amd64"));
        assertThrows(CompilationException.class, () -> resolve("v1.1.24", "FreeBSD", "amd64"));
        assertThrows(CompilationException.class, () -> resolve("v1.1.24", null, "amd64"));
        assertThrows(CompilationException.class, () -> resolve("v1.1.24", LINUX, "ppc64le"));
        assertThrows(CompilationException.class, () -> resolve("v1.1.24", LINUX, "x86"));
        assertThrows(CompilationException.class, () -> resolve("v1.1.24", LINUX, null));
        assertThrows(CompilationException.class, () -> resolve("v1.0.0-alpha", "Windows 11", "amd64"));
    }

    @Test
    public void refusesNonCanonicalTags() {
        for (String tag : new String[]{"1.1.24", "v1.1.24+abc", "--help", "v1.1", " v1.1.24", "v1.1.24 ",
                "", "v1.1.24/../x", "v1.1.24-", "v١.1.24", "V1.1.24"}) {
            assertThrows(CompilationException.class, () -> resolve(tag, LINUX, "amd64"), tag);
        }
        assertThrows(CompilationException.class, () -> resolve(null, LINUX, "amd64"));
    }

    @Test
    public void hugeVersionComponentsDoNotOverflow() throws Exception {
        assertCargoDist(resolve("v99999999999999999999.0.0", LINUX, "amd64"), "aiken-x86_64-unknown-linux-musl");
        assertCargoDist(resolve("v1.0.99999999999999999999", LINUX, "amd64"), "aiken-x86_64-unknown-linux-gnu");
        AikenReleaseAsset legacy = resolve("v0.99999999999999999999.0", LINUX, "amd64");
        assertEquals("aiken_v0.99999999999999999999.0_linux_amd64.tar.gz", legacy.getAssetName());
        assertEquals(Integrity.UNAVAILABLE, legacy.getIntegrity());
    }

    @Test
    public void canonicalTagAddsVPrefix() throws Exception {
        assertEquals("v1.0.29", AikenReleaseAsset.toCanonicalTag("1.0.29+e2fb28b"));
        assertEquals("v1.1.24", AikenReleaseAsset.toCanonicalTag("v1.1.24+bacbeb3"));
        assertEquals("v1.1.24", AikenReleaseAsset.toCanonicalTag(" v1.1.24 "));
        assertEquals("v9.9.1", AikenReleaseAsset.toCanonicalTag("9.9.1+abc"));
        assertEquals("v1.0.0-alpha", AikenReleaseAsset.toCanonicalTag("v1.0.0-alpha+abc123"));
        assertThrows(CompilationException.class, () -> AikenReleaseAsset.toCanonicalTag(""));
        assertThrows(CompilationException.class, () -> AikenReleaseAsset.toCanonicalTag("--help"));
        assertThrows(CompilationException.class, () -> AikenReleaseAsset.toCanonicalTag("vv1.1.24"));
        assertThrows(CompilationException.class, () -> AikenReleaseAsset.toCanonicalTag("v1.1; rm -rf /"));
    }

    @Test
    public void pinnedTableIsExactAndUnmodifiable() throws Exception {
        Map<String, String> expected = Map.ofEntries(
                entry("v1.0.0-alpha", "35d62815086ce085ee4b9733eb68524f28391a1a94e172848d36a25981efa598"),
                entry("v1.0.1-alpha", "7468a796d84690db08f7f2468035b644bc0c2e0089d83a83b53f4b6a2a7ce589"),
                entry("v1.0.2-alpha", "90ee1b631a5e20e0065dca9cf8be9fbcfe969598acb17e418f0ff7fefe909b41"),
                entry("v1.0.3-alpha", "0c9cb312d15cae1631c5dc1def456c4260b294369a03ed31dfd8d6f442b678a2"),
                entry("v1.0.4-alpha", "8a9faea57ba89ae819b909651f0a4369552b410efb25cf68bc7e4055c3fcc71c"),
                entry("v1.0.5-alpha", "1b646a6750d19770a0c112e5c672636c663062b13237560670cf35ff220c0d90"),
                entry("v1.0.6-alpha", "14a6842b2d441fb285840226a370d21a0a0a0b43829c3317380eae41a3941673"),
                entry("v1.0.7-alpha", "a4541b54c1c8f3a5994560b4ed0ef03f5f276b194e1e6cfef20cccbcd64ee514"),
                entry("v1.0.8-alpha", "862f573a00e24a2cfd2ed1af6ecec8e9b5c1cbbd0f1da52b726ddbdee340a16d"),
                entry("v1.0.10-alpha", "f042daaabbe0d384ebceb1e32115a81682f9e9aca08c6040731f89a387bbecfd"),
                entry("v1.0.11-alpha", "d352e53ef2ab17a7956ded93ea73d6c5bc5adcee2b9b25ad6984cfe1e8f0a3b0"),
                entry("v1.0.12-alpha", "7beba9a384a5adada0422ad4eac6fae4647091ad189a9c0739b75676e0991093"),
                entry("v1.0.13-alpha", "854ea2f1d32df9df9a7b9a0ccb6eb0d654a56f6d43364809e67d1a0e2402e8e1"),
                entry("v1.0.14-alpha", "2cd09241ef5ba282594467a4e2e2ec2c69b842f5297f29297011d53b0f0539e5"),
                entry("v1.0.15-alpha", "29de4e3eff7f4071172e1566fe18011611f263d0c0b216710d26499b00b7a8f0"),
                entry("v1.0.16-alpha", "b6cda7c9d75faf253408aea226a07513c139a08f13721e99355829d02408e425"),
                entry("v1.0.17-alpha", "919b4fb418148e1a577c9eb27de6c6e0fd21c93b0a9074836828ec05df875d9f"),
                entry("v1.0.18-alpha", "46e29fc17e4ed01f855f0d93d5fec6ab190dcab3e0c8ad367081a9b771712339"),
                entry("v1.0.19-alpha", "53222b8a9fc805b6964089ce944dd03414b3d1e53defc4b7530d633e3eb7a88b"),
                entry("v1.0.20-alpha", "855b37884c56ee25bc9a071c8f1fad024edb7688d203694bebd7ed48da86e997"),
                entry("v1.0.21-alpha", "7c216b7a22c4f85637be033667e3c2cc3dbba6d6fe1f478e264cefba7571b0ca"),
                entry("v1.0.23-alpha", "c31c8e50faaeb1a62423807f59fb8839a098ff9d6231d78d8ac45ddf42075c18"),
                entry("v1.0.24-alpha", "a1a4d050d2d89a482eb9234fc87f3881c446e329df71ac805834b9bb55836f24"),
                entry("v1.0.25-alpha", "e4c840b89ac3a7252dd02d659d866022738ab80fd6da2cd3b63ae0116a54ee92"),
                entry("v1.0.26-alpha", "fa40726d675083ab9f6be16103f80d58faae1fa6539b7098cb7d3347660dbe61"));
        assertEquals(expected, AikenReleaseAsset.LEGACY_LINUX_X64_SHA256);

        // `printf '%s %s\n' tag hex` lines, LC_ALL=C sort, then sha256sum
        String lines = AikenReleaseAsset.LEGACY_LINUX_X64_SHA256.entrySet().stream()
                .map(e -> e.getKey() + " " + e.getValue() + "\n")
                .sorted()
                .collect(Collectors.joining());
        String digest = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(lines.getBytes(StandardCharsets.US_ASCII)));
        assertEquals("22754e9d7f5667ee04c32cea74f3c653515fd39e5e3714ab07d3dae0d7d00069", digest);

        assertThrows(UnsupportedOperationException.class,
                () -> AikenReleaseAsset.LEGACY_LINUX_X64_SHA256.put("v1.0.9-alpha", "00"));

        for (String tag : AikenReleaseAsset.LEGACY_LINUX_X64_SHA256.keySet()) {
            AikenReleaseAsset asset = resolve(tag, LINUX, "amd64");
            assertEquals(Integrity.PINNED, asset.getIntegrity(), tag);
            assertEquals(expected.get(tag), asset.getPinnedSha256(), tag);
        }
    }
}
