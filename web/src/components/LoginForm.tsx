"use client";

import { useRef, useState, type FormEvent } from "react";
import { WakingNotice, buttonClass } from "@/components/QueryStates";

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2_000;

type Phase = "idle" | "submitting" | "waking" | "wake_failed";

const MESSAGES: Record<string, string> = {
  invalid_code: "That access code was not accepted.",
  not_configured: "The app is not configured: API_BASE_URL is missing.",
};

export function LoginForm() {
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptId = useRef(0);

  const attempt = async () => {
    const id = ++attemptId.current;
    setError(null);
    setPhase("submitting");
    for (let tries = 0; tries < MAX_ATTEMPTS; tries += 1) {
      let status = 0;
      let body: { error?: string } | null = null;
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        status = response.status;
        body = await response.json().catch(() => null);
      } catch {
        setPhase("idle");
        setError("Cannot reach the app. Check your connection.");
        return;
      }
      if (id !== attemptId.current) return;
      if (status === 200) {
        window.location.assign("/");
        return;
      }
      if (status !== 503) {
        setPhase("idle");
        setError(MESSAGES[body?.error ?? ""] ?? "Sign-in failed. Try again.");
        return;
      }
      setPhase("waking");
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      if (id !== attemptId.current) return;
    }
    setPhase("wake_failed");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) void attempt();
  };

  const busy = phase === "submitting" || phase === "waking";
  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="access-code" className="mb-1 block font-medium">
          Access code
        </label>
        <input
          id="access-code"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="h-10 w-full rounded border border-line bg-surface px-2"
        />
      </div>
      {error ? (
        <p id="login-error" role="alert" className="text-critical">
          {error}
        </p>
      ) : null}
      {phase === "waking" ? <WakingNotice onRetry={() => void attempt()} /> : null}
      {phase === "wake_failed" ? <WakingNotice stopped onRetry={() => void attempt()} /> : null}
      <button type="submit" disabled={busy || !code.trim()} className={`${buttonClass} w-full`}>
        {busy ? "Checking" : "Sign in"}
      </button>
    </form>
  );
}
