package com.easy1staking.plutusscan.service.compiler;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.service.shell.ShellCommandExecutor;
import com.easy1staking.plutusscan.util.SourceUrlParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.io.FileUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

/**
 * Compiler service for Aiken smart contracts
 * Handles git clone, aikup version installation, and aiken build
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AikenCompilerService implements CompilerService {

    private static final long MAX_PLUTUS_JSON_BYTES = 10L * 1024 * 1024;

    private final ShellCommandExecutor shellExecutor;

    @Value("${verification.build-timeout-seconds:300}")
    private long buildTimeoutSeconds;

    @Value("${verification.temp-dir:/tmp/plutus-scan-builds}")
    private String tempDirBase;

    @Override
    public String compile(String sourceUrl, String commitHash,
                         String compilerVersion, String sourcePath)
            throws CompilationException {

        Path buildDir = null;
        try {
            // Parse source URL
            var parsedUrl = SourceUrlParser.parse(sourceUrl)
                    .orElseThrow(() -> new CompilationException("Invalid source URL: " + sourceUrl));

            // Create base temp directory if it doesn't exist
            Path tempBase = Paths.get(tempDirBase);
            if (!Files.exists(tempBase)) {
                Files.createDirectories(tempBase);
                log.info("Created temp directory base: {}", tempBase);
            }

            // Create temporary directory for this build
            buildDir = Files.createTempDirectory(tempBase, "aiken-build-");
            log.info("Created build directory: {}", buildDir);

            String repoUrl = parsedUrl.getCloneUrl();
            Path repoDir = buildDir.resolve("repo");

            // Defense in depth: entity values may predate ingest validation
            if (!SourceUrlParser.isValidCommitHash(commitHash)) {
                throw new CompilationException("Invalid commit hash: " + commitHash);
            }

            // Fetch just the requested commit (bounds clone cost for huge
            // repos); falls back to a full clone for hosts that don't allow
            // fetching unadvertised objects by hash
            log.info("Fetching {} (from {}) at commit {}", repoUrl, parsedUrl.getVcsType(), commitHash);
            try {
                Files.createDirectories(repoDir);
                shellExecutor.execute(List.of("git", "init", "--quiet"), repoDir, buildTimeoutSeconds);
                shellExecutor.execute(List.of("git", "remote", "add", "origin", repoUrl), repoDir, buildTimeoutSeconds);
                shellExecutor.execute(List.of("git", "fetch", "--depth", "1", "origin", commitHash), repoDir, buildTimeoutSeconds);
                shellExecutor.execute(List.of("git", "checkout", "--quiet", "FETCH_HEAD"), repoDir, buildTimeoutSeconds);
            } catch (IOException e) {
                log.info("Shallow fetch failed ({}), falling back to full clone", e.getMessage());
                FileUtils.deleteDirectory(repoDir.toFile());
                shellExecutor.execute(List.of("git", "clone", "--", repoUrl, repoDir.toString()), buildDir, buildTimeoutSeconds);
                shellExecutor.execute(List.of("git", "checkout", commitHash), repoDir, buildTimeoutSeconds);
            }

            Path realRepoDir = repoDir.toRealPath();

            // Change to source path if specified — resolved path (symlinks
            // included) must stay inside the cloned repository
            Path workDir = repoDir;
            if (sourcePath != null && !sourcePath.isEmpty()) {
                workDir = repoDir.resolve(sourcePath);
                if (!Files.exists(workDir)) {
                    throw new CompilationException(
                        "Source path does not exist: " + sourcePath);
                }
                if (!workDir.toRealPath().startsWith(realRepoDir)) {
                    throw new CompilationException(
                        "Source path escapes the repository: " + sourcePath);
                }
                log.info("Using source path: {}", workDir);
            }

            // Install Aiken version if specified
            if (compilerVersion != null && !compilerVersion.isEmpty()) {
                String releaseTag = toReleaseTag(compilerVersion);
                log.info("Installing Aiken version: {} (release tag: {})", compilerVersion, releaseTag);
                shellExecutor.execute(
                    List.of("aikup", "install", releaseTag),
                    workDir,
                    buildTimeoutSeconds);
            }

            // Build with Aiken
            log.info("Building Aiken project in: {}", workDir);
            var buildResult = shellExecutor.execute(
                List.of("aiken", "build"),
                workDir,
                buildTimeoutSeconds);

            log.info("Build completed successfully");
            log.debug("Build output: {}", buildResult.getStdout());

            // Read plutus.json — symlink-safe: a hostile repo could ship
            // plutus.json as a symlink to an arbitrary server file, which
            // would otherwise end up cached and served through the API
            Path plutusJsonPath = workDir.resolve("plutus.json");
            if (!Files.exists(plutusJsonPath)) {
                throw new CompilationException(
                    "plutus.json not found after build. Build may have failed.");
            }
            Path realPlutusJson = plutusJsonPath.toRealPath();
            if (!realPlutusJson.startsWith(realRepoDir)) {
                throw new CompilationException("plutus.json resolves outside the repository");
            }
            long plutusJsonSize = Files.size(realPlutusJson);
            if (plutusJsonSize > MAX_PLUTUS_JSON_BYTES) {
                throw new CompilationException("plutus.json too large: " + plutusJsonSize + " bytes");
            }

            String plutusJsonContent = Files.readString(realPlutusJson);
            log.info("Successfully read plutus.json ({} bytes)", plutusJsonContent.length());

            return plutusJsonContent;

        } catch (IOException e) {
            throw new CompilationException("IO error during compilation: " + e.getMessage(), e);
        } finally {
            // Cleanup temporary directory
            if (buildDir != null) {
                try {
                    FileUtils.deleteDirectory(buildDir.toFile());
                    log.debug("Cleaned up build directory: {}", buildDir);
                } catch (IOException e) {
                    log.warn("Failed to cleanup build directory: {}", buildDir, e);
                }
            }
        }
    }

    @Override
    public CompilerType getCompilerType() {
        return CompilerType.AIKEN;
    }

    /**
     * Convert a compiler version to an installable aikup release tag.
     *
     * Aiken reports its version with build metadata (e.g. "v1.1.21+42babe5",
     * as found in plutus.json preambles and on-chain metadata), but GitHub
     * releases are tagged without it (e.g. "v1.1.21"). aikup resolves release
     * tags, so the "+<build>" suffix must be stripped. Also validates the
     * result so arbitrary metadata content can't reach the shell.
     */
    public static String toReleaseTag(String compilerVersion) throws CompilationException {
        String tag = compilerVersion.trim();
        int buildMetaIdx = tag.indexOf('+');
        if (buildMetaIdx >= 0) {
            tag = tag.substring(0, buildMetaIdx);
        }
        if (!tag.matches("v?\\d+\\.\\d+\\.\\d+(-[A-Za-z0-9.]+)?")) {
            throw new CompilationException("Invalid Aiken version: " + compilerVersion);
        }
        return tag;
    }
}
