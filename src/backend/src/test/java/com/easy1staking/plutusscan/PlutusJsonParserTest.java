package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.exception.PlutusJsonParseException;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.service.plutusjson.AikenV1_0_Parser;
import com.easy1staking.plutusscan.service.plutusjson.AikenV1_1_Parser;
import com.easy1staking.plutusscan.service.plutusjson.PlutusJsonParserFactory;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ⚠ BEFORE ADDING A CASE HERE, READ THIS.
 *
 * Every version string in the original version of this suite was already
 * normalised — "v1.1.0", "v1.1.3", "1.1.0". That is what OUR OWN FRONTEND
 * emits: it calls toAikenReleaseTag() and strips semver build metadata before
 * submitting. Aiken itself reports "v1.1.23+8949565" in plutus.json's
 * preamble.compiler.version, and that is what an external publisher who copies
 * the field verbatim puts on chain.
 *
 * So this suite and the frontend were THE SAME INSTRUMENT, and an instrument
 * cannot disagree with itself. The suite could not have caught a bug that only
 * a non-frontend client can trigger — and it did not: a real CIP-113 record
 * with a "+build" suffix failed on preview (tx 20da8206…, 2026-08-26) against
 * a predicate this file asserted was correct.
 *
 * ⇒ A TEST SUITE THAT MIRRORS YOUR OWN CLIENT VERIFIES THE ROUND TRIP, NOT THE
 *   CONTRACT. When you add a case, ask what an external publisher would send —
 *   the raw artefact field, not what our client makes of it first.
 */
class PlutusJsonParserTest {

    @Test
    void testAikenV1_0_ParserSupportsVersion() {
        AikenV1_0_Parser parser = new AikenV1_0_Parser();

        // Should support v1.0.x-alpha versions
        assertTrue(parser.supports("v1.0.26-alpha"));
        assertTrue(parser.supports("v1.0.0-alpha"));
        assertTrue(parser.supports("1.0.26-alpha"));

        // Should NOT support v1.1.x or later
        assertFalse(parser.supports("v1.1.0"));
        assertFalse(parser.supports("v1.1.3"));
        assertFalse(parser.supports("v1.2.0"));
        assertFalse(parser.supports(null));
        assertFalse(parser.supports(""));
    }

    @Test
    void testAikenV1_1_ParserSupportsVersion() {
        AikenV1_1_Parser parser = new AikenV1_1_Parser();

        // Should support v1.1.x and later
        assertTrue(parser.supports("v1.1.0"));
        assertTrue(parser.supports("v1.1.3"));
        assertTrue(parser.supports("v1.2.0"));
        assertTrue(parser.supports("1.1.0"));
        assertTrue(parser.supports(null)); // Default to v1.1+
        assertTrue(parser.supports("")); // Default to v1.1+

        // Should NOT support v1.0.x
        assertFalse(parser.supports("v1.0.26"));
        assertFalse(parser.supports("v1.0.0-alpha"));
    }

    /**
     * The predicates are anchored (String.matches), so they reject build
     * metadata outright. That is FINE and deliberate: normalisation is the
     * factory's job, not each parser's. These assertions pin that division —
     * if someone later moves stripping into the parsers, these go red and the
     * factory test below stays green, which is the signal that the choke point
     * has been abandoned.
     */
    @Test
    void parsersThemselvesDoNotStripBuildMetadata() {
        assertFalse(new AikenV1_1_Parser().supports("v1.1.23+8949565"));
        assertFalse(new AikenV1_1_Parser().supports("v1.1.22+39d6b04"));
        assertFalse(new AikenV1_0_Parser().supports("v1.1.23+8949565"));
    }

    /**
     * ⚑ THE ASSERTION THAT PINS THE FIX.
     *
     * Regression for tx 20da8206… (preview, 2026-08-26): a CIP-113 record
     * carrying Aiken's own "v1.1.23+8949565" reached FAILED with
     * "No parser found for Aiken version: v1.1.23+8949565", even though
     * v1.1.23 is inside AikenV1_1_Parser's supported range — the "+build" tail
     * alone made the anchored predicate miss.
     *
     * Fails on the unmodified factory (reproduced first in a standalone JDK 21
     * harness before the fix existed, so the red is measured, not assumed).
     */
    @Test
    void factoryStripsBuildMetadataBeforeSelectingAParser() {
        var factory = new PlutusJsonParserFactory(
            List.of(new AikenV1_0_Parser(), new AikenV1_1_Parser()));

        // The exact string from the failing record
        assertInstanceOf(AikenV1_1_Parser.class,
            factory.getParser(CompilerType.AIKEN, "v1.1.23+8949565"));

        // Not specific to v1.1.23 — any version with build metadata missed
        assertInstanceOf(AikenV1_1_Parser.class,
            factory.getParser(CompilerType.AIKEN, "v1.1.22+39d6b04"));
        assertInstanceOf(AikenV1_1_Parser.class,
            factory.getParser(CompilerType.AIKEN, "v1.1.21+42babe5"));

        // Alphas route to the v1.0 parser, suffix or not
        assertInstanceOf(AikenV1_0_Parser.class,
            factory.getParser(CompilerType.AIKEN, "v1.0.26-alpha"));
        assertInstanceOf(AikenV1_0_Parser.class,
            factory.getParser(CompilerType.AIKEN, "v1.0.26-alpha+9f1c2ab"));

        // Unchanged behaviour: bare versions still resolve as before
        assertInstanceOf(AikenV1_1_Parser.class,
            factory.getParser(CompilerType.AIKEN, "v1.1.23"));
        assertInstanceOf(AikenV1_1_Parser.class,
            factory.getParser(CompilerType.AIKEN, null));
    }

