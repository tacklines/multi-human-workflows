-- Directed messages between session participants (human → agent, agent → human)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    sender_id UUID NOT NULL REFERENCES participants(id),
    recipient_id UUID NOT NULL REFERENCES participants(id),
    content TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, read_at);
CREATE INDEX idx_messages_sender ON messages(sender_id);
