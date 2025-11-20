# TekeTeke SACCO Staff PWA

This is a standalone, mobile‑first React PWA for SACCO staff to view and confirm daily fees, with placeholder structures for loans and savings.

The app is designed to be deployed separately from the main dashboards and can later be wrapped in an Android shell using a Trusted Web Activity.

## Getting started

### Prerequisites

- Node.js 20.x (same as the main TekeTeke project)
- npm (comes with Node)

### Install & run

```bash
cd sacco-staff-pwa
npm install
npm run dev
```

This starts a Vite dev server, usually on `http://localhost:5173`.

## Configuration

The app is configured via Vite environment variables:

- `VITE_API_BASE_URL`:

  - For **local dev**, you can omit this and rely on the built‑in Vite proxy (see below). In that case, all `/u` and `/api` calls are forwarded to `http://localhost:5001`.
  - For **staging/production**, set it to the full backend base URL, for example:

    ```bash
    VITE_API_BASE_URL="https://api.teketeke.example.com"
    ```

    The API client will automatically prepend this to all staff requests and attach the staff JWT as an `Authorization: Bearer <token>` header.

- `VITE_APP_TITLE` (optional): Custom browser title for the app. Defaults to `TekeTeke SACCO Staff Console` if not set.

Create a `.env` file in `sacco-staff-pwa/` or use your preferred environment variable mechanism for Vite.

### Optional staff PIN gate

You can add a lightweight PIN gate in front of the console:

- `VITE_STAFF_PIN` (optional): When set, the app shows a PIN entry screen at `/login` before unlocking the Today view.
  - Example:

    ```bash
    VITE_STAFF_PIN=1234
    ```

  - After the correct PIN is entered, a flag is stored in `localStorage` (`tt_staff_pin_unlocked`) so subsequent reloads on the same device go straight to `/`.
  - This is a **UI convenience**, not a replacement for Supabase auth. Real access control still relies on the staff JWT token (`tt_staff_token`).

### Local dev proxy (no CORS headaches)

`vite.config.ts` is configured with a dev proxy:

- Requests starting with `/u` or `/api` are proxied to `http://localhost:5001` while running `npm run dev`.
- This means you can:
  - Run the backend with `npm run dev` from the repo root (server listens on port `5001` by default).
  - Run the PWA with `npm run dev` inside `sacco-staff-pwa`.
  - Leave `VITE_API_BASE_URL` unset for local dev, and the PWA will call `/u/...` and `/api/...` via the proxy.

### Staff identity

The PWA assumes that the staff JWT and display name are managed by the existing authentication flow and placed into local storage:

- `tt_staff_token` – JWT token used for all API calls (Bearer token).
- `tt_staff_name` – Display name for the greeting header. If not set, the app falls back to `"Staff"`.

In development, you can copy a valid Supabase access token from an existing staff session and set it manually in the browser console of the PWA origin, for example:

```js
localStorage.setItem('tt_staff_token', '<your_supabase_access_token>');
localStorage.setItem('tt_staff_name', 'Claire (SACCO Staff)');
```

## PWA features

