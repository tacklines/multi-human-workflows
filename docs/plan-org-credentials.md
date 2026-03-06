# Plan: Organization-Centric Architecture + Credential Store

## Vision

Make organizations the root navigational and data-scoping concept in Seam. Every user belongs to one or more orgs. Each org contains projects, members, and credentials. This unlocks:

1. **Multi-tenant SaaS** — orgs as the billing/isolation boundary
2. **Credential store** — org-scoped encrypted secrets (Claude OAuth tokens, API keys, git tokens) injected into agent workspaces
3. **Team collaboration** — invite members to orgs, share projects

## Current State

- Schema has `organizations`, `org_members` tables (migration 001) with full RBAC (owner/admin/member)
- Auto-bootstrap creates a "Personal" org on first user login (`db.rs::ensure_default_project`)
- But orgs are **invisible**: no API routes, no UI, no org selection anywhere
- Frontend root is `/projects` — all projects shown flat regardless of org
- `create_project` silently picks user's first org
- MCP tools are session-scoped (agent joins session, gets project_id implicitly) — no org awareness needed there

## Architecture After

```
/ -> /orgs (org selector / default org redirect)
/orgs/:slug -> org dashboard (projects, members, settings, credentials)
/orgs/:slug/projects/:id -> project workspace (unchanged internally)
/orgs/:slug/settings -> org settings + credential store
/sessions/:code -> session lobby (unchanged, session codes are globally unique)
```

**Data flow:**
```
User authenticates (Keycloak)
  -> Fetch user's org memberships
    -> Select/default org
      -> Fetch org's projects
        -> Work within project (sessions, tasks, agents)
```

## Phases

### Phase 1: Backend Org API (Sprint 1)

**Goal:** Expose org CRUD and membership management.

**Files:**
- `server/src/routes/orgs.rs` (new)
- `server/src/main.rs` (mount routes)
- `server/src/models.rs` (add OrgView, OrgMemberView types)

**Endpoints:**
```
GET    /api/orgs                        — list user's orgs
POST   /api/orgs                        — create org
GET    /api/orgs/:slug                  — get org details
PATCH  /api/orgs/:slug                  — update org (name; owner/admin only)
GET    /api/orgs/:slug/members          — list org members
POST   /api/orgs/:slug/members          — invite member (owner/admin only)
PATCH  /api/orgs/:slug/members/:userId  — change role (owner only for admin promotion)
DELETE /api/orgs/:slug/members/:userId  — remove member (owner/admin only; owner can't remove self)
```

