-- Per-task model assignment: when an invocation is created for a task,
-- it inherits the task's model config (sits between request-level and user prefs).
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS model_hint TEXT,
    ADD COLUMN IF NOT EXISTS budget_tier TEXT,
    ADD COLUMN IF NOT EXISTS provider TEXT;
