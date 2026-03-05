-- Persistent agent identities across sessions
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}',
    UNIQUE(user_id, organization_id)
);

-- Link participants to persistent agent identity
ALTER TABLE participants ADD COLUMN agent_id UUID REFERENCES agents(id);

-- Link agent_tokens to persistent agent identity
ALTER TABLE agent_tokens ADD COLUMN agent_id UUID REFERENCES agents(id);
