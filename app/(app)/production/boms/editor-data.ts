import "server-only";
import { activeItemOptions } from "@/lib/inventory/queries";
import { activeWorkstationOptions, type BomRecord } from "@/lib/production/queries";
import type { EditorLine, EditorStep } from "./bom-editor";

export async function loadEditorOptions() {
  const [parents, components, workstations] = await Promise.all([
    activeItemOptions(["wip", "finished"]),
    activeItemOptions(),
    activeWorkstationOptions(),
  ]);
  return { parents, components, workstations };
}

/** Converts a stored BOM into the editor's string-based rows. */
export function toEditorRows(bom: BomRecord): { lines: EditorLine[]; steps: EditorStep[] } {
  return {
    lines: bom.lines.map((l) => ({
      componentId: String(l.componentId),
      qty: String(l.qtyMilli / 1000),
      scrapPct: String(l.scrapBp / 100),
    })),
    steps: bom.steps.map((s) => ({
      workstationId: String(s.workstationId),
      operationName: s.operationName,
      cycleSeconds: String(s.cycleMs / 1000),
      setupMinutes: String(s.setupMinutes),
    })),
  };
}
