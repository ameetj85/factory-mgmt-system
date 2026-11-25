To build a full-stack Factory Management System (MES/ERP lite) backed by SQLite, you need to balance real-time shop-floor tracking with inventory precision and database concurrency limits.
Here are the framework-agnostic project requirements broken down by functional modules, data schema, and technical constraints.

1. Core Functional Requirements


A. Inventory & Material Management (WMS)

• Item Master: Manage raw materials, sub-assemblies (Work-in-Progress/WIP), and finished goods with unique SKUs, units of measure, and reorder thresholds.
• Bill of Materials (BOM): Define multi-level recipes specifying exact quantities of raw materials required to produce one unit of a finished good (including expected scrap/waste percentages).
• Stock Ledger: Track every inventory movement (receiving, consumption, production output, scrap, manual adjustment) as an immutable transaction rather than just overwriting a stock count.
• Low-Stock Alerts: Trigger notifications or dashboard warnings when available stock drops below minimum safety thresholds.

B. Production Planning & Execution (MES)

• Work Orders (WO): Create, schedule, and release production orders linked to a specific BOM, target quantity, and due date.
• Routing & Workstations: Define factory floor stations (e.g., CNC, Assembly, Packaging) and the sequence of operations required for a product.
• Shop Floor Tracking: Allow operators to start, pause, and complete work orders, logging actual run times, setup times, good units produced, and rejected/scrap units.
• Backflushing / Material Issue: Automatically deduct raw materials from inventory based on the BOM when a work order is started or completed.

C. Equipment & Maintenance

• Machine Registry: Track factory assets, operational status (Running, Idle, Maintenance, Down), and standard hourly run rates.
• Downtime Logging: Record unplanned stops with categorized reason codes (e.g., mechanical failure, material shortage, operator break) to calculate Overall Equipment Effectiveness (OEE).
• Preventive Maintenance: Schedule recurring maintenance tasks based on calendar dates or machine runtime hours.

D. Quality Control (QC)

• Inspection Checklists: Attach pass/fail criteria or tolerance measurements to specific production stages or finished batches.
• Lot/Batch Traceability: Assign batch numbers to incoming raw materials and outgoing finished goods so defects can be traced forward to customers and backward to suppliers.

E. User Management & Security

• Role-Based Access Control (RBAC):
	• Admin: Full system configuration, user management, and master data editing.
	• Production Manager: Create BOMs, schedule work orders, view analytics, and approve inventory adjustments.
	• Shop Floor Operator: Simplified view to clock into work orders, log output/scrap, and report machine downtime.
	• Warehouse Clerk: Receive supplier shipments, manage stock locations, and fulfill outgoing orders.
• Audit Logs: Record who created, modified, or deleted critical records (inventory adjustments, BOM changes, completed work orders).

2. Core Database Entities (SQLite Schema Design)

To keep data integrity high, your SQLite database should enforce foreign keys (PRAGMA foreign_keys = ON;) and use a relational structure:

Table	Key Fields	Purpose
users	id, username, password_hash, role, is_active	Authentication and RBAC permissions.
items	id, sku, name, type (raw/wip/finished), uom, reorder_point	Master catalog of all physical goods.
bom_headers	id, finished_item_id, version, is_active	Links a finished product to its recipe.
bom_lines	id, bom_id, component_item_id, quantity_required, scrap_factor	Ingredients/parts needed per unit.
workstations	id, name, status, hourly_capacity	Physical machines or assembly lines.
work_orders	id, wo_number, bom_id, workstation_id, qty_target, qty_completed, status, due_date	Tracks a specific production run.
production_logs	id, work_order_id, operator_id, qty_good, qty_scrap, start_time, end_time	Granular shift/operator output logs.
inventory_txns	id, item_id, batch_number, qty_change, txn_type, reference_id, created_at	Immutable ledger for stock calculation.
downtime_logs	id, workstation_id, reason_code, started_at, ended_at, notes	Tracks machine availability and bottlenecks.


