-- Task management system
-- Hierarchical: epic > story > task > subtask, plus bugs

CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL CHECK (task_type IN ('epic', 'story', 'task', 'subtask', 'bug')),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'closed')),
    assigned_to UUID REFERENCES participants(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES participants(id),
    commit_sha TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_session ON tasks(session_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(session_id, status);
CREATE INDEX idx_tasks_type ON tasks(session_id, task_type);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);

-- Comments on tasks (evidence, discussion, code references)
CREATE TABLE task_comments (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES participants(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);
