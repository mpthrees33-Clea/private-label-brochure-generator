"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) {
      router.push(search.get("callbackUrl") ?? "/");
    } else {
      setError("Wrong password.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-divider bg-surface p-6 shadow-panel"
      >
        <h1 className="font-brand text-2xl font-extrabold tracking-tight">
          quick flip <span className="text-accent">brochures</span>
        </h1>
        <p className="mt-1 text-sm text-fg-muted">Reps only.</p>

        <label className="mt-6 block text-sm font-medium">
          Password
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-divider bg-surface-1 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-light disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <a
          href="/internal/brochure/preview"
          target="_blank"
          rel="noreferrer"
          className="mt-4 block text-center text-xs text-fg-muted underline-offset-2 hover:text-accent hover:underline"
        >
          Preview the sample brochure (no login required)
        </a>
      </form>
    </main>
  );
}
