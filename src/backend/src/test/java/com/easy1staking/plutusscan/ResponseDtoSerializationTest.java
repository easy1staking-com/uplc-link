package com.easy1staking.plutusscan;

import com.easy1staking.plutusscan.domain.entity.ScriptEntity;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.PlutusVersion;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.dto.response.ScriptListResponseDto;
import com.easy1staking.plutusscan.dto.response.VerificationResponseDto;
import com.easy1staking.plutusscan.model.CompilerType;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.List;

/**
 * Locks the registry wire shape (T-205/T-206): per-script `purposes` is
 * always a JSON array (never a singular `purpose` key), and top-level `env`
 * serializes present-when-set and JSON-null-when-unset — this is what stops
 * a future NON_NULL Jackson config from silently dropping `env` again.
 * <p>
 * Plain JUnit 5, no Spring context: the DTO factory methods only touch
 * in-memory entities, so a bare {@link ObjectMapper} is enough to assert the
 * wire shape they produce.
 */
public class ResponseDtoSerializationTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static VerificationRequestEntity buildRequest(String env) {
        VerificationRequestEntity request = VerificationRequestEntity.builder()
                .txHash("2a88dd41f1fb85235fe97ab00fc0ea4ecfe11ea8ce13ba60cf9d10c0bec00e83")
                .sourceUrl("https://github.com/SundaeSwap-finance/sundae-contracts")
                .commitHash("edc118880d3baffcb7d5bd277faec2e7dc54c59b")
                .compilerType(CompilerType.AIKEN)
                .compilerVersion("v1.0.26-alpha")
                .status(VerificationStatus.VERIFIED)
                .env(env)
                .build();

        ScriptEntity script = ScriptEntity.builder()
                .purpose("spend,mint")
                .rawHash("c5a1debe56333bcbc5cfe66a7ae0026cbb262b5900e81408d7660e06")
                .plutusVersion(PlutusVersion.V2)
                .build();

        request.addScript(script);
        return request;
    }

    private static void assertScriptPurposesArray(JsonNode scriptNode) {
        Assertions.assertTrue(scriptNode.has("purposes"), "expected a 'purposes' key");
        Assertions.assertTrue(scriptNode.get("purposes").isArray(), "'purposes' must be a JSON array");

        List<String> purposes = OBJECT_MAPPER.convertValue(
                scriptNode.get("purposes"), new TypeReference<List<String>>() {});
        Assertions.assertEquals(List.of("spend", "mint"), purposes);

        Assertions.assertFalse(scriptNode.has("purpose"), "no singular 'purpose' key must be present on the wire");
    }

    @Test
    void scriptListResponseDtoFromEntitiesWireShape() throws Exception {
        VerificationRequestEntity request = buildRequest("preview");
        ScriptEntity script = request.getScripts().get(0);

        ScriptListResponseDto dto = ScriptListResponseDto.fromEntities(List.of(script));
        JsonNode node = OBJECT_MAPPER.readTree(OBJECT_MAPPER.writeValueAsString(dto));

        Assertions.assertEquals("preview", node.get("env").asText());
        assertScriptPurposesArray(node.get("scripts").get(0));
    }

    @Test
    void scriptListResponseDtoFromEntitySearchPathWireShape() throws Exception {
        VerificationRequestEntity request = buildRequest("preview");

        ScriptListResponseDto dto = ScriptListResponseDto.fromEntity(request);
        JsonNode node = OBJECT_MAPPER.readTree(OBJECT_MAPPER.writeValueAsString(dto));

        Assertions.assertEquals("preview", node.get("env").asText());
        assertScriptPurposesArray(node.get("scripts").get(0));
    }

    @Test
    void verificationResponseDtoFromEntityWireShape() throws Exception {
        VerificationRequestEntity request = buildRequest("preview");

        VerificationResponseDto dto = VerificationResponseDto.fromEntity(request);
        JsonNode node = OBJECT_MAPPER.readTree(OBJECT_MAPPER.writeValueAsString(dto));

        Assertions.assertEquals("preview", node.get("env").asText());
        assertScriptPurposesArray(node.get("scripts").get(0));
    }

    @Test
    void scriptListResponseDtoFromEntityEnvUnsetSerializesJsonNull() throws Exception {
        VerificationRequestEntity request = buildRequest(null);

        ScriptListResponseDto dto = ScriptListResponseDto.fromEntity(request);
        JsonNode node = OBJECT_MAPPER.readTree(OBJECT_MAPPER.writeValueAsString(dto));

        Assertions.assertTrue(node.has("env"), "'env' key must be present even when unset");
        Assertions.assertTrue(node.get("env").isNull(), "'env' must serialize as JSON null, not be dropped");
    }

    @Test
    void verificationResponseDtoFromEntityEnvUnsetSerializesJsonNull() throws Exception {
        VerificationRequestEntity request = buildRequest(null);

        VerificationResponseDto dto = VerificationResponseDto.fromEntity(request);
        JsonNode node = OBJECT_MAPPER.readTree(OBJECT_MAPPER.writeValueAsString(dto));

        Assertions.assertTrue(node.has("env"), "'env' key must be present even when unset");
        Assertions.assertTrue(node.get("env").isNull(), "'env' must serialize as JSON null, not be dropped");
    }
}
