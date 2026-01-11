package com.easy1staking.plutusscan.controller;

import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.dto.response.VerificationResponseDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for querying verification requests
 */
@RestController
@RequestMapping("${apiPrefix}/verification-requests")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Verification Requests", description = "Query verification request status and metadata")
public class VerificationController {

    private final VerificationRequestRepository verificationRequestRepository;

    /**
     * Get verification request status by source URL and commit hash
     * Example: GET /api/v1/verification-requests?sourceUrl=https://github.com/org/repo&commit=35f1a0d...
     * Example: GET /api/v1/verification-requests?sourceUrl=https://gitlab.com/group/subgroup/project&commit=abc123...
     */
    @Operation(
        summary = "Get verification request status",
        description = "Retrieve the status and metadata of a verification request for a specific source URL and commit. " +
                     "Returns information about whether verification succeeded, failed, or is pending."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Verification request found",
            content = @Content(schema = @Schema(implementation = VerificationResponseDto.class))),
        @ApiResponse(responseCode = "404", description = "No verification request found", content = @Content)
    })
    @GetMapping
    public ResponseEntity<VerificationResponseDto> getVerificationStatus(
            @Parameter(description = "Full Git repository URL", required = true)
            @RequestParam String sourceUrl,
            @Parameter(description = "Git commit hash", required = true)
            @RequestParam String commit) {

        log.info("Query verification status: {} @ {}", sourceUrl, commit);

        var requestOpt = verificationRequestRepository
            .findBySourceUrlAndCommitHash(sourceUrl, commit);

        if (requestOpt.isEmpty()) {
            log.info("No verification request found for {} @ {}", sourceUrl, commit);
            return ResponseEntity.notFound().build();
        }

        var response = VerificationResponseDto.fromEntity(requestOpt.get());
        return ResponseEntity.ok(response);
    }
}
