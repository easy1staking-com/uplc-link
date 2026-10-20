package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.service.shell.ShellCommandExecutor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The child process inherits the parent environment unchanged: nothing is
 * prepended to PATH, so no build can pick up a bare binary from a directory
 * the backend added.
 */
public class ShellCommandExecutorTest {

    @TempDir
    Path tmp;

    @Test
    public void childInheritsParentPathUnchanged() throws Exception {
        var result = new ShellCommandExecutor().execute(List.of("printenv", "PATH"), tmp, 10);

        assertEquals(System.getenv("PATH"), result.getStdout().strip());
    }
}
