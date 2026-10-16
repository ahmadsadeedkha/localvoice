import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, type CallOutcome } from "@/components/status-badge";
import { ThemeToggle } from "@/components/theme-toggle";

const outcomes: CallOutcome[] = [
  "booked",
  "transferred",
  "voicemail",
  "abandoned",
  "info",
];

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Design system</h1>
        <ThemeToggle />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Form fields</h2>
        <div className="grid max-w-sm gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Business name</Label>
            <Input id="name" placeholder="Acme Plumbing" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" aria-invalid defaultValue="12345" />
            <p className="text-sm text-destructive">
              Enter a valid phone number.
            </p>
          </div>
          <Input disabled placeholder="Disabled" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Status badges</h2>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((o) => (
            <StatusBadge key={o} outcome={o} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Card with a table</h2>
        <Card>
          <CardHeader>
            <CardTitle>Recent calls</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono">+92 300 1234567</TableCell>
                  <TableCell>
                    <StatusBadge outcome="booked" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    2:14
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">+92 321 7654321</TableCell>
                  <TableCell>
                    <StatusBadge outcome="voicemail" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    0:48
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Loading state</h2>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    </main>
  );
}