3. SQLite-Specific Architectural Requirements

Because SQLite is an embedded, file-based database rather than a client-server engine like PostgreSQL, your backend architecture must enforce specific configurations to avoid SQLITE_BUSY locking errors during concurrent shop-floor usage:
1. Enable Write-Ahead Logging (WAL): Run PRAGMA journal_mode = WAL; on connection startup. This allows concurrent reads while a write transaction is occurring.
2. Set a Busy Timeout: Configure PRAGMA busy_timeout = 5000; (5 seconds) so simultaneous requests from multiple shop-floor tablets wait in a queue rather than failing immediately.
3. Strict Transaction Boundaries: Wrap multi-step operations (like completing a work order, adding finished goods to inventory, and deducting raw materials) inside explicit BEGIN IMMEDIATE transactions so partial data is never saved if an error occurs.
4. Data Types & Dates: Store all timestamps as ISO-8601 strings (YYYY-MM-DDTHH:MM:SSZ) or Unix epoch integers for reliable sorting and timezone handling. Store monetary or fractional weights as integers (e.g., cents or milligrams) to avoid floating-point rounding drift.
5. Automated Backups: Implement a scheduled job using SQLite’s online backup API or VACUUM INTO 'backup_filename.db' (never copy a live .db file using standard OS file-copy commands while WAL mode is active).

4. Non-Functional & UI/UX Requirements

• Shop-Floor Friendly UI: Operator screens must feature high-contrast colors, large touch-friendly buttons (minimum 44x44px), and minimal typing (rely on dropdowns, numpads, and barcode/QR scanner inputs).
• Real-Time Dashboard: Provide managers with live KPIs: Work Order completion rates, current machine statuses, scrap percentages, and bottleneck alerts (via polling, Server-Sent Events, or WebSockets).
• Label & Report Generation: Support generating printable PDFs/labels for work order travelers, batch barcodes, and end-of-shift production summaries.
• Offline Resilience (Optional): If factory Wi-Fi is spotty, design the frontend to queue operator actions locally and sync with the backend once connectivity returns.

Recommended Build Phases

1. Phase 1 (Foundation): Auth/RBAC, Item Master, Inventory Ledger, and basic stock receiving/adjustments.
2. Phase 2 (Production): BOM builder, Workstation setup, Work Order lifecycle, and automatic material deduction.
3. Phase 3 (Analytics & Maintenance): Downtime logging, OEE/scrap reporting dashboards, and automated SQLite backups.


OEE (Overall Equipment Effectiveness)—sometimes mistyped as QEE—is the gold-standard manufacturing metric used to measure how effectively a machine or workstation is utilized compared to its full potential.
OEE breaks manufacturing productivity down into three distinct loss categories (Availability, Performance, and Quality) and multiplies them together to produce a single percentage.
\(\text{OEE}=\text{Availability}\times \text{Performance}\times \text{Quality}\)

1. The Three Core Formulas


A. Availability (Measures Downtime Loss)

Availability compares the time a machine was actually running against the time it was scheduled to run. It accounts for Unplanned Stops (equipment failure, material shortages) and Planned Stops (changeovers, machine setup).
\(\text{Availability}=\frac{\text{Run\ Time}}{\text{Planned\ Production\ Time}}\)
• Planned Production Time: Total shift time minus scheduled breaks, lunches, or periods where no work was scheduled.
• Run Time: Planned Production Time - Stop Time (all recorded downtime events from your downtime_logs table).

B. Performance (Measures Speed Loss)

Performance compares how fast the machine ran against its theoretical maximum speed. It accounts for Slow Cycles (running below rated speed due to wear or bad materials) and Small Stops (brief jams or micro-stops not logged as formal downtime).
\(\text{Performance}=\frac{\text{Ideal\ Cycle\ Time}\times \text{Total\ Count}}{\text{Run\ Time}}\)
(Alternatively, using throughput rate instead of cycle time):
\(\text{Performance}=\frac{\text{Total\ Count}/\text{Run\ Time}}{\text{Ideal\ Run\ Rate}}\)
• Ideal Cycle Time: The fastest theoretical time to produce one unit (stored on your workstations or bom_headers table).
• Total Count: Good Units + Scrap Units (every piece produced, regardless of quality).

