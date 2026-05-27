-- 004_card_display_name.sql
-- Adds a column to cache Ramp's card display_name (independent of card_name which holds masked digits).

ALTER TABLE ramp_transactions
  ADD COLUMN IF NOT EXISTS card_display_name TEXT;
