import { Suspense } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MessageActions } from "@/components/messages/message-actions";
import { Pagination } from "@/components/pagination";
import { PhoneNumber } from "@/components/phone-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { MessagesResponse } from "@/lib/message-types";

const PAGE_SIZE = 20;

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

async function MessagesData({
  searchParams,
}: Pick<PageProps<"/messages">, "searchParams">) {
  const sp = await searchParams;
  const view = first(sp.view) === "handled" ? "handled" : "open";
  const page = Math.max(Number(first(sp.page)) || 1, 1);

  const data = await apiFetch<MessagesResponse>(
    `/messages?view=${view}&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
  );
  const pages = Math.max(Math.ceil(data.total / PAGE_SIZE), 1);

  return (
    <>
      <div className="mb-4 flex gap-2">
        <Button
          asChild
          size="sm"
          variant={view === "open" ? "default" : "outline"}
        >
          <Link href="/messages">
            Open ({data.counts.open})
            {data.counts.new > 0 && ` · ${data.counts.new} new`}
          </Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant={view === "handled" ? "default" : "outline"}
        >
          <Link href="/messages?view=handled">
            Handled ({data.counts.handled})
          </Link>
        </Button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={view === "open" ? "All caught up" : "Nothing handled yet"}
          description={
            view === "open"
              ? "Messages and callback requests from callers will appear here."
              : "Messages you mark as handled will appear here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((m) => (
            <li key={m.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {m.kind === "transfer_request" ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-warning-soft text-warning"
                      >
                        Wants a person
                      </Badge>
                    ) : (
                      <Badge variant="outline">Message</Badge>
                    )}
                    {m.status === "new" && (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-info-soft text-info"
                      >
                        New
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(m.createdAt, data.timezone)}
                    </span>
                  </div>

                  <p className="mt-2 font-medium">
                    {m.callerName ?? (
                      <span className="text-muted-foreground">
                        Unknown caller
                      </span>
                    )}
                    {m.callerPhone && (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        <Link
                          href={`/customers/${encodeURIComponent(m.callerPhone)}`}
                          className="underline-offset-4 hover:underline"
                        >
                          <PhoneNumber value={m.callerPhone} />
                        </Link>
                      </>
                    )}
                  </p>
                </div>

                <MessageActions id={m.id} status={m.status} />
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm">{m.body}</p>

              {m.callId && (
                <Link
                  href={`/calls/${m.callId}`}
                  className="mt-3 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  View call
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pages={pages}
        total={data.total}
        noun="messages"
        hrefFor={(p) => `/messages?view=${view}&page=${p}`}
      />
    </>
  );
}

export default function MessagesPage({ searchParams }: PageProps<"/messages">) {
  return (
    <>
      <PageHeader
        title="Messages"
        description="Messages and callback requests left by callers."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <MessagesData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
