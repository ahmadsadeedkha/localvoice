import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";

type Me = {
  userId: string;
  role: string | null;
  isPlatformAdmin: boolean;
  tenant: { id: string; name: string; slug: string; status: string } | null;
};

async function MeData() {
  const me = await apiFetch<Me>("/me");
  return (
    <pre className="overflow-x-auto rounded-xl border bg-card p-4 text-sm">
      {JSON.stringify(me, null, 2)}
    </pre>
  );
}

export default function SessionPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <PageHeader
        title="Session check"
        description="Temporary page: what the API sees."
      />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <MeData />
      </Suspense>
    </>
  );
}
