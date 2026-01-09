package com.easy1staking.plutusscan;

import com.bloxbean.cardano.client.plutus.spec.BytesPlutusData;
import com.bloxbean.cardano.client.plutus.spec.PlutusData;
import com.bloxbean.cardano.client.util.HexUtil;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;

@Slf4j
public class SerdeTest {

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


}
