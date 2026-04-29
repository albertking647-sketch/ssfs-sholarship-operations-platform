ALTER TABLE academic_profiles
  ADD COLUMN IF NOT EXISTS import_batch_reference TEXT;

ALTER TABLE academic_profiles
  ADD COLUMN IF NOT EXISTS source_file_name TEXT;

CREATE TABLE IF NOT EXISTS academic_history_import_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_reference TEXT NOT NULL UNIQUE,
  academic_year_label TEXT,
  semester_label TEXT,
  source_file_name TEXT,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rollback_deleted_rows INTEGER NOT NULL DEFAULT 0,
  rollback_restored_rows INTEGER NOT NULL DEFAULT 0,
  rollback_reason TEXT,
  rolled_back_by_name TEXT,
  rolled_back_at TIMESTAMPTZ,
  change_set JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_academic_history_import_batches_scope
  ON academic_history_import_batches(academic_year_label, semester_label, created_at DESC);
