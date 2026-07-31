import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assignUserRoleForm } from "../actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [session, supabase] = await Promise.all([
    getAdminSession(),
    createSupabaseServerClient(),
  ]);
  if (!session || !supabase) return null;

  if (!hasPermission(session.role, "manage_users")) {
    return (
      <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-4">
        Your role cannot manage users.
      </p>
    );
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("id, role, created_at, users (email, display_name)")
    .order("created_at");

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users & roles</h1>
      <p className="mt-1 text-sm text-charcoal-600">
        Roles: owner, administrator, reviewer, outreach, read_only. Enforcement is
        server-side and in Row-Level Security — never only in the UI. MFA should be
        required for owner and administrator accounts (see SECURITY.md).
      </p>

      <Card className="mt-5">
        <CardContent className="pt-5">
          <h2 className="font-semibold">Assign role</h2>
          <p className="mt-1 text-xs text-charcoal-500">
            The person must have signed in at least once (magic link) before a role
            can be assigned. Role changes are audited.
          </p>
          <form action={assignUserRoleForm} className="mt-3 flex flex-wrap gap-2">
            <input
              name="email"
              type="email"
              required
              placeholder="user@example.org"
              aria-label="User email"
              className="h-11 min-w-64 rounded-md border border-charcoal-300 px-3 text-sm"
            />
            <select
              name="role"
              aria-label="Role"
              className="h-11 rounded-md border border-charcoal-300 bg-white px-2 text-sm"
            >
              {["administrator", "reviewer", "outreach", "read_only", "owner"].map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-11 rounded-md bg-steel-600 px-4 text-sm font-medium text-white hover:bg-steel-700"
            >
              Assign
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-5 overflow-x-auto rounded-lg border border-charcoal-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-charcoal-200 bg-charcoal-50 text-left">
            <tr>
              <th scope="col" className="p-3 font-semibold">Email</th>
              <th scope="col" className="p-3 font-semibold">Role</th>
              <th scope="col" className="p-3 font-semibold">Since</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {(roles ?? []).map((row) => {
              const user = Array.isArray(row.users) ? row.users[0] : row.users;
              return (
                <tr key={row.id}>
                  <td className="p-3">{user?.email ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={row.role === "owner" ? "law_enforcement" : "neutral"}>
                      {row.role.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="p-3 tabular-nums text-charcoal-500">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {(roles ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="p-6 text-center text-charcoal-500">
                  No roles assigned yet — bootstrap the owner via SETUP.md.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
