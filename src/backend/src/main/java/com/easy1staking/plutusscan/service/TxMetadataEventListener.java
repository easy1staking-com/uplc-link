package com.easy1staking.plutusscan.service;

import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import static com.easy1staking.plutusscan.model.Constants.PLUTUS_SCAN_METADATA_ID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TxMetadataEventListener {

    private final TxMetadataProcessor txMetadataProcessor;

    @EventListener
    public void processBlock(TxMetadataEvent txMetadataEvent) {
        try {
            txMetadataEvent.getTxMetadataList()
                    .stream()
                    .filter(label -> label != null && PLUTUS_SCAN_METADATA_ID.equals(label.getLabel()))
                    .forEach(txMetadataLabel -> txMetadataProcessor.process(txMetadataEvent.getEventMetadata(), txMetadataLabel));
        } catch (Exception e) {
            log.warn("error", e);
        }

    }
}
