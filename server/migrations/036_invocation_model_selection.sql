-- Add model selection fields to invocations for audit trail
ALTER TABLE invocations ADD COLUMN model_hint TEXT;
ALTER TABLE invocations ADD COLUMN budget_tier TEXT;
ALTER TABLE invocations ADD COLUMN provider TEXT;
