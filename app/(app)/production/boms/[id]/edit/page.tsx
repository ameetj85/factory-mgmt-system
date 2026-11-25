import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/dal";
import { getBom } from "@/lib/production/queries";
import { BomEditor } from "../../bom-editor";
import { loadEditorOptions, toEditorRows } from "../../editor-data";

export const metadata: Metadata = { title: "Edit bill of materials" };

export default function EditBomPage(props: PageProps<"/production/boms/[id]/edit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditBomContent {...props} />
    </Suspense>
  );
}

async function EditBomContent({ params }: PageProps<"/production/boms/[id]/edit">) {
  await requirePermission("bom.manage");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [bom, options] = await Promise.all([getBom(Number(id)), loadEditorOptions()]);
  if (!bom) notFound();
  // Versions used by work orders are frozen; edits become a new version.
  if (bom.workOrderCount > 0) redirect(`/production/boms/new?from=${bom.id}`);
  const rows = toEditorRows(bom);

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href={`/production/boms/${bom.id}`}>
            <ArrowLeftIcon /> {bom.sku} v{bom.version}
          </Link>
        </Button>
        <PageHeader title={`Edit ${bom.sku} v${bom.version}`} description="This version hasn't been used by a work order yet, so it can be changed in place." />
      </div>
      <BomEditor
        bomId={bom.id}
        itemId={String(bom.itemId)}
        lockItem
        notes={bom.notes ?? ""}
        lines={rows.lines}
        steps={rows.steps}
        submitLabel="Save changes"
        {...options}
      />
    </>
  );
}
