import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { WorkstationDialog } from "./workstation-dialog";
import { WorkstationsTable, type WorkstationRow } from "./workstations-table";

export const metadata: Metadata = { title: "Workstations" };

export default function WorkstationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WorkstationsPageContent />
    </Suspense>
  );
}

async function WorkstationsPageContent() {
  await requirePermission("workstations.manage");
  const rows = await db.all<WorkstationRow>(
    `SELECT w.id, w.code, w.name, w.description, w.status, w.hourly_capacity AS hourlyCapacity, w.is_active = 1 AS isActive,
            (SELECT COUNT(*) FROM work_orders o WHERE o.workstation_id = w.id AND o.status IN ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')) AS openOrders,
            (SELECT COUNT(*) FROM bom_routing_steps r WHERE r.workstation_id = w.id) AS routingSteps
       FROM workstations w
      ORDER BY w.is_active DESC, w.code COLLATE NOCASE`,
  );

  return (
    <>
      <PageHeader title="Workstations" description="Machines, cells and lines on the factory floor, with their standard capacity.">
        <WorkstationDialog />
      </PageHeader>
      <Card>
        <CardContent>
          <WorkstationsTable rows={rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) }))} />
        </CardContent>
      </Card>
    </>
  );
}
