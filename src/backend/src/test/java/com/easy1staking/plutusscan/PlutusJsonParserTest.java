package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.service.plutusjson.AikenV1_0_Parser;
import com.easy1staking.plutusscan.service.plutusjson.AikenV1_1_Parser;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

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
