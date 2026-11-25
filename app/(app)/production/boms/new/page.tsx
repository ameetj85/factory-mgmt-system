import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon, NetworkIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/dal";
import { getBom } from "@/lib/production/queries";
import { BomEditor } from "../bom-editor";
import { loadEditorOptions, toEditorRows } from "../editor-data";

export const metadata: Metadata = { title: "New bill of materials" };

export default function NewBomPage(props: PageProps<"/production/boms/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewBomContent {...props} />
    </Suspense>
  );
}

async function NewBomContent({ searchParams }: PageProps<"/production/boms/new">) {
  await requirePermission("bom.manage");
  const params = await searchParams;
  const fromId = typeof params.from === "string" && /^\d+$/.test(params.from) ? Number(params.from) : undefined;
  const [options, source] = await Promise.all([loadEditorOptions(), fromId ? getBom(fromId) : Promise.resolve(null)]);
  const rows = source ? toEditorRows(source) : { lines: [], steps: [] };

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-2">
          <Link href={source ? `/production/boms/${source.id}` : "/production/boms"}>
            <ArrowLeftIcon /> {source ? `${source.sku} v${source.version}` : "Bills of materials"}
          </Link>
        </Button>
        <PageHeader
          title={source ? `New version of ${source.sku}` : "New bill of materials"}
          description={source ? `Starts as a copy of v${source.version}. Earlier versions stay unchanged for existing work orders.` : "Define components and routing for a sub-assembly or finished good."}
        />
      </div>
      {options.parents.length === 0 ? (
        <EmptyState
          icon={NetworkIcon}
          title="No items to make"
          description="Add a sub-assembly (WIP) or finished good to the item master first."
        >
          <Button asChild>
            <Link href="/inventory/items">Go to item master</Link>
          </Button>
        </EmptyState>
      ) : (
        <BomEditor
          itemId={source ? String(source.itemId) : typeof params.item === "string" ? params.item : undefined}
          lockItem={Boolean(source)}
          notes={source?.notes ?? ""}
          lines={rows.lines}
          steps={rows.steps}
          submitLabel={source ? "Save new version" : "Create BOM"}
          {...options}
        />
      )}
    </>
  );
}
