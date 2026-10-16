import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const styles = {
  booked: "bg-success-soft text-success",
  transferred: "bg-info-soft text-info",
  voicemail: "bg-warning-soft text-warning",
  abandoned: "bg-destructive-soft text-destructive",
  info: "bg-muted text-muted-foreground",
} as const;

const labels = {
  booked: "Booked",
  transferred: "Transferred",
  voicemail: "Voicemail",
  abandoned: "Abandoned",
  info: "Info only",
} as const;

export type CallOutcome = keyof typeof styles;

export function StatusBadge({ outcome }: { outcome: CallOutcome }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", styles[outcome])}
    >
      {labels[outcome]}
    </Badge>
  );
}
