-- Invocations: ephemeral claude -p calls within persistent Coder workspaces
-- Workspaces are long-lived environments; invocations are the unit of work.

CREATE TABLE invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    session_id UUID REFERENCES sessions(id),
    task_id UUID REFERENCES tasks(id),
    participant_id UUID REFERENCES participants(id),

    -- What to run
    agent_perspective TEXT NOT NULL,        -- e.g. "coder", "reviewer", "planner"
    prompt TEXT NOT NULL,                   -- the task prompt passed to claude -p
    system_prompt_append TEXT,              -- additional context appended to system prompt

    -- Execution state
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
    exit_code INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Output
    result_json JSONB,                      -- structured output from claude -p --output-format json
    error_message TEXT,

    -- Provenance
    triggered_by TEXT NOT NULL DEFAULT 'manual'
        CHECK (triggered_by IN ('manual', 'reaction', 'scheduler')),
    reaction_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invocations_project_status ON invocations(project_id, status);
CREATE INDEX idx_invocations_workspace ON invocations(workspace_id);
CREATE INDEX idx_invocations_task ON invocations(task_id);

-- PG NOTIFY trigger so subscribers learn about new invocations immediately
CREATE OR REPLACE FUNCTION notify_invocation() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('invocations', json_build_object(
        'id', NEW.id,
        'workspace_id', NEW.workspace_id,
        'project_id', NEW.project_id,
        'task_id', NEW.task_id,
        'participant_id', NEW.participant_id,
        'status', NEW.status,
        'triggered_by', NEW.triggered_by,
        'created_at', NEW.created_at
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invocation_notify
    AFTER INSERT ON invocations
    FOR EACH ROW EXECUTE FUNCTION notify_invocation();

-- Workspace pooling: identifies the purpose/slot of a persistent workspace
-- e.g. "project:uuid:branch:coder" — lets the scheduler assign invocations
-- to an already-running workspace instead of creating a new one.
ALTER TABLE workspaces ADD COLUMN pool_key TEXT;
CREATE INDEX idx_workspaces_pool_key ON workspaces(pool_key) WHERE pool_key IS NOT NULL;

-- Track when a workspace last had work dispatched to it (for eviction policy)
ALTER TABLE workspaces ADD COLUMN last_invocation_at TIMESTAMPTZ;
