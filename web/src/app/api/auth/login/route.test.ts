// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openSession } from "@/lib/server/sealed";
import { POST } from "./route";

const login = (code = "test-code") =>
  POST(
    new Request("http://app.test/api/auth/login", {
      method: "POST",
      headers: { origin: "http://app.test", host: "app.test", "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );

describe("login route", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "https://backend.test");
    vi.stubEnv("SESSION_SECRET", "unit-test-secret-unit-test-secret-000");
  });

  it("sets a sealed httpOnly strict cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const response = await login();
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).not.toContain("test-code");
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=strict/i);
    const value = decodeURIComponent(header.split(";")[0]!.split("=")[1]!);
    expect(openSession(value)).toBe("test-code");
  });

  it("does not set a cookie for a rejected code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const response = await login();
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed before calling upstream when the secret is unset", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await login();
    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
