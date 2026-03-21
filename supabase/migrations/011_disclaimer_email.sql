-- Migration 011: add email column to disclaimer_acceptances.
--
-- Stores the email address submitted through the combined access-wall overlay.
-- Nullable so existing rows (pre-access-wall) are unaffected.

ALTER TABLE disclaimer_acceptances ADD COLUMN email text;
