/**
 * Emails to prospects: the proposal shared with them, the team's replies and comments (batched), and the sign-in
 * code. Table layout with inline styles (what email clients render), and a plain-text version of each.
 */

export const DEFAULT_INTRO = 'Hey {first name} - here is your proposal from Teton!';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const para = (s: string) => esc(s).replace(/\r?\n/g, '<br>');
const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? '?').slice(0, 1)).toUpperCase();
};
export const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const longDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const when = (iso: string) => {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
};

/**
 * A prospect's first name: the one the rep gave, else from their email when it reads like one ("dana.lee@…" →
 * "Dana"); null when there's no telling.
 */
export function firstNameOf(name: string | null | undefined, email: string): string | null {
  if (name && name.trim()) return firstWord(name);
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const f = parts[0];
  return /^[a-z]{2,}$/i.test(f) ? f[0].toUpperCase() + f.slice(1).toLowerCase() : null;
}
/** "Hey Dana", or "Hey there" without a name. */
const hey = (first: string | null) => `Hey ${first ?? 'there'}`;
/** The opening line with {first name} filled in (or "there"). */
export const fillIntro = (intro: string | null | undefined, first: string | null) => (intro?.trim() || DEFAULT_INTRO).replace(/\{first name\}/gi, first ?? 'there');

const FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const C = { ink: '#1E2228', body: '#4A5260', muted: '#8A919C', line: '#ECEEF1', coral: '#D9553F', cream: '#F4F1EC', blue: '#1F5FB5' };

interface Layout {
  baseUrl: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  lede: string;
  /** HTML blocks between the lede and the button. */
  body: string;
  cta?: { label: string; url: string };
  /** HTML under the button (access note). */
  after?: string;
  sentBy?: string | null;
  footer: string;
  /** Tag the parts a rep can edit (data-part="intro" / "name" / "note"), for the Share dialog's live preview. */
  marks?: boolean;
}

function layout(l: Layout): string {
  const sent = l.sentBy
    ? `<tr><td style="padding:24px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #F1EEE7"><tr><td style="padding-top:16px;font:600 11px ${FONT};letter-spacing:.6px;text-transform:uppercase;color:${C.muted};white-space:nowrap;width:1%">Sent by:</td>
       <td style="padding:16px 0 0 10px;width:28px"><div style="width:28px;height:28px;border-radius:14px;background:${C.ink};color:#fff;text-align:center;font:700 10.5px/28px ${FONT}">${esc(initials(l.sentBy))}</div></td>
       <td style="padding:16px 0 0 10px;font:400 12.5px ${FONT};color:#5A6270">${esc(l.sentBy)} · Teton</td></tr></table></td></tr>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(l.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.cream}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}"><tr><td align="center" style="padding:28px 12px 32px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #ECE7DF;border-radius:14px">
<tr><td style="padding:30px 34px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font:700 19px ${FONT};color:${C.ink}"><img src="${l.baseUrl}/teton-logo.png" width="24" height="24" alt="" style="vertical-align:-5px;margin-right:8px;border:0">Teton</td></tr>
<tr><td style="padding:26px 0 6px;font:800 10.5px ${FONT};letter-spacing:2.5px;text-transform:uppercase;color:${C.coral}">${esc(l.eyebrow)}</td></tr>
<tr><td style="font:600 23px/1.25 ${FONT};color:${C.ink}">${esc(l.heading)}</td></tr>
<tr><td${l.marks ? ' data-part="intro"' : ''} style="padding-top:10px;font:400 15px/1.55 ${FONT};color:${C.body}">${para(l.lede)}</td></tr>
${l.body}
${l.cta ? `<tr><td align="center" style="padding-top:24px"><a href="${esc(l.cta.url)}" style="display:inline-block;background:${C.ink};color:#ffffff;text-decoration:none;font:600 14.5px ${FONT};padding:13px 28px;border-radius:11px">${esc(l.cta.label)}</a></td></tr>` : ''}
${l.after ?? ''}
${sent}
</table></td></tr></table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td align="center" style="padding:16px 12px 0;font:400 11.5px/1.6 ${FONT};color:${C.muted}">${l.footer}</td></tr></table>
</td></tr></table></body></html>`;
}

