-- Inspection checklists, recorded inspections and lot quality holds.
-- Measurements are signed INTEGER thousandths of the criterion's unit (value_milli).

CREATE TABLE inspection_templates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  stage       TEXT NOT NULL CHECK (stage IN ('RECEIVING', 'IN_PROCESS', 'FINAL')),
  -- When set, the checklist is offered only for this item; otherwise for any item at this stage.
  item_id     INTEGER REFERENCES items(id),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_inspection_templates_stage ON inspection_templates (stage, is_active);

CREATE TABLE inspection_criteria (
  id             INTEGER PRIMARY KEY,
  template_id    INTEGER NOT NULL REFERENCES inspection_templates(id) ON DELETE CASCADE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  label          TEXT NOT NULL,
  criterion_type TEXT NOT NULL CHECK (criterion_type IN ('PASS_FAIL', 'MEASUREMENT')),
  unit           TEXT,
  target_milli   INTEGER,
  min_milli      INTEGER,
  max_milli      INTEGER,
  is_critical    INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0, 1)),
  instructions   TEXT,
  CHECK (criterion_type = 'PASS_FAIL' OR min_milli IS NOT NULL OR max_milli IS NOT NULL),
  CHECK (min_milli IS NULL OR max_milli IS NULL OR min_milli <= max_milli)
);

CREATE TABLE inspections (
  id                INTEGER PRIMARY KEY,
  inspection_number TEXT NOT NULL UNIQUE,
  template_id       INTEGER NOT NULL REFERENCES inspection_templates(id),
  template_name     TEXT NOT NULL,
  stage             TEXT NOT NULL,
  item_id           INTEGER NOT NULL REFERENCES items(id),
  batch_number      TEXT NOT NULL,
  work_order_id     INTEGER REFERENCES work_orders(id),
  receipt_id        INTEGER REFERENCES receipts(id),
  sample_size       INTEGER NOT NULL DEFAULT 1 CHECK (sample_size > 0),
  result            TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL')),
  inspector_id      INTEGER NOT NULL REFERENCES users(id),
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_inspections_lot ON inspections (item_id, batch_number);
CREATE INDEX idx_inspections_created ON inspections (created_at);

-- Each result keeps a copy of the criterion as it was, so later checklist edits never change history.
CREATE TABLE inspection_results (
  id             INTEGER PRIMARY KEY,
  inspection_id  INTEGER NOT NULL REFERENCES inspections(id),
  criterion_id   INTEGER,
  label          TEXT NOT NULL,
  criterion_type TEXT NOT NULL,
  unit           TEXT,
  target_milli   INTEGER,
  min_milli      INTEGER,
  max_milli      INTEGER,
  is_critical    INTEGER NOT NULL DEFAULT 0,
  value_milli    INTEGER,
  passed         INTEGER NOT NULL CHECK (passed IN (0, 1)),
  note           TEXT
);
CREATE INDEX idx_inspection_results ON inspection_results (inspection_id);

CREATE TRIGGER inspections_no_update BEFORE UPDATE ON inspections
BEGIN SELECT RAISE(ABORT, 'inspection records are permanent'); END;
CREATE TRIGGER inspections_no_delete BEFORE DELETE ON inspections
BEGIN SELECT RAISE(ABORT, 'inspection records are permanent'); END;
CREATE TRIGGER inspection_results_no_update BEFORE UPDATE ON inspection_results
BEGIN SELECT RAISE(ABORT, 'inspection records are permanent'); END;
CREATE TRIGGER inspection_results_no_delete BEFORE DELETE ON inspection_results
BEGIN SELECT RAISE(ABORT, 'inspection records are permanent'); END;

-- A held lot can't be shipped or consumed by production until it's released (or scrapped).
CREATE TABLE lot_holds (
  id               INTEGER PRIMARY KEY,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  batch_number     TEXT NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED', 'SCRAPPED')),
  inspection_id    INTEGER REFERENCES inspections(id),
  placed_by        INTEGER NOT NULL REFERENCES users(id),
  placed_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved_by      INTEGER REFERENCES users(id),
  resolved_at      TEXT,
  resolution_notes TEXT
);
CREATE UNIQUE INDEX ux_lot_holds_active ON lot_holds (item_id, batch_number) WHERE status = 'ACTIVE';
CREATE INDEX idx_lot_holds_status ON lot_holds (status, placed_at);
