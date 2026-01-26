package com.easy1staking.plutusscan.domain.repository;

import com.easy1staking.plutusscan.domain.entity.ScriptEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository for ScriptEntity
 */
@Repository
public interface ScriptRepository extends JpaRepository<ScriptEntity, Long> {

    /**
     * Find scripts by raw hash (unparameterized)
     */
    List<ScriptEntity> findByRawHash(String rawHash);

    /**
     * Find scripts by final hash (parameterized)
     */
    List<ScriptEntity> findByFinalHash(String finalHash);

    /**
     * Find scripts by either raw or final hash
     * @param hash Script hash to search for
     * @return List of matching scripts
     */
    @Query("SELECT s FROM ScriptEntity s WHERE s.rawHash = :hash OR s.finalHash = :hash")
    List<ScriptEntity> findByAnyHash(@Param("hash") String hash);

    /**
     * Find scripts by verification request ID
     */
    List<ScriptEntity> findByVerificationRequestId(Long verificationRequestId);

    /**
     * Find scripts by source URL and commit hash
     * Uses join fetch to eagerly load verification request
     */
    @Query("SELECT s FROM ScriptEntity s " +
           "JOIN FETCH s.verificationRequest vr " +
           "WHERE vr.sourceUrl = :sourceUrl AND vr.commitHash = :commitHash")
    List<ScriptEntity> findBySourceUrlAndCommit(
        @Param("sourceUrl") String sourceUrl,
        @Param("commitHash") String commitHash);

    /**
     * Count distinct script hashes (using finalHash for parameterized scripts)
     */
    @Query("SELECT COUNT(DISTINCT s.finalHash) FROM ScriptEntity s")
    long countDistinctScripts();
}
