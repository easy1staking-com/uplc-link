package com.easy1staking.plutusscan.domain.entity;

import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.model.CompilerType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Entity representing a smart contract verification request from blockchain metadata
 */
@Entity
@Table(name = "verification_request"
//        , uniqueConstraints = @UniqueConstraint(name = "uk_verification_request_source", columnNames = {"source_url", "commit_hash"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationRequestEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Audit trail
    @Column(name = "tx_hash", nullable = false, length = 64)
    private String txHash;

    @Column(nullable = false)
    private Long slot;

    // Repository info (VCS-agnostic source URL)
    @Column(name = "source_url", nullable = false, length = 2000)
    private String sourceUrl;

    @Column(name = "commit_hash", nullable = false, length = 64)  // Support both SHA-1 (40) and SHA-256 (64)
    private String commitHash;

    // Compiler info
    @Enumerated(EnumType.STRING)
    @Column(name = "compiler_type", nullable = false)
    private CompilerType compilerType;

    @Column(name = "compiler_version")
    private String compilerVersion;

    @Column(name = "source_path", length = 1000)
    private String sourcePath;

    // Metadata - JSONB field for script_hash → parameter list mapping
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "parameters_json", columnDefinition = "jsonb")
    private Map<String, List<String>> parametersJson;

    // Status tracking
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private VerificationStatus status = VerificationStatus.PENDING;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "retry_count", nullable = false)
    @Builder.Default
    private Integer retryCount = 0;

    // Relationship to scripts
    @OneToMany(mappedBy = "verificationRequest", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ScriptEntity> scripts = new ArrayList<>();

    // Timestamps
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /**
     * Helper method to add a script to this verification request
     */
    public void addScript(ScriptEntity script) {
        scripts.add(script);
        script.setVerificationRequest(this);
    }

    /**
     * Helper method to remove a script from this verification request
     */
    public void removeScript(ScriptEntity script) {
        scripts.remove(script);
        script.setVerificationRequest(null);
    }
}
