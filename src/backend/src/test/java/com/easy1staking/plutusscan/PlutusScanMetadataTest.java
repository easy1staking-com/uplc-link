package com.easy1staking.plutusscan;

import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.api.model.Amount;
import com.bloxbean.cardano.client.backend.blockfrost.service.BFBackendService;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.function.helper.SignerProviders;
import com.bloxbean.cardano.client.metadata.MetadataBuilder;
import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.quicktx.QuickTxBuilder;
import com.bloxbean.cardano.client.quicktx.Tx;
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

import static com.bloxbean.cardano.client.backend.blockfrost.common.Constants.BLOCKFROST_MAINNET_URL;
import static com.bloxbean.cardano.client.backend.blockfrost.common.Constants.BLOCKFROST_PREVIEW_URL;

@Slf4j
public class PlutusScanMetadataTest extends EnvVarInjectionTest {

    private final BFBackendService bfBackendService = new BFBackendService(BLOCKFROST_MAINNET_URL, BLOCKFROST_KEY);

    private final QuickTxBuilder quickTxBuilder = new QuickTxBuilder(bfBackendService);

    @Test
    public void test() {

        var plutusScanTxMetadata = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("https://github.com/easy1staking-com/cardano-recurring-payment")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
//                .sourcePath("")
                .compilerVersion("v1.1.3")
                .parameters(Map.of("e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b", List.of("D8799F58208C198E942F1F7A60E704AA1651333B45BCCD51653259204E4DAC38B559844DD800FF"),
                        "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e", List.of("581c66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0")))
                .build();

        log.info("{}", plutusScanTxMetadata.toPlutusData().serializeToHex());

        var account = Account.createFromMnemonic(Networks.mainnet(), WALLET_MNEMONIC);

        var list = MetadataBuilder.createList();
        var bytesChunks = plutusScanTxMetadata.toCborBytesChunks(64);
        bytesChunks.forEach(list::add);

        var metadata = MetadataBuilder.createMetadata().put(1984L, list);

        var tx = new Tx()
                .from(account.baseAddress())
                .payToAddress(account.baseAddress(), Amount.ada(1))
                .attachMetadata(metadata);

        quickTxBuilder.compose(tx)
                .feePayer(account.baseAddress())
                .withSigner(SignerProviders.signerFrom(account))
                .completeAndWait();

    }

    @Test
    public void deserialiseTest() throws Exception {

        PlutusScanRequestParser plutusScanRequestParser = new PlutusScanRequestParser(new ObjectMapper());

        var metadataCbor = "a11907c0845840d8799f5065617379317374616b696e672d636f6d581963617264616e6f2d726563757272696e672d7061796d656e745435f1a0d51c8663782ab052f869d5c82b5840756e8615404676312e312e33a2581c39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e9f581c66d403abc1d6f1206b74c64204766e46601b584088747575f6a0a02142a0ff581ce513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b9f5827d8799f58208c198e942f1f7a60e704aa1651333b5545bccd51653259204e4dac38b559844dd800ffffff";

        var dataMap = (MapPlutusData) PlutusData.deserialize(HexUtil.decodeHexString(metadataCbor));

        var list = (ListPlutusData) dataMap.getMap().get(BigIntPlutusData.of(1984L));

        var reversed = list.getPlutusDataList()
                .stream()
                .map(chunk -> HexUtil.encodeHexString(((BytesPlutusData) chunk).getValue()))
                .collect(Collectors.joining());

        log.info("{}", list);

        var actual = plutusScanRequestParser.parse(reversed).get();

        log.info("{}", actual);

        var expected = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("http://github.com/easy1staking-com/cardano-recurring-payment")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
                .sourcePath("")
                .compilerVersion("v1.1.3")
                .parameters(Map.of("e513498211e006e0fa7679e7c51ef09fd0b53904b7bfa5d9fb3dd01b", List.of("D8799F58208C198E942F1F7A60E704AA1651333B45BCCD51653259204E4DAC38B559844DD800FF".toLowerCase()),
                        "39b875da204d886d1ea0c4ae193281b819236efa36ab0b711bb3977e", List.of("66d403abc1d6f1206b74c64204766e46601b88747575f6a0a02142a0")))
                .build();

        Assertions.assertEquals(expected, actual);


    }

}
