import { Suspense } from "react";
import Link from "next/link";
import { CalendarCheck, Clock, Phone, PhoneMissed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CallsTable } from "@/components/calls-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { DashboardSummary } from "@/lib/types";

function vsYesterday(today: number, yesterday: number) {
  const diff = today - yesterday;
  if (diff === 0) return "Same as yesterday";
  return `${diff > 0 ? "+" : ""}${diff} vs yesterday`;
}

async function DashboardData() {
  const d = await apiFetch<DashboardSummary>("/dashboard");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Calls today"
          value={d.callsToday}
          hint={vsYesterday(d.callsToday, d.callsYesterday)}
          icon={Phone}
        />
        <StatCard
          label="Appointments booked"
          value={d.bookingsToday}
          icon={CalendarCheck}
        />
        <StatCard
          label="Missed calls"
          value={d.missedToday}
          hint="Hung up within 10 seconds"
          icon={PhoneMissed}
        />
        <StatCard
          label="Avg. call length"
          value={formatDuration(d.avgDurationMs)}
          icon={Clock}
        />
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent calls</h2>
        {d.recentCalls.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/calls">View all</Link>
          </Button>
        )}
      </div>
      <CallsTable calls={d.recentCalls} timezone={d.timezone} />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="mb-3 mt-8 h-6 w-32" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What your AI receptionist handled today."
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </>
  );
}
