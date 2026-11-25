"use client";

import { useState, useTransition } from "react";
import { FactoryIcon, MoreHorizontalIcon, PencilIcon, PowerIcon, PowerOffIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { WorkstationStatusBadge } from "@/components/production/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WorkstationStatus } from "@/lib/production/constants";
import { cn } from "@/lib/utils";
import { setWorkstationActive } from "./actions";
import { WorkstationDialog } from "./workstation-dialog";

export interface WorkstationRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: WorkstationStatus;
  hourlyCapacity: number | null;
  isActive: boolean;
  openOrders: number;
  routingSteps: number;
}

export function WorkstationsTable({ rows }: { rows: WorkstationRow[] }) {
  const [editing, setEditing] = useState<WorkstationRow | null>(null);
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) {
    return <EmptyState icon={FactoryIcon} title="No workstations yet" description="Add the machines and lines that work orders run on." />;
  }

  const toggle = (w: WorkstationRow) =>
    startTransition(async () => {
      const result = await setWorkstationActive(w.id, !w.isActive);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Workstation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right md:table-cell">Capacity</TableHead>
              <TableHead className="text-right">Open orders</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Routing steps</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((w) => (
              <TableRow key={w.id} className={cn("group hover:bg-accent/40 transition-colors", !w.isActive && "opacity-60")}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-9 items-center justify-center rounded-lg transition-colors">
                      <FactoryIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium">
                        {w.code}
                        {!w.isActive && (
                          <Badge variant="outline" className="text-muted-foreground ml-2 h-5 font-sans">
                            Inactive
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{w.name}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <WorkstationStatusBadge status={w.status} />
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                  {w.hourlyCapacity ? `${w.hourlyCapacity}/h` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{w.openOrders}</TableCell>
                <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">{w.routingSteps}</TableCell>
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Actions for ${w.code}`}
                        className="opacity-70 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setEditing(w)}>
                        <PencilIcon /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant={w.isActive ? "destructive" : "default"} onSelect={() => toggle(w)}>
                        {w.isActive ? <PowerOffIcon /> : <PowerIcon />}
                        {w.isActive ? "Deactivate" : "Reactivate"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <WorkstationDialog key={editing.id} workstation={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
