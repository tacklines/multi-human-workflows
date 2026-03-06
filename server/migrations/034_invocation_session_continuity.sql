-- Session continuity: enables chaining invocations via claude -p --resume
-- claude_session_id is extracted from result_json after completion.
-- resume_session_id is the session to resume from (passed as --resume flag).

ALTER TABLE invocations ADD COLUMN claude_session_id TEXT;
ALTER TABLE invocations ADD COLUMN resume_session_id TEXT;

-- Index for looking up the latest invocation with a given session_id
-- (used when resolving the chain for "continue" actions)
CREATE INDEX idx_invocations_claude_session ON invocations(claude_session_id)
    WHERE claude_session_id IS NOT NULL;
