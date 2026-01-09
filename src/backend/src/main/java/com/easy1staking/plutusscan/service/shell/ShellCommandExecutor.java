package com.easy1staking.plutusscan.service.shell;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Service for executing shell commands with proper error handling and timeout support
 */
@Component
@Slf4j
public class ShellCommandExecutor {

    /**
     * Execute a shell command in the specified working directory
     *
     * @param command Command to execute
     * @param workingDir Working directory for the command
     * @param timeoutSeconds Maximum execution time in seconds
     * @return ProcessResult containing exit code, stdout, and stderr
     * @throws IOException If command execution fails or times out
     */
    public ProcessResult execute(String command, Path workingDir, long timeoutSeconds) throws IOException {
        log.debug("Executing command: {} in directory: {}", command, workingDir);

        ProcessBuilder pb = new ProcessBuilder("sh", "-c", command);
        pb.directory(workingDir.toFile());

        // Set PATH to include ~/.aiken/bin for aikup
        Map<String, String> env = pb.environment();
        String path = env.get("PATH");
        String aikenBinPath = System.getProperty("user.home") + "/.aiken/bin";
        env.put("PATH", aikenBinPath + ":" + path);

        log.debug("PATH environment: {}", env.get("PATH"));

        Process process = pb.start();

        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();

        // Read stdout
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                stdout.append(line).append("\n");
            }
        }

        // Read stderr
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getErrorStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                stderr.append(line).append("\n");
            }
        }

        boolean finished;
        try {
            finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new IOException("Command execution interrupted", e);
        }

        if (!finished) {
            process.destroyForcibly();
            throw new IOException(String.format(
                "Command timed out after %d seconds: %s", timeoutSeconds, command));
        }

        int exitCode = process.exitValue();

        log.debug("Command completed with exit code: {}", exitCode);

        if (exitCode != 0) {
            log.warn("Command failed with exit code {}. Stderr: {}", exitCode, stderr.toString());
            throw new IOException(String.format(
                "Command failed with exit code %d: %s\nStderr: %s",
                exitCode, command, stderr.toString()));
        }

        return new ProcessResult(exitCode, stdout.toString(), stderr.toString());
    }
}
