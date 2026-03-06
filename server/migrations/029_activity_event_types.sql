-- Expand activity_events CHECK constraints to cover all event/target types
-- actually used in the codebase (questions, requirements, requests).

ALTER TABLE activity_events DROP CONSTRAINT activity_event_type_check;
ALTER TABLE activity_events ADD CONSTRAINT activity_event_type_check
    CHECK (event_type IN (
        'task_created', 'task_updated', 'task_closed', 'task_deleted',
        'comment_added', 'participant_joined', 'session_created',
        'question_asked', 'question_answered',
        'requirement_created', 'requirement_updated',
        'request_created', 'request_updated'
    ));

ALTER TABLE activity_events DROP CONSTRAINT activity_target_type_check;
ALTER TABLE activity_events ADD CONSTRAINT activity_target_type_check
    CHECK (target_type IN ('task', 'comment', 'participant', 'session',
                           'question', 'requirement', 'request'));
