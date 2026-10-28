"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createService, updateService } from "@/app/(app)/services/actions";
import type { Service } from "@/lib/business-types";

const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** Create when `service` is omitted, edit otherwise. */
export function ServiceDialog({
  service,
  trigger,
}: {
  service?: Service;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(service?.name ?? "");
      setDescription(service?.description ?? "");
      setDuration(String(service?.durationMinutes ?? 30));
      setError(null);
    }
    setOpen(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();

    const minutes = Number(duration);
    if (!name.trim()) return setError("Name is required");
    if (
      !Number.isInteger(minutes) ||
      minutes < 5 ||
      minutes > 480 ||
      minutes % 5 !== 0
    ) {
      return setError(
        "Duration must be between 5 and 480 minutes, in steps of 5",
      );
    }
    setError(null);

    startTransition(async () => {
      const input = {
        name: name.trim(),
        description,
        durationMinutes: minutes,
      };
      const result = service
        ? await updateService(service.id, input)
        : await createService(input);

      if (result.ok) {
        toast.success(service ? "Service updated" : "Service added");
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {service ? "Edit service" : "Add service"}
            </DialogTitle>
            <DialogDescription>
              Your AI receptionist offers active services by name when callers
              ask to book.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Haircut"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="service-duration">Duration (minutes)</Label>
            <Input
              id="service-duration"
              type="number"
              inputMode="numeric"
              min={5}
              max={480}
              step={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="service-description">Description (optional)</Label>
            <textarea
              id="service-description"
              className={textareaClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : service ? "Save changes" : "Add service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
