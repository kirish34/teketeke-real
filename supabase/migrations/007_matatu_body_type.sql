-- Add body_type classification for matatus (e.g., van / minibus / bus)
alter table if exists matatus
  add column if not exists body_type text;
