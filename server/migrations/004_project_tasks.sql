-- Move tasks from session-scoped to project-scoped with human-readable ticket IDs

-- Add ticket prefix and sequence counter to projects
ALTER TABLE projects ADD COLUMN ticket_prefix TEXT NOT NULL DEFAULT 'TASK';
ALTER TABLE projects ADD COLUMN next_ticket_number INT NOT NULL DEFAULT 1;

-- Add project_id and ticket_number to tasks
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN ticket_number INT;

-- Backfill project_id from session
UPDATE tasks SET project_id = s.project_id
FROM sessions s WHERE tasks.session_id = s.id;

-- Backfill ticket numbers per project (ordered by created_at)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM tasks
)
UPDATE tasks SET ticket_number = numbered.rn
FROM numbered WHERE tasks.id = numbered.id;

-- Update next_ticket_number on projects
UPDATE projects SET next_ticket_number = COALESCE(
  (SELECT MAX(ticket_number) + 1 FROM tasks WHERE tasks.project_id = projects.id),
  1
);

-- Now make columns NOT NULL
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN ticket_number SET NOT NULL;

-- Make session_id nullable (tasks outlive sessions)
ALTER TABLE tasks ALTER COLUMN session_id DROP NOT NULL;

-- Add unique constraint on (project_id, ticket_number)
ALTER TABLE tasks ADD CONSTRAINT uq_tasks_ticket UNIQUE (project_id, ticket_number);

-- New indexes
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_project_type ON tasks(project_id, task_type);

-- Update notify trigger to include project info
CREATE OR REPLACE FUNCTION notify_task_change() RETURNS TRIGGER AS $$
DECLARE
  sess_code TEXT;
  proj_id UUID;
  event_type TEXT;
  payload JSON;
BEGIN
  -- Get session code if task has a session
  IF COALESCE(NEW.session_id, OLD.session_id) IS NOT NULL THEN
    SELECT code INTO sess_code FROM sessions WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  END IF;

  -- Get project_id
  proj_id := COALESCE(NEW.project_id, OLD.project_id);

  IF TG_OP = 'INSERT' THEN event_type := 'task_created';
  ELSIF TG_OP = 'UPDATE' THEN event_type := 'task_updated';
  ELSE event_type := 'task_deleted';
  END IF;

  payload := json_build_object(
    'type', event_type,
    'session_code', sess_code,
    'project_id', proj_id::text,
    'task_id', COALESCE(NEW.id, OLD.id)::text
  );

  PERFORM pg_notify('task_changes', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
