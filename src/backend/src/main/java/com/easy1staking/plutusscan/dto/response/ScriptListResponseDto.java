package com.easy1staking.plutusscan.dto.response;

import com.easy1staking.plutusscan.domain.entity.ScriptEntity;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
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

    public static ScriptListResponseDto fromEntity(VerificationRequestEntity entity) {
        return ScriptListResponseDto.builder()
            .sourceUrl(entity.getSourceUrl())
            .commitHash(entity.getCommitHash())
            .sourcePath(entity.getSourcePath())
            .compilerType(entity.getCompilerType() != null ? entity.getCompilerType().name() : null)
            .compilerVersion(entity.getCompilerVersion())
            .status(entity.getStatus() != null ? entity.getStatus().name() : null)
            .scripts(entity.getScripts() != null ? entity.getScripts().stream()
                .map(ScriptResponseDto::fromEntity)
                .collect(Collectors.toList()) : List.of())
            .build();
    }
}
