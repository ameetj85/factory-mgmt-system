import "server-only";
import { db } from "@/lib/db/client";
import { activeLocationOptions } from "@/lib/inventory/queries";
import { activeWorkstationOptions } from "@/lib/production/queries";

export interface ProducibleItem {
  id: number;
  sku: string;
  name: string;
  uom: string;
  bomVersion: number;
  /** Workstations in the recipe's routing, last operation first (the usual place to report output). */
  routingWorkstationIds: number[];
}

export async function loadWorkOrderFormOptions() {
  const [items, routing, workstations, locations] = await Promise.all([
    db.all<{ id: number; sku: string; name: string; uom: string; bom_id: number; version: number }>(
      `SELECT i.id, i.sku, i.name, i.uom, h.id AS bom_id, h.version
         FROM items i JOIN bom_headers h ON h.item_id = i.id AND h.is_active = 1
        WHERE i.is_active = 1 ORDER BY i.sku COLLATE NOCASE`,
    ),
    db.all<{ bom_id: number; workstation_id: number }>(
      `SELECT r.bom_id, r.workstation_id FROM bom_routing_steps r
         JOIN bom_headers h ON h.id = r.bom_id AND h.is_active = 1
        ORDER BY r.sequence DESC`,
    ),
    activeWorkstationOptions(),
    activeLocationOptions(),
  ]);

  const producible: ProducibleItem[] = items.map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    uom: i.uom,
    bomVersion: i.version,
    routingWorkstationIds: [...new Set(routing.filter((r) => r.bom_id === i.bom_id).map((r) => r.workstation_id))],
  }));
  return { items: producible, workstations, locations };
}

export type WorkOrderFormOptions = Awaited<ReturnType<typeof loadWorkOrderFormOptions>>;
