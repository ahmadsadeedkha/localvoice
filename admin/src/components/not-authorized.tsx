import { useClerk } from "@clerk/react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export function NotAuthorized() {
  const { signOut } = useClerk();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <EmptyState
          icon={ShieldAlert}
          title="Not authorized"
          description="This console is for LocalVoice platform administrators."
          action={
            <Button variant="outline" onClick={() => signOut()}>
              Sign out
            </Button>
          }
        />
      </div>
    </main>
  );
}
