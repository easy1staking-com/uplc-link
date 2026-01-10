package com.easy1staking.plutusscan.controller;

import com.easy1staking.plutusscan.dto.response.ScriptListResponseDto;
import com.easy1staking.plutusscan.service.AddressService;
import com.easy1staking.plutusscan.service.ScriptService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for querying scripts
 */
@RestController
@RequestMapping("${apiPrefix}/scripts")
@RequiredArgsConstructor
@Slf4j
public class ScriptController {

    private final ScriptService scriptService;
    private final AddressService addressService;

    /**
     * Get scripts by source URL and commit hash
     * Example: GET /api/v1/scripts/by-source?sourceUrl=https://github.com/org/repo&commit=35f1a0d...
     * Example: GET /api/v1/scripts/by-source?sourceUrl=https://gitlab.com/group/subgroup/project&commit=abc123...
     */
    @GetMapping("/by-source")
    public ResponseEntity<ScriptListResponseDto> getScriptsBySource(
            @RequestParam String sourceUrl,
            @RequestParam String commit) {

        log.info("Query scripts by source: {} @ {}", sourceUrl, commit);

        var scripts = scriptService.findBySourceUrlAndCommit(sourceUrl, commit);

        if (scripts.isEmpty()) {
            log.info("No scripts found for {} @ {}", sourceUrl, commit);
            return ResponseEntity.notFound().build();
        }

        var response = ScriptListResponseDto.fromEntities(scripts);
        return ResponseEntity.ok(response);
    }

    /**
     * Get scripts by script hash (raw or final)
     * Example: GET /api/v1/scripts/by-hash/abc123...
     */
    @GetMapping("/by-hash/{scriptHash}")
    public ResponseEntity<ScriptListResponseDto> getScriptsByHash(
            @PathVariable String scriptHash) {

        log.info("Query scripts by hash: {}", scriptHash);

        var scripts = scriptService.findByHash(scriptHash);

        if (scripts.isEmpty()) {
            log.info("No scripts found for hash: {}", scriptHash);
            return ResponseEntity.notFound().build();
        }

        var response = ScriptListResponseDto.fromEntities(scripts);
        return ResponseEntity.ok(response);
    }

    /**
     * Get scripts by Cardano address
     * Supports: base addresses, enterprise addresses, stake addresses, direct script hash
     * Example: GET /api/v1/scripts/by-address/addr1w8qmxk...
     */
    @GetMapping("/by-address/{address}")
    public ResponseEntity<ScriptListResponseDto> getScriptsByAddress(
            @PathVariable String address) {

        log.info("Query scripts by address: {}", address);

        // Extract script hash from address (or validate if already a hash)
        var scriptHashOpt = addressService.normalizeToScriptHash(address);

        if (scriptHashOpt.isEmpty()) {
            log.warn("Address does not contain a script hash or is invalid: {}", address);
            return ResponseEntity.badRequest().build();
        }

        String scriptHash = scriptHashOpt.get();
        log.debug("Resolved address {} to script hash: {}", address, scriptHash);

        var scripts = scriptService.findByHash(scriptHash);

        if (scripts.isEmpty()) {
            log.info("No scripts found for address/hash: {}", address);
            return ResponseEntity.notFound().build();
        }

        var response = ScriptListResponseDto.fromEntities(scripts);
        return ResponseEntity.ok(response);
    }

    /**
     * Search scripts by partial source URL pattern (case-insensitive)
     * Example: GET /api/v1/scripts/search?urlPattern=sundae-labs
     * Example: GET /api/v1/scripts/search?urlPattern=easy1staking
     * Example: GET /api/v1/scripts/search?urlPattern=aiken-lang
     */
    @GetMapping("/search")
    public ResponseEntity<List<ScriptListResponseDto>> searchScripts(
            @RequestParam("urlPattern") String urlPattern) {

        log.info("Search request for URL pattern: {}", urlPattern);

        if (urlPattern == null || urlPattern.trim().isEmpty()) {
            log.warn("Empty URL pattern provided");
            return ResponseEntity.badRequest().build();
        }

        List<ScriptListResponseDto> results = scriptService.searchByUrlPattern(urlPattern);

        if (results.isEmpty()) {
            log.info("No scripts found matching pattern: {}", urlPattern);
            return ResponseEntity.ok(List.of());  // Return empty list instead of 404
        }

        log.info("Found {} verification requests matching pattern '{}'", results.size(), urlPattern);
        return ResponseEntity.ok(results);
    }
}
