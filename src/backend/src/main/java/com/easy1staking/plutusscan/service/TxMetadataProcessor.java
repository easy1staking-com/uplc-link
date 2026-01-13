package com.easy1staking.plutusscan.service;

import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.util.HexUtil;
import com.bloxbean.cardano.yaci.store.events.EventMetadata;
import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataLabel;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.model.PlutusScanRequestParser;
import com.easy1staking.plutusscan.util.SourceUrlParser;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigInteger;
import java.util.stream.Collectors;

import static com.easy1staking.plutusscan.model.Constants.PLUTUS_SCAN_METADATA_ID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TxMetadataProcessor {

    private final PlutusScanRequestParser plutusScanRequestParser;

    private final VerificationRequestRepository verificationRequestRepository;

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void process(EventMetadata eventMetadata, TxMetadataLabel txMetadataLabel) {
        try {
            var cbor = txMetadataLabel.getCbor();
            var txHash = txMetadataLabel.getTxHash();
            var slot = eventMetadata.getSlot();

            // Parse CBOR metadata
            var dataMap = (MapPlutusData) PlutusData.deserialize(HexUtil.decodeHexString(cbor));
            var list = (ListPlutusData) dataMap.getMap()
                    .get(BigIntPlutusData.of(new BigInteger(PLUTUS_SCAN_METADATA_ID)));

            var reassembled = list.getPlutusDataList()
                    .stream()
                    .map(chunk -> HexUtil.encodeHexString(((BytesPlutusData) chunk).getValue()))
                    .collect(Collectors.joining());

            // Parse plutus scan request
            var plutusScanRequestOpt = plutusScanRequestParser.parse(reassembled);

            if (plutusScanRequestOpt.isEmpty()) {
                log.warn("could not process: {}", txMetadataLabel);
                return;
            }

            var plutusScanRequest = plutusScanRequestOpt.get();

            // Validate source URL
            var parsedUrl = SourceUrlParser.parse(plutusScanRequest.sourceUrl());
            if (parsedUrl.isEmpty()) {
                log.warn("Invalid source URL format: {}", plutusScanRequest.sourceUrl());
                return;
            }

            // Validate commit hash (20 or 32 bytes = 40 or 64 hex chars)
            if (!SourceUrlParser.isValidCommitHash(plutusScanRequest.commitHash())) {
                log.warn("Invalid commit hash: {} (must be 40 or 64 hex chars)", plutusScanRequest.commitHash());
                return;
            }

            log.info("Received verification request: {} @ {} from tx {}",
                    plutusScanRequest.sourceUrl(),
                    plutusScanRequest.commitHash(),
                    txHash);

            // Check if verification request already exists
//            var existingRequest = verificationRequestRepository
//                    .findBySourceUrlAndCommitHash(
//                            plutusScanRequest.sourceUrl(),
//                            plutusScanRequest.commitHash());
//
//            if (existingRequest.isPresent()) {
//                log.info("Verification request already exists for {} @ {}, skipping duplicate from tx {}",
//                        plutusScanRequest.sourceUrl(),
//                        plutusScanRequest.commitHash(),
//                        txHash);
//                return;
//            }

            // Create and save new verification request entity
            var entity = VerificationRequestEntity.builder()
                    .txHash(txHash)
                    .slot(slot)
                    .sourceUrl(plutusScanRequest.sourceUrl())
                    .commitHash(plutusScanRequest.commitHash())
                    .compilerType(plutusScanRequest.compilerType())
                    .compilerVersion(plutusScanRequest.compilerVersion())
                    .sourcePath(plutusScanRequest.sourcePath())
                    .parametersJson(plutusScanRequest.parameters())
                    .status(VerificationStatus.PENDING)
                    .retryCount(0)
                    .build();

            verificationRequestRepository.save(entity);

            log.info("Created verification request id={} for {} @ {}, tx={}, slot={}",
                    entity.getId(),
                    plutusScanRequest.sourceUrl(),
                    plutusScanRequest.commitHash(),
                    txHash,
                    slot);

        } catch (Exception e) {
            var txHash = txMetadataLabel.getTxHash();
            var blockHash = eventMetadata.getBlockHash();
            log.error("Failed to process verification metadata from tx {} at block {}", txHash, blockHash, e);
        }
    }

}
