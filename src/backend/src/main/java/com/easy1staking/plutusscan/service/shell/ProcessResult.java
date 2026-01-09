package com.easy1staking.plutusscan.service.shell;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * DTO representing the result of a shell command execution
 */
@Getter
@AllArgsConstructor
public class ProcessResult {
    private final int exitCode;
    private final String stdout;
    private final String stderr;

    /**
     * Check if the process completed successfully (exit code 0)
     */
    public boolean isSuccess() {
        return exitCode == 0;
    }
}
