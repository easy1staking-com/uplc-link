package com.easy1staking.plutusscan.model;

import com.bloxbean.cardano.client.plutus.spec.PlutusData;
import com.bloxbean.cardano.client.util.HexUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class PlutusScanRequestParser {

    private final ObjectMapper objectMapper;

    public Optional<PlutusScanRequest> parse(String inlineDatum) {
        try {
            var data = PlutusData.deserialize(HexUtil.decodeHexString(inlineDatum));

            var jsonData = objectMapper.readTree(objectMapper.writeValueAsString(data));

            var alternative = jsonData.get("constructor").asInt();
            var fields = jsonData.path("fields");

            // New format: sourceUrl, commitHash (raw bytes), sourcePath, compilerVersion, parametersMap
            var sourceUrl = decode(fields.get(0).path("bytes").asText());
            var commitHashBytes = fields.get(1).path("bytes").asText();  // Keep as hex string
            var sourcePath = decode(fields.get(2).path("bytes").asText());
            var compilerVersion = decode(fields.get(3).path("bytes").asText());
            var parameters = new HashMap<String, List<String>>();
            var map = fields.get(4).path("map");

            map.iterator().forEachRemaining(node -> {
                var key = node.get("k").path("bytes").asText();
                var jsonValues = node.get("v").path("list");
                var values = new ArrayList<String>();
                jsonValues.iterator().forEachRemaining(jsonValue -> values.add(jsonValue.path("bytes").asText()));
                parameters.put(key, values);
            });

            return CompilerType.fromId(alternative)
                    .map(compilerType -> PlutusScanRequest.builder()
                            .compilerType(compilerType)
                            .sourceUrl(sourceUrl)
                            .commitHash(commitHashBytes)
                            .sourcePath(sourcePath)
                            .compilerVersion(compilerVersion)
                            .parameters(parameters)
                            .build());
        } catch (Exception e) {
            log.error("Failed to parse registry node from inline datum", e);
            return Optional.empty();
        }
    }

    private String decode(String string) {
        return new String(HexUtil.decodeHexString(string));
    }


}