C. Quality (Measures Defect Loss)

Quality compares the number of usable parts produced against the total number of parts started. It accounts for Production Rejects and Startup Scrap.
\(\text{Quality}=\frac{\text{Good\ Count}}{\text{Total\ Count}}\)
• Good Count: Units that pass inspection without needing rework (qty_good).
• Total Count: Good Count + Scrap Count (qty_good + qty_scrap).

2. Worked Example (Shift Calculation)

Assume a workstation is scheduled for an 8-hour shift (480 minutes) with a 30-minute scheduled lunch break:
1. Shift Inputs:
	• Planned Production Time: 480 - 30 = 450 minutes
	• Unplanned Downtime (Jam/Setup): 45 minutes
	• Ideal Cycle Time: 0.5 minutes per unit (2 units/minute)
	• Good Units Produced: 680 units
	• Scrap Units Produced: 20 units (Total Count = 700 units)
2. Step-by-Step Calculation:
	• Run Time: 450 - 45 = 405 minutes
	• Availability: \(\frac{405}{450} = 0.90 \text{ (90.0\%)}\)
	• Performance: \(\frac{0.5 \times 700}{405} = \frac{350}{405} = 0.8642 \text{ (86.4\%)}\)
	• Quality: \(\frac{680}{700} = 0.9714 \text{ (97.1\%)}\)
3. Final OEE Score:
\(\text{OEE}=0.90\times 0.8642\times 0.9714=0.7555\text{\ (75.6\%)}\)
(Note: Notice that OEE also simplifies mathematically to the Fully Productive Time formula: \(\frac{\text{Ideal Cycle Time} \times \text{Good Count}}{\text{Planned Production Time}} = \frac{0.5 \times 680}{450} = 75.6\%\). However, calculating the three components separately is essential so managers know why productivity was lost.)

3. Implementation Tips for Your SQLite Schema

When implementing OEE in your backend and database, watch out for these common pitfalls:

Pitfall	How to Handle in Your App
Performance > 100%	If a machine runs faster than its configured Ideal Cycle Time, Performance will exceed 100%. Do not clamp it to 100% silently—flag it as a warning that the workstation's baseline Ideal Cycle Time is outdated and needs recalibration.
Cycle Time Mismatches	Different products run at different speeds on the same machine. Store ideal_cycle_time_seconds on a junction table (workstation_routings) linking a specific bom_id to a workstation_id, rather than only on the workstations table.
Division by Zero	Always guard against Planned Production Time = 0, Run Time = 0, or Total Count = 0 in your SQL queries or backend logic using NULLIF(denominator, 0) so idle shifts return 0% or NULL rather than crashing.
Overlapping Downtime	Ensure your backend validates downtime_logs so two downtime events on the same workstation cannot overlap in timestamps, which would artificially inflate Stop Time and break Availability.



To calculate OEE accurately in SQLite, use Common Table Expressions (CTEs) to aggregate production logs and downtime logs separately before joining them to the workstation.
Joining both tables directly without pre-aggregating causes a Cartesian product (row multiplication), which inflates unit counts and downtime minutes.

1. Required Schema Adjustments

To calculate OEE across mixed product runs accurately, add an ideal_cycle_time_seconds column to work_orders (copied from your routing/BOM when the order is created) and track shift schedules or pass a time window (:start_time, :end_time) into the query.
sql
-- Key columns referenced in the query below:
-- workstations: id, name
-- work_orders: id, workstation_id, ideal_cycle_time_seconds
-- production_logs: id, work_order_id, qty_good, qty_scrap, start_time, end_time
-- downtime_logs: id, workstation_id, started_at, ended_at, is_planned (0 = unplanned/setup, 1 = scheduled break)
Use code with caution.

