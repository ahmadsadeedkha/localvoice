"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import {
  cancelAppointment,
  retryCalendarSync,
} from "@/app/(app)/appointments/actions";
import { formatDateTimeLong } from "@/lib/format";
import type { AppointmentItem } from "@/lib/business-types";

export function AppointmentActions({
  appointment,
  timezone,
}: {
  appointment: AppointmentItem;
  timezone: string;
}) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelAppointment(appointment.id);
      if (result.ok) {
        toast.success("Appointment cancelled");
        setCancelOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function retrySync() {
    startTransition(async () => {
      const result = await retryCalendarSync(appointment.id);
      if (result.ok) toast.success("Retrying calendar sync");
      else toast.error(result.error);
    });
  }

  return (
    <>
      {/* modal={false}: lets the dialogs below take focus cleanly after the menu closes */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Appointment actions"
            disabled={pending}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRescheduleOpen(true)}>
            Reschedule
          </DropdownMenuItem>
          {appointment.calendarSyncStatus === "failed" && (
            <DropdownMenuItem onSelect={retrySync}>
              Retry calendar sync
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setCancelOpen(true)}
          >
            Cancel appointment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {rescheduleOpen && (
        <RescheduleDialog
          appointment={appointment}
          timezone={timezone}
          open={rescheduleOpen}
          onOpenChange={setRescheduleOpen}
        />
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
            <DialogDescription>
              {appointment.serviceName} for{" "}
              {appointment.customerName ?? "this customer"} on{" "}
              {formatDateTimeLong(appointment.startsAt, timezone)}. The time
              becomes free for new bookings and the event is removed from Google
              Calendar. The customer is not notified automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Keep appointment
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={cancel} disabled={pending}>
              {pending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
