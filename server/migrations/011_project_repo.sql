ALTER TABLE projects ADD COLUMN repo_url TEXT;
ALTER TABLE projects ADD COLUMN default_branch TEXT NOT NULL DEFAULT 'main';
