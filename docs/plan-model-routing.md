# Plan: Multi-Provider Model Routing with User Preferences

## Vision

Users control how their agents select models. The system supports multiple inference providers (Anthropic, OpenRouter, Ollama, llama.cpp) and lets users set persistent preferences at the user and org level. Invocations carry model selection params so the choice is explicit, auditable, and reproducible.

## Current State

- Model routing is capability-driven but entirely ephemeral (CLI flags, no persistence)
- Credentials exist for Anthropic API keys but no OpenRouter/Together/etc.
- `CreateInvocationRequest` has no model selection fields
- No user preference tables or APIs exist
- Agent model router supports ollama, llamacpp, anthropic providers

## Architecture

### Provider Model

Providers are external inference services. Each has:
- A credential type (maps to env var)
- An API compatibility layer (most are OpenAI-compatible)
- A set of available models (discovered or configured)

**Phase 1 providers**: Anthropic (existing), OpenRouter (new), Ollama (existing), llama.cpp (existing)

### Preference Hierarchy

```
Request-level override (invocation params)
  > User preference (personal default)
    > Org preference (org-wide default)
      > System default (config.py fallback)
```

### Data Flow

1. User sets preferences via settings UI (stored in DB)
2. Invocation created with optional model overrides
3. Server passes model config to workspace as env vars
4. Agent CLI reads env vars + resolves via router
5. Router applies preference hierarchy to select model

## Phases

### Phase 1: OpenRouter Provider (agents)

Add OpenRouter as an inference provider in the Python agent model router.

- Add `openrouter` provider type to `ModelProfile`
- Create `OpenRouterProvider` that wraps the OpenAI-compatible API
- Register OpenRouter models in `build_model_registry()` when `OPENROUTER_API_KEY` is set
- Add well-known profiles for key models: qwen3.5-coder, deepseek-v3, llama-4-maverick, etc.
- Add `openrouter_api_key` credential type to server credential system
- Test: CLI `--model qwen3.5` resolves to OpenRouter when available

### Phase 2: Model Preferences (server + DB)

Persistent user and org model preferences.

**Migration**: `user_model_preferences` and `org_model_preferences` tables
```sql
CREATE TABLE user_model_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    preference_key TEXT NOT NULL,     -- e.g. 'default_model', 'default_budget', 'default_provider'
    preference_value JSONB NOT NULL,
    created_at, updated_at
    UNIQUE(user_id, preference_key)
);

CREATE TABLE org_model_preferences (
    id UUID PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id),
    preference_key TEXT NOT NULL,
    preference_value JSONB NOT NULL,
    created_at, updated_at
    UNIQUE(org_id, preference_key)
);
```

**Preference keys** (initial set):
- `default_model` — model hint string (e.g. "qwen3.5-coder", "opus")
- `default_budget` — budget tier ceiling (free/economy/moderate/unlimited)
- `default_provider` — preferred provider (openrouter/anthropic/ollama)
- `model_allowlist` — array of allowed model hints (org-level policy)
- `model_denylist` — array of denied model hints (org-level policy)

**API routes**:
- `GET/PUT /api/me/model-preferences` — user preferences (get all / upsert)
- `GET/PUT /api/orgs/:slug/model-preferences` — org preferences (admin only)

### Phase 3: Invocation Model Selection (server + agents)

Wire model selection into the invocation flow.

- Add `model_hint`, `budget_tier`, `provider` fields to `CreateInvocationRequest`
- Add corresponding columns to `invocations` table (for audit trail)
- Server passes model config as env vars to workspace: `SEAM_MODEL_HINT`, `SEAM_BUDGET_TIER`, `SEAM_PROVIDER`
- Agent CLI reads `SEAM_*` env vars as defaults (below CLI flags, above config.py)
- Dispatch merges: request params > user prefs > org prefs > system defaults
- Server resolves the merged preference and passes final values to dispatch

### Phase 4: Preferences UI (frontend)

User-facing settings for model routing.

- **User settings page** (`/settings`): Add "Model Preferences" section
  - Default model selector (dropdown of known models)
  - Default budget tier (radio/select)
  - Default provider preference
- **Org settings page** (`/orgs/:slug/settings`): Add "Model Policy" tab
  - Org default model/budget/provider
  - Model allowlist/denylist management
- **Invoke dialog**: Add model override controls
  - Model hint input (with autocomplete from known models)
  - Budget tier selector
  - "Use my defaults" toggle (pre-fills from preferences)

### Phase 5: Model Discovery (stretch)

Dynamic model listing from providers.

- OpenRouter: `GET /api/v1/models` — fetch available models + pricing
- Cache model list with TTL (1 hour)
- Expose via `GET /api/models` endpoint for frontend autocomplete
- Show pricing info in model selector

## Out of Scope (Future)

- Custom workflow manager (user-defined routing rules)
- Per-task model assignment (different models for different task types)
- Cost tracking and budget enforcement
- Model performance benchmarking

## Credential Types to Add

| Type | Env Var | Provider |
|---|---|---|
| `openrouter_api_key` | `OPENROUTER_API_KEY` | OpenRouter |

## Key Files

| Area | Files |
|---|---|
| Model router | `agents/src/seam_agents/models/router.py`, `registry.py`, `types.py` |
| Config | `agents/src/seam_agents/config.py` |
| Credentials | `server/src/credentials.rs`, `server/src/routes/credentials.rs` |
| Dispatch | `server/src/dispatch.rs` |
| Invocations | `server/src/routes/invocations.rs` |
| User settings UI | `frontend/src/components/user/user-settings.ts` |
| Org settings UI | `frontend/src/components/org/org-settings.ts` |
| Invoke dialog | `frontend/src/components/invocations/invoke-dialog.ts` |
