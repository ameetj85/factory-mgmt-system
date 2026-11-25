import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, ScrollTextIcon } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { db, type SqlValue } from "@/lib/db/client";
import { formatAuditAction } from "@/lib/format";
import { AUDIT_CATEGORIES } from "@/lib/audit-categories";
import { AuditFilters } from "./audit-filters";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default function AuditLogPage(props: PageProps<"/admin/audit-log">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditLogPageContent {...props} />
    </Suspense>
  );
}

async function AuditLogPageContent({ searchParams }: PageProps<"/admin/audit-log">) {
  await requirePermission("audit.view");
  const params = await searchParams;
  const category = AUDIT_CATEGORIES.find((c) => c.value === params.category)?.value;
  const userId = typeof params.user === "string" && /^\d+$/.test(params.user) ? Number(params.user) : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where: string[] = [];
  const args: SqlValue[] = [];
  if (category) {
    where.push("a.action LIKE ?");
    args.push(`${category}.%`);
  }
  if (userId) {
    where.push("a.user_id = ?");
    args.push(userId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [entries, total, users] = await Promise.all([
    db.all<{
      id: number;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      details: string | null;
      ip_address: string | null;
      created_at: string;
      full_name: string | null;
      username: string | null;
    }>(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at, u.full_name, u.username
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
         ${whereSql}
        ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...args, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
    ),
    db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs a ${whereSql}`, args),
    db.all<{ id: number; full_name: string }>("SELECT id, full_name FROM users ORDER BY full_name COLLATE NOCASE"),
  ]);

  const hasNext = entries.length > PAGE_SIZE;
  const rows = entries.slice(0, PAGE_SIZE);
  const pageHref = (p: number) => {
    const search = new URLSearchParams();
    if (category) search.set("category", category);
    if (userId) search.set("user", String(userId));
    if (p > 1) search.set("page", String(p));
    return search.size ? `?${search}` : "?";
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of sign-ins and changes to critical records. Entries can't be edited or deleted."
      />

      <Card>
        <CardContent className="space-y-4">
          <AuditFilters category={category} userId={userId} users={users.map((u) => ({ id: u.id, name: u.full_name }))} />

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
              <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                <ScrollTextIcon className="size-5" />
              </div>
              <p className="font-medium">No audit entries</p>
              <p className="text-muted-foreground text-sm">Nothing matches these filters yet.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">Record</TableHead>
                    <TableHead className="hidden xl:table-cell">Details</TableHead>
                    <TableHead className="hidden lg:table-cell pr-4">IP address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-accent/40 align-top transition-colors">
                      <TableCell className="text-muted-foreground pl-4 text-sm whitespace-nowrap">
                        <LocalTime iso={entry.created_at} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.full_name ? (
                          <div>
                            <p className="font-medium">{entry.full_name}</p>
                            <p className="text-muted-foreground text-xs">@{entry.username}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={entry.action.endsWith("failed") ? "bg-destructive/10 text-destructive" : undefined}
                        >
                          {formatAuditAction(entry.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                        {entry.entity_type ? `${entry.entity_type} #${entry.entity_id}` : "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-md xl:table-cell">
                        {entry.details ? (
                          <code className="bg-muted text-muted-foreground block truncate rounded-md px-2 py-1 font-mono text-xs" title={entry.details}>
                            {entry.details}
                          </code>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden pr-4 font-mono text-xs lg:table-cell">
                        {entry.ip_address ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              {(total?.n ?? 0).toLocaleString()} entr{total?.n === 1 ? "y" : "ies"} · page {page}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>
                    <ChevronLeftIcon /> Newer
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeftIcon /> Newer
                </Button>
              )}
              {hasNext ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>
                    Older <ChevronRightIcon />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Older <ChevronRightIcon />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
