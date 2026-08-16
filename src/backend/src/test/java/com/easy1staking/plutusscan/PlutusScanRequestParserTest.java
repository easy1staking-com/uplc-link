package com.easy1staking.plutusscan;

import com.bloxbean.cardano.client.plutus.spec.BigIntPlutusData;
import com.bloxbean.cardano.client.plutus.spec.BytesPlutusData;
import com.bloxbean.cardano.client.plutus.spec.ConstrPlutusData;
import com.bloxbean.cardano.client.plutus.spec.ListPlutusData;
import com.bloxbean.cardano.client.plutus.spec.MapPlutusData;
import com.bloxbean.cardano.client.plutus.spec.PlutusData;
import com.bloxbean.cardano.client.util.HexUtil;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.model.PlutusScanRequest;
import com.easy1staking.plutusscan.model.PlutusScanRequestParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

/**
 * Acceptance matrix for the amended CIP-171 constructor table.
 * <p>
 * Constructor 0 (Aiken) keeps the strict 6-field layout — sourceUrl,
 * commitHash, sourcePath, compilerVersion, env, parameters map. Constructors
 * 1..5 (Plutarch, PlutusTx, Scalus, plu-ts, OpShin) carry the published v1
 * schema: 4 mandatory bytestrings plus an optional parameters map, and never
 * an env. Anything else is dropped with a log.
 * <p>
 * Non-Aiken fixtures are built straight from {@link ConstrPlutusData} —
 * {@link PlutusScanRequest#toPlutusData()} always emits the 6-field Aiken
 * layout and would not exercise these shapes.
 */
