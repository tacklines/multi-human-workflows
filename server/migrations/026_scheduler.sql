-- Event reactions: configurable responses to domain events
CREATE TABLE event_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    filter JSONB NOT NULL DEFAULT '{}',
    action_type TEXT NOT NULL,
    action_config JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_reactions_project ON event_reactions(project_id);
CREATE INDEX idx_event_reactions_event ON event_reactions(aggregate_type, event_type);

-- Scheduled jobs: cron-based recurring tasks
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cron_expr TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_config JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_jobs_project ON scheduled_jobs(project_id);
CREATE INDEX idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE enabled = true;

-- Event bridge cursor: singleton tracking last processed domain event
CREATE TABLE event_bridge_cursor (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_event_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO event_bridge_cursor (id, last_event_id) VALUES (1, 0);