**Behavior:**
- `GET /api/orgs` returns all orgs where user is a member
- `POST /api/orgs` creates org, makes creator the owner
- Personal org (auto-created) is marked somehow (e.g., `personal BOOLEAN DEFAULT false` column, or convention: slug starts with `personal-`)
- `GET /api/projects` continues to work (returns projects across all user's orgs) for backward compat
- Add `GET /api/orgs/:slug/projects` — projects scoped to one org
- `POST /api/orgs/:slug/projects` — create project in specific org (preferred over current `POST /api/projects`)

**Migration 022:**
```sql
ALTER TABLE organizations ADD COLUMN personal BOOLEAN NOT NULL DEFAULT false;
-- Backfill existing personal orgs
UPDATE organizations SET personal = true WHERE slug LIKE 'personal-%';
```

### Phase 2: Credential Store (Sprint 2)

**Goal:** Encrypted credential storage per org.

**Files:**
- `server/migrations/023_org_credentials.sql` (new)
- `server/src/credentials.rs` (new — encryption + CRUD)
- `server/src/routes/credentials.rs` (new)
- `server/src/main.rs` (mount routes)

**Schema:**
```sql
CREATE TABLE org_credential_keys (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    encrypted_dek BYTEA NOT NULL,  -- Fernet-encrypted by master KEK
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ
);

CREATE TABLE org_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                    -- human label, e.g. "Claude Max Token"
    credential_type TEXT NOT NULL,         -- claude_oauth, api_key, git_token, custom
    encrypted_value BYTEA NOT NULL,        -- Fernet-encrypted by org DEK
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,               -- optional TTL
    UNIQUE (org_id, name)
);

CREATE INDEX idx_org_credentials_org ON org_credentials(org_id);
```

**Encryption:**
- Master KEK: `CREDENTIAL_MASTER_KEY` env var (Fernet key, base64-encoded)
- Per-org DEK: random Fernet key, encrypted by master KEK, stored in `org_credential_keys`
- Credential values: encrypted by org DEK
- Never return decrypted values to frontend — only name, type, created_at, expires_at
- Decryption only at injection time (workspace launch, agent spawn)

**Endpoints:**
```
GET    /api/orgs/:slug/credentials           — list credentials (metadata only, no values)
POST   /api/orgs/:slug/credentials           — create credential
PATCH  /api/orgs/:slug/credentials/:id       — rotate value (replace encrypted_value)
DELETE /api/orgs/:slug/credentials/:id       — delete credential
```

**Rust crate:** `fernet` (Fernet symmetric encryption)

### Phase 3: Frontend Org Navigation (Sprint 3)

**Goal:** Org-aware navigation and UI.

**Files:**
- `frontend/src/components/org/` (new directory)
  - `org-selector.ts` — org switcher in nav/header
  - `org-dashboard.ts` — org home (projects grid, member list, settings link)
  - `org-settings.ts` — org settings + credential management
  - `org-members.ts` — member list with invite/role management
- `frontend/src/state/org-api.ts` (new)
- `frontend/src/router.ts` (update routes)
- `frontend/src/components/project/project-list.ts` (adapt to org context)
- `frontend/src/components/shared/` (nav updates)

**Route changes:**
```
/ -> redirect to /orgs/:defaultOrgSlug (or /orgs if multiple)
/orgs -> org list (if user has multiple orgs)
/orgs/:slug -> org dashboard
/orgs/:slug/projects/:id -> project workspace
/orgs/:slug/projects/:id/:tab -> project workspace tab
/orgs/:slug/settings -> org settings (credentials, members)
/sessions/:code -> unchanged (globally unique codes)
```

**UX:**
- If user has one org: skip org list, go straight to org dashboard
- Org switcher dropdown in top nav (always visible)
- Project cards on org dashboard (same as current project-list but scoped)
- Settings page has tabs: General, Members, Credentials
- Credential UI: list with masked values, add/rotate/delete buttons
- Never show credential values — just type, name, created date, and "Rotate" action

### Phase 4: Credential Injection (Sprint 4)

**Goal:** Wire credentials into Coder workspace launches.

**Files:**
- `server/src/routes/workspaces.rs` (update create_workspace)
- `server/src/credentials.rs` (add decrypt_for_workspace helper)
- `infra/coder/templates/seam-agent/main.tf` (consume new env vars)

**Flow:**
1. When launching a Coder workspace for a task:
   - Look up task -> project -> org
   - Decrypt org credentials by type
   - Inject as env vars: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, etc.
2. Credential type mapping:
   - `claude_oauth` -> `CLAUDE_CODE_OAUTH_TOKEN`
   - `anthropic_api_key` -> `ANTHROPIC_API_KEY`
   - `git_token` -> `GIT_TOKEN` (or configure in Coder external auth)
   - `custom` -> user-defined env var name (stored in metadata)

### Phase 5: MCP Org Context (Sprint 5, if needed)

**Goal:** Agents can query org-level info if needed.

This may not be needed immediately. Agents operate within sessions (which are within projects, which are within orgs). The org context is implicit. Only add MCP tools if agents need to:
- List available credential types (not values) for self-configuration
- Query org membership for @mentions or delegation

**Defer unless a concrete use case emerges.**

## Quality Criteria

- **Zero data loss**: Existing personal orgs continue to work. No migration drops data.
- **Backward compat**: `GET /api/projects` still works (returns all projects across orgs).
- **Security**: Credentials never returned in plaintext to frontend. Master key rotation re-encrypts DEKs only (not all values). Audit log on credential access.
- **UX**: Single-org users see no friction. Multi-org users get clean switcher. Credential management is admin-only.

## Constraints

- Fernet for encryption (battle-tested, authenticated, used by Confidant/Airflow)
- `rust-fernet` crate
- Master KEK from env var (single secret to protect at infrastructure level)
- No external secrets management service (Vault, Infisical) — keep it simple
- Credential types are a controlled vocabulary, not freeform
