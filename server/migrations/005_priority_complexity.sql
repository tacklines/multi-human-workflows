-- Add priority and complexity to tasks

ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN complexity TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
    CHECK (priority IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE tasks ADD CONSTRAINT tasks_complexity_check
    CHECK (complexity IN ('xl', 'large', 'medium', 'small', 'trivial'));

-- Index for priority-based queries (agents picking up highest-priority work)
CREATE INDEX idx_tasks_priority ON tasks(project_id, priority, status);
