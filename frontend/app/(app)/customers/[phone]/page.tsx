import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { CallsTable } from "@/components/calls-table";
import { PageHeader } from "@/components/page-header";
import { PhoneNumber } from "@/components/phone-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { CustomerDetail } from "@/lib/customer-types";
import { formatDateTime, formatDateTimeLong } from "@/lib/format";

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

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function CustomerData({
  params,
}: Pick<PageProps<"/customers/[phone]">, "params">) {
  const phone = safeDecode((await params).phone);

  let c: CustomerDetail;
  try {
    c = await apiFetch<CustomerDetail>(
      `/customers/${encodeURIComponent(phone)}`,
    );
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
      notFound();
    }
    throw e;
  }

  return (
    <>
      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Phone">
            <PhoneNumber value={c.phone} />
          </Fact>
          <Fact label="Total calls">{c.callCount}</Fact>
          <Fact label="Appointments">{c.bookings.length}</Fact>
          <Fact label="Next appointment">
            {c.nextAppointmentAt
              ? formatDateTimeLong(c.nextAppointmentAt, c.timezone)
              : "—"}
          </Fact>
        </CardContent>
      </Card>

      {c.bookings.length > 0 && (
        <Section title="Appointments">
          <ul className="flex flex-col gap-2">
            {c.bookings.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{b.serviceName}</p>
                  <p className="text-muted-foreground">
                    {formatDateTimeLong(b.startsAt, c.timezone)} ·{" "}
                    {b.resourceName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {b.callId && (
                    <Link
                      href={`/calls/${b.callId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      View call
                    </Link>
                  )}
                  <BookingStatusBadge status={b.status} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.messages.length > 0 && (
        <Section title="Messages">
          <ul className="flex flex-col gap-2">
            {c.messages.map((m) => (
              <li key={m.id} className="rounded-xl border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">
                    {m.kind === "transfer_request"
                      ? "Transfer request"
                      : "Message"}
                  </Badge>
                  <span>{formatDateTime(m.createdAt, c.timezone)}</span>
                  {m.callId && (
                    <Link
                      href={`/calls/${m.callId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      View call
                    </Link>
                  )}
                </div>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.calls.length > 0 && (
        <Section title="Calls">
          <CallsTable calls={c.calls} timezone={c.timezone} showSummary />
          {c.callCount > c.calls.length && (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing the {c.calls.length} most recent of {c.callCount} calls.
            </p>
          )}
        </Section>
      )}
    </>
  );
}

export default function CustomerPage({
  params,
}: PageProps<"/customers/[phone]">) {
  return (
    <>
      <PageHeader
        title="Customer"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/customers">
              <ArrowLeft aria-hidden /> All customers
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CustomerData params={params} />
      </Suspense>
    </>
  );
}
