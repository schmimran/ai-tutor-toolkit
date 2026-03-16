-- Migration 004: add category column to feedback table.
-- Stores which feedback category each row represents: accuracy, usefulness, or tone.
-- Nullable so existing rows (which have no category) are unaffected.

ALTER TABLE feedback
  ADD COLUMN category text;

CREATE INDEX feedback_category ON feedback (category) WHERE category IS NOT NULL;
