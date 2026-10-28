-- Adds the week-before MLH registration reminder (PLAT-26).
--
-- Only adds the label; nothing in this migration uses it, which keeps it clear
-- of Postgres's restriction on using a new enum value in the transaction that
-- created it.
ALTER TYPE "EmailType" ADD VALUE IF NOT EXISTS 'MLH_REMINDER';
