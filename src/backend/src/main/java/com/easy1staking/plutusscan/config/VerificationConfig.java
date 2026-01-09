package com.easy1staking.plutusscan.config;

import com.easy1staking.plutusscan.service.compiler.CompilerService;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Configuration for verification services
 */
@Configuration
@Slf4j
public class VerificationConfig {

    /**
     * Create a map of compiler services keyed by compiler type name (lowercase)
     * This allows VerificationService to look up the appropriate compiler dynamically
     */
    @Component
    @RequiredArgsConstructor
    public static class CompilerServices {

        private final List<CompilerService> services;

        @Getter
        private Map<String, CompilerService> compilerServiceMap;

        @PostConstruct
        public void init() {
            compilerServiceMap = services.stream()
                    .collect(Collectors.toMap(
                            service -> service.getCompilerType().name().toLowerCase(),
                            Function.identity()));
        }
    }
}
