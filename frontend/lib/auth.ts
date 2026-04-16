// frontend/lib/auth.ts
"use client";

import { AuthResponse } from "@/types/api";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const ACCESS_MAX_AGE = 900; // 15 min
const REFRESH_MAX_AGE = 2592000; // 30 days

export function setTokens({ access_token, refresh_token }: AuthResponse): void {
  document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(access_token)}; path=/; max-age=${ACCESS_MAX_AGE}; SameSite=Strict`;
  document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(refresh_token)}; path=/; max-age=${REFRESH_MAX_AGE}; SameSite=Strict`;
}

export function clearTokens(): void {
  document.cookie = `${ACCESS_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${REFRESH_COOKIE}=; path=/; max-age=0`;
}

export function getAccessToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACCESS_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getRefreshToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${REFRESH_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data: AuthResponse = await res.json();
  setTokens(data);
  return data.access_token;
}
