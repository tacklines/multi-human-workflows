-- PostgreSQL LISTEN/NOTIFY for real-time task updates
-- Triggers on tasks and task_comments so that changes from any source
-- (HTTP API, MCP tools, direct DB) get broadcast via WebSocket.

CREATE OR REPLACE FUNCTION notify_task_change() RETURNS TRIGGER AS $$
DECLARE
  sess_code TEXT;
  event_type TEXT;
  payload JSON;
BEGIN
  SELECT code INTO sess_code FROM sessions WHERE id = COALESCE(NEW.session_id, OLD.session_id);

  IF sess_code IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN event_type := 'task_created';
  ELSIF TG_OP = 'UPDATE' THEN event_type := 'task_updated';
  ELSE event_type := 'task_deleted';
  END IF;

  payload := json_build_object(
    'type', event_type,
    'session_code', sess_code,
    'task_id', COALESCE(NEW.id, OLD.id)::text
  );

  PERFORM pg_notify('task_changes', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_notify
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_change();

-- Comment notifications
CREATE OR REPLACE FUNCTION notify_comment_change() RETURNS TRIGGER AS $$
DECLARE
  sess_code TEXT;
  payload JSON;
BEGIN
  SELECT s.code INTO sess_code
  FROM tasks t JOIN sessions s ON s.id = t.session_id
  WHERE t.id = COALESCE(NEW.task_id, OLD.task_id);

  IF sess_code IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  payload := json_build_object(
    'type', 'comment_added',
    'session_code', sess_code,
    'task_id', COALESCE(NEW.task_id, OLD.task_id)::text
  );

  PERFORM pg_notify('task_changes', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_notify
  AFTER INSERT ON task_comments
  FOR EACH ROW EXECUTE FUNCTION notify_comment_change();
