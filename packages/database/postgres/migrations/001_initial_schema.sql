CREATE TYPE support_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE application_status AS ENUM ('draft', 'submitted', 'screened', 'shortlisted', 'recommended', 'waitlisted', 'awarded', 'rejected', 'withdrawn');
CREATE TYPE eligibility_status AS ENUM ('pending', 'eligible', 'ineligible', 'requires_review');
CREATE TYPE recommendation_status AS ENUM ('pending', 'recommended', 'waitlisted', 'declined', 'promoted_to_award');
CREATE TYPE waitlist_status AS ENUM ('waitlisted', 'promoted', 'expired', 'withdrawn');
CREATE TYPE award_status AS ENUM ('active', 'pending_renewal', 'renewed', 'completed', 'cancelled', 'declined');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed');
CREATE TYPE support_application_status AS ENUM ('submitted', 'approved', 'declined', 'fulfilled', 'cancelled');

CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  full_name TEXT NOT NULL,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_revoked_sessions (
  session_id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_login_throttle_buckets (
  bucket_key TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  window_expires_at BIGINT NOT NULL,
  blocked_until BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE funders (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  contact_email TEXT,
  notes TEXT,
  status support_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE schemes (
  id BIGSERIAL PRIMARY KEY,
  funder_id BIGINT REFERENCES funders(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  is_exclusive BOOLEAN NOT NULL DEFAULT TRUE,
  renewal_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  requires_interview BOOLEAN NOT NULL DEFAULT FALSE,
  default_award_amount NUMERIC(12, 2),
  status support_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE application_cycles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  academic_year_label TEXT NOT NULL,
  opens_on DATE,
  closes_on DATE,
  status support_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  disability_status TEXT,
  phone_number TEXT,
  email TEXT,
  nationality TEXT,
  home_address TEXT,
  duplicate_flag BOOLEAN NOT NULL DEFAULT FALSE,
  conflict_flag BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_identifiers (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(identifier_type, identifier_value)
);

CREATE TABLE academic_profiles (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  cycle_id BIGINT REFERENCES application_cycles(id),
  college TEXT NOT NULL,
  program_name TEXT NOT NULL,
  year_of_study TEXT,
  academic_year_label TEXT,
  semester_label TEXT,
  enrollment_status TEXT,
  cwa NUMERIC(5, 2),
  wassce_aggregate NUMERIC(5, 2),
  import_batch_reference TEXT,
  source_file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE academic_history_import_batches (
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

CREATE TABLE applications (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  scheme_id BIGINT NOT NULL REFERENCES schemes(id),
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id),
  submitted_at TIMESTAMPTZ,
  imported_batch_reference TEXT,
  status application_status NOT NULL DEFAULT 'submitted',
  eligibility_status eligibility_status NOT NULL DEFAULT 'pending',
  need_category TEXT,
  need_score NUMERIC(6, 2),
  reviewer_notes TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, scheme_id, cycle_id)
);

CREATE TABLE application_documents (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_received BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE eligibility_checks (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  result eligibility_status NOT NULL,
  reason TEXT,
  checked_by BIGINT REFERENCES users(id),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scoring_templates (
  id BIGSERIAL PRIMARY KEY,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id),
  cycle_id BIGINT REFERENCES application_cycles(id),
  name TEXT NOT NULL,
  version_label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scoring_criteria (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES scoring_templates(id) ON DELETE CASCADE,
  criterion_code TEXT NOT NULL,
  criterion_name TEXT NOT NULL,
  weight NUMERIC(6, 2) NOT NULL,
  max_score NUMERIC(6, 2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE application_scores (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  criterion_id BIGINT REFERENCES scoring_criteria(id) ON DELETE SET NULL,
  raw_score NUMERIC(6, 2) NOT NULL,
  weighted_score NUMERIC(6, 2) NOT NULL,
  scored_by BIGINT REFERENCES users(id),
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recommendations (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  final_score NUMERIC(6, 2),
  priority_rank INTEGER,
  status recommendation_status NOT NULL DEFAULT 'pending',
  committee_notes TEXT,
  recommended_amount NUMERIC(12, 2),
  recommended_by BIGINT REFERENCES users(id),
  recommended_at TIMESTAMPTZ
);

CREATE TABLE waitlist_entries (
  id BIGSERIAL PRIMARY KEY,
  recommendation_id BIGINT NOT NULL UNIQUE REFERENCES recommendations(id) ON DELETE CASCADE,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id),
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id),
  priority_rank INTEGER NOT NULL,
  need_severity TEXT,
  reason TEXT NOT NULL,
  status waitlist_status NOT NULL DEFAULT 'waitlisted',
  promoted_award_id BIGINT,
  expires_on DATE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE awards (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  application_id BIGINT REFERENCES applications(id),
  scheme_id BIGINT NOT NULL REFERENCES schemes(id),
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id),
  waitlist_entry_id BIGINT UNIQUE REFERENCES waitlist_entries(id),
  approved_amount NUMERIC(12, 2) NOT NULL,
  status award_status NOT NULL DEFAULT 'active',
  approval_notes TEXT,
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE beneficiaries (
  id BIGSERIAL PRIMARY KEY,
  academic_year_label TEXT NOT NULL,
  scheme_name TEXT NOT NULL,
  sponsor_name TEXT,
  full_name TEXT NOT NULL,
  student_reference_id TEXT,
  index_number TEXT,
  college TEXT,
  amount_paid NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  support_type TEXT NOT NULL DEFAULT 'unknown',
  beneficiary_cohort TEXT,
  carried_forward_from_prior_year BOOLEAN NOT NULL DEFAULT FALSE,
  remarks TEXT,
  import_mode TEXT NOT NULL DEFAULT 'historical_archive',
  import_batch_reference TEXT,
  source_file_name TEXT,
  linked_application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  linked_waitlist_entry_id BIGINT REFERENCES waitlist_entries(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE food_bank_registrations (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_label TEXT NOT NULL,
  referral_source TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'registered',
  source_type TEXT NOT NULL DEFAULT 'manual_add',
  source_file_name TEXT,
  import_batch_reference TEXT,
  served_at TIMESTAMPTZ,
  served_by_name TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, academic_year_label)
);

CREATE TABLE beneficiary_import_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_reference TEXT NOT NULL UNIQUE,
  academic_year_label TEXT NOT NULL,
  scheme_name TEXT NOT NULL,
  source_file_name TEXT,
  import_mode TEXT NOT NULL DEFAULT 'historical_archive',
  duplicate_strategy TEXT NOT NULL DEFAULT 'skip',
  imported_rows INTEGER NOT NULL DEFAULT 0,
  replaced_rows INTEGER NOT NULL DEFAULT 0,
  categorized_by_college BOOLEAN NOT NULL DEFAULT FALSE,
  beneficiary_cohort TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by BIGINT REFERENCES users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rollback_deleted_rows INTEGER NOT NULL DEFAULT 0,
  rollback_reason TEXT,
  rolled_back_by BIGINT REFERENCES users(id),
  rolled_back_by_name TEXT,
  rolled_back_at TIMESTAMPTZ
);

CREATE TABLE beneficiary_audit_events (
  id BIGSERIAL PRIMARY KEY,
  beneficiary_id BIGINT,
  academic_year_label TEXT NOT NULL,
  scheme_name TEXT NOT NULL,
  student_reference_id TEXT,
  batch_reference TEXT,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  event_reason TEXT,
  actor_user_id BIGINT REFERENCES users(id),
  actor_name TEXT,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist_entries
  ADD CONSTRAINT waitlist_entries_promoted_award_id_fkey
  FOREIGN KEY (promoted_award_id) REFERENCES awards(id);

CREATE TABLE award_renewals (
  id BIGSERIAL PRIMARY KEY,
  award_id BIGINT NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id),
  status award_status NOT NULL DEFAULT 'pending_renewal',
  review_notes TEXT,
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  award_id BIGINT NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL UNIQUE,
  disbursement_period TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  processed_by BIGINT REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE support_programs (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status support_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE support_applications (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id),
  program_id BIGINT NOT NULL REFERENCES support_programs(id),
  cycle_id BIGINT REFERENCES application_cycles(id),
  status support_application_status NOT NULL DEFAULT 'submitted',
  need_category TEXT,
  request_summary TEXT,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE distribution_logs (
  id BIGSERIAL PRIMARY KEY,
  support_application_id BIGINT NOT NULL REFERENCES support_applications(id) ON DELETE CASCADE,
  collection_date DATE,
  collection_status TEXT,
  attendance_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE import_batches (
  id BIGSERIAL PRIMARY KEY,
  batch_reference TEXT NOT NULL UNIQUE,
  module_name TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  imported_by BIGINT REFERENCES users(id),
  row_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE export_jobs (
  id BIGSERIAL PRIMARY KEY,
  export_reference TEXT NOT NULL UNIQUE,
  module_name TEXT NOT NULL,
  export_format TEXT NOT NULL,
  generated_by BIGINT REFERENCES users(id),
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id),
  action_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_full_name ON students(full_name);
CREATE INDEX idx_student_identifiers_value ON student_identifiers(identifier_value);
CREATE INDEX idx_academic_profiles_student_id ON academic_profiles(student_id);
CREATE INDEX idx_academic_history_import_batches_scope
  ON academic_history_import_batches(academic_year_label, semester_label, created_at DESC);
CREATE INDEX idx_applications_scheme_cycle ON applications(scheme_id, cycle_id);
CREATE INDEX idx_applications_student_id ON applications(student_id);
CREATE INDEX idx_recommendations_status ON recommendations(status);
CREATE INDEX idx_waitlist_entries_scheme_cycle_rank ON waitlist_entries(scheme_id, cycle_id, priority_rank);
CREATE INDEX idx_awards_student_id ON awards(student_id);
CREATE INDEX idx_beneficiaries_year ON beneficiaries(academic_year_label);
CREATE INDEX idx_beneficiaries_scheme ON beneficiaries(scheme_name);
CREATE INDEX idx_beneficiaries_reference ON beneficiaries(student_reference_id);
CREATE INDEX idx_beneficiaries_college ON beneficiaries(college);
CREATE INDEX idx_beneficiary_import_batches_scope ON beneficiary_import_batches(academic_year_label, scheme_name, created_at DESC);
CREATE INDEX idx_beneficiary_audit_scope ON beneficiary_audit_events(academic_year_label, scheme_name, student_reference_id, created_at DESC);
CREATE INDEX idx_beneficiary_audit_record ON beneficiary_audit_events(beneficiary_id, created_at DESC);
CREATE INDEX idx_payments_award_id ON payments(award_id);
CREATE INDEX idx_support_applications_student_program ON support_applications(student_id, program_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
