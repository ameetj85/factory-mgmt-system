import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, CopyPlusIcon, CornerDownRightIcon, DollarSignIcon, LayersIcon, PencilIcon, RouteIcon, TimerIcon } from "lucide-react";
import { ItemTypeBadge } from "@/components/inventory/badges";
import { LocalTime } from "@/components/local-time";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { formatCycleTime, formatPercentBp } from "@/lib/production/constants";
import { explodeBom, getBom } from "@/lib/production/queries";
import { formatCents, formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { BomActiveToggle } from "./bom-active-toggle";

export const metadata: Metadata = { title: "Bill of materials" };

export default function BomDetailPage(props: PageProps<"/production/boms/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BomDetailContent {...props} />
    </Suspense>
  );
}

async function BomDetailContent({ params }: PageProps<"/production/boms/[id]">) {
  await requirePermission("bom.manage");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const bom = await getBom(Number(id));
  if (!bom) notFound();

  const [{ nodes, unitCostCents, missingCosts }, versions] = await Promise.all([
    explodeBom(bom),
    db.all<{ id: number; version: number; is_active: number }>("SELECT id, version, is_active FROM bom_headers WHERE item_id = ? ORDER BY version DESC", [bom.itemId]),
  ]);
  const totalCycleMs = bom.steps.reduce((sum, s) => sum + s.cycleMs, 0);
  const totalSetup = bom.steps.reduce((sum, s) => sum + s.setupMinutes, 0);
  const locked = bom.workOrderCount > 0;

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/production/boms">
            <ArrowLeftIcon /> Bills of materials
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{bom.sku}</h1>
              <Badge variant="secondary" className="font-mono">
                v{bom.version}
              </Badge>
              <ItemTypeBadge type={bom.type} />
              {bom.isActive ? <Badge>Active recipe</Badge> : <Badge variant="outline">Inactive</Badge>}
            </div>
            <p className="text-lg">{bom.name}</p>
            <p className="text-muted-foreground text-sm">
              Created <LocalTime iso={bom.createdAt} />
              {bom.createdBy && <> by {bom.createdBy}</>} · used by {bom.workOrderCount} work order{bom.workOrderCount === 1 ? "" : "s"}
            </p>
            {bom.notes && <p className="text-muted-foreground max-w-2xl text-sm italic">{bom.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <BomActiveToggle bomId={bom.id} active={bom.isActive} />
            <Button asChild variant="outline">
              <Link href={`/production/boms/new?from=${bom.id}`}>
                <CopyPlusIcon /> New version
              </Link>
            </Button>
            {!locked && (
              <Button asChild>
                <Link href={`/production/boms/${bom.id}/edit`}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Components" value={bom.lines.length} icon={LayersIcon} hint={`${nodes.length} rows across all levels`} />
        <StatCard
          label="Material cost per unit"
          value={unitCostCents == null ? "—" : formatCents(unitCostCents)}
          icon={DollarSignIcon}
          hint={missingCosts ? "Some materials have no standard cost" : "From standard costs"}
        />
        <StatCard label="Ideal cycle time" value={formatCycleTime(totalCycleMs)} icon={TimerIcon} hint="Sum of routing steps per unit" />
        <StatCard label="Setup time" value={`${totalSetup} min`} icon={RouteIcon} hint={`${bom.steps.length} operation${bom.steps.length === 1 ? "" : "s"}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Material structure</CardTitle>
          <CardDescription>
            Expanded through the active recipes of sub-assemblies. Quantities are for one {bom.uom} of {bom.sku}, including scrap allowances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Component</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Per parent</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Scrap</TableHead>
                  <TableHead className="text-right">Per {bom.uom}</TableHead>
                  <TableHead className="pr-4 text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((n) => (
                  <TableRow key={n.key} className={cn("hover:bg-accent/40 transition-colors", n.hasSubRecipe && "bg-primary/[0.03]")}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2" style={{ paddingLeft: `${n.depth * 1.25}rem` }}>
                        {n.depth > 0 && <CornerDownRightIcon className="text-muted-foreground size-3.5 shrink-0" />}
                        <div className="min-w-0">
                          <span className="font-mono text-sm font-medium">{n.sku}</span>
                          {n.hasSubRecipe && (
                            <Badge variant="secondary" className="ml-2 h-5">
                              sub-assembly
                            </Badge>
                          )}
                          <span className="text-muted-foreground block truncate text-xs">{n.name}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">{formatQty(n.qtyPerParentMilli, n.uom)}</TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">{n.scrapBp ? formatPercentBp(n.scrapBp) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatQty(n.extendedMilli, n.uom)}</TableCell>
                    <TableCell className="text-muted-foreground pr-4 text-right tabular-nums">
                      {n.hasSubRecipe ? <span className="text-xs">see below</span> : formatCents(n.costCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Routing</CardTitle>
            <CardDescription>Operations in sequence.</CardDescription>
          </CardHeader>
          <CardContent>
            {bom.steps.length === 0 ? (
              <p className="text-muted-foreground text-sm">No routing defined. Work orders will need a workstation picked manually.</p>
            ) : (
              <ol className="space-y-2">
                {bom.steps.map((s) => (
                  <li key={s.sequence} className="hover:border-primary/30 hover:bg-accent/30 flex items-center gap-4 rounded-xl border p-3 transition-colors">
                    <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums">
                      {s.sequence}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.operationName}</p>
                      <p className="text-muted-foreground text-xs">
                        <span className="font-mono">{s.workstationCode}</span> · {formatCycleTime(s.cycleMs)} per unit · {s.setupMinutes} min setup
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Versions</CardTitle>
            <CardDescription>Only one version can be active at a time.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/production/boms/${v.id}`}
                    className={cn(
                      "hover:bg-accent/60 flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                      v.id === bom.id && "bg-primary/10 text-primary font-medium",
                    )}
                  >
                    <span className="font-mono">v{v.version}</span>
                    {v.is_active ? <Badge className="h-5">Active</Badge> : <span className="text-muted-foreground text-xs">inactive</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
