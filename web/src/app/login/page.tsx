import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Sign in | RideOps" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-lg font-semibold">RideOps Pre-Escalation Check</h1>
      <p className="mb-4 text-ink-2">Internal tool for L1 support. Enter the team access code.</p>
      <LoginForm />
    </main>
  );
}
