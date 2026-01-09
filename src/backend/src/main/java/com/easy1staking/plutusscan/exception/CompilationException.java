package com.easy1staking.plutusscan.exception;

/**
 * Exception thrown when smart contract compilation fails
 */
public class CompilationException extends Exception {
    public CompilationException(String message) {
        super(message);
    }

    public CompilationException(String message, Throwable cause) {
        super(message, cause);
    }
}
