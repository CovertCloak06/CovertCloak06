"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Passwordless magic-link sign-in (with password fallback). Accounts with an
 * enrolled TOTP factor must complete the MFA challenge here before the
 * session reaches AAL2 — getAdminSession() rejects aal1 sessions for
 * privileged roles, so skipping the challenge yields no dashboard access.
 */

/** Only same-origin /admin paths are valid post-login destinations. */
export function sanitizeNextPath(raw: string | null): string {
  if (
    raw &&
    raw.startsWith("/admin") &&
    !raw.startsWith("//") &&
    !raw.includes("\\") &&
    !raw.includes(":")
  ) {
    return raw;
  }
  return "/admin";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const destination = sanitizeNextPath(searchParams.get("next"));

  const finishLogin = useCallback(() => {
    router.push(destination);
    router.refresh();
  }, [router, destination]);

  /** If MFA is enrolled but the session is still aal1, start a TOTP
   * challenge; otherwise proceed into the dashboard. */
  const continueAfterAuth = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) {
        setError("MFA is required but no usable factor was found. Contact the owner.");
        return;
      }
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (challengeError || !challenge) {
        setError(challengeError?.message ?? "Could not start the MFA challenge.");
        return;
      }
      setMfa({ factorId: totp.id, challengeId: challenge.id });
      return;
    }
    finishLogin();
  }, [finishLogin]);

  // A magic-link return (or an aal1 session bounced back by the dashboard)
  // lands here already authenticated — resume at the MFA step if needed.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void continueAfterAuth();
    });
  }, [continueAfterAuth]);

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
          options: { emailRedirectTo: `${window.location.origin}/admin/login` },
        });
        if (authError) throw authError;
        setSent(true);
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        await continueAfterAuth();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mfa) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: mfa.challengeId,
        code: mfaCode.trim(),
      });
      if (verifyError) throw verifyError;
      finishLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  if (mfa) {
    return (
      <form onSubmit={submitMfa} className="mt-6 space-y-4">
        <p className="flex items-start gap-2 text-sm text-charcoal-200">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-steel-400" />
          Enter the 6-digit code from your authenticator app.
        </p>
        <div>
          <Label htmlFor="mfa-code" className="text-charcoal-200">
            Verification code
          </Label>
          <Input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="mt-1.5 border-charcoal-600 bg-charcoal-800 text-paper"
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-3 text-sm text-charcoal-900">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
          Verify
        </Button>
      </form>
    );
  }

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
