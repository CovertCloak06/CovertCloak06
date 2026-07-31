"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

/** Browser client (anon key only — RLS enforces all access). */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createBrowserClient(supabaseUrl()!, supabaseAnonKey()!);
  }
  return client;
}
