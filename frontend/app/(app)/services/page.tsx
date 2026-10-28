import { Suspense } from "react";
import { Plus, Settings } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { HoursEditor } from "@/components/services/hours-editor";
import { ServiceDialog } from "@/components/services/service-dialog";
import { ServiceRowActions } from "@/components/services/service-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { DAY_NAMES, WEEK_ORDER, intervalsByDay } from "@/lib/hours";
import type { Service, ServicesResponse } from "@/lib/business-types";

const baseColumns: Column<Service>[] = [
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

const actionsColumn: Column<Service> = {
  key: "actions",
  header: "Actions",
  cell: (s) => <ServiceRowActions service={s} />,
  className: "text-right",
};

function ReadOnlyHours({ data }: { data: ServicesResponse }) {
  const byDay = intervalsByDay(data.hours);
  return (
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
                    intervals.length ? "tabular-nums" : "text-muted-foreground"
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
  );
}

async function ServicesData() {
  const data = await apiFetch<ServicesResponse>("/services");

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Services</h2>
        {data.canEdit && (
          <ServiceDialog
            trigger={
              <Button size="sm">
                <Plus aria-hidden /> Add service
              </Button>
            }
          />
        )}
      </div>
      <DataTable
        columns={data.canEdit ? [...baseColumns, actionsColumn] : baseColumns}
        rows={data.services}
        getRowId={(s) => s.id}
        empty={
          <EmptyState
            icon={Settings}
            title="No services yet"
            description={
              data.canEdit
                ? "Add a service so your agent can book it."
                : "Services your agent can book will appear here."
            }
          />
        }
      />

      <h2 className="mb-3 mt-8 text-lg font-semibold">Opening hours</h2>
      {data.canEdit ? (
        <HoursEditor initialHours={data.hours} timezone={data.timezone} />
      ) : (
        <>
          <ReadOnlyHours data={data} />
          <p className="mt-3 text-sm text-muted-foreground">
            Times are in {data.timezone.replaceAll("_", " ")}.
          </p>
        </>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        {data.canEdit
          ? "Changes apply to new bookings. Existing appointments aren’t affected."
          : "Only owners and admins can edit services and hours."}
      </p>
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
