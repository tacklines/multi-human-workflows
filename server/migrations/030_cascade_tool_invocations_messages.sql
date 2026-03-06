-- Fix missing ON DELETE CASCADE for tool_invocations and messages session FKs.
-- All other session-referencing tables cascade on session delete; these two
-- were inconsistently missing it, which blocks session deletion.

ALTER TABLE tool_invocations DROP CONSTRAINT tool_invocations_session_id_fkey;
ALTER TABLE tool_invocations ADD CONSTRAINT tool_invocations_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT messages_session_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
