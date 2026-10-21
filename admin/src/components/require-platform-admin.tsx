import { Navigate, Outlet } from "react-router";
import { useUser } from "@clerk/react";
import { NotAuthorized } from "@/components/not-authorized";
import { Skeleton } from "@/components/ui/skeleton";

export function RequirePlatformAdmin() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  if (user.publicMetadata?.role !== "platform_admin") return <NotAuthorized />;
  return <Outlet />;
}
