-- CIP-171 env field: aiken build --env changes the compiled bytecode, so it is
-- part of the request identity and of the plutus.json cache key.

-- verification_request: nullable — null means "built without --env"
ALTER TABLE verification_request ADD COLUMN env VARCHAR(64);
COMMENT ON COLUMN verification_request.env IS 'Aiken --env module name; NULL = built without the flag';

-- plutus_json_cache: the cache key was missing two build-input dimensions
-- (source_path pre-existing gap, env new). Both are NOT NULL with '' meaning
-- "absent" so the unique constraint applies (Postgres treats NULLs as distinct).
-- The cache is a pure rebuildable artifact store, so clear it rather than
-- guessing which existing rows were keyed ambiguously.
TRUNCATE TABLE plutus_json_cache;

ALTER TABLE plutus_json_cache ADD COLUMN source_path VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE plutus_json_cache ADD COLUMN env VARCHAR(64) NOT NULL DEFAULT '';

ALTER TABLE plutus_json_cache DROP CONSTRAINT IF EXISTS uk_plutus_json_cache_key;
ALTER TABLE plutus_json_cache ADD CONSTRAINT uk_plutus_json_cache_key
    UNIQUE (compiler_type, source_url, commit_hash, compiler_version, source_path, env);

COMMENT ON COLUMN plutus_json_cache.source_path IS 'Path within repository ('''' = root)';
COMMENT ON COLUMN plutus_json_cache.env IS 'Aiken --env module name ('''' = built without the flag)';
