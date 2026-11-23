// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SESSION_TTL_SECONDS, isSessionConfigured, openSession, sealSession } from "@/lib/server/sealed";

const SECRET = "unit-test-secret-unit-test-secret-000";

describe("sealed session", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));

  it("round-trips without exposing the code", () => {
    const sealed = sealSession("plain-test-code")!;
    expect(sealed).not.toContain("plain-test-code");
    expect(Buffer.from(sealed.split(".")[2]!, "base64url").toString()).not.toContain("plain-test-code");
    expect(openSession(sealed)).toBe("plain-test-code");
  });

  it("uses a fresh IV each time", () => {
    expect(sealSession("x")).not.toBe(sealSession("x"));
  });

  it("rejects an expired session", () => {
    const now = Date.now();
    const sealed = sealSession("x", now)!;
    expect(openSession(sealed, now + SESSION_TTL_SECONDS * 1000 - 1)).toBe("x");
    expect(openSession(sealed, now + SESSION_TTL_SECONDS * 1000)).toBeNull();
  });

  it.each([0, 1, 2, 3])("rejects tampering with part %i", (index) => {
    const parts = sealSession("x")!.split(".");
    const bytes = Buffer.from(parts[index]!, "base64url");
    bytes[0] = bytes[0]! ^ 1;
    parts[index] = index === 0 ? "v2" : bytes.toString("base64url");
    expect(openSession(parts.join("."))).toBeNull();
  });

  it("rejects malformed values and a raw code", () => {
    for (const value of [undefined, "", "raw-code", "v1.a.b", "v1.a.b.c.d", "v1.!!.!!.!!"]) {
      expect(openSession(value)).toBeNull();
    }
  });

  it("rejects a session sealed under another secret", () => {
    const sealed = sealSession("x")!;
    vi.stubEnv("SESSION_SECRET", `${SECRET}-rotated`);
    expect(openSession(sealed)).toBeNull();
  });

  it.each([undefined, "", "too-short"])("fails closed when the secret is %j", (secret) => {
    const sealed = sealSession("x")!;
    vi.stubEnv("SESSION_SECRET", secret as string);
    expect(isSessionConfigured()).toBe(false);
    expect(sealSession("x")).toBeNull();
    expect(openSession(sealed)).toBeNull();
  });
});