This app is built as an installable PWA:

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js` (simple cache‑first strategy)
- Icons: `public/icons/icon-192.png`, `public/icons/icon-512.png`

`index.html` links the manifest and sets the theme color:

- `<link rel="manifest" href="/manifest.webmanifest" />`
- `<meta name="theme-color" content="#0ea5e9" />`

The service worker is registered in `src/main.tsx` once the page has loaded.

When deployed over HTTPS, Lighthouse should report the app as an **Installable PWA** (has a manifest, a service worker, and passes basic PWA checks).

## Today screen and data flow

- `/` renders the **Today** screen (`TodayScreen`), with sub‑tabs for:
  - **Daily fee** – live data from `/u/staff/fees`
  - **Loans** – structured mock data (ready to be wired to `/u/staff/loans` later)
  - **Savings** – UI placeholder with local actions and toasts
- `/login` renders a lightweight placeholder login screen. Real auth remains in the main system.

### API client

The API client is defined in `src/api/client.ts`, `src/api/staff.ts`, and `src/api/fees.ts`:

- `request<T>(path: string, options?: RequestInit): Promise<T>`
  - Builds URLs against `VITE_API_BASE_URL` when set, or same‑origin paths when using the Vite dev proxy.
  - Always attaches `Authorization: Bearer <tt_staff_token>` when available.
- Staff helpers in `src/api/staff.ts` wrap existing backend endpoints:
  - `/u/my-saccos` → `getPrimarySaccoId()`
  - `/u/sacco/:id/matatus` → `getSaccoMatatus(...)`
  - `/u/sacco/:id/daily-fee-rates` → `getDailyFeeRates(...)`
  - `/u/sacco/:id/transactions` → `getSaccoTransactions(...)`
- Daily fee helpers in `src/api/fees.ts`:
  - `fetchFees(params: { date: string; status?: "pending" | "paid" | "failed" | "all"; search?: string; cursor?: string; })`
    - Uses the staff helpers above to:
      - Detect the current staff user&apos;s SACCO.
      - Load matatus, daily fee rates, and transactions.
      - Derive a unified list of `Fee` items with `status: "paid"` (successful `SACCO_FEE`/`DAILY_FEE` transactions for the chosen day) or `status: "pending"` (matatus with no such payment yet).
  - `confirmFee(fee: Fee)`
    - Calls the existing `POST /api/staff/cash` endpoint with `kind: "DAILY_FEE"` and the fee&apos;s amount and matatu id.
    - Lets the backend reuse its existing cash‑recording logic while the PWA stays thin.

### Daily fee tab

The **Daily fee** tab:

- Fetches today&apos;s fees on mount using local time.
- Splits them into **Paid today** and **Not paid** lists.
- Shows a summary row with counts and total KES amounts for paid and not‑paid.
- Provides a search input that live‑filters both lists by matatu label.
- Supports a `Collect` action:
  - Calls `confirmFee(fee.id)`.
  - On success, moves the matatu from **Not paid** to **Paid today** and shows a green success toast.
  - On failure, keeps it in **Not paid** and shows an error toast.
- Includes a small refresh button that reloads fees (with a spinner while refreshing).

Animations and micro‑interactions are implemented with CSS transitions so rows gently fade/slide in and cards respond to presses.

### Loans & Savings

- `LoansTab`:
  - Renders a table‑like list of mock loans with columns: Matatu, Loan, Balance, To pay today, Status.
  - Contains a clear comment and structure to be replaced by a real `/u/staff/loans` endpoint later.
- `SavingsTab`:
  - Shows mock “Paid today” savings rows.
  - Provides a “Manual collection” form (matatu dropdown + amount) that triggers a local toast on submit:
    - `"Savings collection recorded (UI only, no backend yet)"`
  - Shows a muted note that savings APIs are not wired yet.

## Running a production build

```bash
cd sacco-staff-pwa
npm install
npm run build
```

This runs the standard Vite production build. The output is placed in `dist/`.

## Android app via Trusted Web Activity

To wrap this PWA into a full‑screen Android app for SACCO staff, you can use **Trusted Web Activity** via Bubblewrap.

> Note: The steps below are documentation only; do **not** run these commands inside this repository unless you deliberately want to generate an Android project.

1. Install Bubblewrap globally:

   ```bash
   npm install -g @bubblewrap/cli
   ```

2. Deploy the PWA over HTTPS and ensure Lighthouse reports it as an **Installable PWA**:

   - The deployed URL should serve `manifest.webmanifest`.
   - The service worker (`/sw.js`) must be registered and control the start URL.

3. Initialize the Bubblewrap project from the live manifest:

   ```bash
   bubblewrap init --manifest=https://<deployed-staff-pwa>/manifest.webmanifest
   ```

   - Replace `<deployed-staff-pwa>` with the actual HTTPS origin where this PWA is hosted.
   - Review and adjust the generated Android project settings (app name, package ID, icons, etc.) as needed.

4. Build the Android artifacts:

   ```bash
   bubblewrap build
   ```

   This produces an APK/AAB that wraps the TekeTeke SACCO Staff PWA in a full‑screen Android app.

5. Sign and distribute the generated Android app through your usual channels (internal testing, Play Store, etc.).
