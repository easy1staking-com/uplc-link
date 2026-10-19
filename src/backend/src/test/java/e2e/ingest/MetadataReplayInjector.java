package e2e.ingest;

import com.bloxbean.cardano.yaci.store.events.EventMetadata;
import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataEvent;
import com.bloxbean.cardano.yaci.store.metadata.domain.TxMetadataLabel;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.env.Environment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Test-only stand-in for yaci-store's chain sync, used by the runtime-image E2E
 * harness (e2e/runtime/run.sh). It replays label-1984 records from a local file
 * as the same {@link TxMetadataEvent} yaci-store would publish, so the real
 * ingest path (TxMetadataEventListener -> TxMetadataProcessor -> parser ->
 * validator) runs unchanged inside the production BE image.
 *
 * Deliberately a plain class in package {@code e2e.ingest}, outside the
 * component-scan root {@code com.easy1staking.plutusscan}: it is loaded only
 * when the harness starts the boot jar through PropertiesLauncher with
 * {@code -Dloader.path=<dir with the compiled class>} and
 * {@code --spring.main.sources=e2e.ingest.MetadataReplayInjector}. It lives in
 * src/test, so it is never packaged into the boot jar. Inert unless
 * {@code e2e.replay.file} is set.
 *
 * File format: one record per non-blank line, {@code <txHash> <labelCborHex>}
 * where the hex is the whole label map {@code {1984: [chunks]}}.
 */
public class MetadataReplayInjector implements ApplicationRunner {

    private final ApplicationEventPublisher publisher;
    private final Environment environment;

    public MetadataReplayInjector(ApplicationEventPublisher publisher, Environment environment) {
        this.publisher = publisher;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        String file = environment.getProperty("e2e.replay.file");
        if (file == null || file.isEmpty()) {
            return;
        }

        List<String> lines = Files.readAllLines(Path.of(file)).stream()
                .filter(line -> !line.isBlank())
                .toList();

        for (int i = 0; i < lines.size(); i++) {
            int n = i + 1;
            String[] tokens = lines.get(i).trim().split("\\s+");
            if (tokens.length != 2) {
                throw new IllegalArgumentException(
                        "Replay line " + n + " must be '<txHash> <labelCborHex>', got " + tokens.length + " token(s)");
            }
            String txHash = tokens[0];

            var meta = EventMetadata.builder()
                    .slot(n)
                    .block(n)
                    .blockHash(String.format("%064x", n))
                    .build();
            var label = TxMetadataLabel.builder()
                    .txHash(txHash)
                    .slot((long) n)
                    .label("1984")
                    .cbor(tokens[1])
                    .build();

            publisher.publishEvent(new TxMetadataEvent(meta, List.of(label)));
            System.out.println("E2E-INJECTED " + txHash);
        }
    }
}
