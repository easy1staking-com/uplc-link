package com.easy1staking.plutusscan;

import com.bloxbean.cardano.client.plutus.spec.BigIntPlutusData;
import com.bloxbean.cardano.client.plutus.spec.BytesPlutusData;
import com.bloxbean.cardano.client.plutus.spec.ListPlutusData;
import com.bloxbean.cardano.client.plutus.spec.MapPlutusData;
import com.bloxbean.cardano.client.plutus.spec.PlutusData;
import com.bloxbean.cardano.yaci.store.events.EventMetadata;
import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataLabel;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.model.CompilerType;
import com.easy1staking.plutusscan.model.PlutusScanRequest;
import com.easy1staking.plutusscan.model.PlutusScanRequestParser;
import com.easy1staking.plutusscan.service.TxMetadataProcessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Ingest end of the label-1984 path: the label map {1984: [chunks]} is fed to
 * TxMetadataProcessor exactly as yaci-store delivers it, through the real
 * parser and validator, and the persisted row is captured from the repository.
 */
public class TxMetadataProcessorTest {

    private static final String TX_HASH = "ab".repeat(32);

    private VerificationRequestRepository repo;
    private TxMetadataProcessor processor;

    @BeforeEach
    void setUp() {
        repo = mock(VerificationRequestRepository.class);
        when(repo.save(any(VerificationRequestEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        processor = new TxMetadataProcessor(new PlutusScanRequestParser(new ObjectMapper()), repo);
    }

    private static String labelCbor(String compilerVersion) {
        var request = PlutusScanRequest.builder()
                .compilerType(CompilerType.AIKEN)
                .sourceUrl("https://github.com/org/repo")
                .commitHash("35f1a0d51c8663782ab052f869d5c82b756e8615")
                .compilerVersion(compilerVersion)
                .parameters(Map.of())
                .build();
        var chunks = ListPlutusData.of(request.toCborBytesChunks(64).stream()
                .map(BytesPlutusData::of)
                .toArray(PlutusData[]::new));
        var label = new MapPlutusData();
        label.put(BigIntPlutusData.of(1984), chunks);
        return label.serializeToHex();
    }

    private VerificationRequestEntity ingest(String compilerVersion) {
        var meta = EventMetadata.builder()
                .slot(1)
                .block(1)
                .blockHash(String.format("%064x", 1))
                .build();
        var label = TxMetadataLabel.builder()
                .txHash(TX_HASH)
                .slot(1L)
                .label("1984")
                .cbor(labelCbor(compilerVersion))
                .build();

        processor.process(meta, label);

        var saved = ArgumentCaptor.forClass(VerificationRequestEntity.class);
        verify(repo, times(1)).save(saved.capture());
        return saved.getValue();
    }

    @Test
    public void emptyCompilerVersionIsPersistedRejected() {
        var entity = ingest("");

        assertEquals(VerificationStatus.REJECTED, entity.getStatus());
        assertEquals("compiler version required", entity.getErrorMessage());
        assertEquals(TX_HASH, entity.getTxHash());
    }

    @Test
    public void versionedRequestIsPersistedPending() {
        var entity = ingest("v1.1.24");

        assertEquals(VerificationStatus.PENDING, entity.getStatus());
        assertNull(entity.getErrorMessage());
        assertEquals(TX_HASH, entity.getTxHash());
    }
}
