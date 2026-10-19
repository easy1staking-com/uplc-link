package com.easy1staking.plutusscan.service.compiler;

import com.easy1staking.plutusscan.exception.CompilationException;

import java.math.BigInteger;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static java.util.Map.entry;

/**
 * Which GitHub release asset holds an Aiken compiler for a tag and platform,
 * where aikup's layout puts its binary, and how to check its integrity.
 *
 * Pure: no I/O. Mirrors aikup 0.0.11's asset_name and its switch-branch
 * src_bin, so a version aikup installed is found where aikup put it.
 *
 * <ul>
 *   <li>Legacy releases (core &le; 1.0.26) ship {@code aiken_<tag>_<os>_<arch>.tar.gz}
 *       holding a single {@code aiken}, installed at {@code versions/<tag>/aiken}.
 *       They have no checksum sidecar: only linux amd64 is pinned below.</li>
 *   <li>cargo-dist releases ship {@code aiken-<arch>-<os>.tar.gz} holding
 *       {@code <asset-stem>/aiken}, installed at {@code versions/<tag>/<asset-stem>/aiken},
 *       with a {@code <asset>.sha256} sidecar. Linux builds are musl after 1.1.3.</li>
 * </ul>
 * The pre-release suffix is ignored when comparing versions.
 */
public final class AikenReleaseAsset {

    public static final String RELEASE_BASE_URL = "https://github.com/aiken-lang/aiken/releases/download";

    /** SHA-256 of {@code aiken_<tag>_linux_amd64.tar.gz} for every legacy release. */
    public static final Map<String, String> LEGACY_LINUX_X64_SHA256 = Map.ofEntries(
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

    /** A canonical tag: {@code v}-prefixed, ASCII digits, no build metadata. */
    private static final Pattern CANONICAL_TAG = Pattern.compile("v(\\d+)\\.(\\d+)\\.(\\d+)(-[A-Za-z0-9.]+)?");

    private static final BigInteger[] LAST_LEGACY = core(1, 0, 26);
    private static final BigInteger[] LAST_GNU = core(1, 1, 3);

    public enum Integrity {
        /** Verify against the release's {@code <asset>.sha256}. */
        SIDECAR,
        /** Verify against {@link #getPinnedSha256()}. */
        PINNED,
        /** No trusted digest exists: refuse to download. */
        UNAVAILABLE
    }

    private final String tag;
    private final String assetName;
    private final List<String> binarySegments;
    private final Integrity integrity;
    private final String pinnedSha256;

    private AikenReleaseAsset(String tag, String assetName, List<String> binarySegments,
                              Integrity integrity, String pinnedSha256) {
        this.tag = tag;
        this.assetName = assetName;
        this.binarySegments = binarySegments;
        this.integrity = integrity;
        this.pinnedSha256 = pinnedSha256;
    }

    /**
     * Resolve the asset for a canonical tag on a JVM platform.
     *
     * @param canonicalTag e.g. "v1.1.24"; anything else is refused
     * @param osName Java {@code os.name}
     * @param osArch Java {@code os.arch}
     * @throws CompilationException for a non-canonical tag or an unsupported platform
     */
    public static AikenReleaseAsset resolve(String canonicalTag, String osName, String osArch)
            throws CompilationException {
        Matcher m = canonicalTag == null ? null : CANONICAL_TAG.matcher(canonicalTag);
        if (m == null || !m.matches()) {
            throw new CompilationException("Not a canonical Aiken release tag: " + canonicalTag);
        }
        BigInteger[] core = {new BigInteger(m.group(1)), new BigInteger(m.group(2)), new BigInteger(m.group(3))};

        boolean linux;
        if (osName != null && osName.startsWith("Linux")) {
            linux = true;
        } else if (osName != null && osName.startsWith("Mac OS X")) {
            linux = false;
        } else {
            throw new CompilationException("Unsupported platform for Aiken: os.name=" + osName);
        }
        boolean x64;
        if ("amd64".equals(osArch) || "x86_64".equals(osArch)) {
            x64 = true;
        } else if ("aarch64".equals(osArch) || "arm64".equals(osArch)) {
            x64 = false;
        } else {
            throw new CompilationException("Unsupported platform for Aiken: os.arch=" + osArch);
        }

        if (compare(core, LAST_LEGACY) <= 0) {
            String asset = "aiken_" + canonicalTag + "_" + (linux ? "linux" : "darwin")
                    + "_" + (x64 ? "amd64" : "arm64") + ".tar.gz";
            String pinned = linux && x64 ? LEGACY_LINUX_X64_SHA256.get(canonicalTag) : null;
            return new AikenReleaseAsset(canonicalTag, asset, List.of("aiken"),
                    pinned != null ? Integrity.PINNED : Integrity.UNAVAILABLE, pinned);
        }

        String os = linux
                ? (compare(core, LAST_GNU) > 0 ? "unknown-linux-musl" : "unknown-linux-gnu")
                : "apple-darwin";
        String stem = "aiken-" + (x64 ? "x86_64" : "aarch64") + "-" + os;
        return new AikenReleaseAsset(canonicalTag, stem + ".tar.gz", List.of(stem, "aiken"),
                Integrity.SIDECAR, null);
    }

    /**
     * The canonical release tag for a compiler version: {@link AikenCompilerService#toReleaseTag}
     * (trimmed, build metadata stripped, shape-checked) with a {@code v} prefix if missing.
     */
    public static String toCanonicalTag(String compilerVersion) throws CompilationException {
        String tag = AikenCompilerService.toReleaseTag(compilerVersion);
        return tag.startsWith("v") ? tag : "v" + tag;
    }

    /** True for a {@code v}-prefixed, shape-valid tag without build metadata. */
    public static boolean isCanonicalTag(String tag) {
        return tag != null && CANONICAL_TAG.matcher(tag).matches();
    }

    public String getTag() {
        return tag;
    }

    /** File name of the release asset, e.g. {@code aiken-x86_64-unknown-linux-musl.tar.gz}. */
    public String getAssetName() {
        return assetName;
    }

    /**
     * Path of the binary relative to {@code versions/<tag>/}, one element per segment.
     * The first segment is the archive's top-level entry, which is what gets installed.
     */
    public List<String> getBinarySegments() {
        return binarySegments;
    }

    public Integrity getIntegrity() {
        return integrity;
    }

    /** Lower-case hex SHA-256 for {@link Integrity#PINNED}, otherwise null. */
    public String getPinnedSha256() {
        return pinnedSha256;
    }

    private static BigInteger[] core(long major, long minor, long patch) {
        return new BigInteger[]{BigInteger.valueOf(major), BigInteger.valueOf(minor), BigInteger.valueOf(patch)};
    }

    private static int compare(BigInteger[] a, BigInteger[] b) {
        for (int i = 0; i < a.length; i++) {
            int c = a[i].compareTo(b[i]);
            if (c != 0) {
                return c;
            }
        }
        return 0;
    }
}