2. SQLite OEE Calculation Query

This query calculates OEE per workstation for a given shift or date window (:window_start to :window_end). It uses unixepoch() (built into SQLite 3.38+) to compute exact durations in seconds, clamps log boundaries to the requested shift window, and uses NULLIF to prevent division-by-zero errors.
sql
WITH shift_window AS (
    SELECT 
        :window_start AS win_start,
        :window_end AS win_end,
        MAX(0, unixepoch(:window_end) - unixepoch(:window_start)) AS total_window_sec
),

-- 1. Aggregate Downtime (clamped to the query time window)
downtime_agg AS (
    SELECT 
        d.workstation_id,
        -- Scheduled breaks reduce Planned Production Time
        SUM(CASE WHEN d.is_planned = 1 THEN 
            MAX(0, unixepoch(MIN(COALESCE(d.ended_at, w.win_end), w.win_end)) - unixepoch(MAX(d.started_at, w.win_start)))
        ELSE 0 END) AS planned_break_sec,
        -- Unplanned stops & changeovers reduce Run Time
        SUM(CASE WHEN d.is_planned = 0 THEN 
            MAX(0, unixepoch(MIN(COALESCE(d.ended_at, w.win_end), w.win_end)) - unixepoch(MAX(d.started_at, w.win_start)))
        ELSE 0 END) AS stop_time_sec
    FROM downtime_logs d
    CROSS JOIN shift_window w
    WHERE d.started_at < w.win_end 
      AND COALESCE(d.ended_at, w.win_end) > w.win_start
    GROUP BY d.workstation_id
),

-- 2. Aggregate Production Output & Theoretical Ideal Time
production_agg AS (
    SELECT 
        wo.workstation_id,
        SUM(pl.qty_good) AS total_good,
        SUM(pl.qty_scrap) AS total_scrap,
        SUM(pl.qty_good + pl.qty_scrap) AS total_count,
        -- Multiply each batch's total units by that specific work order's ideal cycle time
        SUM((pl.qty_good + pl.qty_scrap) * wo.ideal_cycle_time_seconds) AS ideal_run_sec
    FROM production_logs pl
    JOIN work_orders wo ON pl.work_order_id = wo.id
    CROSS JOIN shift_window w
    WHERE pl.start_time < w.win_end 
      AND COALESCE(pl.end_time, w.win_end) > w.win_start
    GROUP BY wo.workstation_id
),

-- 3. Compute Time Buckets per Workstation
time_metrics AS (
    SELECT 
        ws.id AS workstation_id,
        ws.name AS workstation_name,
        MAX(0, sw.total_window_sec - COALESCE(dt.planned_break_sec, 0)) AS planned_prod_sec,
        MAX(0, sw.total_window_sec - COALESCE(dt.planned_break_sec, 0) - COALESCE(dt.stop_time_sec, 0)) AS run_time_sec,
        COALESCE(pa.ideal_run_sec, 0) AS ideal_run_sec,
        COALESCE(pa.total_good, 0) AS total_good,
        COALESCE(pa.total_count, 0) AS total_count
    FROM workstations ws
    CROSS JOIN shift_window sw
    LEFT JOIN downtime_agg dt ON ws.id = dt.workstation_id
    LEFT JOIN production_agg pa ON ws.id = pa.workstation_id
)

-- 4. Final OEE Component Percentages
SELECT 
    workstation_id,
    workstation_name,
    planned_prod_sec,
    run_time_sec,
    total_good,
    total_count,
    ROUND(COALESCE(CAST(run_time_sec AS REAL) / NULLIF(planned_prod_sec, 0), 0) * 100, 2) AS availability_pct,
    ROUND(COALESCE(CAST(ideal_run_sec AS REAL) / NULLIF(run_time_sec, 0), 0) * 100, 2) AS performance_pct,
    ROUND(COALESCE(CAST(total_good AS REAL) / NULLIF(total_count, 0), 0) * 100, 2) AS quality_pct,
    ROUND(
        COALESCE(CAST(run_time_sec AS REAL) / NULLIF(planned_prod_sec, 0), 0) *
        COALESCE(CAST(ideal_run_sec AS REAL) / NULLIF(run_time_sec, 0), 0) *
        COALESCE(CAST(total_good AS REAL) / NULLIF(total_count, 0), 0) * 100, 
    2) AS oee_pct
