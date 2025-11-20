import { useEffect, useMemo, useState } from "react";
import { Card } from "./Card";
import {
  getPrimarySaccoId,
  getSaccoLoans,
  getSaccoMatatus,
  getSaccoTransactions,
  Loan,
  Matatu,
  Transaction
} from "../api/staff";
import { useToast } from "./ToastProvider";

interface LoanRow {
  id: string;
  matatu: string;
  loanAmount: number;
  balance: number;
  toPayToday: number;
  status: "on_track" | "overdue" | "cleared";
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  });
}

function statusLabel(status: LoanRow["status"]): string {
  switch (status) {
    case "on_track":
      return "On track";
    case "overdue":
      return "Overdue";
    case "cleared":
      return "Cleared";
    default:
      return status;
  }
}

function statusClassName(status: LoanRow["status"]): string {
  switch (status) {
    case "on_track":
      return "tt-tag tt-tag-paid";
    case "overdue":
      return "tt-tag tt-tag-failed";
    case "cleared":
      return "tt-tag tt-tag-paid";
    default:
      return "tt-tag";
  }
}

function makeMatatuLabel(matatu: Matatu | undefined): string {
  if (!matatu) return "Unknown matatu";
  const plate = (matatu.number_plate || "").toString().trim();
  const route =
    (matatu.route_name || matatu.route_short_name || "").toString().trim();
  if (plate && route) return `${plate} — ${route}`;
  if (plate) return plate;
  if (route) return route;
  return "Unknown matatu";
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function countWeekdaysInclusive(start: Date, end: Date): number {
  try {
    let count = 0;
    let d = startOfDay(start);
    const e = startOfDay(end);
    while (d <= e) {
      const weekday = d.getDay();
      if (weekday >= 1 && weekday <= 5) {
        count += 1;
      }
      d.setDate(d.getDate() + 1);
    }
    return Math.max(1, count);
  } catch {
    return 1;
  }
}

function weeksInRange(start: Date, end: Date): number {
  try {
    const ms =
      startOfDay(end).getTime() - startOfDay(start).getTime();
    const weekMs = 7 * 24 * 3600 * 1000;
    return Math.max(1, Math.ceil(ms / weekMs));
  } catch {
    return 1;
  }
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

function buildLoanRows(
  loans: Loan[],
  matatus: Matatu[],
  transactions: Transaction[]
): LoanRow[] {
  const matatuById = new Map<string, Matatu>();
  matatus.forEach((m) => {
    if (!m.id) return;
    matatuById.set(String(m.id), m);
  });

  const loanRepaysAll = transactions.filter((tx) => {
    const kind = (tx.kind || "").toString().toUpperCase();
    const status = (tx.status || "").toString().toUpperCase();
    return kind === "LOAN_REPAY" && status === "SUCCESS";
  });

  const loanRepaysToday = loanRepaysAll.filter((tx) =>
    isToday(tx.created_at)
  );

  const paidTodayByMatatu = new Map<string, number>();
  loanRepaysToday.forEach((tx) => {
    if (!tx.matatu_id) return;
    const key = String(tx.matatu_id);
    const prev = paidTodayByMatatu.get(key) || 0;
    paidTodayByMatatu.set(key, prev + Number(tx.fare_amount_kes || 0));
  });

  const repaidAllByMatatu = new Map<string, number>();
  loanRepaysAll.forEach((tx) => {
    if (!tx.matatu_id) return;
    const key = String(tx.matatu_id);
    const prev = repaidAllByMatatu.get(key) || 0;
    repaidAllByMatatu.set(key, prev + Number(tx.fare_amount_kes || 0));
  });

  const todayStart = startOfDay(new Date());
  const msDay = 24 * 3600 * 1000;

  return loans.map<LoanRow>((loan) => {
    const matatuId = loan.matatu_id ? String(loan.matatu_id) : "";
    const matatu = matatuId ? matatuById.get(matatuId) : undefined;
    const matatuLabel = makeMatatuLabel(matatu);

    const principal = Number(loan.principal_kes || 0);
    const ratePct = Number(loan.interest_rate_pct || 0);
    const total = principal * (1 + ratePct / 100);

    const model = (loan.collection_model || "MONTHLY")
      .toString()
      .toUpperCase();
    const termMonths = Math.max(
      1,
      Number(loan.term_months || 1)
    );

    const start = loan.start_date
      ? new Date(loan.start_date)
      : new Date();
    const end = addMonths(start, termMonths);

    let installments = termMonths;
    if (model === "DAILY") {
      installments = countWeekdaysInclusive(start, end);
    } else if (model === "WEEKLY") {
      installments = weeksInRange(start, end);
    }

    const installmentAmount =
      installments > 0 ? total / installments : total;

    let isPayDay = false;
    if (model === "DAILY") {
      isPayDay = true;
    } else if (model === "WEEKLY") {
      const days = Math.floor(
        (todayStart.getTime() - startOfDay(start).getTime()) / msDay
      );
      isPayDay = days >= 0 && days % 7 === 0 && todayStart <= end;
    }

    const dueToday = isPayDay ? installmentAmount : 0;

    const repaidAllForMatatu =
      repaidAllByMatatu.get(matatuId) || 0;
    const loanBalance = Math.max(0, total - repaidAllForMatatu);

    const paidTodayForMatatu =
      paidTodayByMatatu.get(matatuId) || 0;
    const toPayToday = Math.max(
      0,
      dueToday - paidTodayForMatatu
    );

    let status: LoanRow["status"] = "on_track";
    if (loanBalance <= 0.01) {
      status = "cleared";
    } else if (toPayToday > 0.01 && dueToday > 0) {
      status = "overdue";
    }

    return {
      id: String(loan.id || matatuId || ""),
      matatu: matatuLabel,
      loanAmount: principal,
      balance: loanBalance,
      toPayToday,
      status
    };
  });
}

export function LoansTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const saccoId = await getPrimarySaccoId();
        const [loans, matatus, transactions] = await Promise.all([
          getSaccoLoans(saccoId),
          getSaccoMatatus(saccoId),
          getSaccoTransactions(saccoId, 2000)
        ]);
        if (cancelled) return;
        const computed = buildLoanRows(
          loans || [],
          matatus || [],
          transactions || []
        );
        setRows(computed);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load loans.";
        setError(message);
        showToast({ type: "error", message });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const summary = useMemo(() => {
    const totalLoans = rows.length;
    const cleared = rows.filter(
      (r) => r.status === "cleared"
    ).length;
    const overdue = rows.filter(
      (r) => r.status === "overdue"
    ).length;
    return { totalLoans, cleared, overdue };
  }, [rows]);

  return (
    <Card title="Loans due today">
      <div className="tt-section-subtitle" style={{ marginBottom: "0.5rem" }}>
        Snapshot of active loans and what is due today.
      </div>
      {loading && (
        <div className="tt-list-empty">
          Loading loans for your SACCO...
        </div>
      )}
      {error && !loading && (
        <div className="tt-list-empty">{error}</div>
      )}
      {!loading && !error && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.8rem",
              marginBottom: "0.35rem"
            }}
          >
            <span>
              Total loans:{" "}
              <strong>{summary.totalLoans}</strong>
            </span>
            <span>
              Cleared:{" "}
              <strong>{summary.cleared}</strong>{" "}
              • Overdue:{" "}
              <strong>{summary.overdue}</strong>
            </span>
          </div>
          <div className="tt-loans-header">
            <div>Matatu</div>
            <div>Loan</div>
            <div>Balance</div>
            <div>Today</div>
            <div>Status</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem"
            }}
          >
            {rows.length === 0 ? (
              <div className="tt-list-empty">
                No loans found for this SACCO.
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.id} className="tt-loans-row">
                  <div>{row.matatu}</div>
                  <div>{formatCurrency(row.loanAmount)}</div>
                  <div>{formatCurrency(row.balance)}</div>
                  <div>{formatCurrency(row.toPayToday)}</div>
                  <div>
                    <span className={statusClassName(row.status)}>
                      {statusLabel(row.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Card>
  );
}

