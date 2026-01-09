package com.easy1staking.plutusscan.service;

import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Scheduled service that polls for pending verification requests and processes them
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class VerificationScheduler {

    private final VerificationRequestRepository verificationRequestRepository;
    private final VerificationService verificationService;

    @Value("${verification.max-retries:3}")
    private int maxRetries;

    @Value("${verification.batch-size:10}")
    private int batchSize;

    /**
     * Poll for pending verification requests and process them
     * Runs every ${verification.poll-interval-ms} milliseconds (default: 30 seconds)
     */
    @Scheduled(fixedDelayString = "${verification.poll-interval-ms:30000}")
    public void processPendingVerifications() {
        log.debug("Checking for pending verification requests...");

        var pendingRequests = verificationRequestRepository
            .findByStatusAndRetryCountLessThanOrderByCreatedAtAsc(
                VerificationStatus.PENDING,
                maxRetries);

        if (pendingRequests.isEmpty()) {
            return;
        }

        log.info("Found {} pending verification requests", pendingRequests.size());

        // Process in batches to avoid overwhelming the system
        pendingRequests.stream()
            .limit(batchSize)
            .forEach(request -> {
                try {
                    log.info("Processing verification request id={}, {} @ {}",
                        request.getId(),
                        request.getSourceUrl(),
                        request.getCommitHash());

                    verificationService.processVerification(request);

                } catch (Exception e) {
                    log.error("Unexpected error processing verification request id={}",
                        request.getId(), e);
                    // Error is already handled in VerificationService
                    // (status set to FAILED, retry count incremented)
                }
            });

        log.info("Finished processing batch of {} verification requests", Math.min(batchSize, pendingRequests.size()));
    }
}
