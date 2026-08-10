package com.easy1staking.plutusscan;

import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.util.HexUtil;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.model.PlutusScanRequest;
import com.easy1staking.plutusscan.model.PlutusScanRequestParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
public class SerdeTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    public void deserializationTest1() throws Exception {

        var utxoBytes = "d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ff";
        var scriptHash = "66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0";

        var utxoPlutusData = PlutusData.deserialize(HexUtil.decodeHexString(utxoBytes));
//        var scriptHashPlutusData = PlutusData.deserialize(HexUtil.decodeHexString(scriptHash));

        var foo = BytesPlutusData.of(HexUtil.decodeHexString(scriptHash)).serializeToHex();
        log.info("scriptHash: {}", scriptHash);
        log.info("foo: {}", foo);

    }

    /**
     * Byte-identity anchor with the frontend encoder: this expected hex is the
     * same fixture asserted in src/frontend/__tests__/metadata-encoding.test.ts.
     * 6-field CIP-171 layout — env at index 4 (empty bytes = no --env flag),
     * parameters map at index 5.
     */
    @Test
    public void simpleSerdeTest() {
        var expected = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("http://github.com/easy1staking-com/cardano-recurring-payment")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
                .sourcePath("")
                .compilerVersion("v1.1.3")
                .parameters(Map.of("e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b", List.of("D8799F58208C198E942F1F7A60E704AA1651333B45BCCD51653259204E4DAC38B559844DD800FF".toLowerCase()),
                        "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e", List.of("66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0")))
                .build();

        var metadataValue = expected.toPlutusData().serializeToHex();
        log.info("{}", metadataValue);

        Assertions.assertEquals(
                "d8799f583c687474703a2f2f6769746875622e636f6d2f65617379317374616b696e672d636f6d2f63617264616e6f2d726563757272696e672d7061796d656e745435f1a0d51c8663782ab052f869d5c82b756e8615404676312e312e3340a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f581c66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f5827d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ffffff",
                metadataValue.toLowerCase());

        var chunks = expected.toCborBytesChunks(64);
        chunks.forEach(chunk -> log.info("{}", HexUtil.encodeHexString(chunk)));

        // Same request built with an env: the env bytestring ("preview", 7
        // UTF-8 bytes) must sit between compilerVersion and the parameters map
        var withEnv = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("http://github.com/easy1staking-com/cardano-recurring-payment")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
                .sourcePath("")
                .compilerVersion("v1.1.3")
                .env("preview")
                .parameters(Map.of("e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b", List.of("D8799F58208C198E942F1F7A60E704AA1651333B45BCCD51653259204E4DAC38B559844DD800FF".toLowerCase()),
                        "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e", List.of("66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0")))
                .build();

        Assertions.assertEquals(
                "d8799f583c687474703a2f2f6769746875622e636f6d2f65617379317374616b696e672d636f6d2f63617264616e6f2d726563757272696e672d7061796d656e745435f1a0d51c8663782ab052f869d5c82b756e8615404676312e312e334770726576696577a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f581c66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f5827d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ffffff",
                withEnv.toPlutusData().serializeToHex().toLowerCase());
    }


    /**
     * Pre-env 5-field submissions are deliberately unparseable under the
     * redefined 6-field schema: they must be dropped (empty), not misread.
     * This CBOR is a real old-format on-chain payload.
     */
    @Test
    public void oldFiveFieldFormatIsDropped() throws Exception {

        PlutusScanRequestParser plutusScanRequestParser = new PlutusScanRequestParser(OBJECT_MAPPER);

        var metadataCbor = "a11907c0845840d8799f583d68747470733a2f2f6769746875622e636f6d2f65617379317374616b696e672d636f6d2f63617264616e6f2d726563757272696e672d7061796d6558406e745435f1a0d51c8663782ab052f869d5c82b756e8615404676312e312e33a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f5858401e581c66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f58582a27d8799f58208c198e942f1f7a60e704aa1651333b45bccd51653259204e4dac38b559844dd800ffffff";

        var dataMap = (MapPlutusData) PlutusData.deserialize(HexUtil.decodeHexString(metadataCbor));

        var list = (ListPlutusData) dataMap.getMap().get(BigIntPlutusData.of(1984L));

        var reversed = list.getPlutusDataList()
                .stream()
                .map(chunk -> HexUtil.encodeHexString(((BytesPlutusData) chunk).getValue()))
                .collect(Collectors.joining());

        Assertions.assertTrue(plutusScanRequestParser.parse(reversed).isEmpty());
    }

    /**
     * 6-field round-trip: serialize → parse must reproduce the request, both
     * without env (empty bytes → null) and with one.
     */
    @Test
    public void deserializationTest2() {

        PlutusScanRequestParser plutusScanRequestParser = new PlutusScanRequestParser(OBJECT_MAPPER);

        var withoutEnv = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("https://github.com/easy1staking-com/cardano-recurring-payment")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
                .sourcePath("")
                .compilerVersion("v1.1.3")
                .parameters(Map.of("39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e", List.of("66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0"),
                        "e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b", List.of("D8799F58208C198E942F1F7A60E704AA1651333B45BCCD51653259204E4DAC38B559844DD800FF".toLowerCase())))
                .build();

        var parsedWithoutEnv = plutusScanRequestParser.parse(withoutEnv.toPlutusData().serializeToHex()).get();
        Assertions.assertEquals(withoutEnv, parsedWithoutEnv);
        Assertions.assertNull(parsedWithoutEnv.env());

        var withEnv = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("https://github.com/easy1staking-com/cardano-recurring-payment")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
                .sourcePath("")
                .compilerVersion("v1.1.3")
                .env("mainnet")
                .parameters(Map.of("39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e", List.of("66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0")))
                .build();

        var parsedWithEnv = plutusScanRequestParser.parse(withEnv.toPlutusData().serializeToHex()).get();
        Assertions.assertEquals(withEnv, parsedWithEnv);
        Assertions.assertEquals("mainnet", parsedWithEnv.env());
    }


}
