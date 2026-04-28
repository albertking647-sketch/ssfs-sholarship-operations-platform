CREATE TABLE IF NOT EXISTS application_review_rules (
  id BIGSERIAL PRIMARY KEY,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
  required_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  cwa_cutoff NUMERIC(5, 2),
  wassce_cutoff NUMERIC(5, 2),
  interview_required BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by BIGINT REFERENCES users(id),
  updated_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scheme_id, cycle_id)
);

CREATE TABLE IF NOT EXISTS application_import_issues (
  id BIGSERIAL PRIMARY KEY,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'application_import',
  row_number INTEGER,
  student_reference_id TEXT,
  full_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  linked_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  resolved_by BIGINT REFERENCES users(id),
  resolved_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_application_import_issues_scope
  ON application_import_issues (scheme_id, cycle_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS scheme_academic_years (
  scheme_id BIGINT PRIMARY KEY REFERENCES schemes(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommended_students (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
  recommendation_reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_support',
  source_type TEXT NOT NULL DEFAULT 'manual_add',
  source_file_name TEXT,
  import_batch_reference TEXT,
  linked_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  linked_beneficiary_id BIGINT REFERENCES beneficiaries(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommended_student_import_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_reference TEXT NOT NULL UNIQUE,
  source_file_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommended_students_scope
  ON recommended_students(student_id, scheme_id, cycle_id);

CREATE INDEX IF NOT EXISTS idx_recommended_students_status
  ON recommended_students(status, created_at DESC);
