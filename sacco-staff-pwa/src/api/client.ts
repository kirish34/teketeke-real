const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

const STAFF_TOKEN_KEY = "tt_staff_token";

function buildUrl(path: string): string {
  if (API_BASE_URL && /^https?:\/\//i.test(API_BASE_URL)) {
    const base = API_BASE_URL.replace(/\/+$/, "");
    return `${base}${path}`;
  }
  // Fall back to same-origin path (useful with the Vite dev proxy).
  return path;
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem(STAFF_TOKEN_KEY) ?? "";

  const headers = new Headers(options.headers ?? {});

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = buildUrl(path);

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const maybeJson = await response.clone().json();
      if (maybeJson && typeof maybeJson === "object" && "message" in maybeJson) {
        message = String((maybeJson as { message?: unknown }).message);
      }
    } catch {
      try {
        const text = await response.text();
        if (text) {
          message = text;
        }
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
