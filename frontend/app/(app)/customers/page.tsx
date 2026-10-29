import { Suspense } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { PhoneNumber } from "@/components/phone-number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatDateTimeLong } from "@/lib/format";
import type { CustomerListItem, CustomersResponse } from "@/lib/customer-types";

const PAGE_SIZE = 20;

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

async function CustomersData({
  searchParams,
}: Pick<PageProps<"/customers">, "searchParams">) {
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const page = Math.max(Number(first(sp.page)) || 1, 1);

  const data = await apiFetch<CustomersResponse>(
    `/customers?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}&q=${encodeURIComponent(q)}`,
  );
  const pages = Math.max(Math.ceil(data.total / PAGE_SIZE), 1);

  const columns: Column<CustomerListItem>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (c) => (
        <Link
          href={`/customers/${encodeURIComponent(c.phone)}`}
          className="block underline-offset-4 hover:underline focus-visible:underline"
        >
          {c.name ? (
            <span className="font-medium">{c.name}</span>
          ) : (
            <span className="text-muted-foreground">Unknown caller</span>
          )}
          <span className="block text-sm text-muted-foreground">
            <PhoneNumber value={c.phone} />
          </span>
        </Link>
      ),
    },
    {
      key: "calls",
      header: "Calls",
      cell: (c) => c.callCount,
      className: "tabular-nums",
    },
    {
      key: "bookings",
      header: "Appointments",
      cell: (c) => c.bookingCount,
      className: "tabular-nums",
    },
    {
      key: "next",
      header: "Next appointment",
      cell: (c) =>
        c.nextAppointmentAt ? (
          formatDateTimeLong(c.nextAppointmentAt, data.timezone)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      className: "tabular-nums",
    },
    {
      key: "last",
      header: "Last contact",
      cell: (c) => formatDateTime(c.lastContactAt, data.timezone),
      className: "text-right tabular-nums",
    },
  ];

  return (
    <>
      <form action="/customers" className="mb-4 flex max-w-md gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search by name or phone"
          aria-label="Search customers"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/customers">Clear</Link>
          </Button>
        )}
      </form>

      <DataTable
        columns={columns}
        rows={data.items}
        getRowId={(c) => c.phone}
        empty={
          <EmptyState
            icon={Users}
            title={q ? "No matching customers" : "No customers yet"}
            description={
              q
                ? "Try a different name or part of a phone number."
                : "People who call or book will appear here."
            }
          />
        }
      />

      <Pagination
        page={page}
        pages={pages}
        total={data.total}
        noun="customers"
        hrefFor={(p) =>
          `/customers?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`
        }
      />
    </>
  );
}

export default function CustomersPage({
  searchParams,
}: PageProps<"/customers">) {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has called, booked or left a message."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CustomersData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
