package com.easy1staking.plutusscan.domain.entity;

import com.easy1staking.plutusscan.model.CompilerType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Entity for caching plutus.json build artifacts to avoid redundant compilations
 */
@Entity
@Table(name = "plutus_json_cache",
       uniqueConstraints = @UniqueConstraint(
           name = "uk_plutus_json_cache_key",
           columnNames = {"compiler_type", "source_url", "commit_hash", "compiler_version"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlutusJsonCacheEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Cache key components
    @Enumerated(EnumType.STRING)
    @Column(name = "compiler_type", nullable = false)
    private CompilerType compilerType;

    @Column(name = "source_url", nullable = false, length = 2000)
    private String sourceUrl;

    @Column(name = "commit_hash", nullable = false, length = 64)  // Support both SHA-1 (40) and SHA-256 (64)
    private String commitHash;

    @Column(name = "compiler_version", nullable = false)
    private String compilerVersion;

    // Cached content stored as JSONB for efficient querying
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "plutus_json_content", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> plutusJsonContent;

    // Metadata
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
