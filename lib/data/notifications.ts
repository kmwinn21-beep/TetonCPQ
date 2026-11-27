/**
 * Everything unread for one user across the deals they own or collaborate on: task notifications, business case and
 * inputs comments that @mention them, and floor plan notes/comments. For the sidebar's Notifications drawer.
 */
import type { Client } from '@libsql/client';
import { unreadPlanItems, markPlanItemsRead, type UnreadItem, type Viewer } from './planNotes';
import { markMentionsRead, unreadMentions, type MentionItem } from './proposalComments';
import { markTaskNotificationsRead, taskNotifications, todayIso, type TaskNotification } from './tasks';
import { markProspectNotificationsRead, prospectNotifications, type ProspectNotification } from './shareLinks';

export interface DealNotifications {
  quoteId: number;
  dealName: string;
  tasks: TaskNotification[];
  mentions: MentionItem[];
  plan: UnreadItem[];
  /** Prospects on the deal's shared link: their comments, and their first visits (the owner's). */
  prospect: ProspectNotification[];
}

async function myDeals(db: Client, v: Viewer): Promise<Array<{ quoteId: number; dealName: string }>> {
  const r = await db.execute({
    sql: `SELECT d.customer_name, (SELECT q.id FROM quotes q WHERE q.deal_id = d.id ORDER BY q.id LIMIT 1) AS quote_id FROM deals d
          WHERE d.archived_at IS NULL AND (d.owner_id = ? OR EXISTS (SELECT 1 FROM deal_collaborators c WHERE c.deal_id = d.id AND c.user_id = ?)
             OR EXISTS (SELECT 1 FROM proposal_comments c WHERE c.deal_id = d.id AND EXISTS (SELECT 1 FROM json_each(c.mentions) j WHERE j.value = ?))
             OR EXISTS (SELECT 1 FROM user_notifications n WHERE n.deal_id = d.id AND n.user_id = ?))
          ORDER BY d.customer_name`,
    args: [v.id, v.id, v.id, v.id],
  });
  return r.rows.filter((x) => x.quote_id != null).map((x) => ({ quoteId: Number(x.quote_id), dealName: String(x.customer_name ?? '') }));
}

/** Unread items per deal (deals with nothing unread left out), and the total. */
export async function allNotifications(db: Client, v: Viewer, today = todayIso()): Promise<{ deals: DealNotifications[]; total: number }> {
  const tasks = await taskNotifications(db, v, undefined, today);
  const deals: DealNotifications[] = [];
  for (const d of await myDeals(db, v)) {
    const [mentions, plan, prospect] = await Promise.all([unreadMentions(db, d.quoteId, v), unreadPlanItems(db, d.quoteId, v), prospectNotifications(db, v.id, d.quoteId)]);
    const t = tasks.filter((x) => x.quoteId === d.quoteId);
    if (t.length || mentions.length || plan.length || prospect.length) deals.push({ ...d, tasks: t, mentions, plan, prospect });
  }
  return { deals, total: deals.reduce((s, d) => s + d.tasks.length + d.mentions.length + d.plan.length + d.prospect.length, 0) };
}

export interface ReadRequest {
  all?: boolean;
  quoteId?: number;
  tasks?: number[];
  mentions?: number[];
  plan?: Array<{ kind: string; id: number }>;
  prospect?: number[];
}
/** Marks items read: listed ones (plan items need their deal), one deal's everything, or everything. */
export async function markNotificationsRead(db: Client, v: Viewer, b: ReadRequest): Promise<void> {
  if (b.all) {
    const quotes = b.quoteId ? [b.quoteId] : (await myDeals(db, v)).map((d) => d.quoteId);
    await markTaskNotificationsRead(db, v, 'all', b.quoteId);
    for (const q of quotes) {
      await markMentionsRead(db, q, v, 'all');
      await markPlanItemsRead(db, q, v, 'all');
    }
    return;
  }
  if (b.tasks?.length) await markTaskNotificationsRead(db, v, b.tasks);
  if (b.mentions?.length && b.quoteId) await markMentionsRead(db, b.quoteId, v, b.mentions);
  if (b.plan?.length && b.quoteId) await markPlanItemsRead(db, b.quoteId, v, b.plan);
  if (b.prospect?.length) await markProspectNotificationsRead(db, v.id, b.prospect);
}
