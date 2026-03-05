-- Agent tokens for server-spawned agents (Coder workspaces)
-- Opaque bearer tokens as an alternative to Keycloak JWTs
CREATE TABLE agent_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_tokens_hash ON agent_tokens(token_hash);
CREATE INDEX idx_agent_tokens_user ON agent_tokens(user_id);
