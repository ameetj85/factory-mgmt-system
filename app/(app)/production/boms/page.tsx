import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NetworkIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ItemTypeBadge } from "@/components/inventory/badges";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import type { ItemType } from "@/lib/inventory/constants";

export const metadata: Metadata = { title: "Bills of materials" };

export default function BomsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BomsPageContent />
    </Suspense>
  );
}

async function BomsPageContent() {
  await requirePermission("bom.manage");
  const rows = await db.all<{
    id: number;
    sku: string;
    name: string;
    type: ItemType;
    version: number;
    is_active: number;
    line_count: number;
    step_count: number;
    wo_count: number;
    updated_at: string;
    other_versions: number;
  }>(
    `SELECT h.id, i.sku, i.name, i.type, h.version, h.is_active, h.updated_at,
            (SELECT COUNT(*) FROM bom_lines l WHERE l.bom_id = h.id) AS line_count,
            (SELECT COUNT(*) FROM bom_routing_steps r WHERE r.bom_id = h.id) AS step_count,
            (SELECT COUNT(*) FROM work_orders w WHERE w.bom_id = h.id) AS wo_count,
            (SELECT COUNT(*) FROM bom_headers x WHERE x.item_id = h.item_id) - 1 AS other_versions
       FROM bom_headers h JOIN items i ON i.id = h.item_id
      ORDER BY i.sku COLLATE NOCASE, h.is_active DESC, h.version DESC`,
  );

  return (
    <>
      <PageHeader title="Bills of materials" description="Recipes for sub-assemblies and finished goods: components, scrap allowances and routing.">
        <Button asChild className="shadow-md shadow-primary/25">
          <Link href="/production/boms/new">
            <PlusIcon /> New BOM
          </Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState icon={NetworkIcon} title="No bills of materials yet" description="Define what goes into each finished good or sub-assembly." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Makes</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Components</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Steps</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Work orders</TableHead>
                    <TableHead className="hidden pr-4 lg:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={r.is_active ? "group hover:bg-accent/40 transition-colors" : "group hover:bg-accent/40 opacity-70 transition-colors"}>
                      <TableCell className="pl-4">
                        <Link href={`/production/boms/${r.id}`} className="flex items-center gap-3">
                          <div>
                            <span className="group-hover:text-primary font-mono text-sm font-medium transition-colors">{r.sku}</span>
                            <span className="text-muted-foreground block max-w-sm truncate text-xs">{r.name}</span>
                          </div>
                          <span className="hidden xl:inline">
                            <ItemTypeBadge type={r.type} />
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">v{r.version}</span>
                          {r.is_active ? (
                            <Badge className="h-5">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground h-5">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{r.line_count}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{r.step_count}</TableCell>
                      <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{r.wo_count}</TableCell>
                      <TableCell className="text-muted-foreground hidden pr-4 text-sm lg:table-cell">
                        <LocalTime iso={r.updated_at} />
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
