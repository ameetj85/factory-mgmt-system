import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";

// Server-Sent Events: tells open dashboards that shop-floor data changed, so they re-fetch.
// The server polls one cheap fingerprint query every few seconds per connection and only sends an
// event when it changes. Connections are recycled after a few minutes; EventSource reconnects itself.

const CHECK_EVERY_MS = 5_000;
const MAX_LIFETIME_MS = 5 * 60_000;

async function fingerprint(): Promise<string> {
  const row = await db.get<Record<string, unknown>>(
    `SELECT (SELECT MAX(id) FROM production_output_events) AS o,
            (SELECT MAX(id) FROM production_logs) AS r,
            (SELECT COUNT(*) FROM production_logs WHERE end_time IS NULL) AS ro,
            (SELECT MAX(id) FROM downtime_logs) AS d,
            (SELECT COUNT(*) FROM downtime_logs WHERE ended_at IS NULL) AS dopen,
            (SELECT MAX(updated_at) FROM work_orders) AS w,
            (SELECT MAX(id) FROM inventory_txns) AS t,
            (SELECT COUNT(*) FROM lot_holds WHERE status = 'ACTIVE') AS h`,
  );
  return JSON.stringify(row ?? {});
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "dashboard.view")) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        controller.close();
      };

      let last = await fingerprint().catch(() => "");
      send("ready", "1");
      const started = Date.now();
      timer = setInterval(async () => {
        if (closed) return;
        if (Date.now() - started > MAX_LIFETIME_MS) return close();
        try {
          const next = await fingerprint();
          if (next !== last) {
            last = next;
            send("change", String(Date.now()));
          } else {
            // Comment line keeps proxies from timing the connection out.
            if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
          }
        } catch {
          // A failed check just waits for the next tick.
        }
      }, CHECK_EVERY_MS);
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
