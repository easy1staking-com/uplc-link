package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.service.compiler.AikenReleaseAsset;
import com.easy1staking.plutusscan.service.compiler.AikenToolchain;
import com.easy1staking.plutusscan.service.shell.ProcessResult;
import com.easy1staking.plutusscan.service.shell.ShellCommandExecutor;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AikenToolchain against a local HTTP server that stands in for
 * github.com/.../releases/download, with fixture archives built by the
 * system tar. The real ~/.aiken is never read or written: the home is a
 * temp dir, and a sentinel symlink at its bin/aiken must survive every case.
 */
public class AikenToolchainTest {

    private static final String CARGO_TAG = "v1.1.24";
    private static final String SENTINEL_TARGET = "/nonexistent/sentinel-aiken";
    private static final String FIXTURE_BINARY = "#!/bin/sh\necho fixture-aiken\n";

    @TempDir
    Path tmp;

    private Path home;
    private Path versions;
    private Path sentinel;
    private HttpServer server;
    private ExecutorService serverPool;
    private String baseUrl;
    private final Map<String, Route> routes = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();
    private RecordingShell shell;

    /** 200 with a body, or 302 to another path on this server. */
    private record Route(byte[] body, String redirectTo) {
    }

    /** Real ShellCommandExecutor that records every argv and runs a hook after each exec. */
    private static final class RecordingShell extends ShellCommandExecutor {
        final List<List<String>> execs = Collections.synchronizedList(new ArrayList<>());
        volatile ExecHook afterExec;

        @Override
        public ProcessResult execute(List<String> command, Path workingDir, long timeoutSeconds) throws IOException {
            execs.add(List.copyOf(command));
            ProcessResult result = super.execute(command, workingDir, timeoutSeconds);
            if (afterExec != null) {
                afterExec.run(command);
            }
            return result;
        }
    }

    @FunctionalInterface
    private interface ExecHook {
        void run(List<String> command) throws IOException;
    }

    @BeforeEach
    void setUp() throws Exception {
        home = tmp.resolve("aiken-home");
        versions = home.resolve("versions");
        sentinel = home.resolve("bin").resolve("aiken");
        Files.createDirectories(sentinel.getParent());
        Files.createSymbolicLink(sentinel, Path.of(SENTINEL_TARGET));

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        serverPool = Executors.newFixedThreadPool(8);
        server.setExecutor(serverPool);
        server.createContext("/", this::handle);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/releases/download";

        shell = new RecordingShell();
    }

