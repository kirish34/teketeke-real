/**
 * M-Pesa SMS plugin (Android-only) - expected Capacitor bridge API.
 *
 * NOTE:
 *  - This file is documentation for the native plugin contract.
 *  - The real implementation must be added as a Capacitor plugin in the Android project.
 *
 * Expected global:
 *   window.Capacitor.Plugins.MpesaSms
 *
 * Methods:
 *   - requestPermission(): Promise<{ granted: boolean, status: 'granted'|'denied'|'prompt' }>
 *   - setEnabled({ enabled: boolean }): Promise<void>
 *   - pullNewMessages(): Promise<{ items: MpesaItem[] }>
 *
 * Where MpesaItem looks like:
 *   {
 *     kind: 'IN' | 'OUT',                // 'IN' = money received, 'OUT' = payment sent
 *     amount: number,                    // transaction amount in KES
 *     category?: string,                 // optional suggested category for OUT (Fuel, Parking, Maintenance, Other, ...)
 *     counterparty?: string,             // merchant / phone / name where possible
 *     mpesa_ref?: string,                // unique M-Pesa reference
 *     description?: string,              // short human-readable description
 *     occurred_at?: string,              // ISO timestamp if available
 *   }
 *
 * The Taxi web app will pass `items` directly to:
 *   POST /api/taxi/mpesa-import
 *   { items: MpesaItem[] }
 *
 * The backend is responsible for:
 *   - Deduplicating by mpesa_ref per user
 *   - Creating taxi_cash_entries for IN
 *   - Creating taxi_expense_entries for OUT
 */