FROM time_metrics;
Use code with caution.

3. Key SQLite Details in This Query

• Mixed-Product Speeds (ideal_run_sec): Instead of using a single static speed per machine, SUM((qty_good + qty_scrap) * wo.ideal_cycle_time_seconds) calculates the exact theoretical seconds required for whatever mix of products ran during that shift.
• Window Clamping (MIN / MAX): If a machine broke down 30 minutes before a shift started and stayed down 15 minutes into the shift, MAX(d.started_at, w.win_start) ensures only the 15 minutes inside the shift count against that shift's Availability.
• Active Events (COALESCE(ended_at, w.win_end)): If a machine is currently down or a production log is still open (ended_at IS NULL), the query calculates real-time OEE up to the :window_end timestamp.
• Required Indexes: Add composite indexes on (workstation_id, started_at, ended_at) for downtime_logs and (work_order_id, start_time, end_time) for production_logs so range queries stay fast as logs grow.

To calculate Planned Production Time automatically without manually logging every lunch break or weekend, model your shifts as recurring weekly templates combined with an exception calendar for holidays and overtime.
This template-plus-exception pattern keeps your database lightweight while handling complex factory realities like overnight shifts (e.g., 10:00 PM to 6:00 AM) and workstation-specific schedules.

1. Database Schema (SQLite)

Add four lightweight tables to represent shift templates, scheduled breaks, workstation assignments, and calendar overrides:
sql
-- 1. Reusable shift definitions (e.g., "Day Shift", "Night Shift")
CREATE TABLE shift_templates (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,      -- "HH:MM:SS" (24h format, e.g., "06:00:00")
    duration_minutes INTEGER NOT NULL -- Using duration handles overnight shifts cleanly
);

-- 2. Recurring breaks inside a shift (excluded from Planned Production Time)
CREATE TABLE shift_breaks (
    id INTEGER PRIMARY KEY,
    shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,            -- e.g., "Lunch", "Morning Tea"
    offset_minutes INTEGER NOT NULL, -- Minutes after shift start (e.g., 240 = 4 hrs in)
    duration_minutes INTEGER NOT NULL
);

-- 3. Assigns shift templates to workstations by day of week
CREATE TABLE workstation_schedules (
    id INTEGER PRIMARY KEY,
    workstation_id INTEGER NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
    shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
    effective_from TEXT NOT NULL,  -- ISO Date "YYYY-MM-DD"
    effective_to TEXT              -- NULL if currently active
);

-- 4. Overrides for holidays, plant shutdowns, or weekend overtime
CREATE TABLE schedule_exceptions (
    id INTEGER PRIMARY KEY,
    workstation_id INTEGER REFERENCES workstations(id), -- NULL applies to entire factory
    exception_date TEXT NOT NULL,  -- ISO Date "YYYY-MM-DD"
    exception_type TEXT NOT NULL CHECK (exception_type IN ('HOLIDAY', 'OVERTIME')),
    shift_template_id INTEGER REFERENCES shift_templates(id), -- Required if OVERTIME
    notes TEXT
);
Use code with caution.

2. Why start_time + duration_minutes Beats end_time

In factories, 3rd Shift (Night Shift) starts at 22:00:00 on Tuesday and ends at 06:00:00 on Wednesday.
• Storing end_time = "06:00:00" makes end_time < start_time, which breaks standard SQL date math.
• Storing start_time = "22:00:00" and duration_minutes = 480 (with break offsets measured from shift start) lets you compute exact start and end timestamps cleanly:
	• Shift Start: unixepoch(date || 'T' || start_time)
	• Shift End: Shift Start + (duration_minutes * 60)

