-- Add REJECTED to the verification_request status check constraint.
-- REJECTED = discarded at ingest (on-chain metadata failed validation);
-- kept as a record for observability instead of being silently dropped.

ALTER TABLE verification_request DROP CONSTRAINT IF EXISTS chk_status;
ALTER TABLE verification_request ADD CONSTRAINT chk_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'VERIFIED', 'FAILED', 'INSUFFICIENT_PARAMS', 'REJECTED'));

COMMENT ON COLUMN verification_request.status IS 'Verification status: PENDING, PROCESSING, VERIFIED, FAILED, INSUFFICIENT_PARAMS, REJECTED';
