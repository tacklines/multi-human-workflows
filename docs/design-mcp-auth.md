# Design: MCP Authentication & Agent Identity

## Problem

The `/mcp` Streamable HTTP endpoint is unauthenticated. Any network client can connect, call `join_session` with a valid agent code, and operate as an agent. This is fine for local development but unacceptable for remote/production use.

Additionally, agent identity is weak — agents are identified only by their sponsor's agent code, with no persistent agent identity or capability scoping.

## Goals

1. **Authenticate MCP connections** using Keycloak OAuth 2.0
2. **Device authorization flow** so agents can obtain tokens without browser access
3. **Better agent identity** — persistent agent records with scoped capabilities
4. **MCP spec compliance** — advertise OAuth metadata per the MCP specification
5. **Ease of use** — minimal friction for agent operators to connect

## Architecture

### Authentication Flow

```
Agent                    Seam Server              Keycloak
  │                          │                       │
  ├─ GET /.well-known/      │                       │
  │  oauth-protected-resource                       │
  │◄─ { auth_server, scopes }                       │
  │                          │                       │
  ├─────────────────────────────── POST /device/auth │
  │◄──────────────────────────── { device_code,      │
  │                                user_code,        │
  │                                verification_uri }│
  │                          │                       │
  │  (human approves via     │                       │
  │   Keycloak UI or Seam    │                       │
  │   session page)          │                       │
  │                          │                       │
  ├─────────────────────────────── POST /token       │
  │◄──────────────────────────── { access_token }    │
  │                          │                       │
  ├─ POST /mcp               │                       │
  │  Authorization: Bearer   │                       │
  │  <access_token>          │                       │
  │                     ├─── validate JWT ──────────►│
  │                     │◄── claims ────────────────│
  │                     │                            │
  │◄─ MCP response      │                           │
```

### Components

#### 1. Tower Auth Middleware (`server/src/mcp_auth.rs`)

A Tower layer that wraps `StreamableHttpService`:

- Extracts `Authorization: Bearer <token>` from request headers
- Validates the JWT against Keycloak JWKS (reuses existing `JwksCache`)
- Injects validated `Claims` into request extensions
- Returns `401 Unauthorized` if no/invalid token
- Passes `/.well-known/*` requests through without auth

The middleware wraps the MCP service at mount time:

```rust
let mcp_service = StreamableHttpService::new(
    move || Ok(SeamMcp::new(mcp_db.clone())),
    Arc::new(LocalSessionManager::default()),
    StreamableHttpServerConfig::default(),
);
let authed_mcp = McpAuthLayer::new(jwks.clone()).layer(mcp_service);
let app = app.nest_service("/mcp", authed_mcp);
```

#### 2. OAuth Metadata Endpoints

Per MCP spec, the server advertises OAuth configuration:

**`GET /.well-known/oauth-protected-resource`** (RFC 9728):
```json
{
  "resource": "https://seam.example.com/mcp",
  "authorization_servers": ["https://keycloak.example.com/realms/seam"],
  "scopes_supported": ["openid", "profile"],
  "bearer_methods_supported": ["header"]
}
```

**`GET /.well-known/oauth-authorization-server`** — proxies to Keycloak's own metadata at `{keycloak_url}/realms/{realm}/.well-known/openid-configuration`, which already includes the `device_authorization_endpoint`.

#### 3. Keycloak Device Auth Configuration

Keycloak natively supports RFC 8628. Configuration needed:

- Create client `mcp-agents` in realm `seam`
  - Access Type: `public` (no client secret — agents are public clients)
  - Enable "OAuth 2.0 Device Authorization Grant" flow
  - Set allowed scopes: `openid`, `profile`
  - Device code lifespan: 10 minutes
  - Polling interval: 5 seconds
- Add `device_authorization_endpoint` to realm metadata (Keycloak does this automatically)

The device flow endpoints are all on Keycloak directly — Seam doesn't need to proxy them. The agent just needs the Keycloak realm URL.

#### 4. Agent Identity Model

Current model: agents are `participants` with `participant_type = 'agent'`, linked to a sponsor via `agent_join_codes.user_id`.

Proposed additions:

```sql
-- Track persistent agent identities across sessions
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_subject TEXT NOT NULL,         -- sub claim from JWT
    display_name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}',            -- model, version, capabilities
    UNIQUE(keycloak_subject, organization_id)
);
```

When an authenticated agent calls `join_session`:

