/**
 * Role model. Enforcement happens in three layers:
 *  1. Postgres RLS policies (supabase/migrations/0002_rls.sql) — authoritative.
 *  2. Server-side checks in Server Actions / Server Components (this module).
 *  3. UI visibility — convenience only, never a security boundary.
 */

export const ROLES = ["owner", "administrator", "reviewer", "outreach", "read_only"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "manage_users"
  | "manage_settings"
  | "manage_content"
  | "manage_leads"
  | "review_leads"
  | "manage_entities"
  | "manage_campaigns"
  | "manage_sources"
  | "manage_files"
  | "transmit_to_apd"
  | "view_audit"
  | "export_audit"
  | "export_data"
  | "delete_files"
  | "view_dashboard";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "manage_users",
    "manage_settings",
    "manage_content",
    "manage_leads",
    "review_leads",
    "manage_entities",
    "manage_campaigns",
    "manage_sources",
    "manage_files",
    "transmit_to_apd",
    "view_audit",
    "export_audit",
    "export_data",
    "delete_files",
    "view_dashboard",
  ]),
  administrator: new Set<Permission>([
    "manage_users",
    "manage_settings",
    "manage_content",
    "manage_leads",
    "review_leads",
    "manage_entities",
    "manage_campaigns",
    "manage_sources",
    "manage_files",
    "transmit_to_apd",
    "view_audit",
    "export_data",
    "view_dashboard",
  ]),
  reviewer: new Set<Permission>([
    "review_leads",
    "manage_entities",
    "manage_sources",
    "view_dashboard",
  ]),
  outreach: new Set<Permission>([
    "manage_campaigns",
    "manage_content",
    "view_dashboard",
  ]),
  read_only: new Set<Permission>(["view_dashboard"]),
};

export function isRole(value: string | null | undefined): value is Role {
  return (ROLES as readonly string[]).includes(value ?? "");
}

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertPermission(role: Role | null | undefined, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: role "${role ?? "none"}" lacks permission "${permission}"`);
  }
}
