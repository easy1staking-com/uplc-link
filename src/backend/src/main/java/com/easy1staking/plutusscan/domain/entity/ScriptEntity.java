package com.easy1staking.plutusscan.domain.entity;

import com.easy1staking.plutusscan.domain.enums.ParameterizationStatus;
import com.easy1staking.plutusscan.domain.enums.PlutusVersion;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Entity representing an individual smart contract script/validator
 */
@Entity
@Table(name = "script")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScriptEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "verification_request_id", nullable = false)
    private VerificationRequestEntity verificationRequest;

    // Script identification
    @Column(name = "script_name", nullable = false, length = 500)
    private String scriptName;

    @Column(name = "module_name", nullable = false)
    private String moduleName;

    @Column(name = "validator_name", nullable = false)
    private String validatorName;

    @Column(nullable = false, length = 50)
    private String purpose;

    // Hashes
    @Column(name = "raw_hash", nullable = false, length = 64)
    private String rawHash;

    @Column(name = "final_hash", length = 64)
    private String finalHash;

    // Plutus info
    @Enumerated(EnumType.STRING)
    @Column(name = "plutus_version", nullable = false)
    private PlutusVersion plutusVersion;

    @Column(name = "compiled_code", nullable = false, columnDefinition = "TEXT")
    private String compiledCode;

    // Parameters - stored as JSON
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "required_parameters", columnDefinition = "jsonb")
    private List<Map<String, Object>> requiredParameters;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "provided_parameters", columnDefinition = "jsonb")
    private List<String> providedParameters;

    @Enumerated(EnumType.STRING)
    @Column(name = "parameterization_status", nullable = false)
    @Builder.Default
    private ParameterizationStatus parameterizationStatus = ParameterizationStatus.NONE_REQUIRED;

    // Timestamps
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
