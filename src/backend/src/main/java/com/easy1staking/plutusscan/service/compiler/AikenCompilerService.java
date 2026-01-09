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

/**
 * Compiler service for Aiken smart contracts
 * Handles git clone, aikup version installation, and aiken build
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AikenCompilerService implements CompilerService {

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

            // Clone repository
            log.info("Cloning {} (from {}) at commit {}", repoUrl, parsedUrl.getVcsType(), commitHash);
            shellExecutor.execute(
                String.format("git clone %s %s", repoUrl, repoDir),
                buildDir,
                buildTimeoutSeconds);

            shellExecutor.execute(
                String.format("git checkout %s", commitHash),
                repoDir,
                buildTimeoutSeconds);

            // Change to source path if specified
            Path workDir = repoDir;
            if (sourcePath != null && !sourcePath.isEmpty()) {
                workDir = repoDir.resolve(sourcePath);
                if (!Files.exists(workDir)) {
                    throw new CompilationException(
                        "Source path does not exist: " + sourcePath);
                }
                log.info("Using source path: {}", workDir);
            }

            // Install Aiken version if specified
            if (compilerVersion != null && !compilerVersion.isEmpty()) {
                log.info("Installing Aiken version: {}", compilerVersion);
                shellExecutor.execute(
                    String.format("aikup install %s", compilerVersion),
                    workDir,
                    buildTimeoutSeconds);
            }

            // Build with Aiken
            log.info("Building Aiken project in: {}", workDir);
            var buildResult = shellExecutor.execute(
                "aiken build",
                workDir,
                buildTimeoutSeconds);

            log.info("Build completed successfully");
            log.debug("Build output: {}", buildResult.getStdout());

            // Read plutus.json
            Path plutusJsonPath = workDir.resolve("plutus.json");
            if (!Files.exists(plutusJsonPath)) {
                throw new CompilationException(
                    "plutus.json not found after build. Build may have failed.");
            }

            String plutusJsonContent = Files.readString(plutusJsonPath);
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
}
