import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardListIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { STAGE_LABELS, type Stage } from "@/lib/quality/constants";
import { cn } from "@/lib/utils";
import { ChecklistActiveToggle } from "./checklist-active-toggle";

export const metadata: Metadata = { title: "Inspection checklists" };

export default function ChecklistsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChecklistsContent />
    </Suspense>
  );
}

async function ChecklistsContent() {
  await requirePermission("quality.manage");
  const rows = await db.all<{
    id: number;
    name: string;
    description: string | null;
    stage: Stage;
    sku: string | null;
    is_active: number;
    criteria: number;
    critical: number;
    used: number;
  }>(
    `SELECT t.id, t.name, t.description, t.stage, i.sku, t.is_active,
            (SELECT COUNT(*) FROM inspection_criteria c WHERE c.template_id = t.id) AS criteria,
            (SELECT COUNT(*) FROM inspection_criteria c WHERE c.template_id = t.id AND c.is_critical = 1) AS critical,
            (SELECT COUNT(*) FROM inspections x WHERE x.template_id = t.id) AS used
       FROM inspection_templates t LEFT JOIN items i ON i.id = t.item_id
      ORDER BY t.is_active DESC, t.stage, t.name COLLATE NOCASE`,
  );

  return (
    <>
      <PageHeader title="Inspection checklists" description="Pass/fail checks and tolerance measurements for receiving, in-process and final inspection.">
        <Button asChild className="shadow-md shadow-primary/25">
          <Link href="/quality/checklists/new">
            <PlusIcon /> New checklist
          </Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardListIcon} title="No checklists yet" description="Create one for incoming material, in-process checks or final inspection." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Checklist</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="hidden md:table-cell">Applies to</TableHead>
                    <TableHead className="text-right">Checks</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Used</TableHead>
                    <TableHead className="w-12 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={cn("group hover:bg-accent/40 transition-colors", !r.is_active && "opacity-60")}>
                      <TableCell className="pl-4">
                        <Link href={`/quality/checklists/${r.id}`} className="block">
                          <span className="group-hover:text-primary font-medium transition-colors">{r.name}</span>
                          {!r.is_active && (
                            <Badge variant="outline" className="text-muted-foreground ml-2 h-5">
                              Inactive
                            </Badge>
                          )}
                          {r.description && <span className="text-muted-foreground block max-w-md truncate text-xs">{r.description}</span>}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{STAGE_LABELS[r.stage]}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{r.sku ? <span className="font-mono">{r.sku}</span> : <span className="text-muted-foreground">Any item</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.criteria}
                        {r.critical > 0 && <span className="text-destructive ml-1 text-xs">({r.critical} critical)</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{r.used}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <ChecklistActiveToggle id={r.id} active={r.is_active === 1} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
