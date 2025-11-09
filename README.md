# TekeTeke — REAL v8 (Supabase/Postgres)

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

To provision demo accounts for every mobile dashboard run:
```bash
node scripts/seed-role-users.js
```
This creates (or reuses) users such as `sacco.manager@example.com` with password `TekePass123!` and links them to the seeded sacco/matatu records via `public.user_roles`.

## Front-end entry points
- **Role chooser:** `/public/auth/role-select.html` (links to every dashboard + the ops console).
- **Mobile PWA:** `/public/mobile/index.html` &rarr; offline queue, STK launch, transaction history and profile (installs from the browser). Works with `/api/pay/stk` and `/u/*` routes.
- **Ops console (system admin):** `/public/ops/index.html` &rarr; manage SACCOs, vehicles, USSD pool, and recent logins via `/api/admin/*`.
- **Legacy dashboards:** `/public/system/dashboard.html`, `/public/sacco/*`, `/public/matatu/*`, etc. remain available for parity testing.
- **Native shell:** `/mobile-shell` contains a Capacitor wrapper that emits Android (and optional iOS) binaries. Run `npm run role:<slug>` inside that folder (e.g., `role:taxi`, `role:bodaboda`, `role:matatu-staff`) to sync assets and build a role-specific APK such as “TekeTeke Go Taxi”.
- **Dashboard download cards:** Each applicable dashboard (matatu crew/staff, owner, sacco staff, taxi, boda) surfaces a “Download APK” CTA that links to `/downloads/teketeke-go-<role>.apk`. Replace those files with your signed builds when you publish new versions.
- **Download landing page:** `/public/downloads/index.html` lists the APKs currently available. When you copy signed builds into `public/downloads/` and redeploy on Vercel, that page (and all CTA buttons) immediately point to the fresh binaries.

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
- When generating APKs, copy the resulting files (e.g., `mobile-shell/android/app/build/outputs/apk/release/app-release.apk`) into `public/downloads/` using the naming convention above before pushing to Vercel so the download buttons stay current.


