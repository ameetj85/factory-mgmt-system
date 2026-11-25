import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarClockIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { WeekPlan } from "@/components/maintenance/week-plan";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/client";
import { upcomingPlan } from "@/lib/maintenance/service";
import { localDate } from "@/lib/maintenance/shift-math";
import { activeWorkstationOptions } from "@/lib/production/queries";
import { AssignDialog } from "./assign-dialog";
import { AssignmentsGrid, type AssignmentRow } from "./assignments-grid";
import { ExceptionDialog } from "./exception-dialog";
import { ExceptionsList, type ExceptionRow } from "./exceptions-list";
import { TemplateDialog } from "./template-dialog";
import { TemplatesList, type TemplateRow } from "./templates-list";
import { TimezoneCard } from "./timezone-card";

export const metadata: Metadata = { title: "Shift calendar" };

export default function ShiftsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ShiftsContent />
    </Suspense>
  );
}

async function loadShifts() {
  const [templates, breaks, assignments, exceptions, workstations] = await Promise.all([
    db.all<{ id: number; name: string; start_time: string; duration_minutes: number; is_active: number }>(
      "SELECT id, name, start_time, duration_minutes, is_active FROM shift_templates ORDER BY is_active DESC, start_time",
    ),
    db.all<{ shift_template_id: number; name: string; offset_minutes: number; duration_minutes: number }>(
      "SELECT shift_template_id, name, offset_minutes, duration_minutes FROM shift_breaks ORDER BY offset_minutes",
    ),
    db.all<AssignmentRow>(
      `SELECT s.id, s.workstation_id AS workstationId, w.code AS workstationCode, s.shift_template_id AS templateId, t.name AS templateName,
              s.day_of_week AS dayOfWeek, s.effective_from AS effectiveFrom, s.effective_to AS effectiveTo
         FROM workstation_schedules s JOIN workstations w ON w.id = s.workstation_id JOIN shift_templates t ON t.id = s.shift_template_id
        WHERE w.is_active = 1
        ORDER BY w.code COLLATE NOCASE, s.day_of_week, t.start_time`,
    ),
    db.all<ExceptionRow>(
      `SELECT e.id, e.exception_date AS date, e.exception_type AS type, e.notes, w.code AS workstationCode, t.name AS templateName
         FROM schedule_exceptions e LEFT JOIN workstations w ON w.id = e.workstation_id LEFT JOIN shift_templates t ON t.id = e.shift_template_id
        WHERE e.exception_date >= date('now', '-30 days')
        ORDER BY e.exception_date`,
    ),
    activeWorkstationOptions(),
  ]);
  const { timeZone, plans } = await upcomingPlan(workstations.map((w) => w.id), 7, Date.now());

  const templateRows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    startTime: t.start_time,
    durationMinutes: t.duration_minutes,
    isActive: t.is_active === 1,
    breaks: breaks
      .filter((b) => b.shift_template_id === t.id)
      .map((b) => ({ name: b.name, offsetMinutes: b.offset_minutes, durationMinutes: b.duration_minutes })),
  }));
  const today = localDate(Date.now(), timeZone);
  return { templateRows, assignments, exceptions, workstations, timeZone, plans, today };
}

async function ShiftsContent() {
  await requirePermission("shifts.manage");
  const { templateRows, assignments, exceptions, workstations, timeZone, plans, today } = await loadShifts();
  const activeTemplates = templateRows.filter((t) => t.isActive);

  return (
    <>
      <PageHeader title="Shift calendar" description="Working time for each machine. Planned production time for OEE comes from here.">
        <TemplateDialog />
      </PageHeader>

      <TimezoneCard timeZone={timeZone} />

      <Card>
        <CardHeader>
          <CardTitle>Shifts</CardTitle>
          <CardDescription>Reusable shift patterns. Breaks are excluded from planned production time.</CardDescription>
        </CardHeader>
        <CardContent>
          {templateRows.length === 0 ? (
            <EmptyState icon={CalendarClockIcon} title="No shifts defined" description="Start with your main shift, e.g. Day 06:00 for 8 hours with a 30 minute lunch." />
          ) : (
            <TemplatesList templates={templateRows} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Weekly schedule</CardTitle>
            <CardDescription>Which shifts each machine works on each day of the week.</CardDescription>
          </div>
          <AssignDialog workstations={workstations} templates={activeTemplates.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime }))} />
        </CardHeader>
        <CardContent>
          <AssignmentsGrid assignments={assignments} workstations={workstations} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Holidays &amp; overtime</CardTitle>
            <CardDescription>One-off changes for a date, for one machine or the whole factory.</CardDescription>
          </div>
          <ExceptionDialog workstations={workstations} templates={activeTemplates.map((t) => ({ id: t.id, name: t.name, startTime: t.startTime }))} />
        </CardHeader>
        <CardContent>
          <ExceptionsList exceptions={exceptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next 7 days</CardTitle>
          <CardDescription>Planned production time per machine ({timeZone}).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 overflow-x-auto">
          {workstations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No machines yet.</p>
          ) : (
            workstations.map((w) => (
              <div key={w.id} className="min-w-[44rem] space-y-2">
                <p className="text-sm">
                  <span className="font-mono font-medium">{w.code}</span> <span className="text-muted-foreground">{w.name}</span>
                </p>
                <WeekPlan days={plans.get(w.id) ?? []} timeZone={timeZone} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
