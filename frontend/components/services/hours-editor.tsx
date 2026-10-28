"use client";

import { useState, useTransition } from "react";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveHours } from "@/app/(app)/services/actions";
import type { HourInterval } from "@/lib/business-types";
import {
  DAY_NAMES,
  MAX_INTERVALS_PER_DAY,
  WEEK_ORDER,
  fromWeek,
  toWeek,
  validateDay,
  type Period,
  type Week,
} from "@/lib/hours";

function nextPeriod(existing: Period[]): Period {
  if (existing.length === 0) return { open: "09:00", close: "17:00" };
  const last = existing[existing.length - 1];
  const [h, m] = (last.close || "17:00").split(":").map(Number);
  const start = Math.min(h * 60 + m, 22 * 60 + 59);
  const end = Math.min(start + 60, 23 * 60 + 59);
  const fmt = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  return { open: fmt(start), close: fmt(end) };
}

export function HoursEditor({
  initialHours,
  timezone,
}: {
  initialHours: HourInterval[];
  timezone: string;
}) {
  const [week, setWeek] = useState<Week>(() => toWeek(initialHours));
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const errors = Object.fromEntries(
    WEEK_ORDER.map((d) => [d, validateDay(d, week[d])]),
  ) as Record<number, string | null>;
  const hasErrors = Object.values(errors).some(Boolean);
  const dirty =
    JSON.stringify(fromWeek(week)) !==
    JSON.stringify(fromWeek(toWeek(initialHours)));

  function updateDay(day: number, periods: Period[]) {
    setServerError(null);
    setWeek((w) => ({ ...w, [day]: periods }));
  }

  function copyToAll(day: number) {
    setServerError(null);
    setWeek((w) => {
      const next = { ...w };
      for (const d of WEEK_ORDER) next[d] = week[day].map((p) => ({ ...p }));
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveHours(fromWeek(week));
      if (result.ok) {
        toast.success("Opening hours saved");
        setServerError(null);
      } else {
        setServerError(result.error);
      }
    });
  }

  return (
    <>
      <Card>
        <CardContent>
          <ul className="divide-y">
            {WEEK_ORDER.map((day) => {
              const periods = week[day];
              return (
                <li
                  key={day}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start"
                >
                  <p className="w-28 shrink-0 pt-1.5 text-sm font-medium">
                    {DAY_NAMES[day]}
                  </p>

                  <div className="flex flex-1 flex-col gap-2">
                    {periods.length === 0 && (
                      <p className="pt-1.5 text-sm text-muted-foreground">
                        Closed
                      </p>
                    )}
                    {periods.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-28">
                          <Input
                            type="time"
                            aria-label={`${DAY_NAMES[day]} opens`}
                            value={p.open}
                            aria-invalid={!!errors[day]}
                            onChange={(e) =>
                              updateDay(
                                day,
                                periods.map((x, j) =>
                                  j === i ? { ...x, open: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <span className="text-muted-foreground">–</span>
                        <div className="w-28">
                          <Input
                            type="time"
                            aria-label={`${DAY_NAMES[day]} closes`}
                            value={p.close}
                            aria-invalid={!!errors[day]}
                            onChange={(e) =>
                              updateDay(
                                day,
                                periods.map((x, j) =>
                                  j === i ? { ...x, close: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${DAY_NAMES[day]} period ${i + 1}`}
                          onClick={() =>
                            updateDay(
                              day,
                              periods.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <X aria-hidden />
                        </Button>
                      </div>
                    ))}
                    {errors[day] && (
                      <p role="alert" className="text-sm text-destructive">
                        {errors[day]}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={periods.length >= MAX_INTERVALS_PER_DAY}
                      onClick={() =>
                        updateDay(day, [...periods, nextPeriod(periods)])
                      }
                    >
                      <Plus aria-hidden />
                      {periods.length === 0 ? "Add hours" : "Add period"}
                    </Button>
                    {periods.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToAll(day)}
                      >
                        <Copy aria-hidden /> Copy to all days
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!dirty || hasErrors || pending}>
          {pending ? "Saving…" : "Save hours"}
        </Button>
        <Button
          variant="outline"
          disabled={!dirty || pending}
          onClick={() => {
            setServerError(null);
            setWeek(toWeek(initialHours));
          }}
        >
          Discard changes
        </Button>
        {dirty && !pending && (
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
        )}
        {serverError && (
          <span role="alert" className="text-sm text-destructive">
            {serverError}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Times are in {timezone.replaceAll("_", " ")}. Opening periods can’t
        cross midnight.
      </p>
    </>
  );
}
