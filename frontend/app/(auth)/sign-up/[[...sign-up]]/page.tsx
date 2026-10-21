import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SignUpPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-96 max-w-full" />}>
      <SignUp />
    </Suspense>
  );
}
