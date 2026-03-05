-- Coder workspace tracking
-- Links Seam tasks to Coder workspaces for agent sandboxing

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Coder identifiers
    coder_workspace_id UUID,           -- Coder's workspace UUID (null until created)
    coder_workspace_name TEXT,          -- Human-readable name in Coder
    coder_agent_id UUID,               -- Coder agent running in the workspace

    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'creating', 'running', 'stopping', 'stopped', 'failed', 'destroyed')),

    -- Workspace details
    template_name TEXT NOT NULL DEFAULT 'seam-agent',
    branch TEXT,                        -- Git branch checked out in workspace

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    error_message TEXT,                 -- Last error if status = 'failed'

    -- One active workspace per task
    UNIQUE (task_id)
);

CREATE INDEX idx_workspaces_project_id ON workspaces(project_id);
CREATE INDEX idx_workspaces_status ON workspaces(status);
CREATE INDEX idx_workspaces_coder_workspace_id ON workspaces(coder_workspace_id);
