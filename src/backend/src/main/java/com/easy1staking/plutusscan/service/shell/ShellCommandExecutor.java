package com.easy1staking.plutusscan.service.shell;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Service for executing external commands with proper error handling and timeout support
 */
@Component
@Slf4j
public class ShellCommandExecutor {

    /** Cap on retained stdout/stderr so a noisy or hostile child can't exhaust the heap. */
    private static final int MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

    /**
     * Execute a command in the specified working directory.
     *
     * Arguments are passed directly to the process — no shell is involved, so
     * argument values are never subject to shell interpretation. Inputs that
     * originate on-chain (URLs, versions, paths) must still be validated, but
     * cannot inject commands through this path.
     *
     * @param command Command and arguments, one element each
     * @param workingDir Working directory for the command
     * @param timeoutSeconds Maximum execution time in seconds
     * @return ProcessResult containing exit code, stdout, and stderr
     * @throws IOException If command execution fails or times out
     */
    public ProcessResult execute(List<String> command, Path workingDir, long timeoutSeconds) throws IOException {
        log.debug("Executing command: {} in directory: {}", command, workingDir);

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(workingDir.toFile());

        // Set PATH to include ~/.aiken/bin for aikup
        Map<String, String> env = pb.environment();
        String path = env.get("PATH");
        String aikenBinPath = System.getProperty("user.home") + "/.aiken/bin";
        env.put("PATH", aikenBinPath + ":" + path);

        log.debug("PATH environment: {}", env.get("PATH"));

        Process process = pb.start();

        // Drain both pipes on separate threads so a child that fills one pipe
        // buffer while we read the other can't deadlock, and so the timeout
        // below actually arms instead of us blocking indefinitely in readLine().
        StreamGobbler stdout = new StreamGobbler(process.getInputStream());
        StreamGobbler stderr = new StreamGobbler(process.getErrorStream());
        Thread stdoutThread = new Thread(stdout, "proc-stdout");
        Thread stderrThread = new Thread(stderr, "proc-stderr");
        stdoutThread.setDaemon(true);
        stderrThread.setDaemon(true);
        stdoutThread.start();
        stderrThread.start();

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
            // destroy closes the pipes, letting the gobblers reach EOF and exit
            joinQuietly(stdoutThread);
            joinQuietly(stderrThread);
            throw new IOException(String.format(
                "Command timed out after %d seconds: %s", timeoutSeconds, command));
        }

        // Process has exited; wait for the gobblers to finish reading buffered output
        joinQuietly(stdoutThread);
        joinQuietly(stderrThread);

        int exitCode = process.exitValue();

        log.debug("Command completed with exit code: {}", exitCode);

        if (exitCode != 0) {
            log.warn("Command failed with exit code {}. Stderr: {}", exitCode, stderr.getOutput());
            throw new IOException(String.format(
                "Command failed with exit code %d: %s\nStderr: %s",
                exitCode, command, stderr.getOutput()));
        }

        return new ProcessResult(exitCode, stdout.getOutput(), stderr.getOutput());
    }

    private static void joinQuietly(Thread thread) {
        try {
            thread.join(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Reads a process stream to EOF on its own thread. Always drains to the end
     * (so the child never blocks on a full pipe) but stops retaining bytes once
     * {@link #MAX_OUTPUT_BYTES} is reached, bounding heap use for hostile output.
     */
    private static final class StreamGobbler implements Runnable {

        private final InputStream in;
        private final StringBuilder sb = new StringBuilder();
        private boolean truncated = false;

        StreamGobbler(InputStream in) {
            this.in = in;
        }

        @Override
        public void run() {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(in))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (sb.length() < MAX_OUTPUT_BYTES) {
                        sb.append(line).append("\n");
                    } else if (!truncated) {
                        truncated = true;
                        sb.append("\n[output truncated]\n");
                    }
                    // keep draining past the cap so the pipe never fills
                }
            } catch (IOException ignored) {
                // stream closed (e.g. process destroyed) — nothing more to read
            }
        }

        String getOutput() {
            return sb.toString();
        }
    }
}
