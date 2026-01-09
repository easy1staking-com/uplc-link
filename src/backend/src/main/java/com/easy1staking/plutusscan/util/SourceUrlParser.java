package com.easy1staking.plutusscan.util;

import lombok.Builder;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Optional;

/**
 * Utility class for parsing VCS-agnostic source URLs
 * Supports GitHub, GitLab (with nested groups), Codeberg, self-hosted Git, and future decentralized storage
 */
@Slf4j
public class SourceUrlParser {

    /**
     * Parsed source URL components
     */
    @Getter
    @Builder
    public static class ParsedSourceUrl {
        private final String sourceUrl;      // Original full URL
        private final String host;           // e.g., "github.com", "gitlab.com"
        private final String protocol;       // e.g., "https", "ipfs", "ar"
        private final String orgOrGroup;     // For GitHub: org, for GitLab: full group path
        private final String repo;           // Repository name
        private final String cloneUrl;       // Git clone URL (extracted from HTTP URL)
        private final VcsType vcsType;       // Type of VCS platform
    }

    /**
     * Supported VCS types
     */
    public enum VcsType {
        GITHUB,
        GITLAB,
        CODEBERG,
        BITBUCKET,
        SELF_HOSTED_GIT,
        DECENTRALIZED,  // For future IPFS/Arweave support
        UNKNOWN
    }

    /**
     * Parse a source URL into its components
     *
     * Examples:
     * - https://github.com/easy1staking-com/cardano-recurring-payment
     * - https://gitlab.com/group/subgroup/project
     * - https://codeberg.org/user/repo
     * - https://git.company.com/team/project
     *
     * @param sourceUrl Full source URL with protocol
     * @return Parsed components wrapped in Optional
     */
    public static Optional<ParsedSourceUrl> parse(String sourceUrl) {
        if (sourceUrl == null || sourceUrl.isBlank()) {
            return Optional.empty();
        }

        try {
            URI uri = new URI(sourceUrl);
            String protocol = uri.getScheme();
            String host = uri.getHost();
            String path = uri.getPath();

            if (protocol == null || host == null || path == null) {
                log.warn("Invalid source URL format: {}", sourceUrl);
                return Optional.empty();
            }

            // Handle future decentralized storage protocols
            if ("ipfs".equals(protocol) || "ar".equals(protocol)) {
                return Optional.of(ParsedSourceUrl.builder()
                        .sourceUrl(sourceUrl)
                        .host(host)
                        .protocol(protocol)
                        .vcsType(VcsType.DECENTRALIZED)
                        .build());
            }

            // Remove leading/trailing slashes
            path = path.replaceAll("^/+|/+$", "");

            // Remove .git suffix if present
            if (path.endsWith(".git")) {
                path = path.substring(0, path.length() - 4);
            }

            // Parse path components
            String[] pathParts = path.split("/");
            if (pathParts.length < 2) {
                log.warn("Invalid path in source URL (expected at least org/repo): {}", sourceUrl);
                return Optional.empty();
            }

            VcsType vcsType = detectVcsType(host);
            String orgOrGroup;
            String repo;
            String cloneUrl;

            // For GitLab, handle nested groups (everything except last part is the group)
            if (vcsType == VcsType.GITLAB) {
                repo = pathParts[pathParts.length - 1];
                orgOrGroup = String.join("/", java.util.Arrays.copyOfRange(pathParts, 0, pathParts.length - 1));
                cloneUrl = String.format("https://%s/%s/%s.git", host, orgOrGroup, repo);
            } else {
                // For GitHub, Codeberg, etc.: org/repo structure
                orgOrGroup = pathParts[0];
                repo = pathParts[1];
                cloneUrl = String.format("https://%s/%s/%s.git", host, orgOrGroup, repo);
            }

            return Optional.of(ParsedSourceUrl.builder()
                    .sourceUrl(sourceUrl)
                    .host(host)
                    .protocol(protocol)
                    .orgOrGroup(orgOrGroup)
                    .repo(repo)
                    .cloneUrl(cloneUrl)
                    .vcsType(vcsType)
                    .build());

        } catch (URISyntaxException e) {
            log.error("Failed to parse source URL: {}", sourceUrl, e);
            return Optional.empty();
        }
    }

    /**
     * Detect VCS type from hostname
     */
    private static VcsType detectVcsType(String host) {
        if (host == null) {
            return VcsType.UNKNOWN;
        }

        String lowerHost = host.toLowerCase();

        if (lowerHost.contains("github.com")) {
            return VcsType.GITHUB;
        } else if (lowerHost.contains("gitlab.com") || lowerHost.contains("gitlab.")) {
            return VcsType.GITLAB;
        } else if (lowerHost.contains("codeberg.org")) {
            return VcsType.CODEBERG;
        } else if (lowerHost.contains("bitbucket.org") || lowerHost.contains("bitbucket.")) {
            return VcsType.BITBUCKET;
        } else {
            // Assume self-hosted Git for any other https:// URL
            return VcsType.SELF_HOSTED_GIT;
        }
    }

    /**
     * Validate commit hash length (20 bytes for SHA-1, 32 bytes for SHA-256)
     *
     * @param commitHashHex Commit hash in hex format
     * @return true if valid (40 or 64 hex chars), false otherwise
     */
    public static boolean isValidCommitHash(String commitHashHex) {
        if (commitHashHex == null) {
            return false;
        }
        // 40 chars = 20 bytes (SHA-1), 64 chars = 32 bytes (SHA-256)
        return (commitHashHex.length() == 40 || commitHashHex.length() == 64)
                && commitHashHex.matches("[0-9a-fA-F]+");
    }

    /**
     * Validate commit hash byte array length
     *
     * @param commitHashBytes Commit hash as bytes
     * @return true if valid (20 or 32 bytes), false otherwise
     */
    public static boolean isValidCommitHashBytes(byte[] commitHashBytes) {
        if (commitHashBytes == null) {
            return false;
        }
        return commitHashBytes.length == 20 || commitHashBytes.length == 32;
    }

    /**
     * Extract organization and repository for backward compatibility
     * For GitLab nested groups, orgOrGroup will contain the full group path
     *
     * @param sourceUrl Full source URL
     * @return Array [orgOrGroup, repo] or null if parsing fails
     */
    public static String[] extractOrgAndRepo(String sourceUrl) {
        return parse(sourceUrl)
                .map(parsed -> new String[]{parsed.getOrgOrGroup(), parsed.getRepo()})
                .orElse(null);
    }
}
