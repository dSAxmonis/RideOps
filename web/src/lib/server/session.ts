import "server-only";

import { SESSION_TTL_SECONDS } from "@/lib/server/sealed";

export const SESSION_COOKIE = "rideops_session";
export const UPSTREAM_TIMEOUT_MS = 25_000;

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
});

export function apiBaseUrl(): string | null {
  const value = process.env.API_BASE_URL?.trim().replace(/\/+$/, "");
  return value ? value : null;
}

/** Rejects cross-site state changes in addition to the sameSite cookie. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const isColdStartStatus = (status: number) => status === 502 || status === 503 || status === 504;
