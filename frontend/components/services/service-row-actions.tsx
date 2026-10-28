"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateService } from "@/app/(app)/services/actions";
import { ServiceDialog } from "@/components/services/service-dialog";
import type { Service } from "@/lib/business-types";

export function ServiceRowActions({ service }: { service: Service }) {
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const result = await updateService(service.id, {
        active: !service.active,
      });
      if (result.ok) {
        toast.success(
          service.active ? "Service deactivated" : "Service activated",
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <ServiceDialog
        service={service}
        trigger={
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={toggleActive}
      >
        {service.active ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
