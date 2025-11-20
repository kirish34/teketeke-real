import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/Card";
import { TabBar } from "../components/TabBar";
import { DailyFeeTab } from "../components/DailyFeeTab";
import { LoansTab } from "../components/LoansTab";
import { SavingsTab } from "../components/SavingsTab";
import { getPrimarySacco } from "../api/staff";

type SubTabKey = "daily" | "loans" | "savings";

function formatHeaderDate(now: Date): string {
  return now.toLocaleString("en-KE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function greetingForTime(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function TodayScreen() {
  const [subTab, setSubTab] = useState<SubTabKey>("daily");
  const [now, setNow] = useState<Date>(() => new Date());
  const [staffName, setStaffName] = useState<string>("Staff");
  const [saccoName, setSaccoName] = useState<string | null>(null);

  useEffect(() => {
    const storedName = localStorage.getItem("tt_staff_name");
    if (storedName && storedName.trim()) {
      setStaffName(storedName.trim());
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sacco = await getPrimarySacco();
        if (cancelled) return;
        const name =
          (sacco.name || sacco.sacco_id || "").toString().trim();
        if (name) {
          setSaccoName(name);
        }
      } catch {
        // best-effort; keep generic label if this fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const headerDateTime = useMemo(() => formatHeaderDate(now), [now]);
  const headerGreeting = useMemo(() => greetingForTime(now), [now]);

  const saccoTitle = saccoName
    ? `${saccoName} SACCO staff`
    : "SACCO staff";

  return (
    <div className="app-shell">
      <div className="tt-page-container">
        <div className="tt-card tt-header-card">
          <div className="tt-header-topline">TekeTeke</div>
          <div className="tt-header-title">{saccoTitle}</div>
          <div className="tt-header-greeting">
            {headerGreeting}, {staffName}
          </div>
          <div className="tt-header-datetime">{headerDateTime}</div>
        </div>

        <div className="tt-main-panel">
          <div className="tt-tabs-row">
            <TabBar
              tabs={[{ key: "today", label: "Today" }]}
              activeKey="today"
              onChange={() => {
                // Single tab for now; hook reserved for future date ranges.
              }}
            />
          </div>

          <Card>
            <div className="tt-subtabs-row">
              <TabBar
                tabs={[
                  { key: "daily", label: "Daily fee" },
                  { key: "loans", label: "Loans" },
                  { key: "savings", label: "Savings" }
                ]}
                activeKey={subTab}
                onChange={(key) => setSubTab(key as SubTabKey)}
              />
            </div>

            {subTab === "daily" && <DailyFeeTab />}
            {subTab === "loans" && <LoansTab />}
            {subTab === "savings" && <SavingsTab />}
          </Card>
        </div>
      </div>
    </div>
  );
}
