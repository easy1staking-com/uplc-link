package com.easy1staking.plutusscan.util;

import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.model.PlutusScanRequest;
import com.easy1staking.plutusscan.service.compiler.AikenCompilerService;

import java.util.Optional;

/**
 * Semantic validation of parsed on-chain verification requests.
 *
 * On-chain metadata is attacker-controlled (label-1984 txs can be submitted
 * directly, bypassing any frontend), so everything is validated here at the
 * ingest boundary.
 */
public final class RequestValidator {

    public static final int MAX_SOURCE_URL_LENGTH = 2000;
    public static final int MAX_SOURCE_PATH_LENGTH = 1000;
    public static final int MAX_COMPILER_VERSION_LENGTH = 100;
    public static final int MAX_ENV_LENGTH = 64;

    // Aiken env module name (snake_case module identifier); also guarantees the
    // value can never be interpreted as a CLI option when passed to aiken build
    private static final String ENV_PATTERN = "[a-z][a-z0-9_]*";

    private RequestValidator() {
    }

    /**
     * @return the rejection reason, or empty when the request is acceptable
     */
    public static Optional<String> validate(PlutusScanRequest request) {
        var sourceUrl = request.sourceUrl();
        if (sourceUrl == null || sourceUrl.isBlank()) {
            return Optional.of("Missing source URL");
        }
        if (sourceUrl.length() > MAX_SOURCE_URL_LENGTH) {
            return Optional.of("Source URL too long (" + sourceUrl.length() + " chars)");
        }
        if (SourceUrlParser.parse(sourceUrl).isEmpty()) {
            return Optional.of("Invalid source URL format: " + sourceUrl);
        }

        if (!SourceUrlParser.isValidCommitHash(request.commitHash())) {
            return Optional.of("Invalid commit hash (must be 40 or 64 hex chars)");
        }

        var version = request.compilerVersion();
        if (version != null && !version.isEmpty()) {
            if (version.length() > MAX_COMPILER_VERSION_LENGTH) {
                return Optional.of("Compiler version too long");
            }
            if (request.compilerType() == CompilerType.AIKEN) {
                try {
                    AikenCompilerService.toReleaseTag(version);
                } catch (Exception e) {
                    return Optional.of("Invalid Aiken version: " + version);
                }
            } else if (!version.matches("[A-Za-z0-9.+\\-]+")) {
                return Optional.of("Invalid compiler version: " + version);
            }
        }

        var env = request.env();
        if (env != null && !env.isEmpty()) {
            if (env.length() > MAX_ENV_LENGTH) {
                return Optional.of("Environment too long (" + env.length() + " chars)");
            }
            if (!env.matches(ENV_PATTERN)) {
                return Optional.of("Invalid environment: " + env);
            }
        }

        var sourcePath = request.sourcePath();
        if (sourcePath != null && !sourcePath.isEmpty()) {
            if (sourcePath.length() > MAX_SOURCE_PATH_LENGTH) {
                return Optional.of("Source path too long");
            }
            if (sourcePath.startsWith("/") || sourcePath.contains("\\")
                    || !sourcePath.matches("[A-Za-z0-9._/\\-]+")) {
                return Optional.of("Invalid source path: " + sourcePath);
            }
            for (String segment : sourcePath.split("/")) {
                if (segment.equals("..")) {
                    return Optional.of("Source path must not traverse outside the repository: " + sourcePath);
                }
            }
        }

        return Optional.empty();
    }
}
