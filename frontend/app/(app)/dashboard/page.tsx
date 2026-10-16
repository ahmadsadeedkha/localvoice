import { CalendarCheck, Clock, Phone, PhoneMissed } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/data-table";
import { PhoneNumber } from "@/components/phone-number";
import { StatusBadge, type CallOutcome } from "@/components/status-badge";

type Call = {
  id: string;
  from: string;
  outcome: CallOutcome;
  duration: string;
  time: string;
};

// Mock data, replaced by the API later
const calls: Call[] = [
  {
    id: "1",
    from: "+923001234567",
    outcome: "booked",
    duration: "2:14",
    time: "10:42",
  },
  {
    id: "2",
    from: "+923217654321",
    outcome: "voicemail",
    duration: "0:48",
    time: "10:15",
  },
  {
    id: "3",
    from: "+923335550101",
    outcome: "transferred",
    duration: "1:30",
    time: "09:58",
  },
  {
    id: "4",
    from: "+923451112233",
    outcome: "abandoned",
    duration: "0:07",
    time: "09:31",
  },
];

const columns: Column<Call>[] = [
  {
    key: "from",
    header: "Caller",
    cell: (c) => <PhoneNumber value={c.from} />,
  },
  {
    key: "outcome",
    header: "Outcome",
    cell: (c) => <StatusBadge outcome={c.outcome} />,
  },
  {
    key: "time",
    header: "Time",
    cell: (c) => c.time,
    className: "tabular-nums",
  },
  {
    key: "duration",
    header: "Duration",
    cell: (c) => c.duration,
    className: "text-right tabular-nums",
  },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What your AI receptionist handled today."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Calls today"
          value={24}
          hint="+3 vs yesterday"
          icon={Phone}
        />
        <StatCard label="Appointments booked" value={9} icon={CalendarCheck} />
        <StatCard label="Missed calls" value={1} icon={PhoneMissed} />
        <StatCard label="Avg. call length" value="1:52" icon={Clock} />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent calls</h2>
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
    </>
  );
}
