import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApi } from "@/lib/api";
import {
  formatDateTime,
  formatMargin,
  type PricingMarginChange,
  type PricingSettings,
} from "@/lib/billing";

const MAX_MARGIN = 100; // keep in sync with the backend limit

export function PricingPage() {
  const api = useApi();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api<PricingSettings>("/admin/pricing"),
  });

  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const parsed = value.trim() === "" ? NaN : Number(value);
  const validAmount =
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_MARGIN &&
    Math.abs(parsed * 10000 - Math.round(parsed * 10000)) < 1e-6; // max 4 decimals
  const unchanged = data !== undefined && parsed === data.marginPerMinute;

  const save = useMutation({
    mutationFn: () =>
      api<PricingMarginChange>("/admin/pricing/margin", {
        method: "PUT",
        body: JSON.stringify({
          marginPerMinute: parsed,
          note: note.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing"] });
      toast.success("Margin updated");
      setConfirmOpen(false);
      setValue("");
      setNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  const columns: Column<PricingMarginChange>[] = [
    {
      key: "when",
      header: "When",
      cell: (r) => formatDateTime(r.createdAt),
    },
    {
      key: "margin",
      header: "Margin per minute",
      className: "tabular-nums",
      cell: (r) => formatMargin(r.marginPerMinute),
    },
    {
      key: "by",
      header: "Changed by",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.changedBy}
        </span>
      ),
    },
    {
      key: "note",
      header: "Note",
      cell: (r) => r.note ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Each call is billed at Retell's cost for that call plus your margin per minute. 1 credit = $1."
      />

      {error ? (
        <EmptyState
          icon={DollarSign}
          title="Could not load pricing"
          description={error.message}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Margin per minute</CardTitle>
              <CardDescription>
                Added on top of the provider cost for every call minute, for all
                businesses. Changes apply to calls that finish after you save.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div>
                <p className="text-sm text-muted-foreground">Current margin</p>
                {isLoading || !data ? (
                  <Skeleton className="mt-1 h-8 w-32" />
                ) : (
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatMargin(data.marginPerMinute)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / min{data.isDefault ? " (default, never changed)" : ""}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid max-w-md gap-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">
                    New margin per minute (USD)
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_MARGIN}
                    step={0.01}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0.10"
                  />
                  {value !== "" && !validAmount && (
                    <span className="text-xs text-destructive">
                      Enter an amount from 0 to {MAX_MARGIN}, with up to 4
                      decimals.
                    </span>
                  )}
                  {validAmount && (
                    <span className="text-xs text-muted-foreground">
                      Example: a 3-minute call adds {formatMargin(parsed * 3)}{" "}
                      on top of the provider cost.
                    </span>
                  )}
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Note (optional)</span>
                  <Input
                    value={note}
                    maxLength={200}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why are you changing it?"
                  />
                </label>
                <div>
                  <Button
                    disabled={!validAmount || unchanged}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Save margin
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Change history</h2>
            <DataTable
              columns={columns}
              rows={data?.history ?? []}
              getRowId={(r) => r.id}
              loading={isLoading}
              empty={
                <EmptyState
                  icon={DollarSign}
                  title="No changes yet"
                  description="The margin has never been changed, so the default is in use."
                />
              }
            />
          </section>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change the margin for all businesses?</DialogTitle>
            <DialogDescription>
              {validAmount
                ? `Calls that finish from now on will add ${formatMargin(parsed)} per minute on top of the provider cost. Calls already charged are not changed.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !validAmount}
            >
              {save.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
