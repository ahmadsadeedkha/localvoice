import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/lib/business-types";

const styles: Record<BookingStatus, string> = {
  confirmed: "bg-success-soft text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive-soft text-destructive",
  no_show: "bg-warning-soft text-warning",
};

const labels: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", styles[status])}
    >
      {labels[status]}
    </Badge>
  );
}
