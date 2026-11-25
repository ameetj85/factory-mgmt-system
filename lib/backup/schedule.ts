import "server-only";
import { listBackups, runBackup } from "./service";

const globalForSchedule = globalThis as unknown as { __fmsBackupTimer?: ReturnType<typeof setInterval> };

/**
 * Runs a backup every `hours` while the server process is up. On start, it backs up right away
 * (after a short delay) if the newest backup is older than one interval.
 */
export function startBackupSchedule(hours: number) {
  if (globalForSchedule.__fmsBackupTimer) return;
  const intervalMs = hours * 3_600_000;

  const run = async () => {
    try {
      const result = await runBackup();
      console.log(`[backup] wrote ${result.name} (${result.rows} rows, ${Math.round(result.size / 1024)} KB)`);
    } catch (error) {
      console.error("[backup] failed", error);
    }
  };

  globalForSchedule.__fmsBackupTimer = setInterval(run, intervalMs);
  setTimeout(async () => {
    const [latest] = await listBackups();
    if (!latest || Date.now() - Date.parse(latest.createdAt) > intervalMs) await run();
  }, 60_000);
  console.log(`[backup] scheduled every ${hours} h`);
}
