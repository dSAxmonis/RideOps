import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  UPSTREAM_TIMEOUT_MS,
  apiBaseUrl,
  isColdStartStatus,
  isSameOrigin,
  sessionCookieOptions,
} from "@/lib/server/session";
import { isSessionConfigured, sealSession } from "@/lib/server/sealed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const loginSchema = z.object({ code: z.string().trim().min(1).max(256) });

const reply = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply(403, "forbidden");

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply(400, "invalid_request");

  const baseUrl = apiBaseUrl();
  if (!baseUrl || !isSessionConfigured()) return reply(500, "not_configured");

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/api/v1/tickets?limit=1`, {
      headers: { Accept: "application/json", "X-Access-Code": parsed.data.code },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return reply(503, "upstream_unavailable");
  }

  if (upstream.status === 401 || upstream.status === 403) return reply(401, "invalid_code");
  if (isColdStartStatus(upstream.status)) return reply(503, "upstream_unavailable");
  if (!upstream.ok) return reply(502, "bad_upstream_response");

  const sealed = sealSession(parsed.data.code);
  if (!sealed) return reply(500, "not_configured");

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions());
  return response;
}
