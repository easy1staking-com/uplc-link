package com.easy1staking.plutusscan.service.plutusjson;

import com.easy1staking.plutusscan.exception.CompilationException;
import com.easy1staking.plutusscan.exception.PlutusJsonParseException;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.service.compiler.AikenCompilerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Factory for obtaining the appropriate PlutusJsonParser based on compiler type and version
 */
@Component
@RequiredArgsConstructor
public class PlutusJsonParserFactory {

    private final List<PlutusJsonParser> parsers;

    /**
     * Get a parser that supports the given compiler type and version
     *
     * @param compilerType Compiler type (AIKEN, HELIOS, etc.)
     * @param version Compiler version (e.g., "v1.1.3")
     * @return Appropriate parser
     * @throws PlutusJsonParseException If no parser supports the version
     */
    public PlutusJsonParser getParser(CompilerType compilerType, String version) {
        if (compilerType != CompilerType.AIKEN) {
            throw new UnsupportedOperationException(
                "Only Aiken compiler is currently supported, got: " + compilerType);
        }

        // Normalise HERE, at the single point where parser selection funnels,
        // rather than inside each parser's supports(): a future parser cannot
        // then forget to do it. The raw value is still what the record claims,
        // so it — not the canonical form — goes in the error message.
        var canonical = canonicalise(version);

        return parsers.stream()
            .filter(parser -> parser.supports(canonical))
            .findFirst()
            .orElseThrow(() -> new PlutusJsonParseException(
                "No parser found for Aiken version: " + version));
    }

    /**
     * Strip semver build metadata before parser selection.
     *
     * Aiken's plutus.json preamble reports "v1.1.23+8949565", and a publisher
     * that copies `preamble.compiler.version` verbatim — which is the correct
     * thing to record — puts that whole string on chain. Every supports()
     * predicate uses an anchored String.matches(), so the "+<build>" tail made
     * the lookup miss on a version that was otherwise fully supported.
     *
     * Reuses AikenCompilerService.toReleaseTag, which already performs exactly
     * this normalisation for `aikup install` and for ingest validation — the
     * bug was that parser selection was the one call site not using it.
     *
     * Anything the canonicaliser rejects is passed through unchanged: null and
     * empty are meaningful to supports() (they select the v1.1+ default), and a
     * malformed version should fail as an unsupported version naming the value
     * actually submitted, not as a normalisation error.
     */
    private static String canonicalise(String version) {
        if (version == null || version.isEmpty()) {
            return version;
        }
        try {
            return AikenCompilerService.toReleaseTag(version);
        } catch (CompilationException e) {
            return version;
        }
    }
}
