import Link from "next/link";
import { Phone } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PhoneNumber } from "@/components/phone-number";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { CallListItem } from "@/lib/types";

function Caller({ call }: { call: CallListItem }) {
  const label =
    call.fromNumber || call.source !== "web_test" ? (
      <PhoneNumber value={call.fromNumber} />
    ) : (
      <span className="text-muted-foreground">Web test call</span>
    );
  return (
    <Link
      href={`/calls/${call.id}`}
      className="underline-offset-4 hover:underline focus-visible:underline"
    >
      {label}
    </Link>
  );
}

export function CallsTable({
  calls,
  timezone,
  showSummary = false,
}: {
  calls: CallListItem[];
  timezone: string;
  showSummary?: boolean;
}) {
  const columns: Column<CallListItem>[] = [
    { key: "from", header: "Caller", cell: (c) => <Caller call={c} /> },
    {
      key: "outcome",
      header: "Outcome",
      cell: (c) => <StatusBadge outcome={c.outcome} />,
    },
    {
      key: "time",
      header: "Time",
      cell: (c) => formatDateTime(c.startedAt, timezone),
      className: "tabular-nums",
    },
    ...(showSummary
      ? [
          {
            key: "summary",
            header: "Summary",
            cell: (c: CallListItem) => (
              <span className="line-clamp-2 max-w-md text-muted-foreground">
                {c.summary ?? "—"}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "duration",
      header: "Duration",
      cell: (c) =>
        c.status === "in_progress" ? (
          <span className="text-muted-foreground">In progress</span>
        ) : (
          formatDuration(c.durationMs)
        ),
      className: "text-right tabular-nums",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={calls}
      getRowId={(c) => c.id}
      empty={
        <EmptyState
          icon={Phone}
          title="No calls yet"
          description="Calls to your business number will show up here."
        />
      }
    />
  );
}
