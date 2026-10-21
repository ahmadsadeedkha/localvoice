import { NavLink, Outlet } from "react-router";
import { UserButton } from "@clerk/react";
import { Building2, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

// Add items here as pages arrive (calls, webhook events, admins)
const nav = [{ to: "/tenants", label: "Tenants", icon: Building2 }];

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
          <span className="rounded-lg bg-primary p-1.5 text-primary-foreground">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          LocalVoice Admin
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <ThemeToggle />
          <UserButton />
        </header>
        <main className="mx-auto w-full max-w-[1200px] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
