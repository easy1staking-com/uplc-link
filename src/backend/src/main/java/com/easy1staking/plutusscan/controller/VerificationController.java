package com.easy1staking.plutusscan.controller;

import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.dto.response.VerificationResponseDto;
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
public class VerificationController {

    private final VerificationRequestRepository verificationRequestRepository;

    /**
     * Get verification request status by source URL and commit hash
     * Example: GET /api/v1/verification-requests?sourceUrl=https://github.com/org/repo&commit=35f1a0d...
     * Example: GET /api/v1/verification-requests?sourceUrl=https://gitlab.com/group/subgroup/project&commit=abc123...
     */
    @GetMapping
    public ResponseEntity<VerificationResponseDto> getVerificationStatus(
            @RequestParam String sourceUrl,
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
