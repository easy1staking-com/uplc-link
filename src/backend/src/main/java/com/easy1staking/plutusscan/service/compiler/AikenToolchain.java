package com.easy1staking.plutusscan.service.compiler;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.service.shell.ShellCommandExecutor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Resolves the Aiken compiler for a release tag to an absolute binary path,
 * downloading it once if it is not installed.
 *
 * Replaces {@code aikup install}, which queried the GitHub API on every call
 * and re-downloaded cargo-dist releases it had already installed. The layout
 * is aikup's ({@code <aiken-home>/versions/<tag>/...}, see {@link AikenReleaseAsset}),
 * so versions preinstalled by aikup are reused as they are. Nothing under
 * {@code <aiken-home>/bin} is touched: the build runs the binary by path.
 *
 * A missing version is fetched from {@code <base>/<tag>/<asset>} (the
 * releases/download endpoint, never the API), checked against its SHA-256,
 * extracted into a temp dir beside the versions and renamed into place in one
 * atomic step, so a crash or a concurrent install never leaves a partial binary
 * at the layout path.
 *
 * Each request (asset and sidecar) must deliver its whole body within the
 * build timeout of being sent, or the install fails. Download errors name the
 * requested URL, never the signed URL it redirected to.
 */
@Component
@Slf4j
public class AikenToolchain {

    private static final long MAX_ASSET_BYTES = 256L * 1024 * 1024;
    private static final long MAX_SIDECAR_BYTES = 4L * 1024;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(30);

    private final ShellCommandExecutor shellExecutor;
    private final Path versionsDir;
    private final String releaseBaseUrl;
    private final long timeoutSeconds;
    private final HttpClient httpClient;
    // Test seam: only tests replace it (by reflection), to pin fixture archives under fake legacy tags
    private Map<String, String> legacyPinnedSha256 = AikenReleaseAsset.LEGACY_LINUX_X64_SHA256;

    public AikenToolchain(
            ShellCommandExecutor shellExecutor,
            @Value("${verification.aiken-home:${user.home}/.aiken}") String aikenHome,
            @Value("${verification.aiken-release-base-url:https://github.com/aiken-lang/aiken/releases/download}") String releaseBaseUrl,
            @Value("${verification.build-timeout-seconds:300}") long timeoutSeconds) {
        this.shellExecutor = shellExecutor;
        this.versionsDir = Paths.get(aikenHome).toAbsolutePath().normalize().resolve("versions");
        this.releaseBaseUrl = releaseBaseUrl;
        this.timeoutSeconds = timeoutSeconds;
        // NORMAL follows the 302 to the asset host but never https -> http
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
    }

