import { Suspense } from "react";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { DAY_NAMES, WEEK_ORDER, intervalsByDay } from "@/lib/hours";
import type { ServicesResponse } from "@/lib/business-types";

type Service = ServicesResponse["services"][number];

const columns: Column<Service>[] = [
  {
    key: "name",
    header: "Service",
    cell: (s) => (
      <div>
        <p className="font-medium">{s.name}</p>
        {s.description && (
          <p className="text-sm text-muted-foreground">{s.description}</p>
        )}
      </div>
    ),
  },
  {
    key: "duration",
    header: "Duration",
    cell: (s) => `${s.durationMinutes} min`,
    className: "tabular-nums",
  },
  {
    key: "active",
    header: "Status",
    cell: (s) =>
      s.active ? (
        <Badge
          variant="outline"
          className="border-transparent bg-success-soft text-success"
        >
          Active
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="border-transparent bg-muted text-muted-foreground"
        >
          Inactive
        </Badge>
      ),
  },
];

async function ServicesData() {
  const data = await apiFetch<ServicesResponse>("/services");
  const byDay = intervalsByDay(data.hours);

  return (
    <>
      <h2 className="mb-3 text-lg font-semibold">Services</h2>
      <DataTable
        columns={columns}
        rows={data.services}
        getRowId={(s) => s.id}
        empty={
          <EmptyState
            icon={Settings}
            title="No services yet"
            description="Services your agent can book will appear here."
          />
        }
      />

      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Opening hours</h2>
        <p className="text-sm text-muted-foreground">
          Times in {data.timezone.replaceAll("_", " ")}
        </p>
      </div>
      <Card>
        <CardContent>
          <dl className="divide-y">
            {WEEK_ORDER.map((day) => {
              const intervals = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <dt className="font-medium">{DAY_NAMES[day]}</dt>
                  <dd
                    className={
                      intervals.length
                        ? "tabular-nums"
                        : "text-muted-foreground"
                    }
                  >
                    {intervals.length ? intervals.join(", ") : "Closed"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Services & hours"
        description="What you offer and when you're open."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <ServicesData />
      </Suspense>
    </>
  );
}
