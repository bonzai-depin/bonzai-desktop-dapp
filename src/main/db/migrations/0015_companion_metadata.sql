-- Preserve local companion presentation, social-token identity and assigned
-- workflow IDs without changing existing companion IDs or identity columns.
ALTER TABLE companions ADD COLUMN extra_json TEXT;
