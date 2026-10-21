import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OrganizationList } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Skeleton } from "@/components/ui/skeleton";

async function OnboardingGate() {
  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  if (orgId) redirect("/dashboard");

  return (
    <OrganizationList
      hidePersonal
      afterCreateOrganizationUrl="/dashboard"
      afterSelectOrganizationUrl="/dashboard"
    />
  );
}

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Set up your business</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your business or choose an existing one to continue.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-96 max-w-full" />}>
        <OnboardingGate />
      </Suspense>
    </main>
  );
}
