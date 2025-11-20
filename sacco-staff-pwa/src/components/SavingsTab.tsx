import { useEffect, useMemo, useState } from "react";
import { Card } from "./Card";
import { useToast } from "./ToastProvider";
import {
  getPrimarySaccoId,
  getSaccoMatatus,
  getSaccoTransactions,
  Matatu,
  recordStaffCash,
  Transaction
} from "../api/staff";

interface SavingsRow {
  id: string;
  matatu: string;
  amount: number;
  time: string;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  });
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

export function SavingsTab() {
  const { showToast } = useToast();

  const [saccoId, setSaccoId] = useState<string | null>(null);
  const [matatus, setMatatus] = useState<Matatu[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedMatatuId, setSelectedMatatuId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const id = await getPrimarySaccoId();
        const [mats, txs] = await Promise.all([
          getSaccoMatatus(id),
          getSaccoTransactions(id, 1000)
        ]);
        if (cancelled) return;
        setSaccoId(id);
        setMatatus(mats || []);
        setTransactions(txs || []);
        if (!selectedMatatuId && mats && mats.length > 0) {
          setSelectedMatatuId(String(mats[0].id));
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load savings data.";
        setError(message);
        showToast({ type: "error", message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const paidTodayRows = useMemo<SavingsRow[]>(() => {
    if (!transactions.length) return [];
    const matatuById = new Map<string, Matatu>();
    matatus.forEach((m) => {
      if (!m.id) return;
      matatuById.set(String(m.id), m);
    });

    const svPaid = transactions.filter((tx) => {
      const kind = (tx.kind || "").toString().toUpperCase();
      const status = (tx.status || "").toString().toUpperCase();
      return (
        kind === "SAVINGS" &&
        status === "SUCCESS" &&
        isToday(tx.created_at)
      );
    });

    return svPaid
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )
      .map((tx) => {
        const matatu = tx.matatu_id
          ? matatuById.get(String(tx.matatu_id))
          : undefined;
        const label = makeMatatuLabel(matatu);
        const amount = Number(tx.fare_amount_kes || 0);
        const time = new Date(tx.created_at).toLocaleTimeString(
          "en-KE",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        );
        return {
          id: String(tx.id),
          matatu: label,
          amount,
          time
        };
      });
  }, [transactions, matatus]);

  const submitManualCollection = async () => {
    if (!saccoId) {
      showToast({
        type: "error",
        message: "No SACCO context found for this staff user."
      });
      return;
    }

    if (!selectedMatatuId) {
      showToast({
        type: "error",
        message: "Pick a matatu before collecting savings."
      });
      return;
    }

    const parsedAmount = Number(amount || 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast({
        type: "error",
        message: "Enter a positive amount before collecting savings."
      });
      return;
    }

    setSubmitting(true);
    try {
      await recordStaffCash({
        saccoId,
        matatuId: selectedMatatuId,
        kind: "SAVINGS",
        amount: parsedAmount,
        notes: "Savings collection recorded via SACCO staff PWA"
      });
      showToast({
        type: "success",
        message: "Savings collection recorded."
      });
      setAmount("");
      // Refresh today's view
      const txs = await getSaccoTransactions(saccoId, 1000);
      setTransactions(txs || []);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to record savings collection.";
      showToast({ type: "error", message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Card title="Paid today">
        {loading ? (
          <div className="tt-list-empty">
            Loading savings for today...
          </div>
        ) : error ? (
          <div className="tt-list-empty">{error}</div>
        ) : paidTodayRows.length === 0 ? (
          <div className="tt-list-empty">
            No savings recorded for today.
          </div>
        ) : (
          <div className="tt-list" style={{ maxHeight: 180 }}>
            {paidTodayRows.map((row) => (
              <div key={row.id} className="tt-fee-row">
                <div className="tt-fee-main">
                  <div className="tt-fee-matatu">
                    {row.matatu}
                  </div>
                  <div className="tt-fee-meta">
                    {formatCurrency(row.amount)} • {row.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: "0.75rem" }} />

      <Card title="Manual collection">
        <div className="tt-savings-manual">
          <div>
            <div className="tt-field-label">Matatu</div>
            <select
              className="tt-select"
              value={selectedMatatuId}
              onChange={(event) =>
                setSelectedMatatuId(event.target.value)
              }
            >
              {matatus.length === 0 ? (
                <option value="">No matatus available</option>
              ) : (
                matatus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {makeMatatuLabel(m)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <div className="tt-field-label">Amount (KES)</div>
            <input
              className="tt-input"
              type="number"
              min={0}
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
              placeholder="e.g. 500"
            />
          </div>

          <button
            type="button"
            className="tt-button tt-button-primary"
            onClick={submitManualCollection}
            disabled={submitting || !matatus.length}
          >
            {submitting ? "Recording..." : "Collect"}
          </button>
        </div>
        <div className="tt-note">
          Savings are recorded via the same{" "}
          <code>/api/staff/cash</code> endpoint used by the
          existing SACCO staff tools.
        </div>
      </Card>
    </div>
  );
}

