// frontend/lib/api.ts
import { getAccessToken, refreshAccessToken } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(method, path, body, true);
    // Redirect to login
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "session expired");
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json();

  if (!res.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "Request failed";
    throw new ApiError(res.status, detail);
  }

  return data as T;
}

async function upload<T>(path: string, formData: FormData, isRetry = false): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (res.status === 401 && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) return upload<T>(path, formData, true);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "session expired");
  }

  const data: unknown = await res.json();
  if (!res.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "Upload failed";
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, formData: FormData) => upload<T>(path, formData),
  downloadUrl: (path: string) => {
    const token = getAccessToken();
    return `${BASE_URL}${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },
};

export { ApiError };
