package com.easy1staking.plutusscan.dto.response;

import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Response DTO for verification request information
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VerificationResponseDto {
    private String sourceUrl;
    private String commitHash;
    private String sourcePath;
    private String compilerType;
    private String compilerVersion;
    private String status;
    private String errorMessage;
    private List<ScriptResponseDto> scripts;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static VerificationResponseDto fromEntity(VerificationRequestEntity entity) {
        return VerificationResponseDto.builder()
            .sourceUrl(entity.getSourceUrl())
            .commitHash(entity.getCommitHash())
            .sourcePath(entity.getSourcePath())
            .compilerType(entity.getCompilerType().name())
            .compilerVersion(entity.getCompilerVersion())
            .status(entity.getStatus().name())
            .errorMessage(entity.getErrorMessage())
            .scripts(entity.getScripts().stream()
                .map(ScriptResponseDto::fromEntity)
                .collect(Collectors.toList()))
            .createdAt(entity.getCreatedAt())
            .updatedAt(entity.getUpdatedAt())
            .build();
    }
}
