import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { readBackup } from "@/lib/backup/service";

/** Downloads a backup file. Admins only; the name must match the backup naming pattern (no paths). */
export async function GET(_request: Request, { params }: RouteContext<"/api/backups/[name]">) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "system.configure")) return new Response("Forbidden", { status: 403 });
  const { name } = await params;
  const data = await readBackup(name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
