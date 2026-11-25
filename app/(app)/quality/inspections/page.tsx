import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardPenIcon, ListChecksIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Pager } from "@/components/pager";
import { ResultBadge } from "@/components/quality/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, type SqlValue } from "@/lib/db/client";
import { STAGE_LABELS, type Stage } from "@/lib/quality/constants";
import { cn } from "@/lib/utils";
import { InspectionFilters } from "./inspection-filters";

export const metadata: Metadata = { title: "Inspections" };

const PAGE_SIZE = 50;

export default function InspectionsPage(props: PageProps<"/quality/inspections">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InspectionsContent {...props} />
    </Suspense>
  );
}

async function InspectionsContent({ searchParams }: PageProps<"/quality/inspections">) {
  const user = await requirePermission("quality.view");
  const params = await searchParams;
  const result = params.result === "PASS" || params.result === "FAIL" ? params.result : undefined;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = typeof params.page === "string" && /^\d+$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;

  const where: string[] = [];
  const args: SqlValue[] = [];
  if (result) {
    where.push("x.result = ?");
    args.push(result);
  }
  if (q) {
    where.push("(x.batch_number LIKE ? OR i.sku LIKE ? OR x.inspection_number LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows, total] = await Promise.all([
    db.all<{
      id: number;
      inspection_number: string;
      template_name: string;
      stage: Stage;
      sku: string;
      item_id: number;
      batch_number: string;
      result: "PASS" | "FAIL";
      created_at: string;
      inspector: string;
      failed: number;
    }>(
      `SELECT x.id, x.inspection_number, x.template_name, x.stage, i.sku, x.item_id, x.batch_number, x.result, x.created_at, u.full_name AS inspector,
              (SELECT COUNT(*) FROM inspection_results r WHERE r.inspection_id = x.id AND r.passed = 0) AS failed
         FROM inspections x JOIN items i ON i.id = x.item_id JOIN users u ON u.id = x.inspector_id
        ${whereSql}
        ORDER BY x.id DESC LIMIT ? OFFSET ?`,
      [...args, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
    ),
    db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM inspections x JOIN items i ON i.id = x.item_id ${whereSql}`, args),
  ]);

  const hrefFor = (p: number) => {
    const s = new URLSearchParams();
    if (result) s.set("result", result);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    return s.size ? `?${s}` : "?";
  };

  return (
    <>
      <PageHeader title="Inspections" description="Every recorded inspection. Records are permanent and keep the checks as they were at the time.">
        {can(user.role, "quality.inspect") && (
          <Button asChild className="shadow-md shadow-primary/25">
            <Link href="/quality/inspect">
              <ClipboardPenIcon /> Record inspection
            </Link>
          </Button>
        )}
      </PageHeader>
      <Card>
        <CardContent className="space-y-4">
          <InspectionFilters result={result} q={q} />
          {rows.length === 0 ? (
            <EmptyState icon={ListChecksIcon} title="No inspections" description="Nothing matches these filters yet." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Inspection</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead className="hidden md:table-cell">Checklist</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="hidden pr-4 lg:table-cell">Inspector</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, PAGE_SIZE).map((r) => (
                    <TableRow key={r.id} className={cn("group hover:bg-accent/40 transition-colors", r.result === "FAIL" && "bg-destructive/[0.03]")}>
                      <TableCell className="pl-4">
                        <Link href={`/quality/inspections/${r.id}`} className="block">
                          <span className="group-hover:text-primary font-mono text-sm font-medium transition-colors">{r.inspection_number}</span>
                          <span className="text-muted-foreground block text-xs">
                            <LocalTime iso={r.created_at} />
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/quality/trace?item=${r.item_id}&lot=${encodeURIComponent(r.batch_number)}`} className="hover:text-primary font-mono text-sm transition-colors">
                          {r.batch_number}
                        </Link>
                        <span className="text-muted-foreground block text-xs">{r.sku}</span>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        {r.template_name}
                        <Badge variant="secondary" className="ml-2 h-5">
                          {STAGE_LABELS[r.stage]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ResultBadge result={r.result} />
                        {r.failed > 0 && <span className="text-destructive ml-2 text-xs">{r.failed} failed</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden pr-4 text-sm lg:table-cell">{r.inspector}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={page} hasNext={rows.length > PAGE_SIZE} total={total?.n ?? 0} noun={["inspection", "inspections"]} hrefFor={hrefFor} />
        </CardContent>
      </Card>
    </>
  );
}
