-- Workstations, bills of materials with routings, work orders and shop-floor production logs.
-- Quantities are INTEGER thousandths of the item's unit (qty_milli); cycle times are integer milliseconds;
-- scrap factors are integer basis points (250 = 2.5%).

CREATE TABLE workstations (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'RUNNING', 'MAINTENANCE', 'DOWN')),
  hourly_capacity INTEGER CHECK (hourly_capacity IS NULL OR hourly_capacity > 0),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE bom_headers (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  version    INTEGER NOT NULL CHECK (version > 0),
  is_active  INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  notes      TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (item_id, version)
);
-- At most one active recipe per item.
CREATE UNIQUE INDEX ux_bom_active_item ON bom_headers (item_id) WHERE is_active = 1;

CREATE TABLE bom_lines (
  id                      INTEGER PRIMARY KEY,
  bom_id                  INTEGER NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  component_item_id       INTEGER NOT NULL REFERENCES items(id),
  quantity_required_milli INTEGER NOT NULL CHECK (quantity_required_milli > 0),
  scrap_factor_bp         INTEGER NOT NULL DEFAULT 0 CHECK (scrap_factor_bp BETWEEN 0 AND 10000),
  sort_order              INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bom_id, component_item_id)
);

-- The sequence of operations to make one unit; ideal cycle time feeds OEE performance.
CREATE TABLE bom_routing_steps (
  id                 INTEGER PRIMARY KEY,
  bom_id             INTEGER NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  sequence           INTEGER NOT NULL CHECK (sequence > 0),
  workstation_id     INTEGER NOT NULL REFERENCES workstations(id),
  operation_name     TEXT NOT NULL,
  ideal_cycle_time_ms INTEGER NOT NULL CHECK (ideal_cycle_time_ms > 0),
  setup_time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (setup_time_minutes >= 0),
  UNIQUE (bom_id, sequence)
);

CREATE TABLE work_orders (
  id                   INTEGER PRIMARY KEY,
  wo_number            TEXT NOT NULL UNIQUE,
  bom_id               INTEGER NOT NULL REFERENCES bom_headers(id),
  item_id              INTEGER NOT NULL REFERENCES items(id),
  workstation_id       INTEGER NOT NULL REFERENCES workstations(id),
  qty_target_milli     INTEGER NOT NULL CHECK (qty_target_milli > 0),
  qty_completed_milli  INTEGER NOT NULL DEFAULT 0 CHECK (qty_completed_milli >= 0),
  qty_scrap_milli      INTEGER NOT NULL DEFAULT 0 CHECK (qty_scrap_milli >= 0),
  status               TEXT NOT NULL DEFAULT 'DRAFT'
                         CHECK (status IN ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  priority             TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date             TEXT,
  ideal_cycle_time_ms  INTEGER CHECK (ideal_cycle_time_ms IS NULL OR ideal_cycle_time_ms > 0),
  material_location_id INTEGER NOT NULL REFERENCES locations(id),
  output_location_id   INTEGER NOT NULL REFERENCES locations(id),
  notes                TEXT,
  created_by           INTEGER REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  released_at          TEXT,
  started_at           TEXT,
  completed_at         TEXT
);
CREATE INDEX idx_work_orders_status ON work_orders (status, due_date);
CREATE INDEX idx_work_orders_workstation ON work_orders (workstation_id, status);

-- One row per run segment (setup or production) by an operator on a workstation.
CREATE TABLE production_logs (
  id              INTEGER PRIMARY KEY,
  work_order_id   INTEGER NOT NULL REFERENCES work_orders(id),
  workstation_id  INTEGER NOT NULL REFERENCES workstations(id),
  operator_id     INTEGER NOT NULL REFERENCES users(id),
  run_type        TEXT NOT NULL CHECK (run_type IN ('SETUP', 'RUN')),
  start_time      TEXT NOT NULL,
  end_time        TEXT,
  end_reason      TEXT CHECK (end_reason IS NULL OR end_reason IN ('PAUSED', 'COMPLETED', 'SETUP_DONE', 'HANDOVER')),
  qty_good_milli  INTEGER NOT NULL DEFAULT 0 CHECK (qty_good_milli >= 0),
  qty_scrap_milli INTEGER NOT NULL DEFAULT 0 CHECK (qty_scrap_milli >= 0),
  notes           TEXT,
  CHECK (end_time IS NULL OR end_time >= start_time)
);
CREATE INDEX idx_production_logs_wo ON production_logs (work_order_id, start_time, end_time);
CREATE INDEX idx_production_logs_ws ON production_logs (workstation_id, start_time, end_time);
-- A workstation can only have one open run at a time.
CREATE UNIQUE INDEX ux_production_logs_open_run ON production_logs (workstation_id) WHERE end_time IS NULL;

-- Each individual output/scrap report, kept for traceability and shift reporting.
CREATE TABLE production_output_events (
  id                INTEGER PRIMARY KEY,
  production_log_id INTEGER NOT NULL REFERENCES production_logs(id),
  work_order_id     INTEGER NOT NULL REFERENCES work_orders(id),
  qty_good_milli    INTEGER NOT NULL DEFAULT 0 CHECK (qty_good_milli >= 0),
  qty_scrap_milli   INTEGER NOT NULL DEFAULT 0 CHECK (qty_scrap_milli >= 0),
  scrap_reason_code TEXT,
  reported_by       INTEGER NOT NULL REFERENCES users(id),
  reported_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (qty_good_milli + qty_scrap_milli > 0)
);
CREATE INDEX idx_output_events_wo ON production_output_events (work_order_id, reported_at);
