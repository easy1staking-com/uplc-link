package com.easy1staking.plutusscan.controller;

import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.domain.repository.ScriptRepository;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.dto.response.StatsResponseDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("${apiPrefix}/stats")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Stats", description = "Registry statistics")
public class StatsController {

    private final VerificationRequestRepository verificationRequestRepository;
    private final ScriptRepository scriptRepository;

    @Operation(
        summary = "Get registry statistics",
        description = "Returns counts of verifications, unique scripts, and repositories in the registry."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Statistics retrieved successfully",
            content = @Content(schema = @Schema(implementation = StatsResponseDto.class)))
    })
    @GetMapping
    public ResponseEntity<StatsResponseDto> getStats() {
        log.info("Fetching registry statistics");

        long verifications = verificationRequestRepository.countByStatus(VerificationStatus.VERIFIED);
        long scripts = scriptRepository.countDistinctScripts();
        long repositories = verificationRequestRepository.countDistinctSourceUrlByStatus(VerificationStatus.VERIFIED);

        var stats = StatsResponseDto.builder()
            .verifications(verifications)
            .scripts(scripts)
            .repositories(repositories)
            .build();

        log.info("Stats: {} verifications, {} scripts, {} repositories",
            stats.getVerifications(), stats.getScripts(), stats.getRepositories());

        return ResponseEntity.ok(stats);
    }
}
