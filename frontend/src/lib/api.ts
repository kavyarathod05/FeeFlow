const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type ApiError = { message: string; details?: unknown };

function getToken() {
  return localStorage.getItem("feeflow_token");
}

export function setAuth(token: string, user: unknown) {
  localStorage.setItem("feeflow_token", token);
  localStorage.setItem("feeflow_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("feeflow_token");
  localStorage.removeItem("feeflow_user");
}

export function getStoredUser<T = { id: string; role: string; name: string; parentId?: string }>() {
  const raw = localStorage.getItem("feeflow_user");
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw Object.assign(new Error(message), { details: body?.error?.details, status: res.status });
  }
  return body.data as T;
}

export function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
