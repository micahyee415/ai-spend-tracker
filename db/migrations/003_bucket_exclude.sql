-- db/migrations/003_bucket_exclude.sql
-- v2: expand classifications.bucket CHECK to allow 'exclude' value.
-- 'exclude' marks a card/override as "skip from dashboard aggregation entirely".

ALTER TABLE classifications
  DROP CONSTRAINT IF EXISTS classifications_bucket_check;

ALTER TABLE classifications
  ADD CONSTRAINT classifications_bucket_check
  CHECK (bucket IN ('license', 'api', 'exclude') OR bucket IS NULL);
