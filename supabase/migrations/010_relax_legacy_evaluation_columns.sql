-- Relax NOT NULL constraints on legacy v6 evaluation columns.
-- v7 evaluations write to replacement columns (understood_where_student_was,
-- probe_reasoning, adaptive_tone) and no longer provide values for these.
ALTER TABLE session_evaluations
  ALTER COLUMN opening_sequence DROP NOT NULL,
  ALTER COLUMN asked_why DROP NOT NULL,
  ALTER COLUMN clarity DROP NOT NULL,
  ALTER COLUMN tone DROP NOT NULL;
