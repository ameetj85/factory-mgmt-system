import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/dal";
import { activeItemOptions } from "@/lib/inventory/queries";
import { ChecklistEditor } from "../checklist-editor";

export const metadata: Metadata = { title: "New checklist" };

export default function NewChecklistPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewChecklistContent />
    </Suspense>
  );
}

async function NewChecklistContent() {
  await requirePermission("quality.manage");
  const items = await activeItemOptions();
  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href="/quality/checklists">
            <ArrowLeftIcon /> Checklists
          </Link>
        </Button>
        <PageHeader title="New inspection checklist" description="Define what inspectors check and the limits that count as a pass." />
      </div>
      <ChecklistEditor criteria={[]} items={items} />
    </>
  );
}
