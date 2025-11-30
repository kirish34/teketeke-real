-- Platform settings (fees, payout limits, alert thresholds)
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_settings_key_idx on platform_settings(key);

create or replace function set_platform_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_platform_settings_updated_at on platform_settings;
create trigger set_platform_settings_updated_at
before update on platform_settings
for each row
execute function set_platform_settings_updated_at();


-- System alerts (failed payouts, low balances, etc.)
create table if not exists system_alerts (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text unique,
  alert_type text not null,
  severity text not null default 'INFO', -- INFO | WARN | CRITICAL
  message text not null,
  meta jsonb,
  status text not null default 'OPEN', -- OPEN | ACK | RESOLVED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create index if not exists system_alerts_status_idx on system_alerts(status);
create index if not exists system_alerts_created_idx on system_alerts(created_at desc);

create or replace function set_system_alerts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_system_alerts_updated_at on system_alerts;
create trigger set_system_alerts_updated_at
before update on system_alerts
for each row
execute function set_system_alerts_updated_at();


-- Admin audit logs
create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  path text,
  meta jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx on admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_user_idx on admin_audit_logs(user_id);