3. How to Calculate Planned Production Time

Because SQLite lacks a native procedural calendar generator for recurring rules with exceptions, expand the schedule in your backend application code (or materialize shift instances daily) using these four steps:
1. Generate Candidate Shifts: For a requested query range (window_start to window_end), loop through each calendar date (including 1 day prior to catch overnight shifts spilling into window_start) and fetch matching rows from workstation_schedules.
2. Apply Exceptions:
	• If a date has a HOLIDAY entry in schedule_exceptions (for that workstation or workstation_id IS NULL), discard the regular shift.
	• If a date has an OVERTIME entry, append that extra shift_template_id to the day's schedule.
3. Subtract Scheduled Breaks: For each active shift instance, subtract the duration_minutes of all linked rows in shift_breaks.
4. Clamp to the Query Window: If a user queries OEE from 08:00 to 12:00 during a 06:00–14:30 shift, calculate the overlap intersection between [window_start, window_end] and [shift_start, shift_end], minus any break intervals that fall inside that overlap.

4. Bonus: Materializing Shifts (Recommended Pattern)

Instead of recalculating recurring rules on every dashboard refresh, run a lightweight daily background job (cron) that expands the next 14 days of schedules into a concrete shift_instances table:
sql
CREATE TABLE shift_instances (
    id INTEGER PRIMARY KEY,
    workstation_id INTEGER NOT NULL REFERENCES workstations(id),
    shift_name TEXT NOT NULL,
    started_at TEXT NOT NULL,         -- Exact ISO-8601 timestamp
    ended_at TEXT NOT NULL,           -- Exact ISO-8601 timestamp
    planned_prod_sec INTEGER NOT NULL -- Pre-calculated: (duration - breaks) * 60
);
Use code with caution.
Why this works so well with SQLite:
• Instant OEE Queries: Your OEE SQL query simply joins workstations to shift_instances and sums planned_prod_sec—no complex date-recurrence math in SQL.
• Historical Accuracy: Changing a shift template next month won't accidentally rewrite last year's historical OEE reports.
• Clean Shift Dropdowns: Operators clocking in on a tablet can pick directly from today's active shift_instances.


To keep shop-floor tablet interactions fast, predictable, and safe against SQLite concurrency locks, design your REST API around state transitions (starting, reporting progress, pausing, and completing) rather than raw CRUD updates.

1. Core API Principles for Shop-Floor Logging

• Server-Generated Timestamps: Always capture start_time and end_time on the backend using UTC ISO-8601 strings rather than trusting tablet clocks, which can drift.
• Idempotency Keys: Require an Idempotency-Key header (UUID) on POST requests so if spotty factory Wi-Fi causes an operator's tablet to retry a submission, you don't double-count produced units or deduct raw materials twice.
• Atomic Transactions (BEGIN IMMEDIATE): Endpoints that modify inventory and production status simultaneously must execute inside a single immediate write transaction.

2. Production Logging Endpoints


A. Start a Production Run (Clock-In)

Opens a new production_logs entry (end_time = NULL) and sets the workstation status to RUNNING.
• Endpoint: POST /api/v1/work-orders/{wo_id}/runs/start
• Request Body:json
{
  "workstation_id": 4,
  "operator_id": 12
}
Use code with caution.
• Validation Rules: Reject with 409 Conflict if the workstation already has an active open production run or an active open downtime event.
• Response (201 Created):json
{
  "run_id": 891,
  "work_order_id": 45,
  "workstation_id": 4,
  "status": "IN_PROGRESS",
  "start_time": "2026-11-25T15:30:00Z"
}
Use code with caution.

B. Log Incremental Output / Scrap (Mid-Shift Heartbeat)

Allows operators or automated PLC counters to report good/scrap units during a long run without closing the session.
• Endpoint: POST /api/v1/production-runs/{run_id}/output
• Request Body:json
{
  "qty_good_delta": 25,
  "qty_scrap_delta": 2,
  "scrap_reason_code": "SCRAP_DIMENSION"
}
Use code with caution.
• Backend Action: Atomically increments qty_good and qty_scrap on production_logs, updates qty_completed on work_orders, and writes backflush deductions to inventory_txns for raw materials consumed.

