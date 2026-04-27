ALTER TABLE application_message_batches
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email';

ALTER TABLE application_message_batch_items
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
