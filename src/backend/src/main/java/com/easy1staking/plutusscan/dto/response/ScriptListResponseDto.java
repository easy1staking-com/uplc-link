package com.easy1staking.plutusscan.dto.response;

import com.easy1staking.plutusscan.domain.entity.ScriptEntity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Response DTO for a list of scripts with verification metadata
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScriptListResponseDto {
    private String sourceUrl;
    private String commitHash;
    private String sourcePath;
    private String compilerType;
    private String compilerVersion;
    private String status;
    private List<ScriptResponseDto> scripts;

    public static ScriptListResponseDto fromEntities(List<ScriptEntity> entities) {
        if (entities.isEmpty()) {
            return ScriptListResponseDto.builder()
                .scripts(List.of())
                .build();
        }

        // All scripts should have the same verification request
        var firstScript = entities.get(0);
        var request = firstScript.getVerificationRequest();

        return ScriptListResponseDto.builder()
            .sourceUrl(request.getSourceUrl())
            .commitHash(request.getCommitHash())
            .sourcePath(request.getSourcePath())
            .compilerType(request.getCompilerType().name())
            .compilerVersion(request.getCompilerVersion())
            .status(request.getStatus().name())
            .scripts(entities.stream()
                .map(ScriptResponseDto::fromEntity)
                .collect(Collectors.toList()))
            .build();
    }
}
