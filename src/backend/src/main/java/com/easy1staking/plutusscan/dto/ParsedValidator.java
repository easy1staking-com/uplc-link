package com.easy1staking.plutusscan.dto;

import com.easy1staking.plutusscan.domain.enums.PlutusVersion;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * DTO representing a parsed validator from plutus.json
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ParsedValidator {
    private String scriptName;           // e.g., "parameters.parameters.spend"
    private String moduleName;            // e.g., "parameters"
    private String validatorName;         // e.g., "parameters"
    private String purpose;               // e.g., "spend"
    private String rawHash;               // Unparameterized hash
    private String compiledCode;          // CBOR hex
    private PlutusVersion plutusVersion;  // V1, V2, or V3
    private List<ParameterSchema> requiredParameters;  // May be null if no params
}
