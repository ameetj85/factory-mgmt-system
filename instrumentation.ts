// Runs once when a Next.js server instance starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Scheduled database backups are opt-in: set BACKUP_INTERVAL_HOURS (e.g. 24) on long-running servers.
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) return;
  const { startBackupSchedule } = await import("./lib/backup/schedule");
  startBackupSchedule(hours);
}