const box = (inner: string, top = 20) => `<tr><td style="padding-top:${top}px">${inner}</td></tr>`;
const accessNote = (lines: string[]) =>
  `<tr><td style="padding-top:18px"><div style="background:#F6F7F9;border-radius:10px;padding:12px 14px;font:400 12.5px/1.55 ${FONT};color:${C.body}">${lines.join('<br>')}</div></td></tr>`;

// ---------------------------------------------------------------- the proposal shared with them

export interface ShareEmailInput {
  baseUrl: string;
  url: string;
  email: string;
  first: string | null;
  repName: string;
  proposalName: string;
  intro?: string | null;
  note?: string | null;
  preparedOn?: string | null;
  allowComments: boolean;
  allowPdf: boolean;
  verify: boolean;
  expiresOn: string;
  /** For the live preview: tag the editable parts. */
  marks?: boolean;
}
export function shareEmail(i: ShareEmailInput) {
  const lede = fillIntro(i.intro, i.first);
  const note = i.note?.trim();
  const can = [
    ['✓', 'Read it online, on any device'],
    ...(i.allowComments ? [['💬', `Comment on any page or section; ${firstWord(i.repName)} is notified`]] : []),
    ...(i.allowPdf ? [['⤓', 'Download a PDF']] : []),
  ];
  const body =
    (note ? box(`<div${i.marks ? ' data-part="note"' : ''} style="background:#FBF8F3;border-left:3px solid ${C.coral};border-radius:12px;padding:14px 16px"><div style="font:700 11px ${FONT};letter-spacing:.8px;text-transform:uppercase;color:${C.muted};padding-bottom:4px">A note from ${esc(firstWord(i.repName))}</div><div style="font:400 14px/1.55 ${FONT};color:#2A2F36">${para(note)}</div></div>`) : '') +
    box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px"><tr>
      <td style="padding:14px 0 14px 16px;width:62px"><img src="${i.baseUrl}/email-proposal.png" width="62" height="80" alt="" style="display:block;border:0;border-radius:6px"></td>
      <td${i.marks ? ' data-part="name"' : ''} style="padding:14px 16px;font:600 15px/1.35 ${FONT};color:${C.ink}">${esc(i.proposalName)}${i.preparedOn ? `<div style="font:400 12.5px ${FONT};color:#6B7380;padding-top:3px">Prepared ${esc(longDay(i.preparedOn))}</div>` : ''}</td></tr></table>`) +
    box(can.map(([ic, t]) => `<div style="font:400 13.5px/1.5 ${FONT};color:#3A3F47;padding-top:6px"><span style="display:inline-block;width:20px;color:${C.blue}">${ic}</span>${esc(t)}</div>`).join(''), 14);
  const after = accessNote([
    `To open it, enter this email: <b style="color:${C.ink}">${esc(i.email)}</b>.${i.verify ? ' We’ll email you a 6-digit code to confirm it’s you.' : ''}`,
    `The link is open until <b style="color:${C.ink}">${esc(longDay(i.expiresOn))}</b>.`,
  ]);
  const subject = `${i.repName} shared a proposal with you: ${i.proposalName}`;
  const html = layout({
    baseUrl: i.baseUrl,
    preheader: `${lede} Open it to read and comment.`,
    eyebrow: 'Proposal',
    heading: `${i.repName} shared a proposal with you`,
    lede,
    body,
    cta: { label: 'Open the proposal', url: i.url },
    after,
    sentBy: i.repName,
    marks: i.marks,
    footer: `You’re getting this because ${esc(i.repName)} at Teton shared a proposal with this address.<br>Questions? Reply to this email to reach ${esc(firstWord(i.repName))}.`,
  });
  const text = [
    lede,
    '',
    ...(note ? [`A note from ${firstWord(i.repName)}:`, note, ''] : []),
    `${i.proposalName}`,
    `Open the proposal: ${i.url}`,
    '',
    `To open it, enter this email: ${i.email}.${i.verify ? ' We’ll email you a 6-digit code to confirm it’s you.' : ''}`,
    `The link is open until ${longDay(i.expiresOn)}.`,
    '',
    `Sent by ${i.repName} · Teton`,
  ].join('\n');
  return { subject, html, text };
}

// ---------------------------------------------------------------- the team's replies and comments

export interface CommentEmailItem {
  kind: 'reply' | 'comment';
  /** What it's on ("The pilot · Pilot costs", "Whole proposal"). */
  label: string;
  /** Replies: the prospect's comment the thread started with ("You" when it's theirs). */
  original?: { who: string; initials: string; body: string; at: string } | null;
  messages: Array<{ author: string; body: string; at: string }>;
}
export interface CommentEmailInput {
  baseUrl: string;
  url: string;
  first: string | null;
  /** (Their initials, for their own comment.) */
  firstInitials?: string;
  repName: string;
  proposalName: string;
  items: CommentEmailItem[];
  unsubscribeUrl: string;
}
export function commentEmail(i: CommentEmailInput) {
  const replies = i.items.some((x) => x.kind === 'reply');
  const comments = i.items.filter((x) => x.kind === 'comment').length;
  const rep = firstWord(i.repName);
  const lede = replies && comments
    ? `${hey(i.first)} - ${rep} replied to the comment you made on your proposal, and added ${comments === 1 ? 'a comment' : 'comments'}.`
    : replies
      ? `${hey(i.first)} - ${rep} replied to the comment you made on your proposal.`
      : `${hey(i.first)} - ${rep} added ${comments === 1 ? 'a comment' : 'comments'} to your proposal.`;
  const heading = replies && comments ? `${i.repName} replied and added ${comments === 1 ? 'a comment' : 'comments'}` : replies ? `${i.repName} replied to your comment` : `${i.repName} added ${comments === 1 ? 'a comment' : 'comments'}`;
  const subject = replies ? `${i.repName} replied to your comment on ${i.proposalName}` : `${i.repName} added ${comments === 1 ? 'a comment' : 'comments'} to ${i.proposalName}`;
  const msg = (who: string, ini: string, body: string, at: string, team: boolean) =>
    `<tr><td style="padding:14px 16px;${team ? 'background:#F6FAF7;' : ''}border-top:1px solid #F1F2F4"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="width:32px;vertical-align:top"><div style="width:32px;height:32px;border-radius:16px;text-align:center;font:700 11px/32px ${FONT};${team ? `background:${C.ink};color:#fff` : 'background:#E7E2FB;color:#6A5BC7'}">${esc(ini)}</div></td>
      <td style="padding-left:12px;vertical-align:top"><div style="font:600 13px ${FONT};color:${C.ink}">${esc(who)}${team ? ` <span style="font:800 9.5px ${FONT};letter-spacing:.5px;text-transform:uppercase;background:#EEF8F1;color:#1F6B3A;border-radius:99px;padding:2px 7px">Teton</span>` : ''} <span style="font:400 12px ${FONT};color:#9AA1AB">${esc(when(at))}</span></div>
      <div style="font:400 14px/1.5 ${FONT};color:${team ? '#2A2F36' : '#5A6270'};padding-top:4px">${para(body)}</div></td></tr></table></td></tr>`;
  const body = i.items
    .map(
      (it) =>
        `<tr><td style="padding:22px 0 8px;font:700 11px ${FONT};letter-spacing:.8px;text-transform:uppercase;color:${C.muted}">On <span style="text-transform:none;letter-spacing:0;font:600 12.5px ${FONT};color:${C.blue}">${esc(it.label)}</span></td></tr>` +
        `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;border-collapse:separate;overflow:hidden">` +
        (it.original ? msg(it.original.who, it.original.initials, it.original.body, it.original.at, false).replace('border-top:1px solid #F1F2F4', '') : '') +
        it.messages.map((m, k) => {
          const h = msg(m.author, initials(m.author), m.body, m.at, true);
          return !it.original && k === 0 ? h.replace('border-top:1px solid #F1F2F4', '') : h;
        }).join('') +
        `</table></td></tr>`,
    )
    .join('');
  const html = layout({
    baseUrl: i.baseUrl,
    preheader: i.items[0]?.messages[0]?.body.slice(0, 120) ?? lede,
    eyebrow: replies ? 'New reply' : 'New comment',
    heading,
    lede,
    body,
    cta: { label: 'View and/or Reply', url: i.url },
    sentBy: i.repName,
    footer: `You’re getting this because ${esc(i.repName)} shared a proposal with you.<br>Reply in the proposal so the whole thread stays together. <a href="${esc(i.unsubscribeUrl)}" style="color:#6B7380">Stop these emails</a>`,
  });
  const text = [
    lede,
    '',
    ...i.items.flatMap((it) => [`On ${it.label}:`, ...(it.original ? [`${it.original.who}: ${it.original.body}`] : []), ...it.messages.map((m) => `${m.author} (Teton): ${m.body}`), '']),
    `View and/or Reply: ${i.url}`,
    '',
    `Sent by ${i.repName} · Teton`,
    `Stop these emails: ${i.unsubscribeUrl}`,
  ].join('\n');
  return { subject, html, text };
}

