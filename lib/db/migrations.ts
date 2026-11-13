/**
 * Schema migrations, applied in order, each exactly once (tracked in
 * _migrations). Append new ones; never edit one that has shipped.
 *
 * Money is stored in dollars (REAL) to match the engine; quote versions store
 * the full inputs and outputs as JSON so a sent quote never changes.
 */
export const MIGRATIONS: Array<{ id: number; name: string; sql: string[] }> = [
  {
    id: 1,
    name: 'initial schema',
    sql: [
      `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('rep','deal_desk','vp_sales','ceo','admin')),
        password_hash TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE deals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        owner_id INTEGER REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','archived')),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        name TEXT NOT NULL DEFAULT 'Proposal',
        presentation TEXT NOT NULL DEFAULT 'opex' CHECK (presentation IN ('opex','capex','both')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE quote_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id),
        version_no INTEGER NOT NULL,
        parent_version_id INTEGER REFERENCES quote_versions(id),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved','sent','superseded')),
        roi_case TEXT,
        engine_version TEXT,
        inputs_json TEXT NOT NULL,
        outputs_json TEXT,
        guardrail_json TEXT,
        inputs_hash TEXT,
        change_note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        saved_at TEXT,
        sent_at TEXT,
        sent_to TEXT,
        UNIQUE (quote_id, version_no)
      )`,
      // A saved version is frozen: its inputs, outputs and number can never change, and it can't be deleted.
      // Only status / sent fields may move (e.g. saved → sent).
      `CREATE TRIGGER quote_versions_frozen_update
        BEFORE UPDATE ON quote_versions
        WHEN OLD.status <> 'draft' AND (
          NEW.inputs_json IS NOT OLD.inputs_json OR NEW.outputs_json IS NOT OLD.outputs_json OR
          NEW.guardrail_json IS NOT OLD.guardrail_json OR NEW.engine_version IS NOT OLD.engine_version OR
          NEW.version_no IS NOT OLD.version_no OR NEW.quote_id IS NOT OLD.quote_id OR NEW.status = 'draft')
        BEGIN SELECT RAISE(ABORT, 'quote version is frozen'); END`,
      `CREATE TRIGGER quote_versions_frozen_delete
        BEFORE DELETE ON quote_versions
        WHEN OLD.status <> 'draft'
        BEGIN SELECT RAISE(ABORT, 'quote version is frozen'); END`,
      `CREATE UNIQUE INDEX one_draft_per_quote ON quote_versions(quote_id) WHERE status = 'draft'`,
      // Communities as quoted in a saved version (the draft keeps them in inputs_json).
      `CREATE TABLE communities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_version_id INTEGER NOT NULL REFERENCES quote_versions(id),
        position INTEGER NOT NULL,
        name TEXT NOT NULL,
        market TEXT,
        beds INTEGER NOT NULL,
        snf_beds INTEGER NOT NULL DEFAULT 0,
        coverage TEXT NOT NULL CHECK (coverage IN ('rooms_only','full_facility')),
        ecall INTEGER NOT NULL DEFAULT 0,
        is_pilot INTEGER NOT NULL DEFAULT 0,
        pilot_units INTEGER,
        occupancy REAL,
        go_live_month TEXT,
        roi_delay_months INTEGER,
        additional_sensors INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE quote_version_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_version_id INTEGER NOT NULL REFERENCES quote_versions(id),
        community_position INTEGER,
        sku TEXT NOT NULL,
        description TEXT,
        qty REAL NOT NULL,
        unit_list REAL NOT NULL,
        unit_net REAL NOT NULL,
        billing TEXT NOT NULL CHECK (billing IN ('monthly','one_time')),
        start_month INTEGER,
        term_months INTEGER,
        concession_code TEXT
      )`,
      `CREATE TABLE products (
        sku TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pricing_model TEXT NOT NULL CHECK (pricing_model IN ('per_bed_month','per_bed_once','per_unit_once','per_unit_month','multiplier')),
        list_price REAL NOT NULL,
        description TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE assumptions (
        key TEXT NOT NULL,
        roi_case TEXT,
        value REAL NOT NULL,
        label TEXT,
        unit TEXT,
        effective_from TEXT NOT NULL DEFAULT (date('now')),
        updated_by INTEGER REFERENCES users(id),
        PRIMARY KEY (key, roi_case, effective_from)
      )`,
      `CREATE TABLE approval_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_version_id INTEGER NOT NULL REFERENCES quote_versions(id),
        rule_code TEXT NOT NULL,
        required_role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','withdrawn')),
        requested_by INTEGER REFERENCES users(id),
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        decided_by INTEGER REFERENCES users(id),
        decided_at TEXT,
        note TEXT,
        evidence_url TEXT
      )`,
      `CREATE TABLE proposal_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_version_id INTEGER NOT NULL REFERENCES quote_versions(id),
        html_snapshot TEXT NOT NULL,
        template_version TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_quotes_deal ON quotes(deal_id)`,
      `CREATE INDEX idx_versions_quote ON quote_versions(quote_id, version_no)`,
      `CREATE INDEX idx_communities_version ON communities(quote_version_id)`,
    ],
  },
  {
    id: 2,
    name: 'who saved and sent each version',
    sql: [
      `ALTER TABLE quote_versions ADD COLUMN saved_by INTEGER REFERENCES users(id)`,
      `ALTER TABLE quote_versions ADD COLUMN sent_by INTEGER REFERENCES users(id)`,
      `CREATE INDEX idx_deals_owner ON deals(owner_id)`,
    ],
  },
  {
    id: 3,
    name: 'beds by care type',
    sql: [
      `ALTER TABLE communities ADD COLUMN il_beds INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE communities ADD COLUMN al_beds INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE communities ADD COLUMN mc_beds INTEGER NOT NULL DEFAULT 0`,
      // Rows saved before the split: their single count was AL.
      `UPDATE communities SET al_beds = beds WHERE il_beds = 0 AND al_beds = 0 AND mc_beds = 0`,
    ],
  },
  {
    id: 4,
    name: 'proposal wording edits per version',
    sql: [
      `CREATE TABLE proposal_text (
        quote_version_id INTEGER PRIMARY KEY REFERENCES quote_versions(id),
        edits_json TEXT NOT NULL DEFAULT '{}',
        updated_by INTEGER REFERENCES users(id),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
];
