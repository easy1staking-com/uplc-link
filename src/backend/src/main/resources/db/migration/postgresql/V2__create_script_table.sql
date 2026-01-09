-- Create script table
-- Stores individual script/validator information extracted from plutus.json

CREATE TABLE script (
    id BIGSERIAL PRIMARY KEY,
    verification_request_id BIGINT NOT NULL,

    -- Script identification
    script_name VARCHAR(500) NOT NULL,
    module_name VARCHAR(255) NOT NULL,
    validator_name VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL,

    -- Hashes
    raw_hash VARCHAR(64) NOT NULL,
    final_hash VARCHAR(64),

    -- Plutus info
    plutus_version VARCHAR(10) NOT NULL,
    compiled_code TEXT NOT NULL,

    -- Parameters
    required_parameters JSONB,
    provided_parameters JSONB,
    parameterization_status VARCHAR(50) NOT NULL DEFAULT 'NONE_REQUIRED',

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key
    CONSTRAINT fk_script_verification_request
        FOREIGN KEY (verification_request_id)
        REFERENCES verification_request(id)
        ON DELETE CASCADE
);

-- Indexes for query performance
CREATE INDEX idx_script_verification_request_id ON script(verification_request_id);
CREATE INDEX idx_script_raw_hash ON script(raw_hash);
CREATE INDEX idx_script_final_hash ON script(final_hash) WHERE final_hash IS NOT NULL;
CREATE INDEX idx_script_purpose ON script(purpose);
CREATE INDEX idx_script_module_name ON script(module_name);

-- Composite index for repo queries
CREATE INDEX idx_script_repo_lookup ON script(verification_request_id, script_name);

-- Parameterization status check
ALTER TABLE script ADD CONSTRAINT chk_parameterization_status
    CHECK (parameterization_status IN ('NONE_REQUIRED', 'PARTIAL', 'COMPLETE'));

-- Plutus version check
ALTER TABLE script ADD CONSTRAINT chk_plutus_version
    CHECK (plutus_version IN ('V1', 'V2', 'V3'));

-- Comments
COMMENT ON TABLE script IS 'Stores individual smart contract scripts/validators';
COMMENT ON COLUMN script.script_name IS 'Full validator name from plutus.json (e.g., "module.validator.purpose")';
COMMENT ON COLUMN script.raw_hash IS 'Unparameterized script hash';
COMMENT ON COLUMN script.final_hash IS 'Parameterized script hash (nullable if params incomplete)';
COMMENT ON COLUMN script.parameterization_status IS 'Status: NONE_REQUIRED, PARTIAL, COMPLETE';
COMMENT ON COLUMN script.required_parameters IS 'Parameter schema from plutus.json';
COMMENT ON COLUMN script.provided_parameters IS 'Parameter values from metadata';
