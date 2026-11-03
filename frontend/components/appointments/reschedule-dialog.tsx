"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getRescheduleSlots,
  rescheduleAppointment,
} from "@/app/(app)/appointments/actions";
import type { AppointmentItem, RescheduleSlots } from "@/lib/business-types";

/** YYYY-MM-DD of an instant in the business's timezone (en-CA formats as ISO dates). */
const dateIn = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);

export function RescheduleDialog({
  appointment,
  timezone,
  open,
  onOpenChange,
}: {
  appointment: AppointmentItem;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = dateIn(new Date(), timezone);
  const [date, setDate] = useState(() =>
    dateIn(new Date(appointment.startsAt), timezone),
  );
  const [data, setData] = useState<RescheduleSlots | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  function load(day: string) {
    startLoading(async () => {
      const result = await getRescheduleSlots(appointment.id, day);
      setSelected(null);
      if (result.ok) {
        setData(result.data);
        setLoadError(null);
      } else {
        setData(null);
        setLoadError(result.error);
      }
    });
  }

  // First load when the dialog opens; later loads come from changing the date.
  useEffect(() => {
    if (open) load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeDate(day: string) {
    setDate(day);
    if (day) load(day);
  }

  const currentMs = new Date(appointment.startsAt).getTime();
  const isCurrent = (iso: string) => new Date(iso).getTime() === currentMs;

  function save() {
    if (!selected) return;
    startSaving(async () => {
      const result = await rescheduleAppointment(appointment.id, selected);
      if (result.ok) {
        toast.success("Appointment rescheduled");
        onOpenChange(false);
      } else {
        toast.error(result.error);
        // The slot may have just been taken: refresh the list.
        load(date);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            {appointment.serviceName} for{" "}
            {appointment.customerName ?? "this customer"}. Only free times are
            shown. Times are in {timezone.replaceAll("_", " ")}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-date">Date</Label>
            <Input
              id="reschedule-date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => changeDate(e.target.value)}
              className="w-48"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Time</Label>
            {loading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 rounded-lg" />
                ))}
              </div>
            ) : loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : !data?.slots.length ? (
              <p className="text-sm text-muted-foreground">
                No free times on this day. Try another date.
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label="Available times"
                className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
              >
                {data.slots.map((s) => {
                  const current = isCurrent(s.start);
                  const active = selected === s.start;
                  return (
                    <Button
                      key={s.start}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      disabled={current}
                      title={current ? "Current time" : undefined}
                      className={cn("tabular-nums", current && "opacity-60")}
                      onClick={() => setSelected(s.start)}
                    >
                      {s.label}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Close
          </Button>
          <Button onClick={save} disabled={!selected || saving}>
            {saving ? "Saving…" : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
