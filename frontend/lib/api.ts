// frontend/lib/api.ts

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

// FastAPI puts a human string under `detail` for business errors, but an array
// of {loc, msg, type} objects for 422 validation errors. Stringifying the array
// naively yields "[object Object]"; join the messages instead.
function parseErrorDetail(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return fallback;
  }
  const detail = (data as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : null,
      )
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join(" · ");
  }
  return fallback;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await import("@/lib/auth").then((m) =>
      m.refreshAccessToken(),
    );
    if (refreshed) return request<T>(method, path, body, true);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "session expired");
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => {
    throw new ApiError(res.status, res.statusText || "Request failed");
  });

  if (!res.ok) {
    throw new ApiError(res.status, parseErrorDetail(data, "Request failed"));
  }

  return data as T;
}

async function upload<T>(
  path: string,
  formData: FormData,
  isRetry = false,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await import("@/lib/auth").then((m) =>
      m.refreshAccessToken(),
    );
    if (refreshed) return upload<T>(path, formData, true);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "session expired");
  }

  const data: unknown = await res.json().catch(() => {
    throw new ApiError(res.status, res.statusText || "Upload failed");
  });
  if (!res.ok) {
    throw new ApiError(res.status, parseErrorDetail(data, "Upload failed"));
  }
  return data as T;
}

async function downloadRequest(
  path: string,
  filename: string,
  isRetry = false,
): Promise<void> {
  if (typeof document === "undefined")
    throw new ApiError(0, "Download requires a browser context");

  const res = await fetch(`/api${path}`, { credentials: "include" });

  if (res.status === 401 && !isRetry) {
    const refreshed = await import("@/lib/auth").then((m) =>
      m.refreshAccessToken(),
    );
    if (refreshed) return downloadRequest(path, filename, true);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "session expired");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, parseErrorDetail(data, "Download failed"));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, formData: FormData) => upload<T>(path, formData),
  download: (path: string, filename: string) => downloadRequest(path, filename),
};
