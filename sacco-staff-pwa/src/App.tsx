import { FormEvent, useEffect, useState } from "react";
import { Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { TodayScreen } from "./screens/TodayScreen";

const PIN_KEY = "tt_staff_pin_unlocked";
const CONFIG_PIN = import.meta.env.VITE_STAFF_PIN as string | undefined;
const MAX_PIN_LENGTH = 8;

function isPinRequired(): boolean {
  return Boolean(CONFIG_PIN && CONFIG_PIN.toString().trim());
}

function isUnlocked(): boolean {
  if (!isPinRequired()) return true;
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}

function LoginScreen() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPinRequired()) {
      navigate("/", { replace: true });
      return;
    }
    if (isUnlocked()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const expected = (CONFIG_PIN || "").toString().trim();
    if (!expected) {
      navigate("/", { replace: true });
      return;
    }
    if (pin.trim() !== expected) {
      setError("Incorrect PIN. Please try again.");
      return;
    }
    try {
      localStorage.setItem(PIN_KEY, "1");
    } catch {
      // ignore localStorage errors
    }
    navigate("/", { replace: true });
  };

  const handleKeyPress = (value: string) => {
    setError(null);
    if (value === "backspace") {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (value === "clear") {
      setPin("");
      return;
    }
    if (!/^\d$/.test(value)) return;
    setPin((prev) =>
      prev.length >= MAX_PIN_LENGTH ? prev : prev + value
    );
  };

  return (
    <div className="app-shell">
      <div className="app-shell-inner">
        <div className="tt-header-topline tt-login-brand">TekeTeke</div>
        <h1 className="app-title tt-login-title">Enter staff PIN</h1>
        <p className="app-subtitle">
          This console is for authorised SACCO staff only.
        </p>
        <form onSubmit={handleSubmit} style={{ marginTop: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem"
            }}
          >
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              className="tt-input tt-pin-input"
              placeholder="Enter PIN"
              value={pin}
              onChange={(event) => {
                const raw = event.target.value.replace(/\D+/g, "");
                setPin(raw.slice(0, MAX_PIN_LENGTH));
              }}
            />
            <div className="tt-pin-keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className="tt-pin-key"
                  onClick={() => handleKeyPress(digit)}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                className="tt-pin-key tt-pin-key-secondary"
                onClick={() => handleKeyPress("clear")}
              >
                Clear
              </button>
              <button
                type="button"
                className="tt-pin-key"
                onClick={() => handleKeyPress("0")}
              >
                0
              </button>
              <button
                type="button"
                className="tt-pin-key tt-pin-key-secondary"
                onClick={() => handleKeyPress("backspace")}
              >
                ←
              </button>
            </div>
            {error && (
              <div className="tt-note" style={{ color: "#b91c1c" }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              className="tt-button tt-button-primary"
              disabled={!pin.trim()}
              style={{ width: "100%", marginTop: "0.25rem" }}
            >
              Unlock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AppRoutes() {
  const unlocked = isUnlocked();

  return (
    <Routes>
      <Route
        path="/"
        element={
          unlocked ? <TodayScreen /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={unlocked ? <Navigate to="/" replace /> : <LoginScreen />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="app-root">
      <AppRoutes />
    </div>
  );
}

export default App;
