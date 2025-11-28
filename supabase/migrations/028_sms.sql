-- SMS templates and outbound message queue

create table if not exists sms_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  body text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sms_messages (
  id uuid primary key default gen_random_uuid(),
  to_phone text not null,
  template_code text,
  body text not null,
  status text not null default 'PENDING', -- PENDING | SENDING | SENT | FAILED
  provider_message_id text,
  error_message text,
  tries int default 0,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sms_messages_status_created
  on sms_messages (status, created_at);

-- Starter templates (rename/reword as needed)
insert into sms_templates (code, body) values
  ('WALLET_CREDIT',
   'Wallet credit: KES {{amount}} received for vehicle {{plate}}. New balance: KES {{balance}}.'),
  ('WITHDRAWAL_MOBILE_SUCCESS',
   'Mobile withdrawal of KES {{amount}} to {{phone}} completed. New balance: KES {{balance}}.'),
  ('WITHDRAWAL_MOBILE_FAILED',
   'Your mobile withdrawal of KES {{amount}} could not be completed. Reason: {{reason}}.'),
  ('WITHDRAWAL_BANK_REQUESTED',
   'Bank withdrawal of KES {{amount}} requested to {{bank_name}} {{account_number}}. Expected 1–24 hours.'),
  ('SACCO_DAILY_SUMMARY',
   'SACCO {{sacco_name}} summary: Collected KES {{total_collected}} today. Active vehicles: {{active_vehicles}}.')
on conflict (code) do nothing;
