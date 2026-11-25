import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/dal";
import { activeItemOptions } from "@/lib/inventory/queries";
import { getChecklist } from "@/lib/quality/service";
import { ChecklistEditor } from "../checklist-editor";

export const metadata: Metadata = { title: "Edit checklist" };

export default function EditChecklistPage(props: PageProps<"/quality/checklists/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditChecklistContent {...props} />
    </Suspense>
  );
}

const toInput = (milli: number | null) => (milli == null ? "" : String(milli / 1000));

async function EditChecklistContent({ params }: PageProps<"/quality/checklists/[id]">) {
  await requirePermission("quality.manage");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [checklist, items] = await Promise.all([getChecklist(Number(id)), activeItemOptions()]);
  if (!checklist) notFound();

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/quality/checklists">
            <ArrowLeftIcon /> Checklists
          </Link>
        </Button>
        <PageHeader title={`Edit ${checklist.name}`} description="Changes apply to future inspections. Recorded inspections keep the checks as they were." />
      </div>
      <ChecklistEditor
        id={checklist.id}
        name={checklist.name}
        description={checklist.description ?? ""}
        stage={checklist.stage}
        itemId={checklist.item_id ? String(checklist.item_id) : "any"}
        items={items}
        criteria={checklist.criteria.map((c) => ({
          label: c.label,
          type: c.criterion_type,
          unit: c.unit ?? "",
          target: toInput(c.target_milli),
          min: toInput(c.min_milli),
          max: toInput(c.max_milli),
          critical: c.is_critical === 1,
          instructions: c.instructions ?? "",
        }))}
      />
    </>
  );
}
