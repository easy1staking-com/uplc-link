package com.easy1staking.plutusscan.controller;

import com.easy1staking.plutusscan.dto.response.ScriptListResponseDto;
import com.easy1staking.plutusscan.service.AddressService;
import com.easy1staking.plutusscan.service.ScriptService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Scripts", description = "Query and search verified Cardano smart contracts")
public class ScriptController {

    private final ScriptService scriptService;
    private final AddressService addressService;

    /**
     * Get scripts by source URL and commit hash
     * Example: GET /api/v1/scripts/by-source?sourceUrl=https://github.com/org/repo&commit=35f1a0d...
     * Example: GET /api/v1/scripts/by-source?sourceUrl=https://gitlab.com/group/subgroup/project&commit=abc123...
     */
    @Operation(
        summary = "Get scripts by source URL and commit",
        description = "Retrieve all verified scripts from a specific Git repository and commit hash. " +
                     "Supports GitHub, GitLab, and Bitbucket URLs."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Scripts found",
            content = @Content(schema = @Schema(implementation = ScriptListResponseDto.class))),
        @ApiResponse(responseCode = "404", description = "No scripts found for this source/commit",
            content = @Content)
    })
    @GetMapping("/by-source")
    public ResponseEntity<ScriptListResponseDto> getScriptsBySource(
            @Parameter(description = "Full Git repository URL (e.g., https://github.com/org/repo)", required = true)
            @RequestParam String sourceUrl,
            @Parameter(description = "Git commit hash (40-character SHA-1)", required = true)
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
    @Operation(
        summary = "Get scripts by hash",
        description = "Retrieve scripts by their hash (works with both raw hash and parameterized hash). " +
                     "The hash should be a 56-character hex string."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Scripts found",
            content = @Content(schema = @Schema(implementation = ScriptListResponseDto.class))),
        @ApiResponse(responseCode = "404", description = "No scripts found with this hash",
            content = @Content)
    })
    @GetMapping("/by-hash/{scriptHash}")
    public ResponseEntity<ScriptListResponseDto> getScriptsByHash(
            @Parameter(description = "Script hash (56-character hex string)", required = true, example = "a3b2c1...")
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
    @Operation(
        summary = "Get scripts by Cardano address",
        description = "Retrieve scripts by a Cardano address. Supports base addresses (addr1...), " +
                     "enterprise addresses (addr1...), stake addresses (stake1...), or direct script hash. " +
                     "The script hash will be extracted from the address automatically."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Scripts found",
            content = @Content(schema = @Schema(implementation = ScriptListResponseDto.class))),
        @ApiResponse(responseCode = "400", description = "Invalid address format", content = @Content),
        @ApiResponse(responseCode = "404", description = "No scripts found for this address", content = @Content)
    })
    @GetMapping("/by-address/{address}")
    public ResponseEntity<ScriptListResponseDto> getScriptsByAddress(
            @Parameter(description = "Cardano address (addr1..., stake1..., or script hash)",
                      required = true, example = "addr1w8...")
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
    @Operation(
        summary = "Search scripts by URL pattern",
        description = "Search for verified scripts using a partial URL pattern (case-insensitive). " +
                     "Returns all verification requests whose source URL contains the search pattern. " +
                     "Useful for finding all contracts from an organization or project."
    )
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Search results (may be empty)",
            content = @Content(schema = @Schema(implementation = List.class))),
        @ApiResponse(responseCode = "400", description = "Invalid search pattern", content = @Content)
    })
    @GetMapping("/search")
    public ResponseEntity<List<ScriptListResponseDto>> searchScripts(
            @Parameter(description = "Partial URL pattern to search (e.g., 'sundae-labs', 'easy1staking')",
                      required = true, example = "aiken-lang")
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
