-- Activity events: chronological log of all notable actions in a project
CREATE TABLE activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES participants(id),
    event_type TEXT NOT NULL,
    -- Polymorphic target: task, comment, participant, session
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    -- Human-readable summary and optional structured metadata
    summary TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_project ON activity_events(project_id, created_at DESC);
CREATE INDEX idx_activity_session ON activity_events(session_id, created_at DESC);
CREATE INDEX idx_activity_actor ON activity_events(actor_id);

-- Notify on new activity events for real-time push
CREATE OR REPLACE FUNCTION notify_activity_event() RETURNS TRIGGER AS $$
DECLARE
    sess_code TEXT;
    payload JSON;
BEGIN
    IF NEW.session_id IS NOT NULL THEN
        SELECT code INTO sess_code FROM sessions WHERE id = NEW.session_id;
    END IF;

    payload := json_build_object(
        'type', 'activity',
        'session_code', sess_code,
        'project_id', NEW.project_id::text,
        'event_id', NEW.id::text,
        'event_type', NEW.event_type,
        'summary', NEW.summary
    );

    PERFORM pg_notify('task_changes', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_event_notify
    AFTER INSERT ON activity_events
    FOR EACH ROW EXECUTE FUNCTION notify_activity_event();

-- Check constraint on event types
ALTER TABLE activity_events ADD CONSTRAINT activity_event_type_check
    CHECK (event_type IN (
        'task_created', 'task_updated', 'task_closed', 'task_deleted',
        'comment_added', 'participant_joined', 'session_created'
    ));

ALTER TABLE activity_events ADD CONSTRAINT activity_target_type_check
    CHECK (target_type IN ('task', 'comment', 'participant', 'session'));
