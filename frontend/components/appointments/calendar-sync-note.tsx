import { CalendarCheck, CalendarX } from "lucide-react";
import type { CalendarSyncStatus } from "@/lib/business-types";

/** Small line under the status badge. Nothing for 'pending' (also the normal state without Google). */
export function CalendarSyncNote({ status }: { status: CalendarSyncStatus }) {
  if (status === "synced") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarCheck className="size-3.5" aria-hidden /> In Google Calendar
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
        <CalendarX className="size-3.5" aria-hidden /> Calendar sync failed
      </p>
    );
  }
  return null;
}
