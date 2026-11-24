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
  {
    id: 5,
    name: 'proposal layout per version',
    sql: [`ALTER TABLE proposal_text ADD COLUMN layout_json TEXT`],
  },
  {
    id: 6,
    name: 'who last changed a list price',
    sql: [`ALTER TABLE products ADD COLUMN updated_by INTEGER REFERENCES users(id)`],
  },
  {
    id: 7,
    name: 'version change lists and the active version',
    sql: [
      // What changed from the version it was based on, as readable lines.
      `ALTER TABLE quote_versions ADD COLUMN changes_json TEXT`,
      // The version the draft was last made from (saved, or made active).
      `ALTER TABLE quotes ADD COLUMN active_version_id INTEGER REFERENCES quote_versions(id)`,
    ],
  },
  {
    id: 8,
    name: 'deleting versions, and floor plans per community',
    sql: [
      // Saved versions stay unchangeable, but a rep can now delete one outright (the app removes its rows too).
      `DROP TRIGGER IF EXISTS quote_versions_frozen_delete`,
      // Floor plans uploaded for a deal's community (by the community's id in the draft), stored in chunks.
      `CREATE TABLE floor_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id),
        community_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        chunks INTEGER NOT NULL DEFAULT 0,
        complete INTEGER NOT NULL DEFAULT 0,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_floor_plans_quote ON floor_plans(quote_id, community_id)`,
      `CREATE TABLE floor_plan_chunks (
        floor_plan_id INTEGER NOT NULL REFERENCES floor_plans(id),
        idx INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (floor_plan_id, idx)
      )`,
    ],
  },
  {
    id: 9,
    name: 'floor plan notes, comments and read marks',
    sql: [
      // A note tagged at a spot on a floor plan page, with a box placed on the page (positions are 0–1 of the page).
      `CREATE TABLE plan_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id),
        floor_plan_id INTEGER NOT NULL REFERENCES floor_plans(id),
        number INTEGER NOT NULL,
        page INTEGER NOT NULL DEFAULT 1,
        x REAL NOT NULL,
        y REAL NOT NULL,
        box_x REAL NOT NULL,
        box_y REAL NOT NULL,
        box_w REAL NOT NULL,
        box_h REAL NOT NULL,
        body TEXT NOT NULL,
        room_type_id TEXT,
        color TEXT NOT NULL,
        on_plan INTEGER NOT NULL DEFAULT 1,
        author_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_plan_notes_plan ON plan_notes(floor_plan_id)`,
      // Comments on a note, or general comments on the plan (note_id null).
      `CREATE TABLE plan_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id),
        floor_plan_id INTEGER NOT NULL REFERENCES floor_plans(id),
        note_id INTEGER REFERENCES plan_notes(id),
        body TEXT NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_plan_comments_plan ON plan_comments(floor_plan_id, note_id)`,
      // What each user has read (kind 'note' or 'comment').
      `CREATE TABLE plan_reads (
        user_id INTEGER NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL CHECK (kind IN ('note','comment')),
        item_id INTEGER NOT NULL,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, kind, item_id)
      )`,
    ],
  },
  {
    id: 10,
    name: 'deal collaborators',
    sql: [
      // People the deal's owner lets edit parts of it: the inputs, Scope Mode (room types), the deliverables.
      `CREATE TABLE deal_collaborators (
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        can_inputs INTEGER NOT NULL DEFAULT 0,
        can_scope INTEGER NOT NULL DEFAULT 0,
        can_deliverables INTEGER NOT NULL DEFAULT 0,
        added_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (deal_id, user_id)
      )`,
      `CREATE INDEX idx_deal_collaborators_user ON deal_collaborators(user_id)`,
      // Deals created before owners were recorded go to the first admin, to hand out.
      `UPDATE deals SET owner_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1) WHERE owner_id IS NULL`,
    ],
  },
  {
    id: 11,
    name: 'notes on tagged rooms',
    sql: [
      // A note on one or more tagged rooms (Scope Mode badges, by their mark ids in the draft's room types).
      `CREATE TABLE tag_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id),
        mark_ids TEXT NOT NULL,
        body TEXT NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_tag_notes_quote ON tag_notes(quote_id)`,
    ],
  },
  {
    id: 12,
    name: 'room numbers read from floor plans',
    sql: [
      // What "Fill numbers from plan" read from the file (JSON: numbers and where they sit, by page), saved so it's read once.
      `ALTER TABLE floor_plans ADD COLUMN labels TEXT`,
    ],
  },
  {
    id: 13,
    name: 'deal details',
    sql: [
      // The deal's details (legal entity, geography, HubSpot link, signatories, projected close date) as JSON.
      `ALTER TABLE deals ADD COLUMN details TEXT`,
    ],
  },
  {
    id: 14,
    name: 'proposal comments',
    sql: [
      // Comments on a business case: on a page, a section of a page, or general (page null). Kept with the deal; the
      // version they were made on is noted. Replies point at their thread (parent_id).
      `CREATE TABLE proposal_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        version_id INTEGER REFERENCES quote_versions(id),
        version_no INTEGER,
        parent_id INTEGER REFERENCES proposal_comments(id),
        page TEXT,
        block TEXT,
        target_label TEXT,
        body TEXT NOT NULL,
        mentions TEXT NOT NULL DEFAULT '[]',
        author_id INTEGER NOT NULL REFERENCES users(id),
        resolved_at TEXT,
        resolved_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_proposal_comments_deal ON proposal_comments(deal_id, parent_id)`,
      // Mentions a user has read (for the Notifications panel).
      `CREATE TABLE comment_reads (
        user_id INTEGER NOT NULL REFERENCES users(id),
        comment_id INTEGER NOT NULL,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, comment_id)
      )`,
    ],
  },
  {
    id: 15,
    name: 'inputs comments',
    sql: [
      // 'deliverable' (the business case) or 'inputs' (the deal page; page = the input section's id). An inputs comment
      // made on unsaved changes has no version (shown as "draft").
      `ALTER TABLE proposal_comments ADD COLUMN area TEXT NOT NULL DEFAULT 'deliverable'`,
    ],
  },
  {
    id: 16,
    name: 'deal tasks and notifications',
    sql: [
      // Tasks on a deal: any number of assignees (or none), optional due date (no time) and priority.
      `CREATE TABLE deal_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        title TEXT NOT NULL,
        assignees TEXT NOT NULL DEFAULT '[]',
        priority TEXT CHECK (priority IN ('low','medium','high')),
        due_date TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        completed_at TEXT,
        completed_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_deal_tasks_deal ON deal_tasks(deal_id)`,
      // A user's notifications that aren't comments or plan notes: a task assigned to them, a task overdue
      // (step = 1, 2, 3 … for 3, 6, 9 … days past due).
      `CREATE TABLE user_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        kind TEXT NOT NULL,
        task_id INTEGER,
        step INTEGER NOT NULL DEFAULT 0,
        actor_id INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        read_at TEXT,
        UNIQUE (user_id, kind, task_id, step)
      )`,
      `CREATE INDEX idx_user_notifications_user ON user_notifications(user_id, read_at)`,
    ],
  },
  {
    id: 17,
    name: 'business case templates',
    sql: [
      // A business case layout and wording for a kind of reader (persona). No numbers: each deal fills it in.
      `CREATE TABLE bc_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        persona TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        edits_json TEXT NOT NULL DEFAULT '{}',
        layout_json TEXT NOT NULL DEFAULT '{}',
        owner_id INTEGER NOT NULL REFERENCES users(id),
        shared INTEGER NOT NULL DEFAULT 1,
        updated_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    id: 18,
    name: 'E-Call purchase prices from the pricing workbook',
    sql: [
      // Buying E-Call: $165 (Bluetooth) and $480 (Inovonics) per bed, where the price book still has the first figures.
      `UPDATE products SET list_price = 165 WHERE sku = 'CAPEX-ECALL-INSTALL-BLE' AND list_price = 115`,
      `UPDATE products SET list_price = 480 WHERE sku = 'CAPEX-ECALL-INSTALL-INOVONICS' AND list_price = 170`,
    ],
  },
  {
    id: 19,
    name: 'E-Call device price replaced by the system-specific device prices',
    sql: [`DELETE FROM products WHERE sku = 'ECALL-DEVICE'`],
  },
  {
    id: 20,
    name: 'proposal links shared with prospects',
    sql: [
      // One link per deal, showing one saved version, for the emails listed (and, optionally, a 6-digit code).
      `CREATE TABLE share_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deal_id INTEGER NOT NULL REFERENCES deals(id),
        version_id INTEGER NOT NULL REFERENCES quote_versions(id),
        token TEXT NOT NULL UNIQUE,
        expires_on TEXT NOT NULL,
        allow_comments INTEGER NOT NULL DEFAULT 1,
        allow_pdf INTEGER NOT NULL DEFAULT 1,
        access_code TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        revoked_at TEXT
      )`,
      `CREATE INDEX idx_share_links_deal ON share_links(deal_id)`,
      // Who may open it, and when they did.
      `CREATE TABLE share_link_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER NOT NULL REFERENCES share_links(id),
        email TEXT NOT NULL,
        first_opened_at TEXT,
        last_opened_at TEXT,
        views INTEGER NOT NULL DEFAULT 0,
        UNIQUE (link_id, email)
      )`,
      // A prospect's comment (author_id is then the deal's owner, for the joins; prospect_email says who wrote it).
      // Threads a prospect starts are shared: everyone on the link sees them and the team's replies.
      `ALTER TABLE proposal_comments ADD COLUMN prospect_email TEXT`,
      `ALTER TABLE proposal_comments ADD COLUMN prospect_name TEXT`,
      `ALTER TABLE proposal_comments ADD COLUMN share_link_id INTEGER`,
    ],
  },
  {
    id: 21,
    name: 'emails to prospects',
    sql: [
      // The share email: the proposal's name, the opening line ({first name} filled in) and an optional note.
      // verify_email: sign-in also needs a 6-digit code emailed to them (replaces the rep-sent access_code).
      `ALTER TABLE share_links ADD COLUMN proposal_name TEXT`,
      `ALTER TABLE share_links ADD COLUMN intro TEXT`,
      `ALTER TABLE share_links ADD COLUMN note TEXT`,
      `ALTER TABLE share_links ADD COLUMN verify_email INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE share_link_emails ADD COLUMN name TEXT`,
      `ALTER TABLE share_link_emails ADD COLUMN emailed_at TEXT`,
      `ALTER TABLE share_link_emails ADD COLUMN last_seen_at TEXT`,
      `ALTER TABLE share_link_emails ADD COLUMN mute_replies INTEGER NOT NULL DEFAULT 0`,
      // Sign-in codes (hashed), 10 minutes each.
      `CREATE TABLE share_link_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER NOT NULL REFERENCES share_links(id),
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_share_link_codes ON share_link_codes(link_id, email)`,
      // The team's replies and comments a prospect gets by email: held a few minutes so several go as one.
      // Items with the same email_id went (or will go) in one email; status: scheduled, seen (dropped), canceled.
      `CREATE TABLE prospect_mail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER NOT NULL REFERENCES share_links(id),
        email TEXT NOT NULL,
        comment_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        email_id TEXT,
        send_at TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_prospect_mail ON prospect_mail(link_id, email, status)`,
    ],
  },
];
