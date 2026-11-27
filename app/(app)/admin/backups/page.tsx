import type { Metadata } from "next";
import { Suspense } from "react";
import { CloudIcon, DatabaseBackupIcon, FolderIcon, TimerIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/dal";
import { backupDir, backupKeep, listBackups, managedBackupStatus } from "@/lib/backup/service";
import { BackupActions, BackupNowButton } from "./backup-actions";

export const metadata: Metadata = { title: "Backups" };

export default function BackupsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BackupsContent />
    </Suspense>
  );
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`);

async function BackupsContent() {
  await requirePermission("system.configure");
  const [files, managed] = await Promise.all([listBackups(), managedBackupStatus()]);
  const interval = Number(process.env.BACKUP_INTERVAL_HOURS) || 0;

  return (
    <>
      <PageHeader title="Backups" description="Snapshots of the whole database: schema and every record. Restore them into a new, empty database.">
        <BackupNowButton />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Latest backup" value={files[0] ? <LocalTime iso={files[0].createdAt} className="text-lg" /> : "None yet"} icon={DatabaseBackupIcon} hint={files[0] ? size(files[0].size) : undefined} />
        <StatCard label="Schedule" value={interval ? `Every ${interval} h` : "Off"} icon={TimerIcon} hint={interval ? `Keeps the newest ${backupKeep()}` : "Set BACKUP_INTERVAL_HOURS to enable"} />
        <StatCard label="Stored here" value={files.length} icon={FolderIcon} hint={backupDir()} className="[&_p:last-child]:truncate" />
        <StatCard label={managed.label} value={managed.enabled ? "On" : "Off"} icon={CloudIcon} hint={managed.detail} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backup files</CardTitle>
          <CardDescription>Download one to keep it off this server. Older files beyond the retention count are removed automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <EmptyState icon={DatabaseBackupIcon} title="No backups yet" description="Create one now, or turn on the schedule." />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">File</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="w-40 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f, i) => (
                    <TableRow key={f.name} className="group hover:bg-accent/40 transition-colors">
                      <TableCell className="pl-4 font-mono text-sm">
                        {f.name}
                        {i === 0 && <Badge className="ml-2 h-5">Latest</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <LocalTime iso={f.createdAt} />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{size(f.size)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <BackupActions name={f.name} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restoring</CardTitle>
          <CardDescription>Restores never overwrite data. They only run into a new, empty database.</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>1. Create a new, empty database (for Turso: <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">turso db create &lt;name&gt;</code> or the Turso dashboard).</p>
          <p>
            2. Run{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
              RESTORE_DATABASE_URL=&quot;libsql://…&quot; RESTORE_AUTH_TOKEN=&quot;…&quot; npm run db:restore -- backups/&lt;file&gt;
            </code>
          </p>
          <p>3. Point TURSO_DATABASE_URL and TURSO_AUTH_TOKEN at the new database and restart the app.</p>
          <p>
            {managed.enabled ? `${managed.label} also cover this database. ` : ""}For off-site copies of your own, download backup files or schedule{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">npm run db:backup</code> on another machine.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
