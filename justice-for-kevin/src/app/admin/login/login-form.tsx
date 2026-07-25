"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Passwordless magic-link sign-in (with password fallback). MFA for owner
 * and administrator accounts is enforced through Supabase Auth settings —
 * see SECURITY.md → "Authentication".
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setBusy(false);
      return;
    }
    try {
      if (mode === "magic") {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (authError) throw authError;
        setSent(true);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push(searchParams.get("next") ?? "/admin");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p role="status" className="mt-6 flex items-start gap-2 rounded border border-steel-600 bg-charcoal-800 p-4 text-sm">
        <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-steel-400" />
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <Label htmlFor="login-email" className="text-charcoal-200">
          Email
        </Label>
        <Input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          className="mt-1.5 border-charcoal-600 bg-charcoal-800 text-paper"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {mode === "password" ? (
        <div>
          <Label htmlFor="login-password" className="text-charcoal-200">
            Password
          </Label>
          <Input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1.5 border-charcoal-600 bg-charcoal-800 text-paper"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-3 text-sm text-charcoal-900">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <LogIn aria-hidden />}
        {mode === "magic" ? "Send magic link" : "Sign in"}
      </Button>
      <button
        type="button"
        className="w-full text-center text-sm text-charcoal-300 underline-offset-2 hover:underline"
        onClick={() => setMode(mode === "magic" ? "password" : "magic")}
      >
        {mode === "magic" ? "Use a password instead" : "Use a magic link instead"}
      </button>
    </form>
  );
}
