package com.easy1staking.plutusscan.service;

import com.easy1staking.plutusscan.domain.entity.PlutusJsonCacheEntity;
import com.easy1staking.plutusscan.domain.repository.PlutusJsonCacheRepository;
import com.easy1staking.plutusscan.model.CompilerType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

/**
 * Service for caching plutus.json build artifacts
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PlutusJsonCacheService {

    private final PlutusJsonCacheRepository cacheRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Get cached plutus.json content
     *
     * @return Optional containing JSON string if cached, empty otherwise
     */
    @Transactional(readOnly = true)
    public Optional<String> get(CompilerType compilerType, String sourceUrl,
                                String commitHash, String compilerVersion) {
        log.debug("Checking cache for {} @ {} with {} {}",
            sourceUrl, commitHash, compilerType, compilerVersion);

        return cacheRepository.findByCompilerTypeAndSourceUrlAndCommitHashAndCompilerVersion(
                compilerType, sourceUrl, commitHash, compilerVersion)
            .map(entity -> {
                try {
                    String json = objectMapper.writeValueAsString(entity.getPlutusJsonContent());
                    log.info("Cache hit for {} @ {}", sourceUrl, commitHash);
                    return json;
                } catch (JsonProcessingException e) {
                    log.error("Failed to serialize cached plutus.json", e);
                    return null;
                }
            });
    }

    /**
     * Store plutus.json content in cache
     */
    @Transactional
    public void put(CompilerType compilerType, String sourceUrl,
                   String commitHash, String compilerVersion, String plutusJsonContent) {
        try {
            log.info("Caching plutus.json for {} @ {}", sourceUrl, commitHash);

            // Parse JSON string to Map
            @SuppressWarnings("unchecked")
            Map<String, Object> contentMap = objectMapper.readValue(plutusJsonContent, Map.class);

            // Check if already exists
            var existing = cacheRepository.findByCompilerTypeAndSourceUrlAndCommitHashAndCompilerVersion(
                compilerType, sourceUrl, commitHash, compilerVersion);

            if (existing.isPresent()) {
                log.debug("Cache entry already exists, updating");
                existing.get().setPlutusJsonContent(contentMap);
                cacheRepository.save(existing.get());
            } else {
                PlutusJsonCacheEntity entity = PlutusJsonCacheEntity.builder()
                    .compilerType(compilerType)
                    .sourceUrl(sourceUrl)
                    .commitHash(commitHash)
                    .compilerVersion(compilerVersion)
                    .plutusJsonContent(contentMap)
                    .build();

                cacheRepository.save(entity);
                log.info("Successfully cached plutus.json for {} @ {}", sourceUrl, commitHash);
            }
        } catch (JsonProcessingException e) {
            log.error("Failed to parse plutus.json for caching", e);
        }
    }
}
