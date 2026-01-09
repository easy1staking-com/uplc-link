package com.easy1staking.plutusscan.domain.enums;

/**
 * Parameterization status of a script/validator
 */
public enum ParameterizationStatus {
    /**
     * Script requires no parameters, raw hash equals final hash
     */
    NONE_REQUIRED,

    /**
     * Script requires parameters but some/none provided, final hash cannot be calculated
     */
    PARTIAL,

    /**
     * All required parameters provided, final hash calculated successfully
     */
    COMPLETE
}
