CREATE TABLE IF NOT EXISTS application_message_batches (
  id BIGSERIAL PRIMARY KEY,
  scheme_id BIGINT NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  cycle_id BIGINT NOT NULL REFERENCES application_cycles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  message_type TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  body_template TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'logged',
  created_by BIGINT REFERENCES users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_message_batch_items (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES application_message_batches(id) ON DELETE CASCADE,
  application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_name TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'logged',
  error_message TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE application_message_batches
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email';

ALTER TABLE application_message_batches
  ADD COLUMN IF NOT EXISTS created_by_name TEXT;

ALTER TABLE application_message_batch_items
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

ALTER TABLE application_message_batch_items
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

ALTER TABLE application_message_batch_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
