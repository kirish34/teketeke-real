import { request } from "./client";
import {
  DailyFeeRate,
  getDailyFeeRates,
  getPrimarySaccoId,
  getSaccoMatatus,
  getSaccoTransactions,
  Matatu,
  Transaction
} from "./staff";

export type FeeStatus = "pending" | "paid" | "failed";

export interface Fee {
  id: string;
  matatu_label: string;
  amount: number;
  status: FeeStatus;
  date: string;
  last_paid_at?: string | null;
}

interface FetchFeesParams {
  date: string;
  status?: FeeStatus | "all";
  search?: string;
  cursor?: string;
}

interface FetchFeesResponse {
  items: Fee[];
  next_cursor?: string;
}

function isSameDay(targetDate: string, isoTimestamp: string): boolean {
  if (!targetDate) return false;
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const snapshot = `${year}-${month}-${day}`;
  return snapshot === targetDate;
}

function makeMatatuLabel(matatu: Matatu | null | undefined): string {
  if (!matatu) return "Unknown matatu";
  const plate = (matatu.number_plate || "").toString().trim();
  const route =
    (matatu.route_name || matatu.route_short_name || "").toString().trim();
  if (plate && route) return `${plate} — ${route}`;
  if (plate) return plate;
  if (route) return route;
  return "Unknown matatu";
}

function buildDailyFeeByType(
  rates: DailyFeeRate[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rates) {
    const vt = (row.vehicle_type || "").toString().toUpperCase();
    const amt = Number(row.daily_fee_kes || 0);
    if (!vt || !Number.isFinite(amt) || amt <= 0) continue;
    map.set(vt, amt);
  }
  return map;
}

function dailyFeeForMatatu(
  matatu: Matatu | undefined,
  feeByType: Map<string, number>
): number {
  if (!matatu) return 0;
  const vt = (matatu.vehicle_type || "").toString().toUpperCase();
  if (!vt) return 0;
  const amt = feeByType.get(vt);
  if (!Number.isFinite(amt || 0)) return 0;
  return Number(amt);
}

export async function fetchFees(
  params: FetchFeesParams
): Promise<FetchFeesResponse> {
  const targetDate = params.date;
  const saccoId = await getPrimarySaccoId();

  const [matatus, dailyFees, transactions] = await Promise.all([
    getSaccoMatatus(saccoId),
    getDailyFeeRates(saccoId),
    getSaccoTransactions(saccoId, 1000)
  ]);

  const matatuById = new Map<string, Matatu>();
  for (const m of matatus) {
    if (!m.id) continue;
    matatuById.set(String(m.id), m);
  }

  const feeByType = buildDailyFeeByType(dailyFees);

  const paidTx: Transaction[] = transactions.filter((tx) => {
    const kind = (tx.kind || "").toString().toUpperCase();
    const status = (tx.status || "").toString().toUpperCase();
    const matchesKind = kind === "SACCO_FEE" || kind === "DAILY_FEE";
    return (
      matchesKind &&
      status === "SUCCESS" &&
      !!tx.matatu_id &&
      isSameDay(targetDate, tx.created_at)
    );
  });

  const paidFees: Fee[] = paidTx.map((tx) => {
    const matatuId = tx.matatu_id ? String(tx.matatu_id) : "";
    const matatu = matatuById.get(matatuId);
    const label = makeMatatuLabel(matatu);
    const amount = Number(tx.fare_amount_kes || 0);
    return {
      id: String(tx.id || matatuId || ""),
      matatu_label: label,
      amount,
      status: "paid",
      date: targetDate,
      last_paid_at: tx.created_at
    };
  });

  const paidMatatuIds = new Set<string>();
  for (const tx of paidTx) {
    if (!tx.matatu_id) continue;
    paidMatatuIds.add(String(tx.matatu_id));
  }

  const notPaidFees: Fee[] = matatus
    .filter((m) => {
      const id = String(m.id || "");
      if (!id) return false;
      if (paidMatatuIds.has(id)) return false;
      return true;
    })
    .map((m) => {
      const id = String(m.id);
      const label = makeMatatuLabel(m);
      const amount = dailyFeeForMatatu(m, feeByType);
      return {
        id,
        matatu_label: label,
        amount,
        status: "pending",
        date: targetDate,
        last_paid_at: null
      };
    });

  let items: Fee[] = [...paidFees, ...notPaidFees];

  if (params.status && params.status !== "all") {
    items = items.filter((fee) => fee.status === params.status);
  }

  if (params.search) {
    const q = params.search.trim().toLowerCase();
    if (q) {
      items = items.filter((fee) =>
        fee.matatu_label.toLowerCase().includes(q)
      );
    }
  }

  return {
    items,
    next_cursor: undefined
  };
}

export async function confirmFee(fee: Fee): Promise<void> {
  const saccoId = await getPrimarySaccoId();
  const matatuId = fee.id;
  const rawAmount = Number(fee.amount || 0);
  const amount = Math.round(rawAmount);

  if (!matatuId) {
    throw new Error("Missing matatu id for fee confirmation.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      "Daily fee amount is not configured for this vehicle."
    );
  }

  await request(`/api/staff/cash`, {
    method: "POST",
    body: JSON.stringify({
      sacco_id: saccoId,
      matatu_id: matatuId,
      kind: "DAILY_FEE",
      amount,
      payer_name: "SACCO staff PWA",
      payer_phone: "",
      notes: "Daily fee collected via SACCO staff PWA"
    })
  });
}

