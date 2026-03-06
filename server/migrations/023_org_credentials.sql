-- Per-org data encryption keys (envelope encryption)
CREATE TABLE org_credential_keys (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    encrypted_dek BYTEA NOT NULL,  -- Fernet-encrypted by master KEK
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ
);

-- Encrypted credentials scoped to an organization
CREATE TABLE org_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    credential_type TEXT NOT NULL CHECK (credential_type IN (
        'claude_oauth',
        'anthropic_api_key',
        'openai_api_key',
        'google_api_key',
        'git_token',
        'custom'
    )),
    encrypted_value BYTEA NOT NULL,  -- Fernet-encrypted by org DEK
    env_var_name TEXT,               -- for 'custom' type: which env var to inject
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    UNIQUE (org_id, name)
);

CREATE INDEX idx_org_credentials_org ON org_credentials(org_id);
CREATE INDEX idx_org_credentials_type ON org_credentials(org_id, credential_type);
