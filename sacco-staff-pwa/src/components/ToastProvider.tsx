import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";

type ToastType = "success" | "error";

interface ToastState {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (options: { type: ToastType; message: string }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(
    (options: { type: ToastType; message: string }) => {
      setToast({
        id: Date.now(),
        type: options.type,
        message: options.message
      });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3100);
    return () => clearTimeout(timeout);
  }, [toast]);

  const typeClass =
    toast?.type === "success" ? "tt-toast-success" : "tt-toast-error";

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="tt-toast-container">
          <div key={toast.id} className={`tt-toast ${typeClass}`}>
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

