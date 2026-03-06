-- Mark personal orgs for UI distinction
ALTER TABLE organizations ADD COLUMN personal BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any org with slug starting 'personal-' is a personal org
UPDATE organizations SET personal = true WHERE slug LIKE 'personal-%';
