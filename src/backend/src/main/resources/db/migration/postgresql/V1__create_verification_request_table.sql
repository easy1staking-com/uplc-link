-- Create verification_request table
-- Stores metadata from blockchain events for verification processing
-- Supports VCS-agnostic source URLs (GitHub, GitLab, Codeberg, self-hosted Git, etc.)

CREATE TABLE verification_request (
    id BIGSERIAL PRIMARY KEY,

    -- Audit trail
    tx_hash VARCHAR(64) NOT NULL,
    slot BIGINT NOT NULL,

    -- Repository info (VCS-agnostic)
    source_url VARCHAR(2000) NOT NULL,
    commit_hash VARCHAR(64) NOT NULL,  -- Supports SHA-1 (40 chars) and SHA-256 (64 chars)
    source_path VARCHAR(1000),

    -- Compiler info
    compiler_type VARCHAR(50) NOT NULL,
    compiler_version VARCHAR(50),

    -- Metadata
    parameters_json JSONB,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
--                                   ,

    -- Unique constraint on code version
--     CONSTRAINT uk_verification_request_source UNIQUE (source_url, commit_hash)
);

-- Indexes for query performance
CREATE INDEX idx_verification_request_status ON verification_request(status);
CREATE INDEX idx_verification_request_tx_hash ON verification_request(tx_hash);
CREATE INDEX idx_verification_request_slot ON verification_request(slot);
CREATE INDEX idx_verification_request_created_at ON verification_request(created_at);
CREATE INDEX idx_verification_request_source_url ON verification_request(source_url);
CREATE INDEX idx_verification_request_source_commit ON verification_request(source_url, commit_hash);

-- Status check constraint
ALTER TABLE verification_request ADD CONSTRAINT chk_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'VERIFIED', 'FAILED', 'INSUFFICIENT_PARAMS'));

-- Comments on table and columns
COMMENT ON TABLE verification_request IS 'Stores smart contract verification requests from blockchain metadata - supports any Git hosting platform';
COMMENT ON COLUMN verification_request.tx_hash IS 'Transaction hash containing the metadata';
COMMENT ON COLUMN verification_request.slot IS 'Slot number for audit purposes';
COMMENT ON COLUMN verification_request.source_url IS 'VCS-agnostic source URL with protocol (e.g., https://github.com/org/repo, https://gitlab.com/group/project)';
COMMENT ON COLUMN verification_request.commit_hash IS 'Git commit hash - 40 chars (SHA-1) or 64 chars (SHA-256)';
COMMENT ON COLUMN verification_request.source_path IS 'Path within repository (e.g., contracts/, empty for root)';
COMMENT ON COLUMN verification_request.parameters_json IS 'JSONB map of script_hash to parameter lists';
COMMENT ON COLUMN verification_request.status IS 'Verification status: PENDING, PROCESSING, VERIFIED, FAILED, INSUFFICIENT_PARAMS';
