import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin Login", robots: { index: false } };

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-charcoal-700 bg-charcoal-900 p-8 text-paper">
        <h1 className="text-xl font-semibold">Campaign Dashboard</h1>
        <p className="mt-1 text-sm text-charcoal-300">
          Authorized campaign staff only. All access is logged.
        </p>
        {isSupabaseConfigured() ? (
          <LoginForm />
        ) : (
          <p className="mt-6 rounded border border-charcoal-600 bg-charcoal-800 p-4 text-sm text-charcoal-200">
            Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY (see SETUP.md) to enable the dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
