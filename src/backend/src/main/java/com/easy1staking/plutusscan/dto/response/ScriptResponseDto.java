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
    private List<String> purposes; // List of purposes (e.g., ["spend", "mint"])
    private String rawHash;
    private String finalHash;
    private String plutusVersion;
    private String parameterizationStatus;
    private List<Map<String, Object>> requiredParameters;
    private List<String> providedParameters;

    public static ScriptResponseDto fromEntity(ScriptEntity entity) {
        // Convert comma-separated purposes string to List
        List<String> purposes = entity.getPurpose() != null && !entity.getPurpose().isEmpty()
            ? java.util.Arrays.asList(entity.getPurpose().split(","))
            : java.util.Collections.emptyList();

        return ScriptResponseDto.builder()
            .scriptName(entity.getScriptName())
            .moduleName(entity.getModuleName())
            .validatorName(entity.getValidatorName())
            .purposes(purposes)
            .rawHash(entity.getRawHash())
            .finalHash(entity.getFinalHash())
            .plutusVersion(entity.getPlutusVersion() != null ? entity.getPlutusVersion().name() : null)
            .parameterizationStatus(entity.getParameterizationStatus() != null ? entity.getParameterizationStatus().name() : null)
            .requiredParameters(entity.getRequiredParameters())
            .providedParameters(entity.getProvidedParameters())
            .build();
    }
}
