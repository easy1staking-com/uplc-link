package com.easy1staking.plutusscan.domain.enums;

/**
 * Plutus script version (from plutus.json preamble)
 */
public enum PlutusVersion {
    V1,
    V2,
    V3;

    /**
     * Parse Plutus version from string (case-insensitive)
     *
     * @param version Version string (e.g., "V1", "v2", "PlutusV3")
     * @return PlutusVersion enum
     */
    public static PlutusVersion fromString(String version) {
        if (version == null || version.isEmpty()) {
            return V3; // Default to V3
        }

        String normalized = version.toUpperCase()
                .replace("PLUTUS", "")
                .replace("_", "");

        return switch (normalized) {
            case "V1", "1" -> V1;
            case "V2", "2" -> V2;
            case "V3", "3" -> V3;
            default -> V3; // Default to V3 for unknown versions
        };
    }

    public static PlutusVersion from(com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion plutusVersion) {
        return switch (plutusVersion) {
            case com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion.v1 -> V1;
            case com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion.v2 -> V2;
            case com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion.v3 -> V3;
        };
    }

    public com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion toPlutusVersion() {
        return switch (this) {
            case V1 -> com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion.v1;
            case V2 -> com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion.v2;
            case V3 -> com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion.v3;
        };
    }

}
