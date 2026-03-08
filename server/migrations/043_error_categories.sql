ALTER TABLE invocations ADD COLUMN error_category TEXT;

CREATE INDEX idx_invocations_error_category ON invocations (error_category) WHERE error_category IS NOT NULL;

COMMENT ON COLUMN invocations.error_category IS 'Categorized error type: timeout, workspace_error, claude_error, auth_error, system_error';
