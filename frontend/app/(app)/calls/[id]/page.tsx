import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PhoneNumber } from "@/components/phone-number";
import { StatusBadge } from "@/components/status-badge";
import { Transcript } from "@/components/transcript";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import {
  formatDateTime,
  formatDateTimeLong,
  formatDuration,
} from "@/lib/format";
import type { CallDetailResponse } from "@/lib/types";

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 text-base font-medium">{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function CallData({ params }: Pick<PageProps<"/calls/[id]">, "params">) {
  const { id } = await params;

  let data: CallDetailResponse;
  try {
    data = await apiFetch<CallDetailResponse>(`/calls/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
      notFound();
    }
    throw e;
  }
  const { call, timezone } = data;

  return (
    <>
      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Caller">
            {call.fromNumber ? (
              <Link
                href={`/customers/${encodeURIComponent(call.fromNumber)}`}
                className="underline-offset-4 hover:underline"
              >
                <PhoneNumber value={call.fromNumber} />
              </Link>
            ) : call.source === "web_test" ? (
              "Web test call"
            ) : (
              "Unknown"
            )}
          </Fact>
          <Fact label="Outcome">
            <StatusBadge outcome={call.outcome} />
          </Fact>
          <Fact label="Started">
            {formatDateTimeLong(call.startedAt, timezone)}
          </Fact>
          <Fact label="Duration">
            {call.status === "in_progress"
              ? "In progress"
              : formatDuration(call.durationMs)}
          </Fact>
          <Fact label="Caller sentiment">
            {call.sentiment ? (
              <Badge variant="outline">{call.sentiment}</Badge>
            ) : (
              "—"
            )}
          </Fact>
          <Fact label="Agent goal met">
            {call.callSuccessful == null
              ? "—"
              : call.callSuccessful
                ? "Yes"
                : "No"}
          </Fact>
          <Fact label="Ended because">
            {call.disconnectionReason?.replaceAll("_", " ") ?? "—"}
          </Fact>
        </CardContent>
      </Card>

      {call.summary && (
        <Section title="Summary">
          <p className="max-w-3xl text-sm leading-relaxed">{call.summary}</p>
        </Section>
      )}

      {call.bookings.length > 0 && (
        <Section title="Appointments from this call">
          <ul className="flex flex-col gap-2">
            {call.bookings.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{b.serviceName}</p>
                  <p className="text-muted-foreground">
                    {formatDateTimeLong(b.startsAt, timezone)}
                    {b.customerName ? ` · ${b.customerName}` : ""}
                  </p>
                </div>
                <Badge variant="outline">{b.status}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {call.messages.length > 0 && (
        <Section title="Messages left">
          <ul className="flex flex-col gap-2">
            {call.messages.map((m) => (
              <li key={m.id} className="rounded-xl border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">
                    {m.kind === "transfer_request"
                      ? "Transfer request"
                      : "Message"}
                  </Badge>
                  {m.callerName && <span>{m.callerName}</span>}
                  {m.callerPhone && <PhoneNumber value={m.callerPhone} />}
                  <span>· {formatDateTime(m.createdAt, timezone)}</span>
                </div>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Transcript">
        {call.transcript ? (
          <Transcript text={call.transcript} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {call.status === "in_progress"
              ? "The transcript appears once the call ends."
              : "No transcript was recorded for this call."}
          </p>
        )}
      </Section>
    </>
  );
}

export default function CallPage({ params }: PageProps<"/calls/[id]">) {
  return (
    <>
      <PageHeader
        title="Call details"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/calls">
              <ArrowLeft aria-hidden /> All calls
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CallData params={params} />
      </Suspense>
    </>
  );
}
