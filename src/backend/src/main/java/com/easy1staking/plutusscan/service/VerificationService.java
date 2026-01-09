package com.easy1staking.plutusscan.service;

import com.easy1staking.plutusscan.config.VerificationConfig;
import com.easy1staking.plutusscan.domain.entity.VerificationRequestEntity;
import com.easy1staking.plutusscan.domain.enums.VerificationStatus;
import com.easy1staking.plutusscan.domain.repository.VerificationRequestRepository;
import com.easy1staking.plutusscan.dto.ParsedValidator;
import com.easy1staking.plutusscan.service.compiler.CompilerService;
import com.easy1staking.plutusscan.service.plutusjson.PlutusJsonParserFactory;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Main service for orchestrating the verification workflow
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class VerificationService {

    private final VerificationRequestRepository verificationRequestRepository;
    private final PlutusJsonCacheService cacheService;
    private final VerificationConfig.CompilerServices compilerServices;
    private final PlutusJsonParserFactory parserFactory;
    private final ScriptService scriptService;

    @PostConstruct
    public void init() {

        log.info("INIT - compilerServiceMap size: {}", compilerServices.getCompilerServiceMap().size());
        log.info("INIT - compilerServiceMap keys: {}", String.join(",", compilerServices.getCompilerServiceMap().keySet()));
    }

    /**
     * Process a verification request
     * This is the main workflow: compile → parse → create scripts
     *
     * @param request The verification request to process
     */
    @Transactional
    public void processVerification(VerificationRequestEntity request) {
        log.info("Processing verification request id={}, {} @ {}",
            request.getId(),
            request.getSourceUrl(),
            request.getCommitHash());

        try {
            // Update status to PROCESSING
            request.setStatus(VerificationStatus.PROCESSING);
            request.setErrorMessage(null);
            verificationRequestRepository.save(request);

            // Check cache
            var cachedPlutusJson = cacheService.get(
                request.getCompilerType(),
                request.getSourceUrl(),
                request.getCommitHash(),
                request.getCompilerVersion()
            );

            String plutusJsonContent;
            if (cachedPlutusJson.isPresent()) {
                log.info("Using cached plutus.json for {} @ {}",
                    request.getSourceUrl(), request.getCommitHash());
                plutusJsonContent = cachedPlutusJson.get();
            } else {
                // Compile from source
                log.info("Cache miss, compiling from source");

                // Get appropriate compiler service
                String compilerKey = request.getCompilerType().name().toLowerCase();
                log.info("Compiler key: {}", compilerKey);
                CompilerService compilerService = compilerServices.getCompilerServiceMap().get(compilerKey);

                if (compilerService == null) {
                    throw new IllegalStateException(
                        "No compiler service found for type: " + request.getCompilerType());
                }

                plutusJsonContent = compilerService.compile(
                    request.getSourceUrl(),
                    request.getCommitHash(),
                    request.getCompilerVersion(),
                    request.getSourcePath()
                );

                // Cache the result
                cacheService.put(
                    request.getCompilerType(),
                    request.getSourceUrl(),
                    request.getCommitHash(),
                    request.getCompilerVersion(),
                    plutusJsonContent
                );
            }

            // Parse plutus.json
            var parser = parserFactory.getParser(
                request.getCompilerType(),
                request.getCompilerVersion());

            List<ParsedValidator> parsedValidators = parser.parse(plutusJsonContent);

            if (parsedValidators.isEmpty()) {
                log.warn("No validators found in plutus.json for {} @ {}",
                    request.getSourceUrl(), request.getCommitHash());
            }

            // Create script entities
            scriptService.createScripts(request, parsedValidators);

            // Update status to VERIFIED
            request.setStatus(VerificationStatus.VERIFIED);
            request.setErrorMessage(null);
            verificationRequestRepository.save(request);

            log.info("Successfully verified {} @ {} with {} scripts",
                request.getSourceUrl(),
                request.getCommitHash(),
                parsedValidators.size());

        } catch (Exception e) {
            log.error("Verification failed for {} @ {}",
                request.getSourceUrl(), request.getCommitHash(), e);

            request.setRetryCount(request.getRetryCount() + 1);
            request.setErrorMessage(e.getMessage());
            request.setStatus(VerificationStatus.FAILED);
            verificationRequestRepository.save(request);

            throw new RuntimeException("Verification failed", e);
        }
    }
}
