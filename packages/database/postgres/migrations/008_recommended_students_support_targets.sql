ALTER TABLE recommended_students
  ALTER COLUMN scheme_id DROP NOT NULL;

ALTER TABLE recommended_students
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'application_scheme';

ALTER TABLE recommended_students
  ADD COLUMN IF NOT EXISTS support_name TEXT;
