"use client";

import { useState, useTransition } from "react";
import { MapPinIcon, MapPinOffIcon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
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
import { cn } from "@/lib/utils";
import { setLocationActive } from "./actions";
import { LocationDialog } from "./location-dialog";

export interface LocationRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount: number;
  lotCount: number;
}

export function LocationsTable({ locations }: { locations: LocationRow[] }) {
  const [editing, setEditing] = useState<LocationRow | null>(null);
  const [pending, startTransition] = useTransition();

  if (locations.length === 0) {
    return <EmptyState icon={MapPinIcon} title="No locations" description="Create a location to start storing stock." />;
  }

  const toggle = (location: LocationRow) =>
    startTransition(async () => {
      const result = await setLocationActive(location.id, !location.isActive);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Location</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Lots</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow key={location.id} className={cn("group hover:bg-accent/40 transition-colors", !location.isActive && "opacity-60")}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-9 items-center justify-center rounded-lg transition-colors">
                      <MapPinIcon className="size-4" />
                    </div>
                    <div>
                      <p className="font-mono text-sm font-medium">
                        {location.code}
                        {!location.isActive && (
                          <Badge variant="outline" className="text-muted-foreground ml-2 h-5 font-sans">
                            Inactive
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">{location.name}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-md truncate text-sm md:table-cell">{location.description ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{location.itemCount}</TableCell>
                <TableCell className="text-right tabular-nums">{location.lotCount}</TableCell>
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Actions for ${location.code}`}
                        className="opacity-70 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setEditing(location)}>
                        <PencilIcon /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant={location.isActive ? "destructive" : "default"} onSelect={() => toggle(location)}>
                        {location.isActive ? <MapPinOffIcon /> : <RotateCcwIcon />}
                        {location.isActive ? "Deactivate" : "Reactivate"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <LocationDialog key={editing.id} location={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
