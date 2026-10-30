"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectGoogleCalendar } from "@/app/(app)/integrations/actions";
import type { GoogleCalendarOption } from "@/lib/integration-types";

export function CalendarPicker({
  calendars,
  currentId,
}: {
  calendars: GoogleCalendarOption[];
  currentId: string | null;
}) {
  const fallback = currentId ?? calendars.find((c) => c.primary)?.id ?? "";
  const [value, setValue] = useState(fallback);
  const [pending, startTransition] = useTransition();
  const unchanged = value === currentId;

  function save() {
    startTransition(async () => {
      const result = await selectGoogleCalendar(value);
      if (result.ok) toast.success("Calendar saved");
      else toast.error(result.error);
    });
  }

  if (!calendars.length) {
    return (
      <p className="text-sm text-muted-foreground">
        This Google account has no calendars you can add events to.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={value} onValueChange={setValue} disabled={pending}>
        <SelectTrigger
          className="w-full sm:w-80"
          aria-label="Calendar for bookings"
        >
          <SelectValue placeholder="Choose a calendar" />
        </SelectTrigger>
        <SelectContent>
          {calendars.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {c.primary ? " (main)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={save} disabled={pending || !value || unchanged}>
        {pending
          ? "Saving…"
          : currentId
            ? "Change calendar"
            : "Use this calendar"}
      </Button>
    </div>
  );
}