    @AfterEach
    void tearDown() throws Exception {
        server.stop(0);
        serverPool.shutdownNow();
        // J2: nothing under <home>/bin is created, removed or re-pointed
        assertEquals(Path.of(SENTINEL_TARGET), Files.readSymbolicLink(sentinel));
        try (Stream<Path> bin = Files.list(sentinel.getParent())) {
            assertEquals(List.of(sentinel), bin.toList());
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        hits.computeIfAbsent(path, p -> new AtomicInteger()).incrementAndGet();
        Route route = routes.get(path);
        try (exchange) {
            if (route == null) {
                exchange.sendResponseHeaders(404, -1);
            } else if (route.redirectTo() != null) {
                exchange.getResponseHeaders().add("Location", route.redirectTo());
                exchange.sendResponseHeaders(302, -1);
            } else {
                exchange.sendResponseHeaders(200, route.body().length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(route.body());
                }
            }
        }
    }

    private int totalHits() {
        return hits.values().stream().mapToInt(AtomicInteger::get).sum();
    }

    private int hitsEndingWith(String suffix) {
        return hits.entrySet().stream()
                .filter(e -> e.getKey().endsWith(suffix))
                .mapToInt(e -> e.getValue().get())
                .sum();
    }

    private AikenToolchain toolchain() {
        return new AikenToolchain(shell, home.toString(), baseUrl, 60);
    }

    private static AikenReleaseAsset assetFor(String tag) throws CompilationException {
        return AikenReleaseAsset.resolve(tag, System.getProperty("os.name"), System.getProperty("os.arch"));
    }

    private Path layoutBinary(String tag) throws CompilationException {
        Path binary = versions.resolve(tag);
        for (String segment : assetFor(tag).getBinarySegments()) {
            binary = binary.resolve(segment);
        }
        return binary.toAbsolutePath().normalize();
    }

    /** tar -czf of a staged tree whose top-level entry is the first binary segment. */
    private byte[] archive(String tag, String binaryContent) throws Exception {
        List<String> segments = assetFor(tag).getBinarySegments();
        Path stage = Files.createTempDirectory(tmp, "stage-");
        Path binary = stage;
        for (String segment : segments) {
            binary = binary.resolve(segment);
        }
        Files.createDirectories(binary.getParent());
        Files.writeString(binary, binaryContent);
        assertTrue(binary.toFile().setExecutable(true));
        Path out = Files.createTempFile(tmp, "fixture-", ".tar.gz");
        Process tar = new ProcessBuilder("tar", "-czf", out.toString(), "-C", stage.toString(), segments.get(0))
                .redirectErrorStream(true)
                .start();
        tar.getInputStream().transferTo(OutputStream.nullOutputStream());
        assertTrue(tar.waitFor(60, TimeUnit.SECONDS));
        assertEquals(0, tar.exitValue());
        return Files.readAllBytes(out);
    }

    private static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private String assetPath(String tag) throws CompilationException {
        return "/releases/download/" + tag + "/" + assetFor(tag).getAssetName();
    }

    /** Serves the asset through a 302, as github.com does, plus its sidecar. */
    private void serveCargoDist(String tag, byte[] archive, String sidecarHex) throws CompilationException {
        String asset = assetFor(tag).getAssetName();
        String blob = "/blob/" + tag + "/" + asset;
        routes.put(assetPath(tag), new Route(null, blob));
        routes.put(blob, new Route(archive, null));
        routes.put(assetPath(tag) + ".sha256",
                new Route((sidecarHex + " *" + asset + "\n").getBytes(StandardCharsets.US_ASCII), null));
    }

    private void assertNoDownloadDirs() throws IOException {
        if (!Files.exists(versions)) {
            return;
        }
        try (Stream<Path> entries = Files.list(versions)) {
            List<Path> leftovers = entries
                    .filter(p -> p.getFileName().toString().startsWith(".download-"))
                    .toList();
            assertEquals(List.of(), leftovers);
        }
    }

    private void assertNoTar() {
        assertFalse(shell.execs.stream().anyMatch(argv -> argv.get(0).equals("tar")), "tar exec: " + shell.execs);
    }

    @Test
    public void presentVersionMakesNoRequestAndNoExec() throws Exception {
        byte[] archive = archive(CARGO_TAG, FIXTURE_BINARY);
        serveCargoDist(CARGO_TAG, archive, sha256(archive));
        Path binary = layoutBinary(CARGO_TAG);
        Files.createDirectories(binary.getParent());
        Files.writeString(binary, "preinstalled");

        Path resolved = toolchain().ensureInstalled(CARGO_TAG);

        assertEquals(binary, resolved);
        assertTrue(resolved.isAbsolute());
        assertEquals("preinstalled", Files.readString(resolved));
        assertEquals(0, totalHits(), "requests: " + hits);
        assertEquals(List.of(), shell.execs);
    }

    @Test
    public void absentCargoDistDownloadsVerifiesAndInstallsOnce() throws Exception {
        byte[] archive = archive(CARGO_TAG, FIXTURE_BINARY);
        serveCargoDist(CARGO_TAG, archive, sha256(archive).toUpperCase());
        AikenToolchain toolchain = toolchain();

        Path resolved = toolchain.ensureInstalled(CARGO_TAG);

        Path binary = layoutBinary(CARGO_TAG);
        assertEquals(binary, resolved);
        assertTrue(Files.isRegularFile(resolved, LinkOption.NOFOLLOW_LINKS));
        assertEquals(FIXTURE_BINARY, Files.readString(resolved));
        String asset = assetFor(CARGO_TAG).getAssetName();
        assertEquals(Map.of(
                assetPath(CARGO_TAG), 1,
                "/blob/" + CARGO_TAG + "/" + asset, 1,
                assetPath(CARGO_TAG) + ".sha256", 1), snapshotHits());
        assertEquals(1, shell.execs.size(), "execs: " + shell.execs);
        assertEquals("tar", shell.execs.get(0).get(0));
        assertNoDownloadDirs();

        int before = totalHits();
        int execsBefore = shell.execs.size();
        assertEquals(binary, toolchain.ensureInstalled(CARGO_TAG));
        assertEquals(before, totalHits(), "second call made requests: " + hits);
        assertEquals(execsBefore, shell.execs.size());
    }

    @Test
    public void sidecarMismatchRefusesAndCleansUp() throws Exception {
        byte[] archive = archive(CARGO_TAG, FIXTURE_BINARY);
        serveCargoDist(CARGO_TAG, archive, "0".repeat(64));

        CompilationException e = assertThrows(CompilationException.class,
                () -> toolchain().ensureInstalled(CARGO_TAG));

        assertTrue(e.getMessage().contains("SHA-256 mismatch"), e.getMessage());
        assertFalse(Files.exists(layoutBinary(CARGO_TAG), LinkOption.NOFOLLOW_LINKS));
        assertNoDownloadDirs();
        assertNoTar();
    }

    @Test
    public void missingReleaseNamesRequestedUrlAndStatus() throws Exception {
        String asset = assetFor(CARGO_TAG).getAssetName();
        // the asset redirects to a blob that is not there
        routes.put(assetPath(CARGO_TAG), new Route(null, "/blob/signed-secret/" + asset));

        CompilationException e = assertThrows(CompilationException.class,
                () -> toolchain().ensureInstalled(CARGO_TAG));

        assertEquals("Failed to download " + baseUrl + "/" + CARGO_TAG + "/" + asset + ": HTTP 404", e.getMessage());
        assertFalse(e.getMessage().contains("signed-secret"));
        assertFalse(Files.exists(layoutBinary(CARGO_TAG), LinkOption.NOFOLLOW_LINKS));
        assertNoDownloadDirs();
        assertNoTar();
    }

    @Test
    public void legacyPinnedTagNeverRequestsSidecar() throws Exception {
        String tag = "v1.0.0-alpha";
        AikenReleaseAsset asset = assetFor(tag);
        byte[] archive = archive(tag, FIXTURE_BINARY);
        // A matching sidecar is on offer: the pinned digest must win over it
        routes.put(assetPath(tag), new Route(archive, null));
        routes.put(assetPath(tag) + ".sha256", new Route(
                (sha256(archive) + " *" + asset.getAssetName() + "\n").getBytes(StandardCharsets.US_ASCII), null));

        assertThrows(CompilationException.class, () -> toolchain().ensureInstalled(tag));

        assertEquals(0, hitsEndingWith(".sha256"), "requests: " + hits);
        int expectedAssetHits = asset.getIntegrity() == AikenReleaseAsset.Integrity.PINNED ? 1 : 0;
        assertEquals(expectedAssetHits, totalHits(), "requests: " + hits);
        assertFalse(Files.exists(layoutBinary(tag), LinkOption.NOFOLLOW_LINKS));
        assertNoDownloadDirs();
        assertNoTar();
    }

    @Test
    public void legacyUnpinnedTagRefusedWithoutRequest() throws Exception {
        String tag = "v1.0.9-alpha";
        byte[] archive = archive(tag, FIXTURE_BINARY);
        routes.put(assetPath(tag), new Route(archive, null));
        routes.put(assetPath(tag) + ".sha256", new Route(
                (sha256(archive) + " *x\n").getBytes(StandardCharsets.US_ASCII), null));

        assertThrows(CompilationException.class, () -> toolchain().ensureInstalled(tag));

        assertEquals(0, totalHits(), "requests: " + hits);
        assertFalse(Files.exists(versions.resolve(tag), LinkOption.NOFOLLOW_LINKS));
        assertNoDownloadDirs();
        assertNoTar();
    }

    @Test
    public void plantedRaceUsesTheWinnersInstall() throws Exception {
        byte[] archive = archive(CARGO_TAG, FIXTURE_BINARY);
        serveCargoDist(CARGO_TAG, archive, sha256(archive));
        Path binary = layoutBinary(CARGO_TAG);
        // Another installer finishes between our extraction and our rename
        shell.afterExec = argv -> {
            Files.createDirectories(binary.getParent());
            Files.writeString(binary, "planted");
        };

        Path resolved = toolchain().ensureInstalled(CARGO_TAG);

        assertEquals(binary, resolved);
        assertEquals("planted", Files.readString(resolved));
        assertNoDownloadDirs();
    }

    @Test
    public void concurrentInstallsOfOneTagAgree() throws Exception {
        byte[] archive = archive(CARGO_TAG, FIXTURE_BINARY);
        serveCargoDist(CARGO_TAG, archive, sha256(archive));
        AikenToolchain toolchain = toolchain();
        // Both extract before either renames, so one of them must collide
        CyclicBarrier extracted = new CyclicBarrier(2);
        shell.afterExec = argv -> {
            try {
                extracted.await(30, TimeUnit.SECONDS);
            } catch (Exception e) {
                throw new IOException(e);
            }
        };
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Path>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    return toolchain.ensureInstalled(CARGO_TAG);
                }));
            }
            start.countDown();
            Path first = results.get(0).get(60, TimeUnit.SECONDS);
            Path second = results.get(1).get(60, TimeUnit.SECONDS);

            Path binary = layoutBinary(CARGO_TAG);
            assertEquals(binary, first);
            assertEquals(binary, second);
            assertTrue(Files.isRegularFile(binary, LinkOption.NOFOLLOW_LINKS));
            assertEquals(FIXTURE_BINARY, Files.readString(binary));
            assertEquals(2, shell.execs.size(), "both extracted: " + shell.execs);
            assertNoDownloadDirs();
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    public void nonCanonicalTagsRefusedBeforeAnyIo() throws Exception {
        byte[] archive = archive(CARGO_TAG, FIXTURE_BINARY);
        serveCargoDist(CARGO_TAG, archive, sha256(archive));
        AikenToolchain toolchain = toolchain();

        for (String tag : new String[]{"1.1.24", "--help", "v1.1.24+abc", "v1.1.24/../../bin", "", " v1.1.24"}) {
            assertThrows(CompilationException.class, () -> toolchain.ensureInstalled(tag), tag);
        }
        assertThrows(CompilationException.class, () -> toolchain.ensureInstalled(null));

        assertEquals(0, totalHits(), "requests: " + hits);
        assertEquals(List.of(), shell.execs);
        assertFalse(Files.exists(versions), "versions/ was created");
    }

    private Map<String, Integer> snapshotHits() {
        Map<String, Integer> snapshot = new HashMap<>();
        hits.forEach((path, count) -> snapshot.put(path, count.get()));
        return snapshot;
    }
}
