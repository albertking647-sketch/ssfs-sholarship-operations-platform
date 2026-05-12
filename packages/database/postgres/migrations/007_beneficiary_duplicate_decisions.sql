CREATE TABLE IF NOT EXISTS beneficiary_duplicate_decisions (
  id BIGSERIAL PRIMARY KEY,
  academic_year_label TEXT NOT NULL,
  student_reference_id TEXT NOT NULL,
  full_name TEXT,
  schemes JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheme_signature TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_channel TEXT,
  requested_contact TEXT,
  delivery_status TEXT,
  delivery_message_id TEXT,
  requested_by_user_id BIGINT REFERENCES users(id),
  requested_by_name TEXT,
  requested_at TIMESTAMPTZ,
  declined_scheme_name TEXT,
  resolved_by_user_id BIGINT REFERENCES users(id),
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (academic_year_label, student_reference_id, scheme_signature)
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_duplicate_decisions_scope
  ON beneficiary_duplicate_decisions(academic_year_label, student_reference_id, status, updated_at DESC);