C. Pause or Complete a Production Run

Closes the open production_logs record (end_time = NOW()), logs final units, and updates the work order status.
• Endpoint: POST /api/v1/production-runs/{run_id}/complete
• Request Body:json
{
  "qty_good": 140,
  "qty_scrap": 4,
  "mark_work_order_done": true
}
Use code with caution.
• Backend Action:
	1. Sets end_time on production_logs.
	2. Adds qty_good of the finished item to inventory_txns (txn_type = 'PRODUCTION_OUTPUT').
	3. Deducts (qty_good + qty_scrap) * bom_qty of raw materials from inventory_txns (txn_type = 'MATERIAL_CONSUMPTION').
	4. Sets workstation status back to IDLE.

3. Downtime Logging Endpoints


A. Report Machine Downtime (Start Stoppage)

Immediately flags a machine as down, automatically pausing any active production run on that workstation so Run Time and Stop Time never overlap.
• Endpoint: POST /api/v1/workstations/{ws_id}/downtime/start
• Request Body:json
{
  "reason_code": "MECH_JAM",
  "is_planned": false,
  "operator_id": 12,
  "notes": "Feeder belt jammed on line 2"
}
Use code with caution.
• Validation Rules: Reject with 409 Conflict if an open downtime record (ended_at IS NULL) already exists for ws_id.
• Response (201 Created):json
{
  "downtime_id": 304,
  "workstation_id": 4,
  "workstation_status": "DOWN",
  "started_at": "2026-11-25T16:10:00Z",
  "paused_run_id": 891
}
Use code with caution.

B. Resolve Downtime (Resume Machine)

Closes the open downtime event and sets the machine back to IDLE (or RUNNING if resuming a paused run).
• Endpoint: POST /api/v1/downtime/{downtime_id}/resolve
• Request Body:json
{
  "resolved_by_id": 19,
  "resolution_notes": "Cleared jam and recalibrated sensor",
  "resume_run_id": 891
}
Use code with caution.
• Backend Action: Sets ended_at = NOW(), calculates duration_seconds, and if resume_run_id is passed, opens a fresh production_logs segment so run intervals stay clean.

C. Log Historical / Retroactive Downtime

Used by supervisors to insert missed stoppages or adjust timestamps after a shift ends.
• Endpoint: POST /api/v1/workstations/{ws_id}/downtime/retroactive
• Request Body:json
{
  "reason_code": "CHANGEOVER",
  "is_planned": false,
  "started_at": "2026-11-25T14:00:00Z",
  "ended_at": "2026-11-25T14:25:00Z",
  "notes": "Tooling swap for SKU-402"
}
Use code with caution.
• Overlap Check Query: Before inserting, execute a check inside your transaction to prevent inflated downtime:sql
SELECT COUNT(*) FROM downtime_logs
WHERE workstation_id = :ws_id
  AND started_at < :new_ended_at
  AND COALESCE(ended_at, '9999-12-31T23:59:59Z') > :new_started_at;
Use code with caution.
If count > 0, return 422 Unprocessable Entity with the conflicting downtime ID.

4. Summary of Endpoints & HTTP Status Codes


Action	Method & Path	Key Side Effects
Start Run	POST /work-orders/{id}/runs/start	Sets machine RUNNING; creates open run log
Log Output	POST /production-runs/{id}/output	Increments counts; backflushes raw materials
End Run	POST /production-runs/{id}/complete	Closes run; adds finished goods to inventory
Start Stop	POST /workstations/{id}/downtime/start	Sets machine DOWN; auto-pauses open run
End Stop	POST /downtime/{id}/resolve	Closes downtime; optionally starts new run segment
Live OEE	GET /workstations/{id}/oee?start=...&end=...	Runs CTE aggregation query for dashboard