    /**
     * Absolute path of the Aiken binary for a canonical release tag,
     * installing it first if it is absent.
     *
     * @param canonicalTag a tag from {@link AikenReleaseAsset#toCanonicalTag}
     * @throws CompilationException if the tag is not canonical, the platform or
     *         release is unsupported, or the download, integrity check or install fails
     */
    public Path ensureInstalled(String canonicalTag) throws CompilationException {
        // Refuse before any path, request or exec is built from the tag
        if (!AikenReleaseAsset.isCanonicalTag(canonicalTag)) {
            throw new CompilationException("Not a canonical Aiken release tag: " + canonicalTag);
        }
        AikenReleaseAsset asset = AikenReleaseAsset.resolve(
                canonicalTag, System.getProperty("os.name"), System.getProperty("os.arch"), legacyPinnedSha256);

        Path installDir = versionsDir.resolve(canonicalTag).normalize();
        if (!versionsDir.equals(installDir.getParent())
                || !canonicalTag.equals(installDir.getFileName().toString())) {
            throw new CompilationException("Aiken install dir escapes " + versionsDir + ": " + installDir);
        }
        Path binary = resolveSegments(installDir, asset.getBinarySegments());

        if (isRegularFile(binary)) {
            log.info("Using installed Aiken {} at {}", canonicalTag, binary);
            return binary;
        }

        if (asset.getIntegrity() == AikenReleaseAsset.Integrity.UNAVAILABLE) {
            throw new CompilationException("No trusted checksum for Aiken " + canonicalTag
                    + " (" + asset.getAssetName() + "); refusing to download it");
        }

        String assetUrl = releaseBaseUrl + "/" + canonicalTag + "/" + asset.getAssetName();
        Path tmp = null;
        try {
            Files.createDirectories(versionsDir);
            tmp = Files.createTempDirectory(versionsDir, ".download-" + canonicalTag + "-");

            log.info("Downloading Aiken {} from {}", canonicalTag, assetUrl);
            Path archive = tmp.resolve(asset.getAssetName());
            String actualSha256 = download(assetUrl, archive);

            String expectedSha256 = asset.getIntegrity() == AikenReleaseAsset.Integrity.PINNED
                    ? asset.getPinnedSha256()
                    : fetchSidecarSha256(assetUrl + ".sha256");
            if (!expectedSha256.equalsIgnoreCase(actualSha256)) {
                throw new CompilationException("SHA-256 mismatch for " + assetUrl
                        + ": expected " + expectedSha256 + ", got " + actualSha256);
            }

            try {
                shellExecutor.execute(
                        List.of("tar", "-xzf", archive.toString(), "-C", tmp.toString()),
                        tmp,
                        timeoutSeconds);
            } catch (IOException e) {
                throw new CompilationException("Failed to extract " + asset.getAssetName() + ": " + e.getMessage(), e);
            }

            List<String> segments = asset.getBinarySegments();
            for (int i = 1; i < segments.size(); i++) {
                Path dir = resolveSegments(tmp, segments.subList(0, i));
                if (!Files.isDirectory(dir, LinkOption.NOFOLLOW_LINKS)) {
                    throw new CompilationException(asset.getAssetName() + " has no directory " + dir.getFileName());
                }
            }
            if (!isRegularFile(resolveSegments(tmp, segments))) {
                throw new CompilationException(asset.getAssetName() + " has no regular file "
                        + String.join("/", segments));
            }

            // The archive's top-level entry is what gets installed: the
            // <asset-stem> directory (cargo-dist) or the aiken file (legacy)
            Path source = tmp.resolve(segments.get(0));
            Path destination = installDir.resolve(segments.get(0));
            Files.createDirectories(installDir);
            try {
                // rename(2) refuses a populated directory but silently replaces
                // a file, so a legacy single-file install checks first
                if (!Files.isDirectory(source, LinkOption.NOFOLLOW_LINKS)
                        && Files.exists(destination, LinkOption.NOFOLLOW_LINKS)) {
                    throw new FileAlreadyExistsException(destination.toString());
                }
                Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) {
                // Lost a race to another installer: theirs is as good as ours
                if (isRegularFile(binary)) {
                    log.info("Using installed Aiken {} at {}", canonicalTag, binary);
                    return binary;
                }
                throw new CompilationException("Failed to install Aiken " + canonicalTag
                        + " at " + destination + ": " + e.getMessage(), e);
            }
            if (!isRegularFile(binary)) {
                throw new CompilationException("Aiken " + canonicalTag + " not found at " + binary + " after install");
            }
            log.info("Installed Aiken {} at {}", canonicalTag, binary);
            return binary;
        } catch (IOException e) {
            throw new CompilationException("Failed to install Aiken " + canonicalTag + ": " + e.getMessage(), e);
        } finally {
            if (tmp != null) {
                deleteTree(tmp);
            }
        }
    }

    /**
     * Stream {@code url} into {@code target}, bounded to {@link #MAX_ASSET_BYTES}.
     *
     * @return lower-case hex SHA-256 of the bytes written
     */
    private String download(String url, Path target) throws CompilationException, IOException {
        MessageDigest digest = sha256();
        try (BoundedBody bounded = send(url)) {
            HttpResponse<InputStream> response = bounded.response();
            checkStatus(url, response);
            checkContentLength(url, response, MAX_ASSET_BYTES);
            try (OutputStream out = Files.newOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                int n;
                while ((n = bounded.read(buffer)) != -1) {
                    total += n;
                    if (total > MAX_ASSET_BYTES) {
                        throw new CompilationException(url + " exceeds " + MAX_ASSET_BYTES + " bytes");
                    }
                    digest.update(buffer, 0, n);
                    out.write(buffer, 0, n);
                }
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /**
     * Fetch a {@code <hex> *<asset>} sidecar, bounded to {@link #MAX_SIDECAR_BYTES}.
     *
     * @return its first whitespace-delimited token, which must be 64 hex characters
     */
    private String fetchSidecarSha256(String url) throws CompilationException, IOException {
        byte[] body;
        try (BoundedBody bounded = send(url)) {
            HttpResponse<InputStream> response = bounded.response();
            checkStatus(url, response);
            checkContentLength(url, response, MAX_SIDECAR_BYTES);
            body = bounded.readNBytes((int) MAX_SIDECAR_BYTES + 1);
        }
        if (body.length > MAX_SIDECAR_BYTES) {
            throw new CompilationException(url + " exceeds " + MAX_SIDECAR_BYTES + " bytes");
        }
        String[] tokens = new String(body, StandardCharsets.US_ASCII).trim().split("\\s+", 2);
        if (!tokens[0].matches("[0-9a-fA-F]{64}")) {
            throw new CompilationException("Malformed checksum sidecar at " + url);
        }
        return tokens[0];
    }

    /**
     * Send a GET for {@code url} and return its body, which must be read
     * within {@link #timeoutSeconds} of the request being sent.
     */
    private BoundedBody send(String url) throws CompilationException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(timeoutSeconds))
                .GET()
                .build();
        long deadlineNanos = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        HttpResponse<InputStream> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CompilationException("Interrupted while downloading " + url, e);
        } catch (IOException e) {
            // Name the requested URL only: an exception message could carry
            // the signed URL the request was redirected to
            throw new CompilationException("Failed to download " + url + ": "
                    + e.getClass().getSimpleName(), e);
        }
        return BoundedBody.arm(url, response, deadlineNanos, timeoutSeconds);
    }

