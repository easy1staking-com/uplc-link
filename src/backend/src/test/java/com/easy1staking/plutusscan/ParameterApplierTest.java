package com.easy1staking.plutusscan;

import com.bloxbean.cardano.client.plutus.blueprint.PlutusBlueprintUtil;
import com.bloxbean.cardano.client.plutus.blueprint.model.PlutusVersion;
import com.easy1staking.plutusscan.util.ParameterApplier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Parameter application against external oracles (aiken blueprint apply, scalus npm).
 * Vectors live in src/test/resources/parameter-applier/vectors.json.
 */
public class ParameterApplierTest {

    private static JsonNode fe;
    private static JsonNode vault;

    @BeforeAll
    static void loadVectors() throws IOException {
        try (InputStream in = ParameterApplierTest.class.getResourceAsStream("/parameter-applier/vectors.json")) {
            JsonNode root = new ObjectMapper().readTree(in);
            fe = root.get("aikenV1_1_22OutputReference");
            vault = root.get("vaultV1_1_24StdlibV4");
        }
    }

    // a. Aiken v1.1.24 oracles: inner flat plus a 0x4b CBOR header
    static Stream<Arguments> lambdaVectors() {
        return Stream.of(
                Arguments.of("lam-addInteger", "450101002701", "4b0101003270098101010001"),
                Arguments.of("lam-unionValue", "4501010027c1", "4b010100327c098101010001"),
                Arguments.of("lam-value-const", "4501010024e9", "4b010100324e898101010001"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("lambdaVectors")
    public void appliesToSmallPrograms(String name, String script, String expected) {
        assertEquals(expected, ParameterApplier.applyParams(script, List.of("01")));
    }

    // b. Aiken v1.1.24 + stdlib v4 vault with PV11 builtins
    @Test
    public void vaultV1_1_24StdlibV4() {
        List<String> params = new ArrayList<>();
        vault.get("params").forEach(p -> params.add(p.asText()));
        assertEquals(vault.get("expectedHash").asText(),
                ParameterApplier.applyParamsAndHash(vault.get("compiledCode").asText(), params, PlutusVersion.v3));
    }

    // c. FE fixture anchor (Aiken v1.1.22, OutputReference param)
    @Test
    public void feAnchorUnappliedHash() throws Exception {
        assertEquals(fe.get("hash").asText(),
                PlutusBlueprintUtil.getPlutusScriptFromCompiledCode(fe.get("compiledCode").asText(), PlutusVersion.v3)
                        .getPolicyId());
    }

    @Test
    public void feAnchorAppliedHash() {
        assertEquals(fe.get("appliedHash").asText(),
                ParameterApplier.applyParamsAndHash(fe.get("compiledCode").asText(),
                        List.of(fe.get("paramCborHex").asText()), PlutusVersion.v3));
    }

    // d. Byte preservation: oracle is aiken blueprint apply v1.1.23+8949565 with an opaque Data param
    static Stream<Arguments> bytePreservationVectors() {
        return Stream.of(
                Arguments.of("constr-definite d879820102", "d879820102",
                        "0f752c169b9444d3b9ce981a289c841eecb43074492ff4de34438c91"),
                Arguments.of("list-definite 820102", "820102",
                        "cfe108b951e7a8e5c16ed6d7ae04177a567141197a5de861744fbd4b"),
                Arguments.of("list-indefinite 9f0102ff", "9f0102ff",
                        "d03a9727ed7516cc837edb29c65bb1599db11345b1b1ec25fc9a48f7"),
                Arguments.of("list-definite 303 bytes", "99012c" + "01".repeat(300),
                        "2b5cdf4eeed7f915e8037877e9f2b3c86ba1f2d946f3315df996ab4b"),
                Arguments.of("bytes-indefinite 332 bytes", "5f" + ("5840" + "ab".repeat(64)).repeat(5) + "ff",
                        "e75e8775ab88fbed35e0e5f8ac4f1206d90da110b67ea8d8545c79ad"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("bytePreservationVectors")
    public void preservesParamBytes(String name, String param, String expectedHash) {
        assertEquals(expectedHash,
                ParameterApplier.applyParamsAndHash(fe.get("compiledCode").asText(), List.of(param), PlutusVersion.v3));
    }

    @Test
    public void definiteAndIndefiniteListsHashDifferently() {
        String code = fe.get("compiledCode").asText();
        assertNotEquals(
                ParameterApplier.applyParamsAndHash(code, List.of("820102"), PlutusVersion.v3),
                ParameterApplier.applyParamsAndHash(code, List.of("9f0102ff"), PlutusVersion.v3));
    }

    // e. Refusals: params come from attacker-controlled 1984 metadata
    @Test
    public void refusesEmptyParams() {
        assertThrows(IllegalArgumentException.class,
                () -> ParameterApplier.applyParams(fe.get("compiledCode").asText(), List.of()));
    }

    @Test
    public void refusesDeeplyNestedParam() {
        String param = "9f".repeat(100000) + "ff".repeat(100000);
        assertThrows(IllegalArgumentException.class,
                () -> ParameterApplier.applyParams(fe.get("compiledCode").asText(), List.of(param)));
    }

    @Test
    public void refusesProgramNotReEncodedByteIdentically() {
        // Data constant encoded definite-length 820102; Scalus re-encodes it canonically
        assertThrows(IllegalArgumentException.class,
                () -> ParameterApplier.applyParams("4b0101004c01038201020001", List.of("01")));
    }

    @Test
    public void refusesTrailingByte() {
        assertThrows(RuntimeException.class,
                () -> ParameterApplier.applyParams(fe.get("compiledCode").asText(), List.of("01ff")));
    }

    @Test
    public void refusesNonHex() {
        assertThrows(RuntimeException.class,
                () -> ParameterApplier.applyParams(fe.get("compiledCode").asText(), List.of("zz")));
    }
}
