-- Requests: human intent that drives requirement decomposition
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id),
    author_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'analyzing', 'decomposed', 'archived')),
    analysis TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: requests <-> requirements
CREATE TABLE request_requirements (
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    PRIMARY KEY (request_id, requirement_id)
);

CREATE INDEX idx_requests_project ON requests(project_id, status);
CREATE INDEX idx_request_requirements_req ON request_requirements(requirement_id);
