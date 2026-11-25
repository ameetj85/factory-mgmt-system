-- Item master, storage locations and the immutable stock ledger.
-- Quantities are stored as INTEGER thousandths of the item's unit of measure (qty_milli),
-- so 1.25 kg is stored as 1250. Money is stored as integer cents.

CREATE TABLE items (
  id                  INTEGER PRIMARY KEY,
  sku                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                TEXT NOT NULL,
  description         TEXT,
  type                TEXT NOT NULL CHECK (type IN ('raw', 'wip', 'finished')),
  uom                 TEXT NOT NULL,
  reorder_point_milli INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point_milli >= 0),
  standard_cost_cents INTEGER CHECK (standard_cost_cents IS NULL OR standard_cost_cents >= 0),
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_items_type ON items (type, is_active);

CREATE TABLE locations (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT INTO locations (code, name, description) VALUES ('MAIN', 'Main warehouse', 'Default storage location');

-- Header for a supplier delivery; each received line is an inventory_txns row referencing it.
CREATE TABLE receipts (
  id                 INTEGER PRIMARY KEY,
  receipt_number     TEXT NOT NULL UNIQUE,
  supplier_name      TEXT NOT NULL,
  supplier_reference TEXT,
  notes              TEXT,
  received_by        INTEGER NOT NULL REFERENCES users(id),
  received_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Outgoing deliveries to customers (forward traceability for lots).
CREATE TABLE shipments (
  id              INTEGER PRIMARY KEY,
  shipment_number TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL,
  order_reference TEXT,
  notes           TEXT,
  shipped_by      INTEGER NOT NULL REFERENCES users(id),
  shipped_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE transfers (
  id               INTEGER PRIMARY KEY,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  batch_number     TEXT NOT NULL,
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id   INTEGER NOT NULL REFERENCES locations(id),
  qty_milli        INTEGER NOT NULL CHECK (qty_milli > 0),
  notes            TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (from_location_id <> to_location_id)
);

-- The stock ledger. Every movement is a new row; stock on hand is SUM(qty_change_milli).
CREATE TABLE inventory_txns (
  id               INTEGER PRIMARY KEY,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  location_id      INTEGER NOT NULL REFERENCES locations(id),
  batch_number     TEXT NOT NULL,
  qty_change_milli INTEGER NOT NULL CHECK (qty_change_milli <> 0),
  txn_type         TEXT NOT NULL CHECK (txn_type IN (
                     'RECEIPT', 'ADJUSTMENT', 'SCRAP', 'TRANSFER_OUT', 'TRANSFER_IN', 'SHIPMENT',
                     'MATERIAL_CONSUMPTION', 'PRODUCTION_OUTPUT')),
  reference_type   TEXT,
  reference_id     INTEGER,
  unit_cost_cents  INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  notes            TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_txns_stock ON inventory_txns (item_id, location_id, batch_number);
CREATE INDEX idx_txns_created ON inventory_txns (created_at);
CREATE INDEX idx_txns_batch ON inventory_txns (batch_number);
CREATE INDEX idx_txns_reference ON inventory_txns (reference_type, reference_id);

CREATE TRIGGER inventory_txns_no_update BEFORE UPDATE ON inventory_txns
BEGIN
  SELECT RAISE(ABORT, 'inventory_txns is append-only; post a correcting transaction instead');
END;

CREATE TRIGGER inventory_txns_no_delete BEFORE DELETE ON inventory_txns
BEGIN
  SELECT RAISE(ABORT, 'inventory_txns is append-only; post a correcting transaction instead');
END;

-- Current stock per item, location and batch.
CREATE VIEW stock_levels AS
SELECT item_id,
       location_id,
       batch_number,
       SUM(qty_change_milli) AS qty_milli,
       MIN(created_at)       AS first_txn_at,
       MAX(created_at)       AS last_txn_at
  FROM inventory_txns
 GROUP BY item_id, location_id, batch_number;

-- Manual stock corrections. Clerks request them; managers approve before the ledger changes.
CREATE TABLE adjustment_requests (
  id               INTEGER PRIMARY KEY,
  item_id          INTEGER NOT NULL REFERENCES items(id),
  location_id      INTEGER NOT NULL REFERENCES locations(id),
  batch_number     TEXT NOT NULL,
  qty_change_milli INTEGER NOT NULL CHECK (qty_change_milli <> 0),
  reason_code      TEXT NOT NULL,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by     INTEGER NOT NULL REFERENCES users(id),
  requested_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reviewed_by      INTEGER REFERENCES users(id),
  reviewed_at      TEXT,
  review_notes     TEXT,
  txn_id           INTEGER REFERENCES inventory_txns(id)
);
CREATE INDEX idx_adjustments_status ON adjustment_requests (status, requested_at);

-- Guards against double submission when a flaky connection makes a client retry.
CREATE TABLE idempotency_keys (
  key        TEXT PRIMARY KEY,
  action     TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
