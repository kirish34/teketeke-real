# TekeTeke Mobile Shell

This folder contains the glue needed to wrap the existing `/public/*` dashboards inside a Capacitor container so you can export Android APKs (and optional iOS builds later) without rewriting your UI. All role-specific dashboards continue to live on the same Supabase/Vercel stack; the shell just drops the web assets into a WebView, adds native permissions, and gives you a place to wire push, deep links, etc.

## Why Capacitor?
Capacitor keeps the source of truth inside the repo you already maintain, but still produces real native projects (`android/` + `ios/`). Because Vercel hosts your web app, you can either:

1. **Bundle offline assets** by copying `../public/**/*` into `mobile-shell/web/public` (default) and redirecting the shell to any entry point (driver, taxi, boda, etc.), or
2. **Point to your Vercel build** by setting `TEKETEKE_REMOTE_URL=https://your-app.vercel.app/public/<role>/...` before syncing (useful for staging builds).

Either way you get one multi-role app—users just sign in and pick a role exactly like the browser flow.

## Prerequisites
- Node 18+ (matches the main project)
- Android Studio + SDK + Java 17
- (Optional) A Supabase service key to exercise authenticated routes
- Vercel deploy URL if you want remote hosting inside the shell

## Install & prepare assets
```bash
cd mobile-shell
npm install          # copies ../public/mobile into mobile-shell/web
```

Whenever you tweak the PWA, re-run:
```bash
npm run prep:web
```

## Generate/update native projects
```bash
# First time only (creates android/ + capacitor config)
npm run cap:init

# Afterwards (syncs changes + copies latest web assets)
npm run cap:sync
```

If you prefer to stream from Vercel instead of bundling files, export the env var before syncing:
```bash
TEKETEKE_REMOTE_URL=https://your-team.vercel.app/public/mobile/index.html npm run cap:sync
```

## Build & run Android
```bash
# Opens Android Studio
npm run android

# Or build a debug APK directly
npm run build:apk
```
The unsigned debug APK will live at `mobile-shell/android/app/build/outputs/apk/debug/app-debug.apk`.

For release builds you need to:
1. Create a keystore (`keytool -genkeypair ...`)
2. Add the signing config in `android/app/build.gradle`
3. Run `./gradlew assembleRelease`

## PWA asset source
All assets are copied from `../public`, so absolute URLs like `/public/js/api.js` continue to work offline. The default entry is the driver PWA (`/public/mobile/index.html`), but you can generate role-specific builds with the helper scripts below:

| Role | Command |
| --- | --- |
| Matatu Staff | `npm run role:matatu-staff` |
| Matatu Owner | `npm run role:matatu-owner` |
| Sacco Staff  | `npm run role:sacco-staff` |
| Taxi         | `npm run role:taxi` |
| Bodaboda     | `npm run role:bodaboda` |

Each command sets the package id + app name + entry HTML, runs `npm run cap:sync`, and leaves you inside the corresponding Android project. After that you can `npm run android` or `npm run build:apk` to obtain a dedicated APK (e.g., `TekeTeke Go Taxi`).

## Next steps / ideas
- Add deep links that open tabs like `app://teketeke/pay` → `/public/mobile/index.html#pay`
- Wire push notifications (FCM) through Capacitor Push plugin
- Add biometric lock using `@capacitor/preferences` + `@capacitor/device`
- Configure build pipelines (GitHub Actions or Vercel Deploy Hooks) to automate `npm run cap:sync` + Gradle builds
