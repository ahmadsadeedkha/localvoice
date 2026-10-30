"use client";

import { useFormStatus } from "react-dom";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectGoogle } from "@/app/(app)/integrations/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <CalendarPlus aria-hidden />
      )}
      {pending ? "Opening Google…" : label}
    </Button>
  );
}

/** A form, so the server action can redirect the browser to Google. */
export function ConnectGoogleButton({
  label = "Connect Google Calendar",
}: {
  label?: string;
}) {
  return (
    <form action={connectGoogle}>
      <SubmitButton label={label} />
    </form>
  );
}
