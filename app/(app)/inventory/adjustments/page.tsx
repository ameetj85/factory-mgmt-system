import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { SlidersHorizontalIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { activeItemOptions, activeLocationOptions, availableLots } from "@/lib/inventory/queries";
import { cn } from "@/lib/utils";
import { AdjustmentDialog } from "./adjustment-dialog";
import { AdjustmentsTable, type AdjustmentRow } from "./adjustments-table";

export const metadata: Metadata = { title: "Adjustments" };

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export default function AdjustmentsPage(props: PageProps<"/inventory/adjustments">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdjustmentsPageContent {...props} />
    </Suspense>
  );
}

async function AdjustmentsPageContent({ searchParams }: PageProps<"/inventory/adjustments">) {
  const user = await requirePermission("inventory.adjust");
  const params = await searchParams;
  const status = STATUSES.find((s) => s.value === params.status)?.value ?? "pending";
  const canApprove = can(user.role, "inventory.approve");

  const [rows, counts, items, locations, lots] = await Promise.all([
    db.all<AdjustmentRow>(
      `SELECT a.id, a.batch_number AS batchNumber, a.qty_change_milli AS qtyChangeMilli, a.reason_code AS reasonCode,
              a.notes, a.status, a.requested_at AS requestedAt, a.reviewed_at AS reviewedAt, a.review_notes AS reviewNotes,
              a.requested_by AS requestedById, i.sku, i.name AS itemName, i.uom, l.code AS locationCode,
              ru.full_name AS requestedBy, vu.full_name AS reviewedBy
         FROM adjustment_requests a
         JOIN items i ON i.id = a.item_id
         JOIN locations l ON l.id = a.location_id
         JOIN users ru ON ru.id = a.requested_by
         LEFT JOIN users vu ON vu.id = a.reviewed_by
        WHERE a.status = ?
        ORDER BY a.id DESC
        LIMIT 200`,
      [status],
    ),
    db.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM adjustment_requests GROUP BY status"),
    activeItemOptions(),
    activeLocationOptions(),
    availableLots(),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Adjustments"
        description={
          canApprove
            ? "Correct stock levels. Your adjustments post immediately; requests from warehouse clerks wait here for approval."
            : "Request stock corrections. A production manager or admin approves them before stock changes."
        }
      >
        <AdjustmentDialog items={items} locations={locations} lots={lots} autoApprove={canApprove} />
      </PageHeader>

      <Card>
        <CardContent className="space-y-4">
          <nav className="bg-muted inline-flex rounded-lg p-1" aria-label="Filter by status">
            {STATUSES.map((s) => (
              <Link
                key={s.value}
                href={s.value === "pending" ? "/inventory/adjustments" : `/inventory/adjustments?status=${s.value}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  status === s.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-primary",
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    s.value === "pending" && countFor("pending") > 0 ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15",
                  )}
                >
                  {countFor(s.value)}
                </span>
              </Link>
            ))}
          </nav>

          {rows.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontalIcon}
              title={status === "pending" ? "Nothing waiting for approval" : `No ${status} adjustments`}
              description={status === "pending" ? "New requests from the warehouse will appear here." : undefined}
            />
          ) : (
            <AdjustmentsTable rows={rows} canApprove={canApprove} currentUserId={user.id} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