public class PlutusScanRequestParserTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final String SOURCE_URL = "https://github.com/easy1staking-com/cardano-recurring-payment";
    private static final String COMMIT_HASH = "35f1a0d51c8663782ab052f869d5c82b756e8615";
    private static final String SOURCE_PATH = "onchain";
    private static final String COMPILER_VERSION = "1.3.0";
    private static final String SCRIPT_HASH = "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e";
    private static final String PARAMETER = "66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0";

    private final PlutusScanRequestParser parser = new PlutusScanRequestParser(OBJECT_MAPPER);

    // ---------------------------------------------------------------------
    // Constructor 0 (Aiken) — current behaviour, must stay byte-identical
    // ---------------------------------------------------------------------

    @Test
    public void aikenSixFieldWithoutEnvParses() {
        var request = aikenRequest(null);

        var parsed = parser.parse(request.toPlutusData().serializeToHex()).orElseThrow();

        Assertions.assertEquals(request, parsed);
        Assertions.assertEquals(CompilerType.AIKEN, parsed.compilerType());
        // Empty env bytes on the wire decode back to null
        Assertions.assertNull(parsed.env());
        Assertions.assertEquals(Map.of(SCRIPT_HASH, List.of(PARAMETER)), parsed.parameters());
    }

    @Test
    public void aikenSixFieldWithEnvParses() {
        var request = aikenRequest("preview");

        var parsed = parser.parse(request.toPlutusData().serializeToHex()).orElseThrow();

        Assertions.assertEquals(request, parsed);
        Assertions.assertEquals(CompilerType.AIKEN, parsed.compilerType());
        Assertions.assertEquals("preview", parsed.env());
    }

    @Test
    public void aikenFiveFieldDrops() {
        var hex = constr(0,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                BytesPlutusData.of(COMPILER_VERSION),
                parametersMap());

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    @Test
    public void aikenSevenFieldDrops() {
        var hex = constr(0,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                BytesPlutusData.of(COMPILER_VERSION),
                BytesPlutusData.of(""),
                parametersMap(),
                BytesPlutusData.of("trailing"));

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    @Test
    public void aikenAbsurdFieldCountDrops() {
        var fields = new PlutusData[100];
        for (int i = 0; i < fields.length; i++) {
            fields[i] = BytesPlutusData.of("field-" + i);
        }

        Assertions.assertTrue(parser.parse(constr(0, fields)).isEmpty());
    }

    @Test
    public void aikenNonBytesInBytesPositionDrops() {
        // sourcePath position carries an integer instead of a bytestring
        var hex = constr(0,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BigIntPlutusData.of(42),
                BytesPlutusData.of(COMPILER_VERSION),
                BytesPlutusData.of(""),
                parametersMap());

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    @Test
    public void aikenNonMapParametersDrops() {
        var hex = constr(0,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                BytesPlutusData.of(COMPILER_VERSION),
                BytesPlutusData.of(""),
                BytesPlutusData.of("not-a-map"));

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    // ---------------------------------------------------------------------
    // Constructors 1..5 — published v1 schema, env-less
    // ---------------------------------------------------------------------

    @Test
    public void plutarchFiveFieldParses() {
        var parsed = parser.parse(v1Record(1, parametersMap())).orElseThrow();

        Assertions.assertEquals(CompilerType.PLUTARCH, parsed.compilerType());
        Assertions.assertEquals(SOURCE_URL, parsed.sourceUrl());
        Assertions.assertEquals(COMMIT_HASH, parsed.commitHash());
        Assertions.assertEquals(SOURCE_PATH, parsed.sourcePath());
        Assertions.assertEquals(COMPILER_VERSION, parsed.compilerVersion());
        // The v1 schema has no env field at all
        Assertions.assertNull(parsed.env());
        Assertions.assertEquals(Map.of(SCRIPT_HASH, List.of(PARAMETER)), parsed.parameters());
    }

    /**
     * The CIP-0171 constructor table. Attribution is asserted by enum constant
     * name rather than by a typed reference so that this whole test class also
     * compiles — and fails — against the pre-realignment enum, which is what
     * makes the fail-first run meaningful. The name is also what gets
     * persisted, so it is the value that actually has to be right.
     */
    @Test
    public void allNonAikenConstructorsFiveFieldParse() {
        var expected = Map.of(
                1, "PLUTARCH",
                2, "PLUTUSTX",
                3, "SCALUS",
                4, "PLUTS",
                5, "OPSHIN");

        expected.forEach((alternative, compilerTypeName) -> {
            var parsed = parser.parse(v1Record(alternative, parametersMap())).orElseThrow();
            Assertions.assertEquals(compilerTypeName, parsed.compilerType().name(),
                    "constructor " + alternative);
            Assertions.assertNull(parsed.env(), "constructor " + alternative);
            Assertions.assertEquals(Map.of(SCRIPT_HASH, List.of(PARAMETER)), parsed.parameters(),
                    "constructor " + alternative);
        });
    }

    @Test
    public void allNonAikenConstructorsFourFieldParseWithEmptyParameters() {
        for (int alternative = 1; alternative <= 5; alternative++) {
            var parsed = parser.parse(v1Record(alternative)).orElseThrow();
            Assertions.assertEquals(SOURCE_URL, parsed.sourceUrl(), "constructor " + alternative);
            Assertions.assertEquals(COMMIT_HASH, parsed.commitHash(), "constructor " + alternative);
            Assertions.assertNull(parsed.env(), "constructor " + alternative);
            Assertions.assertEquals(Map.of(), parsed.parameters(), "constructor " + alternative);
        }
    }

    @Test
    public void nonAikenSixFieldDrops() {
        // v1 layout with a trailing extra field
        for (int alternative = 1; alternative <= 5; alternative++) {
            var hex = constr(alternative,
                    BytesPlutusData.of(SOURCE_URL),
                    BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                    BytesPlutusData.of(SOURCE_PATH),
                    BytesPlutusData.of(COMPILER_VERSION),
                    parametersMap(),
                    BytesPlutusData.of("trailing"));
            Assertions.assertTrue(parser.parse(hex).isEmpty(), "constructor " + alternative);
        }
    }

    @Test
    public void nonAikenCarryingAikenSixFieldLayoutDrops() {
        // A constr-1..5 record shaped like the 6-field Aiken layout is not the
        // v1 schema and must not be read as an env-carrying request
        for (int alternative = 1; alternative <= 5; alternative++) {
            var hex = constr(alternative,
                    BytesPlutusData.of(SOURCE_URL),
                    BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                    BytesPlutusData.of(SOURCE_PATH),
                    BytesPlutusData.of(COMPILER_VERSION),
                    BytesPlutusData.of("preview"),
                    parametersMap());
            Assertions.assertTrue(parser.parse(hex).isEmpty(), "constructor " + alternative);
        }
    }

    @Test
    public void nonAikenThreeFieldDrops() {
        for (int alternative = 1; alternative <= 5; alternative++) {
            var hex = constr(alternative,
                    BytesPlutusData.of(SOURCE_URL),
                    BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                    BytesPlutusData.of(SOURCE_PATH));
            Assertions.assertTrue(parser.parse(hex).isEmpty(), "constructor " + alternative);
        }
    }

    @Test
    public void nonAikenNonBytesInBytesPositionDrops() {
        // compilerVersion position carries a list instead of a bytestring
        var hex = constr(1,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                ListPlutusData.of(BytesPlutusData.of(COMPILER_VERSION)),
                parametersMap());

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    @Test
    public void nonAikenNonMapParametersDrops() {
        var hex = constr(1,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                BytesPlutusData.of(COMPILER_VERSION),
                BytesPlutusData.of("not-a-map"));

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    /**
     * Documented deviation from the CDDL: cardano-client-lib cannot deserialize
     * a CBOR null (0xf6), so a record spelling "no source path" that way is
     * dropped. The supported spelling is empty bytes ("empty = root"). The
     * fixture is hand-written because the library cannot build it either.
     */
    @Test
    public void nonAikenCborNullSourcePathDrops() {
        var hex = "d87a9f"                                                   // constr 1, indefinite array
                + bytesHeader(SOURCE_URL.getBytes().length) + HexUtil.encodeHexString(SOURCE_URL.getBytes())
                + bytesHeader(20) + COMMIT_HASH
                + "f6"                                                       // sourcePath = CBOR null
                + bytesHeader(COMPILER_VERSION.getBytes().length) + HexUtil.encodeHexString(COMPILER_VERSION.getBytes())
                + "a0"                                                       // empty parameters map
                + "ff";

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    // ---------------------------------------------------------------------
    // Unrecognized constructors
    // ---------------------------------------------------------------------

    @Test
    public void unrecognizedConstructorSixDrops() {
        // Constructor 6 was PLUTUS before the CIP-171 realignment; a 6-field
        // Aiken-shaped record under it must now be dropped, not attributed
        var hex = constr(6,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                BytesPlutusData.of(COMPILER_VERSION),
                BytesPlutusData.of(""),
                parametersMap());

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    @Test
    public void unrecognizedConstructorEightDrops() {
        var hex = constr(8,
                BytesPlutusData.of(SOURCE_URL),
                BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH)),
                BytesPlutusData.of(SOURCE_PATH),
                BytesPlutusData.of(COMPILER_VERSION),
                parametersMap());

        Assertions.assertTrue(parser.parse(hex).isEmpty());
    }

    // ---------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------

    private static PlutusScanRequest aikenRequest(String env) {
        return PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl(SOURCE_URL)
                .commitHash(COMMIT_HASH)
                .sourcePath(SOURCE_PATH)
                .compilerVersion(COMPILER_VERSION)
                .env(env)
                .parameters(Map.of(SCRIPT_HASH, List.of(PARAMETER)))
                .build();
    }

    /**
     * v1 schema record: 4 mandatory bytestrings plus the optional trailing
     * parameters map.
     */
    private static String v1Record(int alternative, PlutusData... optionalMap) {
        var fields = new PlutusData[4 + optionalMap.length];
        fields[0] = BytesPlutusData.of(SOURCE_URL);
        fields[1] = BytesPlutusData.of(HexUtil.decodeHexString(COMMIT_HASH));
        fields[2] = BytesPlutusData.of(SOURCE_PATH);
        fields[3] = BytesPlutusData.of(COMPILER_VERSION);
        System.arraycopy(optionalMap, 0, fields, 4, optionalMap.length);
        return constr(alternative, fields);
    }

    private static String constr(int alternative, PlutusData... fields) {
        return ConstrPlutusData.of(alternative, fields).serializeToHex();
    }

    private static MapPlutusData parametersMap() {
        var map = new MapPlutusData();
        map.put(BytesPlutusData.of(HexUtil.decodeHexString(SCRIPT_HASH)),
                ListPlutusData.of(BytesPlutusData.of(HexUtil.decodeHexString(PARAMETER))));
        return map;
    }

    /** CBOR major type 2 header for a definite-length bytestring. */
    private static String bytesHeader(int length) {
        if (length < 24) {
            return String.format("%02x", 0x40 + length);
        }
        if (length < 256) {
            return String.format("58%02x", length);
        }
        return String.format("59%04x", length);
    }

}
