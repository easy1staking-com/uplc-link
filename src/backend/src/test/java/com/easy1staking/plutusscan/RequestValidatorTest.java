package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.model.PlutusScanRequest;
import com.easy1staking.plutusscan.util.RequestValidator;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class RequestValidatorTest {

    private static final String VALID_COMMIT = "35f1a0d51c8663782ab052f869d5c82b756e8615";

    private static PlutusScanRequest request(String url, String commit, String version, String sourcePath) {
        return request(url, commit, version, sourcePath, null);
    }

    private static PlutusScanRequest request(String url, String commit, String version, String sourcePath, String env) {
        return PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl(url)
                .commitHash(commit)
                .compilerVersion(version)
                .sourcePath(sourcePath)
                .env(env)
                .parameters(Map.of())
                .build();
    }

    @Test
    public void acceptsWellFormedRequest() {
        assertTrue(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21+42babe5", "contracts/sub")).isEmpty());
        assertTrue(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, null, null)).isEmpty());
    }

    @Test
    public void rejectsBadInputs() {
        // bad URL
        assertFalse(RequestValidator.validate(
                request("not-a-url", VALID_COMMIT, "v1.1.21", null)).isEmpty());
        // bad commit
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", "zzzz", "v1.1.21", null)).isEmpty());
        // bad version (shell metacharacters)
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1; rm -rf /", null)).isEmpty());
        // traversal source path
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", "../../etc")).isEmpty());
        // absolute source path
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", "/etc")).isEmpty());
        // oversized URL
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/" + "a".repeat(2100), VALID_COMMIT, "v1.1.21", null)).isEmpty());
    }

    @Test
    public void validatesEnv() {
        // valid env module names
        assertTrue(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "mainnet")).isEmpty());
        assertTrue(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "preview_v2")).isEmpty());
        // null/empty = built without --env
        assertTrue(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, null)).isEmpty());
        assertTrue(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "")).isEmpty());
        // must start with a lowercase letter
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "1mainnet")).isEmpty());
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "Mainnet")).isEmpty());
        // no option injection / shell metacharacters
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "--help")).isEmpty());
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "env; rm -rf /")).isEmpty());
        // oversized
        assertFalse(RequestValidator.validate(
                request("https://github.com/org/repo", VALID_COMMIT, "v1.1.21", null, "a".repeat(65))).isEmpty());
    }
}
