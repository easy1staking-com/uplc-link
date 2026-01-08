package com.easy1staking.plutusscan.service;

import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.util.HexUtil;
import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataEvent;
import com.easy1staking.plutusscan.model.PlutusScanRequestParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.math.BigInteger;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TxMetadataEventListener {

    private static final String PLUTUS_SCAN_METADATA_ID = "1984";

    private final PlutusScanRequestParser plutusScanRequestParser;

    @EventListener
    public void processBlock(TxMetadataEvent txMetadataEvent) {
        txMetadataEvent.getTxMetadataList()
                .stream()
                .filter(label -> label.getLabel().equals(PLUTUS_SCAN_METADATA_ID))
                .forEach(txMetadataLabel -> {
                    var cbor = txMetadataLabel.getCbor();

                    try {
                        var dataMap = (MapPlutusData) PlutusData.deserialize(HexUtil.decodeHexString(cbor));

                        var list = (ListPlutusData) dataMap.getMap().get(BigIntPlutusData.of(new BigInteger(PLUTUS_SCAN_METADATA_ID)));

                        var reassembled = list.getPlutusDataList()
                                .stream()
                                .map(chunk -> HexUtil.encodeHexString(((BytesPlutusData) chunk).getValue()))
                                .collect(Collectors.joining());

                        log.info("{}", list);

                        var actual = plutusScanRequestParser.parse(reassembled).get();

                    } catch (Exception e) {
                        var txHash = txMetadataLabel.getTxHash();
                        var blockHash = txMetadataEvent.getEventMetadata().getBlockHash();
                        log.warn("could not process tx {} at block {}, metadata cbor: {}", txHash, blockHash, cbor, e);
                    }

                });
    }


}
