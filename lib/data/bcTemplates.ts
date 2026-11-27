/**
 * Business case templates (see lib/proposal/templates). Anyone creates them; a template shared with everyone can be
 * edited by anyone, a private one only by its owner. Its owner or an admin deletes it. Applying one formats a
 * version's business case; the template is copied in, so later edits to it don't change that business case.
 */
import { allowed } from '@/lib/auth/permissions';
import type { Client, Row } from '@libsql/client';
import { initialsOf, type Person, type Viewer } from './planNotes';
import { getProposalCustomization, saveProposalCustomization, type ProposalCustomization } from './proposalText';
import { getVersion } from './quotes';
import { sanitizeEdits } from '@/lib/proposal/text';
import { sanitizeLayout, DEFAULT_LAYOUT } from '@/lib/proposal/layout';
import { cleanRichText } from '@/lib/proposal/richText';
import { applyTemplate, dealVars, INCLUDE_ALL, TEMPLATE_LAYOUT_KEYS, templateFrom, templatePages, type ApplyMode, type Include, type TemplateContent } from '@/lib/proposal/templates';

export interface BcTemplate extends TemplateContent {
  id: number;
  name: string;
  persona: string;
  description: string;
  shared: boolean;
  owner: Person;
  updatedBy: Person | null;
  updatedAt: string;
  /** Business cases currently formatted from it. */
  usage: number;
  pages: number | null;
  canEdit: boolean;
  canDelete: boolean;
}
export interface TemplateMeta {
  name?: string;
  persona?: string;
  description?: string;
  shared?: boolean;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const person = (id: unknown, name: unknown): Person => ({ id: Number(id), name: String(name ?? 'Someone'), initials: initialsOf(String(name ?? '')) });
const txt = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Only the template parts of a layout, cleaned. */
function cleanContent(input: { edits?: unknown; layout?: unknown }): TemplateContent {
  const edits = Object.fromEntries(Object.entries(sanitizeEdits(input.edits ?? {})).filter(([k]) => k.startsWith('bc.')));
  const full = sanitizeLayout({ ...structuredClone(DEFAULT_LAYOUT), ...((input.layout as object) ?? {}) }, cleanRichText) as unknown as Record<string, unknown>;
  const layout: Record<string, unknown> = {};
  for (const k of TEMPLATE_LAYOUT_KEYS) {
    const v = full[k];
    if (v === undefined || v === null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)) continue;
    layout[k] = v;
  }
  return { edits, layout };
}

const SELECT = `SELECT t.*, o.name AS owner_name, u.name AS updated_name,
  (SELECT COUNT(*) FROM proposal_text p WHERE json_extract(p.layout_json, '$.bcTemplate.id') = t.id) AS usage
  FROM bc_templates t JOIN users o ON o.id = t.owner_id LEFT JOIN users u ON u.id = t.updated_by`;

function toTemplate(x: Row, v: Viewer): BcTemplate {
  let content: TemplateContent = { edits: {}, layout: {} };
  try {
    content = { edits: JSON.parse(String(x.edits_json)), layout: JSON.parse(String(x.layout_json)) };
  } catch {
    /* keep empty */
  }
  const mine = Number(x.owner_id) === v.id;
  const shared = Number(x.shared) === 1;
  return {
    id: Number(x.id),
    name: String(x.name),
    persona: String(x.persona ?? ''),
    description: String(x.description ?? ''),
    shared,
    owner: person(x.owner_id, x.owner_name),
    updatedBy: x.updated_by == null ? null : person(x.updated_by, x.updated_name),
    updatedAt: String(x.updated_at),
    usage: Number(x.usage ?? 0),
    pages: templatePages(content),
    canEdit: mine || shared || allowed(v, 'templates.manage'),
    canDelete: mine || allowed(v, 'templates.manage'),
    ...content,
  };
}

/** Templates the viewer can use: shared ones and their own. */
export async function listTemplates(db: Client, v: Viewer): Promise<BcTemplate[]> {
  const r = await db.execute({ sql: `${SELECT} WHERE t.shared = 1 OR t.owner_id = ? ORDER BY t.persona, t.name`, args: [v.id] });
  return r.rows.map((x) => toTemplate(x, v));
}

export async function getTemplate(db: Client, id: number, v: Viewer): Promise<BcTemplate> {
  const r = await db.execute({ sql: `${SELECT} WHERE t.id = ? AND (t.shared = 1 OR t.owner_id = ? OR ? = 1)`, args: [id, v.id, allowed(v, 'templates.manage') ? 1 : 0] });
  if (!r.rows.length) throw httpError('Template not found', 404);
  return toTemplate(r.rows[0], v);
}

