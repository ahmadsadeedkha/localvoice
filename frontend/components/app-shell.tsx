"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="rounded-lg bg-primary p-1.5 text-primary-foreground">
        <PhoneCall className="size-4" aria-hidden />
      </span>
      LocalVoice AI
    </Link>
  );
}

function NavFallback() {
  return (
    <div className="flex flex-col gap-1 p-3" aria-hidden>
      {navItems.map((item) => (
        <Skeleton key={item.href} className="h-9 w-full" />
      ))}
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Brand />
        </div>
        <Suspense fallback={<NavFallback />}>
          <SidebarNav />
        </Suspense>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center border-b px-4">
                <Brand />
              </div>
              <Suspense fallback={<NavFallback />}>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </Suspense>
            </SheetContent>
          </Sheet>

          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
          />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserButton />
          </div>
        </header>

        <main className="mx-auto w-full max-w-300 p-6">{children}</main>
      </div>
    </div>
  );
}
