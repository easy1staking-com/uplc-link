package com.easy1staking.plutusscan.domain.repository;

import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository for VerificationRequestEntity
 */
@Repository
public interface VerificationRequestRepository extends JpaRepository<VerificationRequestEntity, Long> {

    /**
     * Find verification request by composite key (sourceUrl, commitHash)
     */
    Optional<VerificationRequestEntity> findBySourceUrlAndCommitHash(
        String sourceUrl, String commitHash);

    /**
     * Find pending verification requests for processing
     * @param status Verification status to filter by
     * @param maxRetries Maximum retry count
     * @return List of verification requests ordered by creation time
     */
    List<VerificationRequestEntity> findByStatusAndRetryCountLessThanOrderByCreatedAtAsc(
        VerificationStatus status, Integer maxRetries);

    /**
     * Find verification requests by transaction hash (for audit)
     */
    List<VerificationRequestEntity> findByTxHash(String txHash);

    /**
     * Check if verification request exists for given source and commit
     */
    boolean existsBySourceUrlAndCommitHash(String sourceUrl, String commitHash);

    /**
     * Find all verification requests for a given source URL
     */
    List<VerificationRequestEntity> findBySourceUrl(String sourceUrl);
}
