package com.easy1staking.plutusscan.dto;

import com.easy1staking.plutusscan.domain.enums.PlutusVersion;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * DTO representing a parsed validator from plutus.json
 * Validators are grouped by hash (same compiled code)
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParsedValidator {
    private String scriptName;           // e.g., "parameters.parameters" or "pool"
    private String moduleName;            // e.g., "parameters" or "pool"
    private String validatorName;         // e.g., "parameters" or "pool"
    private List<String> purposes;        // e.g., ["spend", "else"] or ["spend", "mint"]
    private String rawHash;               // Unparameterized hash (used as grouping key)
    private String compiledCode;          // CBOR hex
    private PlutusVersion plutusVersion;  // V1, V2, or V3
    private List<ParameterSchema> requiredParameters;  // May be null if no params
}
