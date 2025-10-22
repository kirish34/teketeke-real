# Vercel Patch for TekeTeke

This patch adds Vercel serverless support to your existing project.

## What it adds
- `api/index.js` â†’ exports the Express app for Vercel Node runtime
- `vercel.json`  â†’ routes `/api/*` and `/u/*` to the serverless function
- `scripts/patch-server-for-vercel.ps1` â†’ modifies `server/server.js` to export the app and avoid listening on Vercel

## How to apply
1) Unzip this into the **root** of your project (where `server/` and `public/` exist).
2) Run the PowerShell patcher (from project root):
   ```powershell
   ./scripts/patch-server-for-vercel.ps1
   ```
powershell
   ```
4) Commit and push to GitHub, then import to Vercel (or use `vercel` CLI).
5) In Vercel — Project Settings — Environment Variables, add:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - DARAJA_ENV, DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE, DARAJA_PASSKEY
   - DARAJA_CALLBACK_URL = `https://<your-vercel-domain>/api/pay/stk/callback`

## Local dev (unchanged)
```powershell
npm run dev
# open http://localhost:5001/public/auth/role-select.html
```

## Notes
- Static assets remain at `/public/...` and are served by Vercel as static files.
- API calls under `/api/*` and `/u/*` are handled by the serverless function.
