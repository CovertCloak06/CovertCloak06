"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="mt-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-charcoal-300 hover:bg-charcoal-800 hover:text-white md:mt-3"
      onClick={async () => {
        await createSupabaseBrowserClient()?.auth.signOut();
        router.push("/admin/login");
        router.refresh();
      }}
    >
      <LogOut aria-hidden className="size-3.5" /> Sign out
    </button>
  );
}
