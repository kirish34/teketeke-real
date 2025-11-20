import { useEffect, useMemo, useState } from "react";
import { confirmFee, fetchFees, Fee } from "../api/fees";
import { useToast } from "./ToastProvider";

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  });
}

function sumAmounts(fees: Fee[]): number {
  return fees.reduce((total, fee) => total + (fee.amount || 0), 0);
}

function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function DailyFeeTab() {
  const { showToast } = useToast();

  const [paid, setPaid] = useState<Fee[]>([]);
  const [notPaid, setNotPaid] = useState<Fee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [collectingId, setCollectingId] = useState<string | null>(null);

  const loadFees = async (opts?: { isRefresh?: boolean }) => {
    const isRefresh = opts?.isRefresh ?? false;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const today = todayLocalIso();
      const result = await fetchFees({ date: today, status: "all" });
      const nextPaid: Fee[] = [];
      const nextNotPaid: Fee[] = [];
      for (const fee of result.items) {
        if (fee.status === "paid") {
          nextPaid.push(fee);
        } else {
          nextNotPaid.push(fee);
        }
      }
      setPaid(nextPaid);
      setNotPaid(nextNotPaid);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load fees.";
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredPaid = useMemo(() => {
    if (!normalizedSearch) return paid;
    return paid.filter((fee) =>
      fee.matatu_label.toLowerCase().includes(normalizedSearch)
    );
  }, [paid, normalizedSearch]);

  const filteredNotPaid = useMemo(() => {
    if (!normalizedSearch) return notPaid;
    return notPaid.filter((fee) =>
      fee.matatu_label.toLowerCase().includes(normalizedSearch)
    );
  }, [notPaid, normalizedSearch]);

  const handleCollect = async (fee: Fee) => {
    if (collectingId || !fee.id) return;
    setCollectingId(fee.id);
    try {
      await confirmFee(fee);
      setNotPaid((prev) => prev.filter((item) => item.id !== fee.id));
      setPaid((prev) => [...prev, { ...fee, status: "paid" }]);
      showToast({
        type: "success",
        message: `Fee for ${fee.matatu_label} confirmed`
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to confirm fee.";
      showToast({ type: "error", message });
    } finally {
      setCollectingId(null);
    }
  };

  const paidTotal = sumAmounts(paid);
  const notPaidTotal = sumAmounts(notPaid);

  return (
    <div>
      <div className="tt-summary-row">
        <div className="tt-summary-metrics">
          <span className="tt-summary-pill">
            <span className="tt-summary-label">Paid:</span>{" "}
            <span className="tt-summary-value">
              {paid.length} • {formatCurrency(paidTotal)}
            </span>
          </span>
          <span className="tt-summary-pill">
            <span className="tt-summary-label">Not paid:</span>{" "}
            <span className="tt-summary-value">
              {notPaid.length} • {formatCurrency(notPaidTotal)}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="tt-button tt-button-outline"
          onClick={() => loadFees({ isRefresh: true })}
          disabled={refreshing || loading}
        >
          {refreshing ? (
            <span className="tt-spinner" aria-label="Refreshing" />
          ) : (
            "Refresh"
          )}
        </button>
      </div>

      <div className="tt-search-row">
        <input
          className="tt-search-input"
          placeholder="Search matatu..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error && (
        <div className="tt-note" style={{ marginTop: "0.45rem" }}>
          {error}
        </div>
      )}

      {loading && !refreshing ? (
        <div className="tt-list-empty" style={{ marginTop: "0.75rem" }}>
          Loading today&apos;s fees...
        </div>
      ) : (
        <>
          <div className="tt-section-header">
            <span>Paid today</span>
            <span className="tt-section-subtitle">
              {filteredPaid.length} matatus
            </span>
          </div>
          <div className="tt-list">
            {filteredPaid.length === 0 ? (
              <div className="tt-list-empty">
                No payments yet for today.
              </div>
            ) : (
              filteredPaid.map((fee) => {
                const paidTime = formatTime(fee.last_paid_at);
                return (
                  <div
                    key={fee.id || fee.matatu_label}
                    className="tt-fee-row"
                  >
                    <div className="tt-fee-main">
                      <div className="tt-fee-matatu">{fee.matatu_label}</div>
                      <div className="tt-fee-meta">
                        <span className="tt-fee-amount">
                          {formatCurrency(fee.amount)}
                        </span>
                        {paidTime && (
                          <span style={{ marginLeft: "0.45rem" }}>
                            • Paid at {paidTime}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="tt-tag tt-tag-paid">Paid</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="tt-section-header" style={{ marginTop: "0.85rem" }}>
            <span>Not paid</span>
            <span className="tt-section-subtitle">
              {filteredNotPaid.length} matatus
            </span>
          </div>
          <div className="tt-list">
            {filteredNotPaid.length === 0 ? (
              <div className="tt-list-empty">
                Everyone is clear. No pending fees.
              </div>
            ) : (
              filteredNotPaid.map((fee) => {
                const isCollecting = collectingId === fee.id;
                return (
                  <div
                    key={fee.id || fee.matatu_label}
                    className="tt-fee-row"
                  >
                    <div className="tt-fee-main">
                      <div className="tt-fee-matatu">{fee.matatu_label}</div>
                      <div className="tt-fee-meta">
                        <span className="tt-fee-amount">
                          {formatCurrency(fee.amount)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="tt-button tt-button-primary"
                      disabled={isCollecting}
                      onClick={() => handleCollect(fee)}
                    >
                      {isCollecting ? "Collecting..." : "Collect"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
