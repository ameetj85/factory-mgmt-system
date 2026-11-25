import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Newer/older pagination driven by a `page` search param. */
export function Pager({
  page,
  hasNext,
  total,
  noun,
  hrefFor,
}: {
  page: number;
  hasNext: boolean;
  total: number;
  noun: [singular: string, plural: string];
  hrefFor: (page: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-muted-foreground text-sm">
        {total.toLocaleString()} {total === 1 ? noun[0] : noun[1]} · page {page}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)}>
              <ChevronLeftIcon /> Newer
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeftIcon /> Newer
          </Button>
        )}
        {hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)}>
              Older <ChevronRightIcon />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Older <ChevronRightIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