    /**
     * A response body that must be read by its request's deadline.
     *
     * HttpRequest.timeout bounds the headers, but not the body of a response
     * served without a redirect, so a watchdog closes the body when the
     * deadline passes, which unblocks a stalled read. The watchdog is a
     * one-shot task on the JDK's shared delayed executor: no thread or pool is
     * created per request. Read errors name the requested URL and the exception
     * type only, never a message that could carry the redirect target.
     */
    private static final class BoundedBody implements AutoCloseable {

        private final String url;
        private final HttpResponse<InputStream> response;
        private final long timeoutSeconds;
        /** Set once, by whichever comes first: the watchdog or {@link #close()}. */
        private final AtomicBoolean settled = new AtomicBoolean();
        private volatile boolean expired;

        private BoundedBody(String url, HttpResponse<InputStream> response, long timeoutSeconds) {
            this.url = url;
            this.response = response;
            this.timeoutSeconds = timeoutSeconds;
        }

        static BoundedBody arm(String url, HttpResponse<InputStream> response, long deadlineNanos,
                               long timeoutSeconds) {
            BoundedBody body = new BoundedBody(url, response, timeoutSeconds);
            long delayNanos = Math.max(0, deadlineNanos - System.nanoTime());
            CompletableFuture.delayedExecutor(delayNanos, TimeUnit.NANOSECONDS).execute(body::expire);
            return body;
        }

        HttpResponse<InputStream> response() {
            return response;
        }

        int read(byte[] buffer) throws CompilationException, IOException {
            int n;
            try {
                n = response.body().read(buffer);
            } catch (IOException e) {
                throw readFailure(e);
            }
            if (expired) {
                throw timedOut(null);
            }
            return n;
        }

        byte[] readNBytes(int len) throws CompilationException, IOException {
            byte[] bytes;
            try {
                bytes = response.body().readNBytes(len);
            } catch (IOException e) {
                throw readFailure(e);
            }
            if (expired) {
                throw timedOut(null);
            }
            return bytes;
        }

        private void expire() {
            if (settled.compareAndSet(false, true)) {
                expired = true;
                try {
                    response.body().close();
                } catch (IOException ignored) {
                    // the read it was meant to unblock reports the timeout
                }
            }
        }

        private CompilationException readFailure(IOException e) {
            return expired ? timedOut(e)
                    : new CompilationException("Failed to download " + url + ": " + e.getClass().getSimpleName(), e);
        }

        private CompilationException timedOut(IOException cause) {
            return new CompilationException("Failed to download " + url + ": timed out after "
                    + timeoutSeconds + " s", cause);
        }

        /** Disarms the watchdog and closes the body. */
        @Override
        public void close() throws IOException {
            settled.set(true);
            response.body().close();
        }
    }

    /** Errors name the requested (github.com) URL, never the redirect target. */
    private static void checkStatus(String url, HttpResponse<?> response) throws CompilationException {
        if (response.statusCode() != 200) {
            throw new CompilationException("Failed to download " + url + ": HTTP " + response.statusCode());
        }
    }

    private static void checkContentLength(String url, HttpResponse<?> response, long max)
            throws CompilationException {
        long declared = response.headers().firstValueAsLong("Content-Length").orElse(-1);
        if (declared > max) {
            throw new CompilationException(url + " declares " + declared + " bytes, limit " + max);
        }
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static Path resolveSegments(Path base, List<String> segments) {
        Path path = base;
        for (String segment : segments) {
            path = path.resolve(segment);
        }
        return path;
    }

    private static boolean isRegularFile(Path path) {
        return Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS);
    }

    /**
     * Remove the temp dir. Symlinks a hostile archive may have extracted are
     * deleted as links, never followed, so nothing outside it is touched.
     */
    private static void deleteTree(Path root) {
        try {
            Files.walkFileTree(root, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.delete(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                    if (exc != null) {
                        throw exc;
                    }
                    Files.delete(dir);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            log.warn("Failed to remove Aiken download dir: {}", root, e);
        }
    }
}
