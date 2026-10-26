-- Every course is priced in dinars.
--
-- ClicToPay charges every card in TND (currency 788), whatever the course
-- said. Until October 2026 an administrator chose a currency when approving
-- a course, so a course approved in EUR showed learners "100 EUR" and
-- charged them 100 TND, and the dashboard's revenue currency setting
-- relabelled a total of dinars as euros or dollars. Both are gone; this
-- sets every stored price to the currency it was actually charged in.
--
-- The number is kept: it is what the card was charged, so changing the
-- label alone makes old receipts and the course page tell the truth.
-- Check beforehand whether any course needs a new price instead:
--
--   SELECT course_id, title, price, currency FROM courses
--   WHERE currency IS DISTINCT FROM 'TND';
--
-- Idempotent.

UPDATE courses          SET currency = 'TND' WHERE currency IS DISTINCT FROM 'TND';
UPDATE course_templates SET currency = 'TND' WHERE currency IS DISTINCT FROM 'TND';

-- The setting itself; nothing reads it any more.
DELETE FROM system_settings WHERE setting_key = 'revenue.currency';