// ---------------------------------------------------------------- the sign-in code

export function codeEmail(i: { baseUrl: string; first: string | null; code: string; proposalName: string; repName: string }) {
  const lede = `${hey(i.first)} - here’s your code to open ${i.proposalName}.`;
  const html = layout({
    baseUrl: i.baseUrl,
    preheader: `Your code is ${i.code}. It works for 10 minutes.`,
    eyebrow: 'Your code',
    heading: i.code.split('').join(' '),
    lede,
    body: box(`<div style="font:400 13.5px/1.55 ${FONT};color:${C.body}">Enter it on the page you just came from. It works for 10 minutes.<br>If you didn’t ask for it, you can ignore this email.</div>`, 14),
    sentBy: i.repName,
    footer: 'You’re getting this because someone entered this email to open a proposal from Teton.',
  });
  return { subject: `Your code to open ${i.proposalName}: ${i.code}`, html, text: `${lede}\n\nYour code: ${i.code}\nIt works for 10 minutes. If you didn’t ask for it, you can ignore this email.` };
}

// ---------------------------------------------------------------- to the deal's owner: the agreement was requested

export interface AgreementEmailInput {
  baseUrl: string;
  /** Opens the deal (its details). */
  url: string;
  who: string;
  first: string | null;
  dealName: string;
  ownerName: string;
  payload: import('@/lib/data/agreements').AgreementPayload;
}
export function agreementEmail(i: AgreementEmailInput) {
  const p = i.payload;
  const them = i.first ?? 'They';
  const pill = (bg: string, fg: string, t: string) => `<span style="display:inline-block;background:${bg};color:${fg};border-radius:999px;padding:3px 9px;font:600 12px ${FONT};white-space:nowrap">${t}</span>`;
  const status = (s: string) => (s === 'confirmed' ? pill('#DDF3E5', '#256B41', '✓ Confirmed') : s === 'updated' ? pill('#EEF5FE', '#1F5FB5', '✎ Updated') : pill('#F1F2F4', C.muted, 'Not confirmed'));
  const lab = (t: string) => `<div style="font:700 10.5px ${FONT};letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};padding-bottom:2px">${t}</div>`;
  const was = (t: string) => (t ? ` <span style="color:${C.muted};text-decoration:line-through">${esc(t)}</span>` : '');
  const sig = p.signatory.value;
  const sigWas = p.signatory.was;
  const sigHtml = sig
    ? `${esc(`${sig.first} ${sig.last}`.trim())}${sig.title ? ` · <b style="color:${C.ink}">${esc(sig.title)}</b>` : ''}${p.signatory.status === 'updated' && sigWas && sigWas.title !== sig.title ? was(sigWas.title) : ''}${sig.email ? `<br>${esc(sig.email)}` : ''}${p.signatory.status === 'updated' && sigWas && sigWas.email !== sig.email ? `<br>${was(sigWas.email)}` : ''}${p.signatory.status === 'updated' && sigWas && `${sigWas.first} ${sigWas.last}` !== `${sig.first} ${sig.last}` ? `<br><span style="color:${C.muted}">Was ${esc(`${sigWas.first} ${sigWas.last}`.trim())}</span>` : ''}`
    : `<span style="color:${C.muted}">Not given</span>`;
  const coms = p.communities.list.length
    ? p.communities.list
        .map((c) => `${esc(c.name)}${c.beds ? ` · ${c.beds} beds` : ''} ${c.hasPlan ? pill('#DDF3E5', '#256B41', '✓ Floor plan') : pill('#F8D3CC', '#9A2E1C', 'Floor plans needed')}`)
        .join('<br>')
    : `<span style="color:${C.muted}">None on the proposal</span>`;
  const row = (first: boolean, label: string, inner: string, st: string) =>
    `<tr><td style="padding:13px 16px;${first ? '' : `border-top:1px solid ${C.line};`}font:400 13.5px/1.6 ${FONT};color:#3A3F47">${lab(label)}${inner}</td><td align="right" style="padding:13px 16px;${first ? '' : `border-top:1px solid ${C.line};`}vertical-align:top">${status(st)}</td></tr>`;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px">
    ${row(true, 'Legal entity name', p.entity.value ? `${esc(p.entity.value)}${p.entity.status === 'updated' ? was(p.entity.was) : ''}` : `<span style="color:${C.muted}">Not given</span>`, p.entity.status)}
    ${row(false, 'Signatory', sigHtml, p.signatory.status)}
    ${row(false, p.communities.pilot ? 'Pilot communities' : 'Communities', `${coms}${p.communities.change ? `<div style="margin-top:8px;background:#FBF8F3;border-radius:8px;padding:8px 10px;color:#2A2F36"><b>What should change:</b> ${para(p.communities.change)}</div>` : ''}`, p.communities.status)}
  </table>`;
  const note = p.note ? box(`<div style="background:#FBF8F3;border-left:3px solid ${C.coral};border-radius:12px;padding:14px 16px"><div style="font:700 11px ${FONT};letter-spacing:.8px;text-transform:uppercase;color:${C.muted};padding-bottom:4px">A note from ${esc(i.first ?? i.who)}</div><div style="font:400 14px/1.55 ${FONT};color:#2A2F36">${para(p.note)}</div></div>`, 14) : '';
  const left = [
    p.entity.status === 'skipped' ? 'legal entity name' : null,
    p.signatory.status === 'skipped' ? 'signatory' : null,
    p.communities.status === 'skipped' ? (p.communities.pilot ? 'pilot communities' : 'communities') : null,
  ].filter((x): x is string => !!x);
  const noPlan = p.communities.list.filter((c) => !c.hasPlan).map((c) => c.name);
  const changed = p.entity.status === 'updated' || p.signatory.status === 'updated';
  const lede = `${them === 'They' ? i.who : them} asked for the ${p.communities.pilot ? 'pilot ' : ''}agreement for ${i.dealName}.${changed ? ' Their changes are already saved to the deal’s details.' : ''}`;
  const after = left.length || noPlan.length
    ? accessNote([
        ...(left.length ? [`Still to confirm with ${esc(i.first ?? i.who)}: <b style="color:${C.ink}">${left.join(', ')}</b>.`] : []),
        ...(noPlan.length ? [`No floor plan yet: <b style="color:${C.ink}">${esc(noPlan.join(', '))}</b>.`] : []),
      ])
    : '';
  const html = layout({
    baseUrl: i.baseUrl,
    preheader: `${i.who} is ready for the agreement.`,
    eyebrow: 'Agreement requested',
    heading: `${i.who} is ready for the agreement`,
    lede,
    body: box(table) + note,
    cta: { label: 'Open the deal details', url: i.url },
    after,
    footer: `You’re getting this because you own this deal in Teton Proposals.<br>Reply to this email to reach ${esc(i.first ?? i.who)} directly.`,
  });
  const word = (s: string) => (s === 'confirmed' ? 'Confirmed' : s === 'updated' ? 'Updated' : 'Not confirmed');
  const text = [
    lede,
    '',
    `Legal entity name (${word(p.entity.status)}): ${p.entity.value || 'Not given'}`,
    `Signatory (${word(p.signatory.status)}): ${sig ? [`${sig.first} ${sig.last}`.trim(), sig.title, sig.email].filter(Boolean).join(', ') : 'Not given'}`,
    `${p.communities.pilot ? 'Pilot communities' : 'Communities'} (${word(p.communities.status)}): ${p.communities.list.map((c) => `${c.name}${c.hasPlan ? '' : ' (floor plans needed)'}`).join('; ') || 'None'}`,
    ...(p.communities.change ? [`What should change: ${p.communities.change}`] : []),
    ...(p.note ? ['', `Note: ${p.note}`] : []),
    '',
    `Open the deal: ${i.url}`,
  ].join('\n');
  return { subject: `${i.who} requested the agreement: ${i.dealName}`, html, text };
}
