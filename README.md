# TekeTeke - REAL v8 (Supabase/Postgres)

This build wires all dashboards to **real Postgres** via Supabase.
Admin endpoints use the Supabase **service role key** (server-side) and require a signed-in user with role `SYSTEM_ADMIN`.

## Run (local)
```bash
cp .env.example .env
# fill SUPABASE_URL + keys
npm i
npm run dev
open http://localhost:5001/public/auth/role-select.html
```
Use the **Use Demo Token** button only to bypass UI auth during development.
System Admin actions require an authenticated Supabase session for a user present in `public.staff_profiles` with role `SYSTEM_ADMIN`.

To provision demo accounts for each role dashboard run:
```bash
node scripts/seed-role-users.js
```
This creates (or reuses) users such as `sacco.manager@example.com` with password `TekePass123!` and links them to the seeded sacco/matatu records via `public.user_roles`.

## Front-end entry points
- **Role chooser:** `/public/auth/role-select.html` (links to System Admin, SACCO, Matatu, Taxi and Boda dashboards).
- **System Admin dashboard:** `/public/system/dashboard.html` -> overview metrics, SACCO & vehicle registries, USSD pool tools, plus centralized login management for SACCO admins, matatu owners, taxi and boda crews.
- **Role dashboards (web):** `/public/sacco/*`, `/public/matatu/*`, `/public/taxi/*`, `/public/bodaboda/*` remain for staff/owners/taxi/boda workflows.
- Mobile PWA, Capacitor shells, and APK download pages have been removed; the project now ships as web-only.

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
- GET /u/me
- GET /u/vehicles
- GET /u/sacco/overview
- GET /u/transactions?kind=fees|loans
- GET /u/ussd?matatu_id=...
- GET/POST/DELETE /api/admin/* (saccos, matatus, ussd pool, staff, loans)
- POST /api/pay/stk (+ /api/pay/stk/callback)

## Notes
- For production, put this server behind HTTPS and configure CORS & rate limiting.
- To seed a **system admin**, insert a row into `staff_profiles` with your `auth.uid()` and role `SYSTEM_ADMIN`.
- Mobile/PWA assets and APK downloads were removed; use the web dashboards only.


