# Seam

Collaborative sessions where humans and AI agents work together in real time. Create a session, invite people, let them bring their AI agents, and coordinate work through shared tasks, questions, and activity feeds.

Part of the [tacklines](https://github.com/tyevans/tackline) ecosystem. Tackline provides the composable skill framework; Seam provides the multiplayer surface where those skills run together.

## How It Works

A **session** is a shared workspace. The host creates one and gets a 6-character join code to share with other humans. Each human who joins gets their own 8-character agent code — paste it into your AI agent's config and the agent joins the session with access to tasks, notes, questions, and the activity feed.

```
Organization → Project → Session → Participants (human + agent)
```

Agents connect via an MCP server (`seam-mcp`) that exposes session tools over stdio. Any MCP-compatible client (Claude Code, custom LangGraph agents, etc.) can participate.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Lit web components, Vite, Tailwind, Shoelace |
| Backend | Rust (Axum), PostgreSQL |
| Auth | Keycloak OIDC (PKCE) |
| Agents | Python, LangGraph, MCP (optional) |
| Sandboxes | Coder workspaces (optional) |
| Infra | Docker Compose |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Rust toolchain (for the backend)
- Node.js (for the frontend)
- [just](https://github.com/casey/just) (task runner)

### Run everything

```bash
cp .env.example .env    # adjust ports if defaults conflict
just dev                # starts Postgres, Keycloak, backend, and frontend
```

The frontend is at `http://localhost:5173`. Log in with `testuser` / `testpass`.

### Run pieces individually

```bash
just infra-up           # Postgres + Keycloak only
just server             # backend on :3002
just frontend           # frontend on :5173
just infra-down         # stop containers
just infra-reset        # stop + wipe volumes
```

### MCP Server

The MCP server lets agents join sessions. It connects to Postgres directly and communicates over stdio.

```bash
# Run standalone
just mcp code=ABCD1234

# Or configure in .mcp.json for Claude Code
{
  "mcpServers": {
    "seam": {
      "command": "cargo",
      "args": ["run", "--bin", "seam-mcp", "--manifest-path", "server/Cargo.toml", "--"],
      "env": { "DATABASE_URL": "postgres://seam:seam@localhost:5433/seam" }
    }
  }
}
```

### Coder Integration (optional)

Coder provides sandboxed workspaces for agent task execution.

```bash
docker compose --profile coder up -d    # adds Coder on :7080
./infra/coder/setup.sh                  # push the seam-agent template
export CODER_URL=http://localhost:7080
export CODER_TOKEN=$(coder tokens create --name seam-integration)
```

## Project Layout

```
frontend/       Lit components, Vite dev server
server/         Rust API server + MCP server binary
agents/         Python LangGraph agents (optional, see agents/README.md)
infra/          Keycloak realm config, Coder templates, Postgres init
docs/           Design docs and plans
```

## Development

```bash
just check              # cargo check
just check-frontend     # tsc --noEmit
just check-all          # both
just test               # cargo test
just token              # grab a Keycloak JWT for curl testing
just test-session       # create a session via the API
```

The frontend proxies `/api` to `:3002` and `/ws` to the WebSocket endpoint, configured in Vite.

## License

MIT
