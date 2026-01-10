package com.easy1staking.plutusscan.domain.repository;

import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    /**
     * Find verification requests by partial source URL match (case-insensitive)
     * @param urlPattern Pattern to search for in source URLs (e.g., "sundae-labs", "easy1staking")
     * @return List of verified requests matching the pattern, ordered by creation time
     */
    @Query("""
        SELECT DISTINCT v FROM VerificationRequestEntity v
        LEFT JOIN FETCH v.scripts
        WHERE LOWER(v.sourceUrl) LIKE LOWER(CONCAT('%', :urlPattern, '%'))
        AND v.status = com.easy1staking.plutusscan.domain.enums.VerificationStatus.VERIFIED
        ORDER BY v.createdAt DESC
        """)
    List<VerificationRequestEntity> findBySourceUrlContaining(@Param("urlPattern") String urlPattern);
}
