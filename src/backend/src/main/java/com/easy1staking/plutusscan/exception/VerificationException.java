package com.easy1staking.plutusscan.exception;

/**
 * Exception thrown during verification processing
 */
public class VerificationException extends RuntimeException {
    public VerificationException(String message) {
        super(message);
    }

    public VerificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
