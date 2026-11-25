import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, CheckIcon, GitBranchIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { PageSkeleton } from "@/components/page-skeleton";
import { ResultBadge } from "@/components/quality/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { describeLimits, formatMeasure, STAGE_LABELS, type Stage } from "@/lib/quality/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inspection" };

export default function InspectionPage(props: PageProps<"/quality/inspections/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InspectionContent {...props} />
    </Suspense>
  );
}

async function InspectionContent({ params }: PageProps<"/quality/inspections/[id]">) {
  await requirePermission("quality.view");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const x = await db.get<{
    id: number;
    inspection_number: string;
    template_name: string;
    stage: Stage;
    item_id: number;
    sku: string;
    item_name: string;
    batch_number: string;
    work_order_id: number | null;
    wo_number: string | null;
    receipt_number: string | null;
    sample_size: number;
    result: "PASS" | "FAIL";
    notes: string | null;
    created_at: string;
    inspector: string;
  }>(
    `SELECT x.*, i.sku, i.name AS item_name, o.wo_number, r.receipt_number, u.full_name AS inspector
       FROM inspections x JOIN items i ON i.id = x.item_id JOIN users u ON u.id = x.inspector_id
       LEFT JOIN work_orders o ON o.id = x.work_order_id LEFT JOIN receipts r ON r.id = x.receipt_id
      WHERE x.id = ?`,
    [Number(id)],
  );
  if (!x) notFound();

  const [results, hold] = await Promise.all([
    db.all<{ id: number; label: string; criterion_type: string; unit: string | null; target_milli: number | null; min_milli: number | null; max_milli: number | null; is_critical: number; value_milli: number | null; passed: number; note: string | null }>(
      "SELECT * FROM inspection_results WHERE inspection_id = ? ORDER BY id",
      [x.id],
    ),
    db.get<{ id: number; status: string; reason: string }>("SELECT id, status, reason FROM lot_holds WHERE inspection_id = ?", [x.id]),
  ]);

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/quality/inspections">
            <ArrowLeftIcon /> Inspections
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{x.inspection_number}</h1>
              <ResultBadge result={x.result} />
              <Badge variant="secondary">{STAGE_LABELS[x.stage]}</Badge>
            </div>
            <p className="text-lg">
              Lot <span className="font-mono font-semibold">{x.batch_number}</span> · <span className="font-mono">{x.sku}</span> {x.item_name}
            </p>
            <p className="text-muted-foreground text-sm">
              {x.template_name} · sample of {x.sample_size} · by {x.inspector} on <LocalTime iso={x.created_at} />
              {x.wo_number && x.work_order_id && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/production/work-orders/${x.work_order_id}`} className="hover:text-primary font-mono transition-colors">
                    {x.wo_number}
                  </Link>
                </>
              )}
              {x.receipt_number && <> · receipt {x.receipt_number}</>}
            </p>
            {x.notes && <p className="text-muted-foreground max-w-2xl text-sm italic">{x.notes}</p>}
          </div>
          <Button asChild variant="outline">
            <Link href={`/quality/trace?item=${x.item_id}&lot=${encodeURIComponent(x.batch_number)}`}>
              <GitBranchIcon /> Trace this lot
            </Link>
          </Button>
        </div>
      </div>

      {hold && (
        <Link
          href="/quality/holds"
          className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 flex items-center gap-3 rounded-xl border p-4 transition-colors"
        >
          <ShieldAlertIcon className="size-5 shrink-0" />
          <span>
            This inspection {hold.status === "ACTIVE" ? "put the lot on quality hold" : `placed a hold that has since been ${hold.status.toLowerCase()}`}: {hold.reason}
          </span>
        </Link>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Limits shown as they were when the inspection was recorded.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Check</TableHead>
                  <TableHead>Limits</TableHead>
                  <TableHead className="text-right">Recorded</TableHead>
                  <TableHead className="pr-4 text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id} className={cn("hover:bg-accent/40 transition-colors", !r.passed && "bg-destructive/[0.04]")}>
                    <TableCell className="pl-4">
                      <p className="font-medium">
                        {r.label}
                        {r.is_critical === 1 && <span className="text-destructive ml-2 text-xs">critical</span>}
                      </p>
                      {r.note && <p className="text-muted-foreground text-xs italic">{r.note}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.criterion_type === "MEASUREMENT" ? describeLimits(r) : "Pass / fail"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.criterion_type === "MEASUREMENT" ? formatMeasure(r.value_milli, r.unit) : r.passed ? "Pass" : "Fail"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {r.passed ? <CheckIcon className="text-success ml-auto size-5" /> : <XIcon className="text-destructive ml-auto size-5" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
