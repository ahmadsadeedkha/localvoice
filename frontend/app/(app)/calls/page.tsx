import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CallsTable } from "@/components/calls-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { CallsPage } from "@/lib/types";

const PAGE_SIZE = 20;

async function CallsData({
  searchParams,
}: Pick<PageProps<"/calls">, "searchParams">) {
  const { page: raw } = await searchParams;
  const page = Math.max(Number(Array.isArray(raw) ? raw[0] : raw) || 1, 1);

  const data = await apiFetch<CallsPage>(
    `/calls?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`,
  );
  const pages = Math.max(Math.ceil(data.total / PAGE_SIZE), 1);

  return (
    <>
      <CallsTable calls={data.items} timezone={data.timezone} showSummary />

      {data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {pages} · {data.total} calls
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/calls?page=${page - 1}`}>Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            )}
            {page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/calls?page=${page + 1}`}>Next</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function CallsPage({ searchParams }: PageProps<"/calls">) {
  return (
    <>
      <PageHeader title="Calls" description="Every call your agent answered." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <CallsData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
