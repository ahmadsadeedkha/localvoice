"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateMessageStatus } from "@/app/(app)/messages/actions";
import type { MessageStatus } from "@/lib/message-types";

export function MessageActions({
  id,
  status,
}: {
  id: string;
  status: MessageStatus;
}) {
  const [pending, startTransition] = useTransition();

  function change(next: MessageStatus, success: string) {
    startTransition(async () => {
      const result = await updateMessageStatus(id, next);
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });
  }

  if (status === "handled") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => change("read", "Message reopened")}
      >
        Reopen
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      {status === "new" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => change("read", "Marked as read")}
        >
          Mark read
        </Button>
      )}
      <Button
        size="sm"
        disabled={pending}
        onClick={() => change("handled", "Marked as handled")}
      >
        Mark handled
      </Button>
    </div>
  );
}
