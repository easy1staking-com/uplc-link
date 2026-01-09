package com.easy1staking.plutusscan.service;

import com.bloxbean.cardano.client.address.Address;
import com.bloxbean.cardano.client.address.Credential;
import com.bloxbean.cardano.client.address.CredentialType;
import com.bloxbean.cardano.client.util.HexUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Service for parsing Cardano addresses and extracting script hashes
 */
@Service
@Slf4j
public class AddressService {

    /**
     * Extract script hash from a Cardano address
     * Supports: base addresses, enterprise addresses, stake addresses
     *
     * @param addressStr Bech32 address string
     * @return Script hash (hex) or empty if not a script address
     */
    public Optional<String> extractScriptHash(String addressStr) {
        try {
            Address address = new Address(addressStr);

            // Try payment credential first (for base and enterprise addresses)
            if (address.getPaymentCredential().isPresent()) {
                Credential paymentCred = address.getPaymentCredential().get();

                if (paymentCred.getType() == CredentialType.Script) {
                    byte[] scriptHash = paymentCred.getBytes();
                    String hashHex = HexUtil.encodeHexString(scriptHash);
                    log.debug("Extracted payment script hash from address: {}", hashHex);
                    return Optional.of(hashHex);
                }
            }

            // Try stake credential (for stake addresses or base addresses with script stake)
            if (address.getDelegationCredential().isPresent()) {
                Credential stakeCred = address.getDelegationCredential().get();

                if (stakeCred.getType() == CredentialType.Script) {
                    byte[] scriptHash = stakeCred.getBytes();
                    String hashHex = HexUtil.encodeHexString(scriptHash);
                    log.debug("Extracted stake script hash from address: {}", hashHex);
                    return Optional.of(hashHex);
                }
            }

            log.debug("Address {} does not contain a script hash", addressStr);
            return Optional.empty();

        } catch (Exception e) {
            log.warn("Failed to parse address: {}", addressStr, e);
            return Optional.empty();
        }
    }

    /**
     * Check if input string is a script hash (56 hex characters)
     *
     * @param input String to check
     * @return true if it's a valid script hash format
     */
    public boolean isScriptHash(String input) {
        return input != null && input.matches("^[a-fA-F0-9]{56}$");
    }

    /**
     * Normalize input to script hash
     * Accepts either a bech32 address or a hex script hash
     *
     * @param input Bech32 address or hex script hash
     * @return Optional containing normalized script hash (lowercase hex)
     */
    public Optional<String> normalizeToScriptHash(String input) {
        if (input == null || input.isEmpty()) {
            return Optional.empty();
        }

        // If it's already a script hash, just normalize to lowercase
        if (isScriptHash(input)) {
            return Optional.of(input.toLowerCase());
        }

        // Otherwise, try to extract from address
        return extractScriptHash(input).map(String::toLowerCase);
    }
}
