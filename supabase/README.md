# SQL Migrations
Apply with Supabase CLI or psql in order:

1. `migrations/000_core_schema.sql` — tables & enums
2. `migrations/001_rls_and_helpers.sql` — helper functions + RLS + RPCs
3. `migrations/002_seeds.sql` — demo seeds (optional)

RPCs used by the dashboards:
- `count_tx_today()` → integer
- `fees_today()`     → (date text, sacco uuid, amount numeric, matatu uuid, time text)
- `loans_today()`    → (date text, sacco uuid, amount numeric, matatu uuid, time text)

If you need a system admin user, insert a row into `public.staff_profiles`
with your auth user id and role 'SYSTEM_ADMIN'. Example:

```sql
insert into public.staff_profiles(user_id, role, name, email)
values ('<YOUR_AUTH_USER_UUID>', 'SYSTEM_ADMIN', 'You', 'you@example.com');
```