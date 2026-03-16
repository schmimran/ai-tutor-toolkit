-- Migration 003: add message_id FK to feedback table.
-- Links per-message feedback rows to the specific assistant message being rated.
-- Nullable so existing rows (which have no message linkage) are unaffected.
-- SET NULL on delete so feedback survives if a message row is somehow removed.

ALTER TABLE feedback
  ADD COLUMN message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX feedback_message_id ON feedback (message_id) WHERE message_id IS NOT NULL;
