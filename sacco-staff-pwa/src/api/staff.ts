import { request } from "./client";

export interface StaffSacco {
  sacco_id: string;
  name?: string | null;
}

export interface Matatu {
  id: string;
  number_plate?: string | null;
  route_name?: string | null;
  route_short_name?: string | null;
  vehicle_type?: string | null;
}

export interface DailyFeeRate {
  sacco_id: string;
  vehicle_type: string;
  daily_fee_kes: number;
}

export interface Transaction {
  id: string;
  sacco_id: string;
  matatu_id: string | null;
  kind: string;
  status: string;
  created_at: string;
  fare_amount_kes: number;
}

export interface Loan {
  id: string;
  sacco_id: string;
  matatu_id: string | null;
  principal_kes: number;
  interest_rate_pct: number;
  collection_model: string | null;
  term_months: number | null;
  start_date: string | null;
  status?: string | null;
}

let cachedSacco: StaffSacco | null = null;
let saccoPromise: Promise<StaffSacco> | null = null;

export async function getPrimarySacco(): Promise<StaffSacco> {
  if (cachedSacco) return cachedSacco;
  if (!saccoPromise) {
    saccoPromise = (async () => {
      const res = await request<{ items: StaffSacco[] }>("/u/my-saccos");
      const first = res.items && res.items.length > 0 ? res.items[0] : null;
      if (!first || !first.sacco_id) {
        throw new Error("No SACCO assignment found for current staff user.");
      }
      cachedSacco = first;
      return first;
    })();
  }
  return saccoPromise;
}

export async function getPrimarySaccoId(): Promise<string> {
  const sacco = await getPrimarySacco();
  return sacco.sacco_id;
}

export async function getSaccoMatatus(
  saccoId: string
): Promise<Matatu[]> {
  const res = await request<{ items: Matatu[] }>(
    `/u/sacco/${encodeURIComponent(saccoId)}/matatus`
  );
  return res.items || [];
}

export async function getDailyFeeRates(
  saccoId: string
): Promise<DailyFeeRate[]> {
  const res = await request<{ items: DailyFeeRate[] }>(
    `/u/sacco/${encodeURIComponent(saccoId)}/daily-fee-rates`
  );
  return res.items || [];
}

export async function getSaccoTransactions(
  saccoId: string,
  limit = 1000
): Promise<Transaction[]> {
  const res = await request<{ items: Transaction[] }>(
    `/u/sacco/${encodeURIComponent(saccoId)}/transactions?limit=${encodeURIComponent(
      String(limit)
    )}`
  );
  return res.items || [];
}

export async function getSaccoLoans(
  saccoId: string
): Promise<Loan[]> {
  const res = await request<{ items: Loan[] }>(
    `/u/sacco/${encodeURIComponent(saccoId)}/loans`
  );
  return res.items || [];
}

export async function recordStaffCash(params: {
  saccoId: string;
  matatuId: string;
  kind: "SAVINGS" | "LOAN_REPAY";
  amount: number;
  notes?: string;
}): Promise<void> {
  const { saccoId, matatuId, kind, amount, notes } = params;
  const payload = {
    sacco_id: saccoId,
    matatu_id: matatuId,
    kind,
    amount: Number(amount || 0),
    payer_name: "SACCO staff PWA",
    payer_phone: "",
    notes: notes || "Recorded via SACCO staff PWA"
  };

  await request("/api/staff/cash", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
