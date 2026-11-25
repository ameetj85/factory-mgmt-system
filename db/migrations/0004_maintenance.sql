-- Machine registry details, downtime, preventive maintenance and shift calendars.

-- Asset details for workstations. Runtime hours are derived from production runs, plus an offset
-- for hours the machine already had before it was tracked here.
ALTER TABLE workstations ADD COLUMN asset_tag TEXT;
ALTER TABLE workstations ADD COLUMN manufacturer TEXT;
ALTER TABLE workstations ADD COLUMN model TEXT;
ALTER TABLE workstations ADD COLUMN serial_number TEXT;
ALTER TABLE workstations ADD COLUMN install_date TEXT;
ALTER TABLE workstations ADD COLUMN hourly_rate_cents INTEGER CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents >= 0);
ALTER TABLE workstations ADD COLUMN runtime_offset_seconds INTEGER NOT NULL DEFAULT 0 CHECK (runtime_offset_seconds >= 0);

-- Stoppages. is_planned = 1 reduces planned production time; 0 counts against availability.
CREATE TABLE downtime_logs (
  id               INTEGER PRIMARY KEY,
  workstation_id   INTEGER NOT NULL REFERENCES workstations(id),
  reason_code      TEXT NOT NULL,
  is_planned       INTEGER NOT NULL DEFAULT 0 CHECK (is_planned IN (0, 1)),
  started_at       TEXT NOT NULL,
  ended_at         TEXT,
  notes            TEXT,
  reported_by      INTEGER NOT NULL REFERENCES users(id),
  resolved_by      INTEGER REFERENCES users(id),
  resolution_notes TEXT,
  paused_run_id    INTEGER REFERENCES production_logs(id),
  is_retroactive   INTEGER NOT NULL DEFAULT 0 CHECK (is_retroactive IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX idx_downtime_ws_window ON downtime_logs (workstation_id, started_at, ended_at);
-- Only one open stoppage per workstation.
CREATE UNIQUE INDEX ux_downtime_open ON downtime_logs (workstation_id) WHERE ended_at IS NULL;

-- Preventive maintenance plans, triggered by calendar interval or by machine runtime hours.
CREATE TABLE pm_plans (
  id                       INTEGER PRIMARY KEY,
  workstation_id           INTEGER NOT NULL REFERENCES workstations(id),
  title                    TEXT NOT NULL,
  instructions             TEXT,
  trigger_type             TEXT NOT NULL CHECK (trigger_type IN ('CALENDAR', 'RUNTIME')),
  interval_days            INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
  interval_runtime_hours   INTEGER CHECK (interval_runtime_hours IS NULL OR interval_runtime_hours > 0),
  -- Where the current interval started: the last completion, or plan creation.
  baseline_at              TEXT NOT NULL,
  baseline_runtime_seconds INTEGER NOT NULL DEFAULT 0,
  estimated_minutes        INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  is_active                INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by               INTEGER REFERENCES users(id),
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK ((trigger_type = 'CALENDAR' AND interval_days IS NOT NULL) OR (trigger_type = 'RUNTIME' AND interval_runtime_hours IS NOT NULL))
);
CREATE INDEX idx_pm_plans_ws ON pm_plans (workstation_id, is_active);

CREATE TABLE pm_completions (
  id               INTEGER PRIMARY KEY,
  plan_id          INTEGER NOT NULL REFERENCES pm_plans(id),
  completed_by     INTEGER NOT NULL REFERENCES users(id),
  completed_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  runtime_seconds  INTEGER NOT NULL,
  notes            TEXT,
  downtime_id      INTEGER REFERENCES downtime_logs(id)
);
CREATE INDEX idx_pm_completions_plan ON pm_completions (plan_id, completed_at);

-- Shift calendar: reusable templates, their breaks, weekly assignments and date exceptions.
CREATE TABLE shift_templates (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  start_time       TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE shift_breaks (
  id                INTEGER PRIMARY KEY,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  offset_minutes    INTEGER NOT NULL CHECK (offset_minutes >= 0),
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0)
);

CREATE TABLE workstation_schedules (
  id                INTEGER PRIMARY KEY,
  workstation_id    INTEGER NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id),
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  effective_from    TEXT NOT NULL,
  effective_to      TEXT,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX idx_ws_schedules ON workstation_schedules (workstation_id, day_of_week);

CREATE TABLE schedule_exceptions (
  id                INTEGER PRIMARY KEY,
  workstation_id    INTEGER REFERENCES workstations(id) ON DELETE CASCADE,
  exception_date    TEXT NOT NULL,
  exception_type    TEXT NOT NULL CHECK (exception_type IN ('HOLIDAY', 'OVERTIME')),
  shift_template_id INTEGER REFERENCES shift_templates(id),
  notes             TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (exception_type = 'HOLIDAY' OR shift_template_id IS NOT NULL)
);
CREATE INDEX idx_schedule_exceptions_date ON schedule_exceptions (exception_date);

-- Plant-wide settings, e.g. the time zone shift times are expressed in.
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT INTO app_settings (key, value) VALUES ('factory_timezone', 'UTC');
