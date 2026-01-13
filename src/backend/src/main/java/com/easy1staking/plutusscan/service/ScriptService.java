package com.easy1staking.plutusscan.service;

import com.bloxbean.cardano.aiken.AikenScriptUtil;
import com.bloxbean.cardano.client.exception.CborDeserializationException;
import com.bloxbean.cardano.client.plutus.blueprint.PlutusBlueprintUtil;
import com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion;
import com.bloxbean.cardano.client.plutus.spec.BytesPlutusData;
import com.bloxbean.cardano.client.plutus.spec.ListPlutusData;
import com.bloxbean.cardano.client.plutus.spec.PlutusData;
import com.bloxbean.cardano.client.util.HexUtil;
import com.easy1staking.plutusscan.domain.entity.ScriptEntity;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.ParameterizationStatus;
import com.easy1staking.plutusscan.domain.repository.ScriptRepository;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.dto.ParameterSchema;
import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.dto.response.ScriptListResponseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for managing Script entities and parameter application
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ScriptService {

    private final ScriptRepository scriptRepository;
    private final VerificationRequestRepository verificationRequestRepository;

    /**
     * Create script entities from parsed validators
     *
     * @param request          The verification request entity
     * @param parsedValidators List of validators parsed from plutus.json
     */
    @Transactional
    public void createScripts(VerificationRequestEntity request,
                              List<ParsedValidator> parsedValidators) {

        Map<String, List<String>> providedParams = request.getParametersJson() != null
                ? request.getParametersJson()
                : new HashMap<>();

        log.info("Creating {} scripts for verification request id={}",
                parsedValidators.size(), request.getId());

        for (ParsedValidator parsed : parsedValidators) {
            ScriptEntity script = new ScriptEntity();
            script.setVerificationRequest(request);
            script.setScriptName(parsed.getScriptName());
            script.setModuleName(parsed.getModuleName());
            script.setValidatorName(parsed.getValidatorName());
            // Convert purposes list to comma-separated string
            script.setPurpose(String.join(",", parsed.getPurposes()));
            script.setRawHash(parsed.getRawHash());
            script.setCompiledCode(parsed.getCompiledCode());
            script.setPlutusVersion(parsed.getPlutusVersion());

            // Convert ParameterSchema to Map for JSON storage
            if (parsed.getRequiredParameters() != null && !parsed.getRequiredParameters().isEmpty()) {
                List<Map<String, Object>> requiredParamsList = new ArrayList<>();
                for (ParameterSchema paramSchema : parsed.getRequiredParameters()) {
                    Map<String, Object> paramMap = new HashMap<>();
                    paramMap.put("title", paramSchema.getTitle());
                    paramMap.put("schema", paramSchema.getSchema());
                    requiredParamsList.add(paramMap);
                }
                script.setRequiredParameters(requiredParamsList);
            }

            // Determine parameterization status
            if (parsed.getRequiredParameters() == null || parsed.getRequiredParameters().isEmpty()) {
                // No parameters required
                script.setParameterizationStatus(ParameterizationStatus.NONE_REQUIRED);
                script.setFinalHash(parsed.getRawHash());
                log.debug("Script {} requires no parameters, finalHash = rawHash", parsed.getScriptName());
            } else {
                // Check if we have parameters for this script (by raw hash)
                List<String> scriptParams = providedParams.get(parsed.getRawHash());

                if (scriptParams != null &&
                        scriptParams.size() == parsed.getRequiredParameters().size()) {
                    // Complete parameters provided
                    script.setParameterizationStatus(ParameterizationStatus.COMPLETE);
                    script.setProvidedParameters(scriptParams);

                    // Calculate final hash by applying parameters
                    try {
                        String finalHash = applyParametersAndHash(
                                parsed.getCompiledCode(),
                                scriptParams,
                                parsed.getPlutusVersion().toPlutusVersion());
                        script.setFinalHash(finalHash);
                        log.debug("Script {} parameterization complete, finalHash calculated",
                                parsed.getScriptName());
                    } catch (Exception e) {
                        log.error("Failed to apply parameters for script {}: {}",
                                parsed.getScriptName(), e.getMessage());
                        script.setParameterizationStatus(ParameterizationStatus.PARTIAL);
                    }
                } else {
                    // Partial or no parameters
                    script.setParameterizationStatus(ParameterizationStatus.PARTIAL);
                    script.setProvidedParameters(scriptParams);
                    log.debug("Script {} has partial parameters ({} of {} provided)",
                            parsed.getScriptName(),
                            scriptParams != null ? scriptParams.size() : 0,
                            parsed.getRequiredParameters().size());
                }
            }

            scriptRepository.save(script);
        }

        log.info("Successfully created {} scripts", parsedValidators.size());
    }

    /**
     * Apply parameters to script and calculate final hash
     */
    private String applyParametersAndHash(String compiledCode, List<String> params, PlutusVersion plutusVersion) {
        try {

            var rawScript = PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(compiledCode, plutusVersion);
            log.info("rawScript = {}", rawScript.getPolicyId());

            log.info("applying: {}", String.join(",", params));

            var parameters = params.stream().map(HexUtil::decodeHexString).map(foo -> {
                try {
                    return PlutusData.deserialize(foo);
                } catch (CborDeserializationException e) {
                    throw new RuntimeException(e);
                }
            }).toList().toArray(new PlutusData[0]);
            var parameterisedScript = PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(
                    AikenScriptUtil.applyParamToScript(ListPlutusData.of(parameters), compiledCode),
                    plutusVersion
            );
            var hash =parameterisedScript.getPolicyId();
            log.info("hash = {}", hash);
            return hash;
        } catch (Exception e) {
            throw new RuntimeException("Failed to apply parameters: " + e.getMessage(), e);
        }
    }

    /**
     * Find scripts by hash (raw or final)
     */
    @Transactional(readOnly = true)
    public List<ScriptEntity> findByHash(String hash) {
        return scriptRepository.findByAnyHash(hash);
    }

    /**
     * Find scripts by source URL and commit hash
     */
    @Transactional(readOnly = true)
    public List<ScriptEntity> findBySourceUrlAndCommit(String sourceUrl, String commitHash) {
        return scriptRepository.findBySourceUrlAndCommit(sourceUrl, commitHash);
    }

    /**
     * Search for scripts by partial source URL pattern (case-insensitive)
     * @param urlPattern Pattern to search for (e.g., "sundae-labs", "easy1staking", "aiken-lang")
     * @return List of script list response DTOs grouped by verification request
     */
    @Transactional(readOnly = true)
    public List<ScriptListResponseDto> searchByUrlPattern(String urlPattern) {
        log.info("Searching scripts by URL pattern: {}", urlPattern);

        List<VerificationRequestEntity> requests =
                verificationRequestRepository.findBySourceUrlContaining(urlPattern);

        log.info("Found {} verification requests matching pattern '{}'", requests.size(), urlPattern);

        return requests.stream()
                .map(ScriptListResponseDto::fromEntity)
                .toList();
    }
}
