package com.easy1staking.plutusscan.domain.enums;

/**
 * Status of a verification request in the processing pipeline
 */
public enum VerificationStatus {
    /**
     * Request received from blockchain, awaiting processing
     */
    PENDING,

    /**
     * Currently being processed (compiling, parsing, etc.)
     */
    PROCESSING,

    /**
     * Successfully verified and scripts extracted
     */
    VERIFIED,

    /**
     * Verification failed due to compilation or parsing error
     */
    FAILED,

    /**
     * Insufficient parameters provided to calculate final hashes
     */
    INSUFFICIENT_PARAMS
}
