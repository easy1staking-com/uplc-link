package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.service.compiler.AikenCompilerService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class AikenVersionTest {

    @Test
    public void stripsBuildMetadata() throws Exception {
        assertEquals("v1.1.21", AikenCompilerService.toReleaseTag("v1.1.21+42babe5"));
        assertEquals("v1.1.22", AikenCompilerService.toReleaseTag("v1.1.22"));
        assertEquals("1.0.29", AikenCompilerService.toReleaseTag("1.0.29+e2fb28b"));
        assertEquals("v1.0.0-alpha", AikenCompilerService.toReleaseTag("v1.0.0-alpha+abc123"));
    }

    @Test
    public void rejectsNonVersions() {
        assertThrows(CompilationException.class,
                () -> AikenCompilerService.toReleaseTag("v1.1; rm -rf /"));
        assertThrows(CompilationException.class,
                () -> AikenCompilerService.toReleaseTag("$(curl evil)"));
        assertThrows(CompilationException.class,
                () -> AikenCompilerService.toReleaseTag(""));
    }
}
