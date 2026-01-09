package com.easy1staking.plutusscan.domain.repository;

import com.easy1staking.plutusscan.domain.entity.PlutusJsonCacheEntity;
import com.easy1staking.plutusscan.model.CompilerType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Repository for PlutusJsonCacheEntity
 */
@Repository
public interface PlutusJsonCacheRepository extends JpaRepository<PlutusJsonCacheEntity, Long> {

    /**
     * Find cached plutus.json by composite key
     * @param compilerType Compiler type (AIKEN, HELIOS, etc.)
     * @param sourceUrl VCS source URL (supports any Git hosting platform)
     * @param commitHash Git commit hash (SHA-1 or SHA-256)
     * @param compilerVersion Compiler version
     * @return Optional cache entity
     */
    Optional<PlutusJsonCacheEntity> findByCompilerTypeAndSourceUrlAndCommitHashAndCompilerVersion(
        CompilerType compilerType,
        String sourceUrl,
        String commitHash,
        String compilerVersion);

    /**
     * Delete cache entries older than the specified cutoff date
     * Used for cache cleanup/maintenance
     * @param cutoffDate Timestamp before which entries should be deleted
     */
    void deleteByCreatedAtBefore(LocalDateTime cutoffDate);
}
