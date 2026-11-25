"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, EyeIcon, MoreHorizontalIcon, PackageIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ItemTypeBadge } from "@/components/inventory/badges";
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
import type { ItemType } from "@/lib/inventory/constants";
import { formatCents, formatQty } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { setItemActive } from "./actions";
import { ItemDialog } from "./item-dialog";

export interface ItemRow {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  type: ItemType;
  uom: string;
  reorderPointMilli: number;
  standardCostCents: number | null;
  isActive: boolean;
  hasTransactions: boolean;
}

export function ItemsTable({ items, canManage, filtered }: { items: ItemRow[]; canManage: boolean; filtered: boolean }) {
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleActive = (item: ItemRow) =>
    startTransition(async () => {
      const result = await setItemActive(item.id, !item.isActive);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageIcon}
        title={filtered ? "No items match these filters" : "The item master is empty"}
        description={filtered ? "Try a different search or clear the filters." : "Create your first item to start tracking stock."}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Unit</TableHead>
              <TableHead className="hidden text-right md:table-cell">Reorder point</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Std. cost</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className={cn("group hover:bg-accent/40 transition-colors", !item.isActive && "opacity-60")}>
                <TableCell className="pl-4">
                  <Link href={`/inventory/items/${item.id}`} className="block">
                    <span className="group-hover:text-primary font-mono text-sm font-medium transition-colors">{item.sku}</span>
                    {!item.isActive && (
                      <Badge variant="outline" className="text-muted-foreground ml-2 h-5">
                        Archived
                      </Badge>
                    )}
                    <span className="text-muted-foreground block max-w-md truncate text-xs">{item.name}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <ItemTypeBadge type={item.type} />
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">{item.uom}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {item.reorderPointMilli > 0 ? formatQty(item.reorderPointMilli, item.uom) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">
                  {formatCents(item.standardCostCents)}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Actions for ${item.sku}`}
                        className="opacity-70 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link href={`/inventory/items/${item.id}`}>
                          <EyeIcon /> View stock &amp; history
                        </Link>
                      </DropdownMenuItem>
                      {canManage && (
                        <>
                          <DropdownMenuItem onSelect={() => setEditing(item)}>
                            <PencilIcon /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant={item.isActive ? "destructive" : "default"}
                            onSelect={() => toggleActive(item)}
                          >
                            {item.isActive ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                            {item.isActive ? "Archive" : "Restore"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <ItemDialog key={editing.id} item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
