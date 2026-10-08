-- What the learner paid with, for the payment history screen.
--
-- Two columns, chosen narrowly on purpose. ClicToPay's anti-fraud terms
-- are stricter than PCI-DSS on one point:
--
--   "Ne stockez jamais les données de carte bancaire
--    (numéro, CVV, date d'expiration) sur vos serveurs."
--
-- PCI-DSS permits keeping the expiry date next to a masked pan.
-- ClicToPay does not, so it is not stored here and nothing reads it.
--
-- card_last4
--   The last four digits only, taken from the masked pan the gateway
--   already returns. Never the full number: a truncation to four digits
--   is not the card number, and is what every receipt shows.
--
-- card_brand
--   VISA, MASTERCARD and so on. Not card data at all.
--
-- Deliberately absent: the full pan, the expiry, the CVV, the cardholder
-- name, and the BIN. The card is typed on ClicToPay's hosted page and
-- never reaches this server, so none of them are ours to keep — and the
-- BIN is the first six digits of the number, whatever else it is useful
-- for.
--
-- Both NULL for every row that exists today, and for any payment whose
-- gateway response carries no card details. The screen falls back to
-- showing the method as unknown rather than inventing one.
--
-- Safe to re-run.

ALTER TABLE enrollments
    ADD COLUMN IF NOT EXISTS card_brand VARCHAR(20),
    ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4);
