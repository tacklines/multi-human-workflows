-- Phase 3 Ory migration: remove bespoke sat_ agent token system.
-- Authentication is now handled exclusively via Ory Hydra JWT access tokens.
DROP TABLE IF EXISTS agent_tokens;
