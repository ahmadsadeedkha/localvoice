import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pages,
  total,
  noun,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  noun: string;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pages} · {total} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)}>Next</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
