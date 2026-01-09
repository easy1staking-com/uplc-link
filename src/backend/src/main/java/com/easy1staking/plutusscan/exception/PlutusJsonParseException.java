package com.easy1staking.plutusscan.exception;

/**
 * Exception thrown when parsing plutus.json fails
 */
public class PlutusJsonParseException extends RuntimeException {
    public PlutusJsonParseException(String message) {
        super(message);
    }

    public PlutusJsonParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