    /**
     * A version that is malformed rather than merely suffixed must still fail
     * as an unsupported version, and the message must name the value the record
     * actually claimed — not a canonical form the submitter never wrote.
     */
    @Test
    void unparseableVersionFailsNamingTheSubmittedValue() {
        var factory = new PlutusJsonParserFactory(
            List.of(new AikenV1_0_Parser(), new AikenV1_1_Parser()));

        var ex = assertThrows(PlutusJsonParseException.class,
            () -> factory.getParser(CompilerType.AIKEN, "not-a-version"));
        assertTrue(ex.getMessage().contains("not-a-version"));

        // v2.x is out of every parser's range today — a known, separate gap
        // (PLAN T-212), asserted so the change is visible when it is closed.
        assertThrows(PlutusJsonParseException.class,
            () -> factory.getParser(CompilerType.AIKEN, "v2.0.0"));
    }

    @Test
    void testAikenV1_0_ParserParsesCorrectly() throws Exception {
        AikenV1_0_Parser parser = new AikenV1_0_Parser();

        // Sample v1.0.x plutus.json with 2-part title format
        String plutusJson = """
            {
              "preamble": {
                "title": "test",
                "plutusVersion": "v2",
                "compiler": {
                  "name": "Aiken",
                  "version": "v1.0.26-alpha"
                }
              },
              "validators": [
                {
                  "title": "oracle.spend",
                  "hash": "test_hash",
                  "compiledCode": "test_code"
                }
              ]
            }
            """;

        List<ParsedValidator> validators = parser.parse(plutusJson);

        assertEquals(1, validators.size());
        ParsedValidator validator = validators.get(0);
        assertEquals("oracle", validator.getScriptName());
        assertEquals("oracle", validator.getModuleName());
        assertEquals("oracle", validator.getValidatorName());
        assertEquals(1, validator.getPurposes().size());
        assertEquals("spend", validator.getPurposes().get(0));
        assertEquals("test_hash", validator.getRawHash());
    }

    @Test
    void testAikenV1_0_ParserGroupsByHash() throws Exception {
        AikenV1_0_Parser parser = new AikenV1_0_Parser();

        // Sample with multiple validators sharing the same hash
        String plutusJson = """
            {
              "preamble": {
                "title": "test",
                "plutusVersion": "v2",
                "compiler": {
                  "name": "Aiken",
                  "version": "v1.0.26-alpha"
                }
              },
              "validators": [
                {
                  "title": "pool.spend",
                  "hash": "shared_hash",
                  "compiledCode": "test_code"
                },
                {
                  "title": "pool.mint",
                  "hash": "shared_hash",
                  "compiledCode": "test_code"
                }
              ]
            }
            """;

        List<ParsedValidator> validators = parser.parse(plutusJson);

        assertEquals(1, validators.size());
        ParsedValidator validator = validators.get(0);
        assertEquals("pool", validator.getScriptName());
        assertEquals("pool", validator.getValidatorName());
        assertEquals(2, validator.getPurposes().size());
        assertTrue(validator.getPurposes().contains("spend"));
        assertTrue(validator.getPurposes().contains("mint"));
        assertEquals("shared_hash", validator.getRawHash());
    }

    @Test
    void testAikenV1_1_ParserParsesCorrectly() throws Exception {
        AikenV1_1_Parser parser = new AikenV1_1_Parser();

        // Sample v1.1.x plutus.json with 3-part title format
        String plutusJson = """
            {
              "preamble": {
                "title": "test",
                "plutusVersion": "v3",
                "compiler": {
                  "name": "Aiken",
                  "version": "v1.1.3"
                }
              },
              "validators": [
                {
                  "title": "automatic_payments.automatic_payments.spend",
                  "hash": "test_hash",
                  "compiledCode": "test_code"
                }
              ]
            }
            """;

        List<ParsedValidator> validators = parser.parse(plutusJson);

        assertEquals(1, validators.size());
        ParsedValidator validator = validators.get(0);
        assertEquals("automatic_payments", validator.getScriptName());
        assertEquals("automatic_payments", validator.getModuleName());
        assertEquals("automatic_payments", validator.getValidatorName());
        assertEquals(1, validator.getPurposes().size());
        assertEquals("spend", validator.getPurposes().get(0));
        assertEquals("test_hash", validator.getRawHash());
    }

    @Test
    void testAikenV1_1_ParserGroupsByHash() throws Exception {
        AikenV1_1_Parser parser = new AikenV1_1_Parser();

        // Sample with multiple purposes sharing the same hash
        String plutusJson = """
            {
              "preamble": {
                "title": "test",
                "plutusVersion": "v3",
                "compiler": {
                  "name": "Aiken",
                  "version": "v1.1.3"
                }
              },
              "validators": [
                {
                  "title": "automatic_payments.automatic_payments.spend",
                  "hash": "shared_hash",
                  "compiledCode": "test_code"
                },
                {
                  "title": "automatic_payments.automatic_payments.else",
                  "hash": "shared_hash",
                  "compiledCode": "test_code"
                }
              ]
            }
            """;

        List<ParsedValidator> validators = parser.parse(plutusJson);

        assertEquals(1, validators.size());
        ParsedValidator validator = validators.get(0);
        assertEquals("automatic_payments", validator.getScriptName());
        assertEquals("automatic_payments", validator.getValidatorName());
        assertEquals(2, validator.getPurposes().size());
        assertTrue(validator.getPurposes().contains("spend"));
        assertTrue(validator.getPurposes().contains("else"));
        assertEquals("shared_hash", validator.getRawHash());
    }
}
