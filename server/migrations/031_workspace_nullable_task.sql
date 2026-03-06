-- Workspaces are not always tied to a single task.
-- Agents launched for a session work across many tasks;
-- automation-triggered workspaces may have no task at all.

-- Drop the unique constraint (multiple workspaces can reference the same task)
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_task_id_key;

-- Make task_id nullable
ALTER TABLE workspaces ALTER COLUMN task_id DROP NOT NULL;

-- Add direct FK to the participant so taskless agents can still be found
ALTER TABLE workspaces ADD COLUMN participant_id UUID REFERENCES participants(id);

CREATE INDEX idx_workspaces_participant_id ON workspaces(participant_id);
