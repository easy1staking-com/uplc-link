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
 * Parser for Aiken v1.1.x plutus.json format
 * Supports versions v1.1.0 through v1.1.x
 */
@Component
@Slf4j
public class AikenV1_1_Parser implements PlutusJsonParser {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public List<ParsedValidator> parse(String plutusJsonContent) throws PlutusJsonParseException {
        try {
            JsonNode root = objectMapper.readTree(plutusJsonContent);

            // Extract plutus version from preamble (default to V3 if not found)
            String plutusVersionStr = root.path("preamble")
                .path("plutusVersion")
                .asText("V3");
            PlutusVersion plutusVersion = PlutusVersion.fromString(plutusVersionStr);

            log.debug("Detected Plutus version: {}", plutusVersion);

            // Parse validators
            List<ParsedValidator> result = new ArrayList<>();
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

                // Parse title: "module.name.purpose"
                String[] parts = title.split("\\.");
                if (parts.length < 3) {
                    log.warn("Invalid validator title format (expected module.name.purpose): {}", title);
                    continue;
                }

                String moduleName = parts[0];
                String validatorName = parts[1];
                String purpose = parts[2];

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

                ParsedValidator parsed = ParsedValidator.builder()
                    .scriptName(title)
                    .moduleName(moduleName)
                    .validatorName(validatorName)
                    .purpose(purpose)
                    .rawHash(hash)
                    .compiledCode(compiledCode)
                    .plutusVersion(plutusVersion)
                    .requiredParameters(parameters.isEmpty() ? null : parameters)
                    .build();

                result.add(parsed);

                log.debug("Parsed validator: {} ({} parameters)",
                    title, parameters.size());
            }

            log.info("Successfully parsed {} validators from plutus.json", result.size());
            return result;

        } catch (Exception e) {
            throw new PlutusJsonParseException("Failed to parse plutus.json", e);
        }
    }

    @Override
    public boolean supports(String version) {
        if (version == null || version.isEmpty()) {
            // Default to supporting if no version specified
            return true;
        }

        // Support v1.1.0 through v1.1.x and also v1.2.x
        String normalized = version.toLowerCase().replace("v", "");
        return normalized.matches("1\\.[12]\\.\\d+");
    }
}
