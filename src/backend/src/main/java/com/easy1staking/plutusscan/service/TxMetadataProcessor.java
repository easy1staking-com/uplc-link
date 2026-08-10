package com.easy1staking.plutusscan.service;

import com.bloxbean.cardano.client.plutus.spec.*;
import com.bloxbean.cardano.client.util.HexUtil;
import com.bloxbean.cardano.yaci.store.events.EventMetadata;
import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataLabel;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.model.PlutusScanRequest;
import com.easy1staking.plutusscan.model.PlutusScanRequestParser;
import com.easy1staking.plutusscan.util.RequestValidator;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigInteger;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

import static com.easy1staking.plutusscan.model.Constants.PLUTUS_SCAN_METADATA_ID;

/**
 * Ingests label-1984 metadata from the chain into verification requests.
 *
 * All input here is attacker-controlled: anyone can submit a 1984 tx directly
 * on-chain, bypassing any frontend. Validation must be complete at this
 * boundary. Semantically invalid requests are persisted as REJECTED (never
 * retried) so discarded submissions remain observable; only CBOR that cannot
 * even be parsed into the request shape is dropped with a log (the entity's
 * non-null columns cannot be filled for those).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TxMetadataProcessor {

    private final PlutusScanRequestParser plutusScanRequestParser;

    private final VerificationRequestRepository verificationRequestRepository;

    @Value("${verification.failure-retry-ttl-hours:24}")
    private long failureRetryTtlHours;

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void process(EventMetadata eventMetadata, TxMetadataLabel txMetadataLabel) {
        try {
            var cbor = txMetadataLabel.getCbor();
            var txHash = txMetadataLabel.getTxHash();
            var slot = eventMetadata.getSlot();

            // Idempotency: yaci-store re-emits events on re-sync/rollback
            if (verificationRequestRepository.existsByTxHash(txHash)) {
                log.info("Tx {} already ingested, skipping", txHash);
                return;
            }

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

            log.info("Received verification request: {} @ {} from tx {}",
                    plutusScanRequest.sourceUrl(),
                    plutusScanRequest.commitHash(),
                    txHash);

            // Semantic validation — invalid content becomes a REJECTED record
            var rejection = RequestValidator.validate(plutusScanRequest);
            if (rejection.isPresent()) {
                log.warn("Rejecting request from tx {}: {}", txHash, rejection.get());
                saveRequest(plutusScanRequest, txHash, slot, VerificationStatus.REJECTED, rejection.get());
                return;
            }

            // Content dedup: identical VERIFIED content is never reprocessed;
            // identical FAILED/REJECTED content is skipped within the TTL so
            // failure spam can't force rebuilds, but retries reopen later
            var duplicate = findContentDuplicate(plutusScanRequest);
            if (duplicate.isPresent()) {
                var existing = duplicate.get();
                if (existing.getStatus() == VerificationStatus.VERIFIED) {
                    log.info("Content of tx {} already VERIFIED as request id={}, skipping",
                            txHash, existing.getId());
                    return;
                }
                var retryOpensAt = existing.getUpdatedAt().plusHours(failureRetryTtlHours);
                if (LocalDateTime.now().isBefore(retryOpensAt)) {
                    log.info("Content of tx {} matches {} request id={} within TTL (retry opens {}), skipping",
                            txHash, existing.getStatus(), existing.getId(), retryOpensAt);
                    return;
                }
                log.info("Content of tx {} matches {} request id={} but TTL expired, reprocessing",
                        txHash, existing.getStatus(), existing.getId());
            }

            var entity = saveRequest(plutusScanRequest, txHash, slot, VerificationStatus.PENDING, null);

            log.info("Created verification request id={} for {} @ {}, tx={}, slot={}",
                    entity.getId(),
                    plutusScanRequest.sourceUrl(),
                    plutusScanRequest.commitHash(),
                    txHash,
                    slot);

        } catch (Throwable e) {
            // Throwable, not Exception: hostile metadata can nest PlutusData
            // deeply enough to raise StackOverflowError during the recursive
            // deserialize/parse. That's an Error, not an Exception, and letting
            // it escape would kill the yaci-store event thread — so one crafted
            // tx must not take down ingest. Nothing is persisted on this path.
            var txHash = txMetadataLabel.getTxHash();
            var blockHash = eventMetadata.getBlockHash();
            log.error("Failed to process verification metadata from tx {} at block {}", txHash, blockHash, e);
        }
    }

    /**
     * Find an existing request with identical content: same source, commit,
     * compiler type/version, source path, env AND parameters. Same repo+commit
     * with different parameters is a legitimate new submission (different final
     * hashes), so parameters are part of the identity — and env is too, since
     * aiken --env bakes different constants into the bytecode (null ≡ empty,
     * plain string comparison, no "default" special-casing).
     */
    private Optional<VerificationRequestEntity> findContentDuplicate(PlutusScanRequest request) {
        List<VerificationRequestEntity> candidates = verificationRequestRepository
                .findBySourceUrlAndCommitHashOrderByCreatedAtDesc(
                        request.sourceUrl(), request.commitHash());

        return candidates.stream()
                .filter(c -> c.getCompilerType() == request.compilerType())
                .filter(c -> Objects.equals(c.getCompilerVersion(), request.compilerVersion()))
                .filter(c -> Objects.equals(emptyToNull(c.getSourcePath()), emptyToNull(request.sourcePath())))
                .filter(c -> Objects.equals(emptyToNull(c.getEnv()), emptyToNull(request.env())))
                .filter(c -> Objects.equals(c.getParametersJson(), request.parameters()))
                .findFirst();
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    private VerificationRequestEntity saveRequest(PlutusScanRequest request, String txHash, Long slot,
                                                  VerificationStatus status, String errorMessage) {
        var entity = VerificationRequestEntity.builder()
                .txHash(txHash)
                .slot(slot)
                .sourceUrl(truncate(request.sourceUrl(), RequestValidator.MAX_SOURCE_URL_LENGTH))
                .commitHash(truncate(request.commitHash(), 64))
                .compilerType(request.compilerType())
                .compilerVersion(truncate(request.compilerVersion(), 255))
                .sourcePath(truncate(request.sourcePath(), RequestValidator.MAX_SOURCE_PATH_LENGTH))
                .env(truncate(request.env(), RequestValidator.MAX_ENV_LENGTH))
                .parametersJson(request.parameters())
                .status(status)
                .errorMessage(errorMessage)
                .retryCount(0)
                .build();
        return verificationRequestRepository.save(entity);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
