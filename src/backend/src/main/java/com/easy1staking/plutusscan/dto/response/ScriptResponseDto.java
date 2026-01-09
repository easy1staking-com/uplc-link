package com.easy1staking.plutusscan.dto.response;

import com.easy1staking.plutusscan.domain.entity.ScriptEntity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Response DTO for script information
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScriptResponseDto {
    private String scriptName;
    private String moduleName;
    private String validatorName;
    private String purpose;
    private String rawHash;
    private String finalHash;
    private String plutusVersion;
    private String parameterizationStatus;
    private List<Map<String, Object>> requiredParameters;
    private List<String> providedParameters;

    public static ScriptResponseDto fromEntity(ScriptEntity entity) {
        return ScriptResponseDto.builder()
            .scriptName(entity.getScriptName())
            .moduleName(entity.getModuleName())
            .validatorName(entity.getValidatorName())
            .purpose(entity.getPurpose())
            .rawHash(entity.getRawHash())
            .finalHash(entity.getFinalHash())
            .plutusVersion(entity.getPlutusVersion().name())
            .parameterizationStatus(entity.getParameterizationStatus().name())
            .requiredParameters(entity.getRequiredParameters())
            .providedParameters(entity.getProvidedParameters())
            .build();
    }
}
