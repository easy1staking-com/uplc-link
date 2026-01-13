package com.easy1staking.plutusscan.service.plutusjson;

import com.easy1staking.plutusscan.domain.enums.PlutusVersion;
import com.easy1staking.plutusscan.dto.ParameterSchema;
import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.exception.PlutusJsonParseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Parser for Aiken v1.0.x (alpha) plutus.json format
 * Supports versions v1.0.0-alpha through v1.0.x-alpha
 */
@Component
@Slf4j
public class AikenV1_0_Parser implements PlutusJsonParser {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public List<ParsedValidator> parse(String plutusJsonContent) throws PlutusJsonParseException {
        try {
            JsonNode root = objectMapper.readTree(plutusJsonContent);

            // Extract plutus version from preamble (default to V2 for alpha versions)
            String plutusVersionStr = root.path("preamble")
                .path("plutusVersion")
                .asText("v2");
            PlutusVersion plutusVersion = PlutusVersion.fromString(plutusVersionStr);

            log.debug("Detected Plutus version: {}", plutusVersion);

            // Group validators by hash (same compiled code)
            java.util.Map<String, ParsedValidator> groupedByHash = new java.util.HashMap<>();

            JsonNode validators = root.path("validators");

            if (!validators.isArray()) {
                throw new PlutusJsonParseException("validators field is not an array");
            }

            for (JsonNode validator : validators) {
                String title = validator.path("title").asText();
                String hash = validator.path("hash").asText();
                String compiledCode = validator.path("compiledCode").asText();

                if (title.isEmpty() || hash.isEmpty() || compiledCode.isEmpty()) {
                    log.warn("Skipping validator with missing fields: title={}, hash={}, compiledCode present={}",
                        title, hash, !compiledCode.isEmpty());
                    continue;
                }

                // Parse title: "name.purpose" (v1.0.x alpha format - 2 parts)
                String[] parts = title.split("\\.");
                if (parts.length < 2) {
                    log.warn("Invalid validator title format for v1.0.x (expected name.purpose): {}", title);
                    continue;
                }

                String validatorName = parts[0];
                String purpose = parts[1];
                String moduleName = validatorName; // Use validator name as module name for v1.0.x

                // Parse parameters (if present)
                List<ParameterSchema> parameters = new ArrayList<>();
                JsonNode parametersNode = validator.path("parameters");
                if (parametersNode.isArray() && parametersNode.size() > 0) {
                    for (JsonNode param : parametersNode) {
                        ParameterSchema schema = ParameterSchema.builder()
                            .title(param.path("title").asText(null))
                            .schema(objectMapper.convertValue(param.path("schema"), Object.class))
                            .build();
                        parameters.add(schema);
                    }
                }

                // Group by hash
                if (!groupedByHash.containsKey(hash)) {
                    List<String> purposes = new ArrayList<>();
                    purposes.add(purpose);

                    ParsedValidator parsed = ParsedValidator.builder()
                        .scriptName(validatorName)
                        .moduleName(moduleName)
                        .validatorName(validatorName)
                        .purposes(purposes)
                        .rawHash(hash)
                        .compiledCode(compiledCode)
                        .plutusVersion(plutusVersion)
                        .requiredParameters(parameters.isEmpty() ? null : parameters)
                        .build();

                    groupedByHash.put(hash, parsed);
                } else {
                    // Add purpose to existing entry's purposes list
                    groupedByHash.get(hash).getPurposes().add(purpose);
                }
            }

            // Convert to result list
            List<ParsedValidator> result = new ArrayList<>(groupedByHash.values());

            log.info("Successfully parsed {} unique validators from plutus.json (v1.0.x alpha)", result.size());
            return result;

        } catch (Exception e) {
            throw new PlutusJsonParseException("Failed to parse plutus.json (v1.0.x alpha)", e);
        }
    }

    @Override
    public boolean supports(String version) {
        if (version == null || version.isEmpty()) {
            return false;
        }

        // Support v1.0.0-alpha through v1.0.x-alpha
        String normalized = version.toLowerCase().replace("v", "");
        return normalized.matches("1\\.0\\.\\d+(-alpha.*)?");
    }
}
