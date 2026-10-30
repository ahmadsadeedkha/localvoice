import { Suspense } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarPicker } from "@/components/integrations/calendar-picker";
import { ConnectGoogleButton } from "@/components/integrations/connect-google-button";
import { DisconnectGoogleButton } from "@/components/integrations/disconnect-google-button";
import { GoogleCallbackToast } from "@/components/integrations/google-callback-toast";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  GoogleCalendarOption,
  GoogleStatus,
} from "@/lib/integration-types";

function StatusBadge({ status }: { status: GoogleStatus }) {
  if (status.needsReconnect) {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-warning-soft text-warning"
      >
        Needs reconnect
      </Badge>
    );
  }
  if (status.connected && status.calendarId) {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-success-soft text-success"
      >
        Connected
      </Badge>
    );
  }
  if (status.connected) {
    return (
      <Badge
        variant="outline"
        className="border-transparent bg-warning-soft text-warning"
      >
        Choose a calendar
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-muted text-muted-foreground"
    >
      Not connected
    </Badge>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "success";
  children: React.ReactNode;
}) {
  const Icon = tone === "warning" ? AlertTriangle : CheckCircle2;
  const cls =
    tone === "warning"
      ? "bg-warning-soft text-warning"
      : "bg-success-soft text-success";
  return (
    <div className={`flex gap-2 rounded-lg px-3 py-2.5 text-sm ${cls}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

async function loadCalendars(): Promise<{
  calendars: GoogleCalendarOption[];
  reconnect: boolean;
}> {
  try {
    const calendars = await apiFetch<GoogleCalendarOption[]>(
      "/integrations/google/calendars",
    );
    return { calendars, reconnect: false };
  } catch (e) {
    // 409 = Google access died since the status was read.
    if (e instanceof ApiError && e.status === 409)
      return { calendars: [], reconnect: true };
    throw e;
  }
}

async function GoogleCalendarCard() {
  const status = await apiFetch<GoogleStatus>("/integrations/google");
  const { calendars, reconnect } =
    status.connected && status.canEdit
      ? await loadCalendars()
      : { calendars: [], reconnect: false };
  const needsReconnect = status.needsReconnect || reconnect;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <CalendarDays
              className="size-5 text-muted-foreground"
              aria-hidden
            />
          </div>
          <div>
            <CardTitle>Google Calendar</CardTitle>
            <CardDescription>
              Your agent books only into free time, and every booking appears in
              your calendar.
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <StatusBadge status={{ ...status, needsReconnect }} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {!status.configured ? (
          <p className="text-sm text-muted-foreground">
            Google Calendar isn&apos;t available yet. Contact support to enable
            it.
          </p>
        ) : needsReconnect ? (
          <>
            <Notice tone="warning">
              Google access for <strong>{status.googleEmail}</strong> expired or
              was removed. Until you reconnect, your agent can&apos;t check
              availability and will take messages instead of booking.
            </Notice>
            {status.canEdit && (
              <ConnectGoogleButton label="Reconnect Google Calendar" />
            )}
          </>
        ) : !status.connected ? (
          <>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Busy times in your calendar are never offered to callers.</li>
              <li>
                Each booking is added as an event with the caller&apos;s name
                and number.
              </li>
              <li>You can disconnect at any time.</li>
            </ul>
            {status.canEdit ? (
              <ConnectGoogleButton />
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask an owner or admin to connect Google Calendar.
              </p>
            )}
          </>
        ) : (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Google account</dt>
                <dd className="font-medium">{status.googleEmail}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Bookings calendar</dt>
                <dd className="font-medium">
                  {status.calendarName ?? "Not chosen yet"}
                </dd>
              </div>
            </dl>

            {!status.calendarId && (
              <Notice tone="warning">
                Choose a calendar to finish setup. Until then, your agent uses
                your opening hours only and bookings aren&apos;t added to
                Google.
              </Notice>
            )}

            {status.canEdit ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CalendarPicker
                  calendars={calendars}
                  currentId={status.calendarId}
                />
                <DisconnectGoogleButton />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only owners and admins can change this.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect your calendar and tools."
      />
      <Suspense>
        <GoogleCallbackToast />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
        <GoogleCalendarCard />
      </Suspense>
    </>
  );
}
