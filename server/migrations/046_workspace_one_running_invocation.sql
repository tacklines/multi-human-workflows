-- Enforce at most one running invocation per workspace.
-- This is a safety net; pool resolution should route correctly before reaching this.
CREATE UNIQUE INDEX invocations_one_running_per_workspace
    ON invocations (workspace_id)
    WHERE status = 'running';