1. Extract `sub` claim from the JWT (injected by auth middleware into request parts)
2. Upsert into `agents` table — creates persistent identity on first use
3. Link the participant record to both the agent identity and the session
4. The agent code still controls **which session** — the JWT controls **who is this agent**

This separates authentication (JWT) from authorization (agent code).

#### 5. MCP Tool Handler Changes

The `join_session` tool gains access to the authenticated identity:

```rust
#[tool(description = "Join a session using an agent code")]
async fn join_session(
    &self,
    #[tool(params)] params: JoinSessionParams,
    Extension(parts): Extension<http::request::Parts>,
) -> Result<CallToolResult, McpError> {
    // Extract authenticated user from JWT claims
    let claims = parts.extensions.get::<Claims>();

    // If authenticated, use JWT identity; if not (stdio), fall back to agent code only
    let agent_identity = match claims {
        Some(claims) => {
            // Upsert agent record, verify authorization
            self.resolve_agent_identity(claims).await?
        }
        None => None, // stdio transport, no JWT
    };

    // Proceed with join, linking agent identity
    self.do_agent_join(&params.code, params.display_name.as_deref(), agent_identity).await
}
```

### UX: Connecting an Agent

#### For agent operators (CLI/SDK):

```bash
# One-time setup: get a token via device flow
seam-auth device-login --realm-url https://keycloak.example.com/realms/seam

# Opens browser / prints: "Go to https://keycloak.example.com/realms/seam/device
#                          and enter code: ABCD-EFGH"

# Token is cached in ~/.seam/token.json

# MCP config with auth:
{
  "mcpServers": {
    "seam": {
      "url": "https://seam.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SEAM_TOKEN}"
      }
    }
  }
}
```

#### For MCP clients with native OAuth support (Claude Code, etc.):

```json
{
  "mcpServers": {
    "seam": {
      "url": "https://seam.example.com/mcp"
    }
  }
}
```

The client auto-discovers OAuth metadata from `/.well-known/oauth-protected-resource`, performs the device auth flow (or browser redirect if available), and handles token refresh automatically.

#### For local development (unchanged):

Stdio transport continues to work without auth. The remote endpoint can optionally skip auth when `MCP_AUTH_DISABLED=true` is set (dev only).

## Implementation Plan

### Sprint 1: Auth Middleware + Metadata

1. **Tower auth middleware** — validate Bearer JWTs on `/mcp`, inject claims into extensions
2. **OAuth metadata endpoints** — `/.well-known/oauth-protected-resource` and authorization server proxy
3. **Keycloak device auth client config** — Terraform/realm export for `mcp-agents` client
4. **Dev bypass** — `MCP_AUTH_DISABLED` env var for local development

### Sprint 2: Agent Identity

5. **`agents` table migration** — persistent agent identity
6. **Agent upsert on join** — extract JWT sub, create/update agent record
7. **Tool handler changes** — `join_session` uses JWT identity when available
8. **Agent info in session context** — participants show agent metadata

### Sprint 3: UX Polish

9. **`seam-auth` CLI tool** — device flow helper for token acquisition
10. **Session UI** — show agent identity details (model, last seen, etc.)
11. **Token refresh** — middleware handles expired tokens gracefully
12. **Documentation** — update CLAUDE.md and README

## Security Considerations

- **JWT validation** reuses existing `JwksCache` — same security as REST API
- **Agent codes remain required** for session authorization — JWT alone doesn't grant session access
- **Scoping**: future work could add Keycloak roles/scopes for fine-grained tool access (e.g., read-only agents)
- **Token lifetime**: Keycloak access tokens should be short-lived (5 min) with refresh tokens
- **Rate limiting**: Consider per-agent rate limits on the MCP endpoint
- **Stdio transport**: Unaffected — remains unauthenticated (requires DB access, inherently trusted)

## Alternatives Considered

### API Keys instead of OAuth
Simpler but requires key management UI, rotation, revocation. OAuth gives us all of this via Keycloak for free.

### Agent codes as Bearer tokens
Conflates session authorization with transport authentication. Agent codes are short (8 chars) and session-scoped — not suitable as API credentials.

### Full OAuth authorization code flow (browser redirect)
Works for humans but not for headless agents. Device flow solves this. MCP clients with browser access can use authorization code flow via the same Keycloak metadata.

### Custom token endpoint on Seam server
Adds complexity. Keycloak already implements device auth, token refresh, and JWKS. No need to reimplement.
