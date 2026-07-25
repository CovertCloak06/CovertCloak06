import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission, isRole, type Permission, type Role } from "./roles";

export type AdminSession = {
  userId: string;
  email: string | null;
  role: Role;
};

/** Resolve the current authenticated admin user and their role (from the
 * user_roles table). Returns null when unauthenticated or role-less. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleRow || !isRole(roleRow.role)) return null;
  return { userId: user.id, email: user.email ?? null, role: roleRow.role };
}

/** Guard for admin pages/actions: redirects unauthenticated users to login
 * and 403s users lacking the required permission. */
export async function requirePermission(permission: Permission): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasPermission(session.role, permission)) redirect("/admin?error=forbidden");
  return session;
}
