export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

export function supabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

/**
 * True when the public Supabase env vars are present. Public pages fall back
 * to seed data when the database is not configured so the site (and CI
 * builds) never hard-fail on missing infrastructure.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
