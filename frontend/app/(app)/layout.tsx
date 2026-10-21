import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

async function AuthGate({ children }: { children: React.ReactNode }) {
  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  if (!orgId) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Skeleton className="h-8 w-48" />
        </div>
      }
    >
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
