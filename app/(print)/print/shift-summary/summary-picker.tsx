"use client";

import { usePathname, useRouter } from "next/navigation";

/** Screen-only controls to pick the date and shift for the summary. */
export function SummaryPicker({ date, shiftId, shifts }: { date: string; shiftId: string; shifts: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: { date?: string; shift?: string }) => {
    const p = new URLSearchParams({ date: next.date ?? date });
    const s = next.shift ?? shiftId;
    if (s) p.set("shift", s);
    router.replace(`${pathname}?${p}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-violet-50 p-3 print:hidden">
      <label className="grid gap-1 text-xs text-zinc-600">
        Date
        <input type="date" value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm" />
      </label>
      <label className="grid gap-1 text-xs text-zinc-600">
        Shift
        <select value={shiftId} onChange={(e) => go({ shift: e.target.value })} className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm">
          <option value="">Full day</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
