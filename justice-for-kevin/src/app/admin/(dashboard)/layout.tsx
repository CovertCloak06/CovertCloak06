import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  FileArchive,
  Files,
  LayoutDashboard,
  Megaphone,
  Network,
  ScrollText,
  Send,
  Settings,
  Users,
} from "lucide-react";
import { getAdminSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SignOutButton } from "./sign-out";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/leads", label: "Leads", icon: ClipboardList },
  { href: "/admin/entities", label: "Entities", icon: Network },
  { href: "/admin/distribution", label: "Distribution", icon: Megaphone },
  { href: "/admin/campaigns", label: "Campaigns", icon: Send },
  { href: "/admin/sources", label: "Sources", icon: FileArchive },
  { href: "/admin/files", label: "Files", icon: Files },
  { href: "/admin/transmissions", label: "Transmissions", icon: Send },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
        <p className="mt-2 text-charcoal-600">
          Supabase is not configured. Follow SETUP.md to connect the database, run
          migrations, and bootstrap the owner account.
        </p>
      </div>
    );
  }

  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-charcoal-50">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-charcoal-800 bg-charcoal-900 text-paper md:flex">
        <div className="border-b border-charcoal-800 p-4">
          <p className="font-semibold">Unbroken: The Fight for Kevin</p>
          <p className="text-xs text-charcoal-400">Campaign dashboard</p>
        </div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto p-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-charcoal-200 hover:bg-charcoal-800 hover:text-white"
            >
              <item.icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-charcoal-800 p-4 text-xs text-charcoal-300">
          <p className="truncate font-medium text-charcoal-200">{session.email}</p>
          <p className="mt-0.5 uppercase tracking-wide">{session.role.replaceAll("_", " ")}</p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-charcoal-200 bg-white px-4 py-3 md:hidden">
          <p className="font-semibold">Campaign dashboard</p>
          <SignOutButton />
        </header>
        <nav
          aria-label="Admin (mobile)"
          className="flex gap-1 overflow-x-auto border-b border-charcoal-200 bg-white px-2 py-2 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-charcoal-700 hover:bg-charcoal-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main id="admin-main" className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
