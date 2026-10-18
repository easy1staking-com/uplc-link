package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.dto.ParameterSchema;
import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.service.plutusjson.AikenV1_0_Parser;
import com.easy1staking.plutusscan.service.plutusjson.AikenV1_1_Parser;
import com.easy1staking.plutusscan.service.plutusjson.PlutusJsonParser;
import com.easy1staking.plutusscan.service.plutusjson.PlutusJsonParserFactory;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * T-404 fixtures: compiler output of examples/aiken-v1.1.24 (regenerate.sh), never hand-edited.
 * The parser is selected from the RAW preamble version ("v1.1.24+bacbeb3"), as an external
 * publisher would put it on chain, not from a value normalised by our own client.
 * Hashes come from the oracle file; none is hard-coded here.
 */
class AikenV1124FixtureTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static String resource(String path) throws IOException {
        try (InputStream in = AikenV1124FixtureTest.class.getResourceAsStream(path)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void productionParserAcceptsBothFixturesAndAgreesWithOracle() throws Exception {
        JsonNode oracle = MAPPER.readTree(resource("/aiken-v1.1.24/oracle.json"));
        var factory = new PlutusJsonParserFactory(
                List.of(new AikenV1_0_Parser(), new AikenV1_1_Parser()));

        Set<String> rawHashes = new HashSet<>();
        for (String env : List.of("default", "preview")) {
            String content = resource("/aiken-v1.1.24/plutus-" + env + ".json");
            JsonNode preamble = MAPPER.readTree(content).get("preamble");
            String rawVersion = preamble.get("compiler").get("version").asText();
            assertEquals("v1.1.24+bacbeb3", rawVersion, env);
            assertEquals("v3", preamble.get("plutusVersion").asText(), env);

            PlutusJsonParser parser = factory.getParser(CompilerType.AIKEN, rawVersion);
            assertInstanceOf(AikenV1_1_Parser.class, parser, env);

            List<ParsedValidator> validators = parser.parse(content);
            assertEquals(1, validators.size(), env);
            ParsedValidator v = validators.get(0);
            assertEquals("fixture.vault", v.getScriptName(), env);
            assertEquals(true, v.getPurposes().containsAll(List.of("spend", "else")), env);
            assertEquals(List.of("owner", "threshold", "pair", "tuple", "nested", "seed", "payee", "minimum"),
                    v.getRequiredParameters().stream().map(ParameterSchema::getTitle).toList(), env);

            String oracleEnv = env.equals("default") ? "" : env;
            String expected = null;
            for (JsonNode build : oracle.get("builds")) {
                if (build.get("env").asText().equals(oracleEnv)) {
                    expected = build.get("unapplied_hash").asText();
                }
            }
            assertEquals(expected, v.getRawHash(), env);
            rawHashes.add(v.getRawHash());
        }
        assertEquals(2, rawHashes.size(), "--env preview must change the hash");
        assertNotEquals(rawHashes.toArray()[0], rawHashes.toArray()[1]);
    }
}
