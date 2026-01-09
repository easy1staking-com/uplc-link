package com.easy1staking.plutusscan.service.plutusjson;

import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.exception.PlutusJsonParseException;

import java.util.List;

/**
 * Interface for parsing plutus.json files
 * Different implementations handle different Aiken versions
 */
public interface PlutusJsonParser {

    /**
     * Parse plutus.json content and extract validators
     *
     * @param plutusJsonContent Raw JSON content from plutus.json
     * @return List of parsed validators
     * @throws PlutusJsonParseException If parsing fails
     */
    List<ParsedValidator> parse(String plutusJsonContent) throws PlutusJsonParseException;

    /**
     * Check if this parser supports the given Aiken version
     *
     * @param version Aiken version string (e.g., "v1.1.3")
     * @return true if this parser can handle the version
     */
    boolean supports(String version);
}