function cleanMeta(m: TemplateMeta, partial: boolean) {
  const out: { name?: string; persona?: string; description?: string; shared?: boolean } = {};
  if (!partial || m.name !== undefined) {
    out.name = txt(m.name, 80);
    if (!out.name) throw httpError('Give the template a name', 400);
  }
  if (!partial || m.persona !== undefined) out.persona = txt(m.persona, 40);
  if (!partial || m.description !== undefined) out.description = txt(m.description, 300);
  if (!partial || m.shared !== undefined) out.shared = m.shared !== false;
  return out;
}

async function insert(db: Client, v: Viewer, meta: TemplateMeta, content: TemplateContent): Promise<number> {
  if (!allowed(v, 'templates.create')) throw httpError('You don’t have permission to create templates', 403);
  const m = cleanMeta(meta, false);
  // Without permission to share with everyone, a new template is saved for its owner only.
  if (!allowed(v, 'templates.share')) m.shared = false;
  const r = await db.execute({
    sql: 'INSERT INTO bc_templates (name, persona, description, edits_json, layout_json, owner_id, shared, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    args: [m.name!, m.persona!, m.description!, JSON.stringify(content.edits), JSON.stringify(content.layout), v.id, m.shared ? 1 : 0, v.id],
  });
  return Number(r.rows[0].id);
}

/** A new template: blank (the standard business case) or with the given layout and wording. */
export async function createTemplate(db: Client, v: Viewer, meta: TemplateMeta, content?: { edits?: unknown; layout?: unknown }): Promise<number> {
  return insert(db, v, meta, content ? cleanContent(content) : { edits: {}, layout: {} });
}

/** A template from a version's business case, deal names and counts swapped for placeholders. */
export async function templateFromVersion(db: Client, versionId: number, v: Viewer, meta: TemplateMeta, include: Include = INCLUDE_ALL, current?: { edits?: unknown; layout?: unknown }): Promise<number> {
  const ver = await getVersion(db, versionId);
  if (!ver) throw httpError('Version not found', 404);
  // What's on screen (it may not have finished saving yet), or what's stored.
  const c = current?.layout !== undefined ? { edits: sanitizeEdits(current.edits ?? {}), layout: sanitizeLayout(current.layout, cleanRichText) } : await getProposalCustomization(db, versionId);
  return insert(db, v, meta, cleanContent(templateFrom(c.edits, c.layout, dealVars(ver.inputs), include)));
}

export async function updateTemplate(db: Client, id: number, v: Viewer, input: TemplateMeta & { edits?: unknown; layout?: unknown }): Promise<void> {
  const t = await getTemplate(db, id, v);
  if (!t.canEdit) throw httpError('Only its owner can change a private template', 403);
  if (input.shared !== undefined && t.owner.id !== v.id && !allowed(v, 'templates.manage')) throw httpError('Only its owner can change who can use it', 403);
  if (input.shared === true && !t.shared && !allowed(v, 'templates.share')) throw httpError('You don’t have permission to share templates with everyone', 403);
  const m = cleanMeta(input, true);
  const content = input.edits !== undefined || input.layout !== undefined ? cleanContent({ edits: input.edits ?? t.edits, layout: input.layout ?? t.layout }) : null;
  await db.execute({
    sql: `UPDATE bc_templates SET name = ?, persona = ?, description = ?, shared = ?, edits_json = ?, layout_json = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [m.name ?? t.name, m.persona ?? t.persona, m.description ?? t.description, (m.shared ?? t.shared) ? 1 : 0, JSON.stringify(content?.edits ?? t.edits), JSON.stringify(content?.layout ?? t.layout), v.id, id],
  });
}

export async function duplicateTemplate(db: Client, id: number, v: Viewer): Promise<number> {
  const t = await getTemplate(db, id, v);
  return insert(db, v, { name: `${t.name} (copy)`.slice(0, 80), persona: t.persona, description: t.description, shared: false }, { edits: t.edits, layout: t.layout });
}

export async function deleteTemplate(db: Client, id: number, v: Viewer): Promise<void> {
  const t = await getTemplate(db, id, v);
  if (!t.canDelete) throw httpError('Only its owner or an admin can delete this template', 403);
  await db.execute({ sql: 'DELETE FROM bc_templates WHERE id = ?', args: [id] });
}

/** Format a version's business case from a template: everything, or just its layout (keeping the deal's wording). */
export async function applyTemplateToVersion(db: Client, versionId: number, templateId: number, mode: ApplyMode, v: Viewer): Promise<ProposalCustomization> {
  const t = await getTemplate(db, templateId, v);
  const current = await getProposalCustomization(db, versionId);
  const next = applyTemplate(current, t, mode, { id: t.id, name: t.name });
  return saveProposalCustomization(db, versionId, next, v.id);
}
