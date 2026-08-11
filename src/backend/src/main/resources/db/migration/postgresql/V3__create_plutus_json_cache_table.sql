-- Create plutus_json_cache table (greenfield baseline)
-- Caches plutus.json content to avoid redundant compilations.
-- Supports VCS-agnostic source URLs (GitHub, GitLab, Codeberg, self-hosted Git, etc.)

CREATE TABLE plutus_json_cache (
    id BIGSERIAL PRIMARY KEY,

    -- Cache key components
    compiler_type VARCHAR(50) NOT NULL,
    source_url VARCHAR(2000) NOT NULL,
    commit_hash VARCHAR(64) NOT NULL,  -- Supports SHA-1 (40 chars) and SHA-256 (64 chars)
    compiler_version VARCHAR(50) NOT NULL,

    -- Cached content
    plutus_json_content JSONB NOT NULL,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Remaining cache key dimensions: both build inputs, both NOT NULL with
    -- '' meaning "absent" so the unique constraint applies (Postgres treats
    -- NULLs as distinct)
    source_path VARCHAR(1000) NOT NULL DEFAULT '',
    env VARCHAR(64) NOT NULL DEFAULT '',

    -- Unique constraint on the full cache key
    CONSTRAINT uk_plutus_json_cache_key
        UNIQUE (compiler_type, source_url, commit_hash, compiler_version, source_path, env)
);

-- Index for lookups by source URL
CREATE INDEX idx_plutus_json_cache_source_url ON plutus_json_cache(source_url);

-- Index for cache cleanup (if needed)
CREATE INDEX idx_plutus_json_cache_created_at ON plutus_json_cache(created_at);

-- Comments
COMMENT ON TABLE plutus_json_cache IS 'Caches plutus.json build artifacts - supports any Git hosting platform';
COMMENT ON COLUMN plutus_json_cache.compiler_type IS 'Type of compiler (AIKEN, HELIOS, etc.)';
COMMENT ON COLUMN plutus_json_cache.source_url IS 'VCS-agnostic source URL with protocol';
COMMENT ON COLUMN plutus_json_cache.commit_hash IS 'Git commit hash - 40 chars (SHA-1) or 64 chars (SHA-256)';
COMMENT ON COLUMN plutus_json_cache.compiler_version IS 'Compiler version used for build';
COMMENT ON COLUMN plutus_json_cache.plutus_json_content IS 'Complete plutus.json content as JSONB';
COMMENT ON COLUMN plutus_json_cache.created_at IS 'Cache entry creation timestamp for TTL management';
COMMENT ON COLUMN plutus_json_cache.source_path IS 'Path within repository ('''' = root)';
COMMENT ON COLUMN plutus_json_cache.env IS 'Aiken --env module name ('''' = built without the flag)';
