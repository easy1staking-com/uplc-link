package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.service.compiler.AikenCompilerService;
import com.easy1staking.plutusscan.service.compiler.AikenReleaseAsset;
import com.easy1staking.plutusscan.service.compiler.AikenToolchain;
import com.easy1staking.plutusscan.service.shell.ProcessResult;
import com.easy1staking.plutusscan.service.shell.ShellCommandExecutor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * AikenCompilerService runs the compiler by the absolute path AikenToolchain
 * resolves, never through aikup. The shell is mocked (git is a no-op, a
 * build writes plutus.json) and the toolchain is real, on a temp home where
 * the version is already present and whose release URL refuses connections,
 * so any download attempt would fail the compile.
 */
public class AikenCompilerServiceTest {

    private static final String SOURCE_URL = "https://github.com/example/project";
    private static final String COMMIT = "0123456789abcdef0123456789abcdef01234567";
    private static final String PLUTUS_JSON = "{\"preamble\":{\"title\":\"fake\"}}";

    @TempDir
    Path tmp;

    private Path aikenHome;
    private final List<List<String>> argvs = Collections.synchronizedList(new ArrayList<>());
    private AikenCompilerService service;

    @BeforeEach
    void setUp() throws Exception {
        aikenHome = tmp.resolve("aiken-home");
        Path buildBase = tmp.resolve("builds");

        ShellCommandExecutor shell = mock(ShellCommandExecutor.class);
        when(shell.execute(anyList(), any(Path.class), anyLong())).thenAnswer(invocation -> {
            List<String> argv = List.copyOf(invocation.getArgument(0));
            Path workingDir = invocation.getArgument(1);
            argvs.add(argv);
            if (argv.size() > 1 && argv.get(1).equals("build")) {
                Files.writeString(workingDir.resolve("plutus.json"), PLUTUS_JSON);
            }
            return new ProcessResult(0, "", "");
        });

        AikenToolchain toolchain = new AikenToolchain(shell, aikenHome.toString(), "http://127.0.0.1:9", 30);
        service = new AikenCompilerService(shell, toolchain);
        ReflectionTestUtils.setField(service, "tempDirBase", buildBase.toString());
        ReflectionTestUtils.setField(service, "buildTimeoutSeconds", 30L);
    }

    /** Plants a regular file at the layout path for the tag on this platform. */
    private Path plant(String tag) throws Exception {
        AikenReleaseAsset asset = AikenReleaseAsset.resolve(
                tag, System.getProperty("os.name"), System.getProperty("os.arch"));
        Path binary = aikenHome.resolve("versions").resolve(tag);
        for (String segment : asset.getBinarySegments()) {
            binary = binary.resolve(segment);
        }
        Files.createDirectories(binary.getParent());
        Files.writeString(binary, "#!/bin/sh\nexit 0\n");
        return binary.toAbsolutePath().normalize();
    }

    private List<String> buildArgv() {
        List<List<String>> builds = argvs.stream()
                .filter(argv -> argv.size() > 1 && argv.get(1).equals("build"))
                .toList();
        assertEquals(1, builds.size(), "exactly one build command: " + argvs);
        return builds.get(0);
    }

    private void assertNoAikup() {
        for (List<String> argv : argvs) {
            assertFalse(argv.stream().anyMatch(arg -> arg.contains("aikup")), "aikup in argv: " + argv);
        }
    }

    @Test
    public void buildsWithAbsolutePresentBinaryAndNoEnv() throws Exception {
        Path binary = plant("v1.1.24");

        String json = service.compile(SOURCE_URL, COMMIT, "v1.1.24+bacbeb3", null, "");

        assertEquals(PLUTUS_JSON, json);
        assertNoAikup();
        List<String> build = buildArgv();
        assertTrue(Path.of(build.get(0)).isAbsolute(), "argv[0] is absolute: " + build);
        assertEquals(binary.toString(), build.get(0));
        assertEquals(List.of("build"), build.subList(1, build.size()));
    }

    @Test
    public void buildsWithAbsolutePresentBinaryAndPreviewEnv() throws Exception {
        Path binary = plant("v1.1.24");

        String json = service.compile(SOURCE_URL, COMMIT, "v1.1.24", null, "preview");

        assertEquals(PLUTUS_JSON, json);
        assertNoAikup();
        List<String> build = buildArgv();
        assertEquals(binary.toString(), build.get(0));
        assertEquals(List.of("build", "--env", "preview"), build.subList(1, build.size()));
    }

    @Test
    public void unprefixedVersionResolvesUnderCanonicalTag() throws Exception {
        Path binary = plant("v9.9.1");

        service.compile(SOURCE_URL, COMMIT, "9.9.1+abc", null, null);

        assertNoAikup();
        List<String> build = buildArgv();
        assertEquals(binary.toString(), build.get(0));
        Path versionDir = aikenHome.resolve("versions").resolve("v9.9.1").toAbsolutePath().normalize();
        assertTrue(Path.of(build.get(0)).startsWith(versionDir), "argv[0] under " + versionDir + ": " + build);
    }

    @Test
    public void emptyVersionKeepsPathAiken() throws Exception {
        String json = service.compile(SOURCE_URL, COMMIT, "", null, null);

        assertEquals(PLUTUS_JSON, json);
        assertNoAikup();
        assertEquals(List.of("aiken", "build"), buildArgv());
    }
}
