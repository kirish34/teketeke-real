-- Payout fields for SACCO and vehicle entities

alter table if exists saccos
  add column if not exists settlement_bank_name text,
  add column if not exists settlement_bank_branch text,
  add column if not exists settlement_account_number text,
  add column if not exists settlement_account_name text;

alter table if exists matatus
  add column if not exists payout_phone text,
  add column if not exists payout_method text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_bank_branch text,
  add column if not exists payout_bank_account_number text,
  add column if not exists payout_bank_account_name text;

alter table if exists taxis
  add column if not exists payout_phone text,
  add column if not exists payout_method text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_bank_branch text,
  add column if not exists payout_bank_account_number text,
  add column if not exists payout_bank_account_name text;

alter table if exists bodabodas
  add column if not exists payout_phone text,
  add column if not exists payout_method text,
  add column if not exists payout_bank_name text,
  add column if not exists payout_bank_branch text,
  add column if not exists payout_bank_account_number text,
  add column if not exists payout_bank_account_name text;
