import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PhoneNumber } from "@/components/phone-number";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatDateTimeLong } from "@/lib/format";
import type {
  AppointmentItem,
  AppointmentsResponse,
} from "@/lib/business-types";

async function AppointmentsData({
  searchParams,
}: Pick<PageProps<"/appointments">, "searchParams">) {
  const { view: raw } = await searchParams;
  const view =
    (Array.isArray(raw) ? raw[0] : raw) === "past" ? "past" : "upcoming";

  const data = await apiFetch<AppointmentsResponse>(
    `/appointments?view=${view}`,
  );

  const columns: Column<AppointmentItem>[] = [
    {
      key: "when",
      header: "When",
      cell: (a) => formatDateTimeLong(a.startsAt, data.timezone),
      className: "tabular-nums",
    },
    {
      key: "customer",
      header: "Customer",
      cell: (a) => (
        <div>
          <p>{a.customerName ?? "Unknown"}</p>
          {a.customerPhone && (
            <p className="text-sm text-muted-foreground">
              <PhoneNumber value={a.customerPhone} />
            </p>
          )}
        </div>
      ),
    },
    {
      key: "service",
      header: "Service",
      cell: (a) => (
        <div>
          <p>{a.serviceName}</p>
          <p className="text-sm text-muted-foreground">{a.resourceName}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => <BookingStatusBadge status={a.status} />,
    },
    {
      key: "source",
      header: "Booked via",
      cell: (a) =>
        a.callId ? (
          <Link
            href={`/calls/${a.callId}`}
            className="text-sm underline-offset-4 hover:underline"
          >
            View call
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: "text-right",
    },
  ];

  return (
    <>
      <div className="mb-4 flex gap-2">
        <Button
          asChild
          size="sm"
          variant={view === "upcoming" ? "default" : "outline"}
        >
          <Link href="/appointments">Upcoming ({data.counts.upcoming})</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={view === "past" ? "default" : "outline"}
        >
          <Link href="/appointments?view=past">Past ({data.counts.past})</Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={data.items}
        getRowId={(a) => a.id}
        empty={
          <EmptyState
            icon={CalendarDays}
            title={
              view === "upcoming"
                ? "No upcoming appointments"
                : "Nothing here yet"
            }
            description={
              view === "upcoming"
                ? "Appointments your agent books will appear here."
                : "Completed and cancelled appointments will appear here."
            }
          />
        }
      />
      {data.counts[view] > data.items.length && (
        <p className="mt-3 text-sm text-muted-foreground">
          Showing the first {data.items.length} of {data.counts[view]}.
        </p>
      )}
    </>
  );
}

export default function AppointmentsPage({
  searchParams,
}: PageProps<"/appointments">) {
  return (
    <>
      <PageHeader
        title="Appointments"
        description="Bookings made by your agent."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <AppointmentsData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
