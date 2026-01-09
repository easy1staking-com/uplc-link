package com.easy1staking.plutusscan.service.plutusjson;

import com.easy1staking.plutusscan.exception.PlutusJsonParseException;
import com.easy1staking.plutusscan.model.CompilerType;
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

        return parsers.stream()
            .filter(parser -> parser.supports(version))
            .findFirst()
            .orElseThrow(() -> new PlutusJsonParseException(
                "No parser found for Aiken version: " + version));
    }
}
