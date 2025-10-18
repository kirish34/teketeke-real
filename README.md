# TekeTeke — REAL v8 (Supabase/Postgres)

This build wires all dashboards to **real Postgres** via Supabase.
Admin endpoints use the Supabase **service role key** (server-side) and an `x-admin-token`.

## Run (local)
```bash
cp .env.example .env
# fill SUPABASE_URL + keys
npm i
npm run dev
open http://localhost:5001/public/auth/role-select.html
```
Use the **Use Demo Token** button only to bypass UI auth during development.
System Admin actions require header `x-admin-token: <ADMIN_TOKEN>` (default `change-me`).

## Database
Apply SQL in order:
```
supabase db push    # or psql -f supabase/migrations/000_core_schema.sql ...
```

### Tables
- `saccos`, `matatus`, `transactions`, `loans`, `staff_profiles`, `ussd_pool`
- Enums: `user_role`, `tx_kind`, `loan_status`, `ussd_status`

### Functions / RPC used by UI
- `count_tx_today()`
- `fees_today()`
- `loans_today()`

### RLS
- Read-open for listings where practical, write guarded by `is_system_admin()` or `is_sacco_admin()`.
- Staff can insert transactions for their sacco. Admin routes use service role to bypass RLS safely on server.

### Daraja
- If Daraja env vars are **set**, `/api/pay/stk` calls real STK Push.
- If they are **empty**, it returns a **mock QUEUED** response for testing.

## Endpoints (server)
- `GET /u/my-saccos` • `GET /u/sacco/:id/matatus` • `GET /u/sacco/:id/transactions?limit=...`
- `POST /api/staff/cash` (records a transaction)
- `GET/POST/DELETE /api/admin/*` (saccos, matatus, ussd_pool, staff, loans)
- `POST /api/pay/stk` (+ `/api/pay/stk/callback`)

## Notes
- For production, put this server behind HTTPS and configure CORS & rate limiting.
- To seed a **system admin**, insert a row into `staff_profiles` with your `auth.uid()` and role `SYSTEM_ADMIN`.
