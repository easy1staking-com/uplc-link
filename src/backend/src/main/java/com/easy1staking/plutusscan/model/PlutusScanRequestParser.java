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

            // The constructor selects the layout, so it is resolved first: an
            // id outside the CIP-0171 table is an unrecognized record and the
            // CIP says to ignore it, whatever its shape.
            var maybeCompilerType = CompilerType.fromId(alternative);
            if (maybeCompilerType.isEmpty()) {
                log.warn("Unrecognized constructor {}, dropping request", alternative);
                return Optional.empty();
            }
            var compilerType = maybeCompilerType.get();
            var isAiken = compilerType == CompilerType.AIKEN;

            // Aiken (constr 0) uses the fixed 6-field layout: sourceUrl,
            // commitHash (raw bytes), sourcePath, compilerVersion, env,
            // parametersMap. Older 5-field submissions are deliberately
            // unparseable (dropped with a log): the schema was redefined in
            // place, indexing restarts past the old records, and the few
            // pre-existing verifications are re-submitted on-chain in the new
            // format — old-format txs stay unrecoverable by design.
            //
            // Constructors 1..5 use the published v1 schema: the same four
            // leading bytestrings plus an optional trailing parameters map,
            // and no env field at all.
            var byteFieldCount = isAiken ? 5 : 4;
            var parametersIndex = isAiken ? 5 : 4;

            if (isAiken) {
                if (fields.size() != 6) {
                    log.warn("Unsupported field count {} (expected 6) for constructor {}, dropping request",
                            fields.size(), alternative);
                    return Optional.empty();
                }
            } else if (fields.size() != 4 && fields.size() != 5) {
                log.warn("Unsupported field count {} (expected 4 or 5) for constructor {}, dropping request",
                        fields.size(), alternative);
                return Optional.empty();
            }
            // Structural type check so the drop rule is self-contained rather
            // than relying on downstream semantic validation
            for (int i = 0; i < byteFieldCount; i++) {
                if (!fields.get(i).has("bytes")) {
                    log.warn("Field {} is not a bytestring, dropping request", i);
                    return Optional.empty();
                }
            }
            if (fields.size() > parametersIndex && !fields.get(parametersIndex).has("map")) {
                log.warn("Field {} is not a map, dropping request", parametersIndex);
                return Optional.empty();
            }

            var sourceUrl = decode(fields.get(0).path("bytes").asText());
            var commitHashBytes = fields.get(1).path("bytes").asText();  // Keep as hex string
            var sourcePath = decode(fields.get(2).path("bytes").asText());
            var compilerVersion = decode(fields.get(3).path("bytes").asText());
            // Aiken only: empty bytes = built without --env (PlutusData has no
            // null). The v1 schema carries no env, so it stays null.
            String env = null;
            if (isAiken) {
                var decodedEnv = decode(fields.get(4).path("bytes").asText());
                env = decodedEnv.isEmpty() ? null : decodedEnv;
            }
            var parameters = new HashMap<String, List<String>>();
            // Absent on a 4-field v1 record — no map node, hence no parameters
            var map = fields.path(parametersIndex).path("map");

            map.iterator().forEachRemaining(node -> {
                var key = node.get("k").path("bytes").asText();
                var jsonValues = node.get("v").path("list");
                var values = new ArrayList<String>();
                jsonValues.iterator().forEachRemaining(jsonValue -> values.add(jsonValue.path("bytes").asText()));
                parameters.put(key, values);
            });

            return Optional.of(PlutusScanRequest.builder()
                    .compilerType(compilerType)
                    .sourceUrl(sourceUrl)
                    .commitHash(commitHashBytes)
                    .sourcePath(sourcePath)
                    .compilerVersion(compilerVersion)
                    .env(env)
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