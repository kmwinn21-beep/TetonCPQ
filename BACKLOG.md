# Backlog

Agreed work not started yet, in the order to build it.

## 1. Roles & permissions (matrix) — built

Settings → Permissions (`/admin/permissions`). Permissions are defined in `lib/auth/permissions.ts` (defaults per role, flag or reach: All deals / + Collaborating / Own deals / Off), stored as changes from the defaults in `role_permissions`, and checked on the server (`allowed`, `reaches`, `requireAllowed`). A test fails if an editable permission isn't checked anywhere.

Decided: everyone sees every deal; planned rows (approvals, agreements) are a read-only preview behind "Show coming soon"; RevOps (renamed from Deal Desk) edits prices and items and scopes any deal by default; reps can delete their own deals. Still open: Super Admin (making or removing Admins).

When a backlog feature ships, flip its permissions to `shipped: true`, check them on the server, and review the defaults.

## 1b. Custom roles: add, rename, delete — built

Mock: `docs/mocks/roles/custom-roles.html`. From the permissions page: "+ Add role" (name, description, start from an existing role's permissions or nothing), rename any role but Admin, edit description, duplicate, reorder, delete (its people moved to another role first, type the name to confirm). Users page lists every role in order, custom ones tagged.

Decided: built-in roles (Sales rep, RevOps, VP Sales, CEO) can be renamed and deleted once nobody has them; Admin can't be renamed or deleted; custom roles get the defaults of the role they started from for permissions added later (Off if started from nothing); admins only.

Build notes: roles move from the fixed list (code + CHECK constraints on `users.role` and `role_permissions.role`) to a roles table with a permanent hidden key, name, description, order, starting role, built-in flag; renames change only the name. Code stops testing role names except `admin` (the guardrail's "Route to RevOps" becomes "someone who can approve tier 1"). Unique names, max 20 roles.

## 2. Deal approval workflow (after #1)

Built on the approval capabilities from #1. Mock first. Covers: approval requests from guardrail findings, notifying the people who can approve, approve / reject with a note, saving blocked until approved, approval history on the deal, and what a later price change does to an approval.

## 3. Deal flow: stages, approval gates, scoping and agreement handoffs (needs team validation)

Mock: `docs/mocks/deal-flow/index.html`. **On hold until the sales and RevOps team validate the process.** The 17-step process from new deal to countersigned agreement, laid out by who does each step (rep, prospect, RevOps, approvers, system), what exists today, and where approvals stop the deal.

Proposed build order (1 and 2 are #1 and #2 above):

1. Roles & permissions (#1).
2. Approval rules in the price book: price, service term, pilot length, pilot cost, each with tiers and an approver, admin-editable (today they're fixed in code and only warn; there's no term-length rule).
3. Approval workflow (#2): request with a reason, approver notified in the app and in Slack, approve / reject with a note; Send and the agreement request locked until approved (a draft-marked PDF still allowed); approval tied to a version, re-approval only for items that got worse.
4. Deal stages that move on their own (Draft → Estimate sent → In review → Scoping → Scoped proposal sent → Agreement → Signature → Won / Lost) and an "Estimate (room counts)" flag until scoped.
5. Scoping handoff: "Request scoping" → RevOps queue with a due date → rep notified.
6. Agreement request in the app, posted to the agreement Slack channel, with a tracker for each draft and redline round.
7. DocuSign (optional, last); manual "sent for signature" / "signed" until then.

Decisions for the team:

1. Does a needed approval lock Send, or only warn? (Recommended: lock Send and the agreement request; draft PDF allowed.)
2. Thresholds and tiers per rule, and whether the CEO is ever required.
3. When a change needs re-approval. (Recommended: only when an approved item gets worse or a new rule trips.)
4. Slack: post only, or Approve / Reject from Slack (needs a Teton Slack app)?
5. Show prospects an "Estimate based on room counts" note until scoped? (Recommended: yes.)
6. DocuSign now or later? (Recommended: later.)

## 4. Agreement redlines in the deal room — V1 built

Mocks: `docs/mocks/agreement-redlines/` (1 overview, 2 access, 3 deal room views, matrix, finishing). V1 built; V2 and V3 not started.

V1 as built, and where it falls short of the plan below:
- Rejecting a change made with Track Changes off is recorded, but the Word file isn't changed for it: Teton writes the counter in Word. Mark final stays blocked while such a rejection is open.
- No approval workflow yet (#2): changes touching price, fees, term, pilot, renewal or termination get a "Commercial terms" flag, and Mark final asks the person to confirm the deal's active version matches (a checkbox, not an automatic check).
- Teton's response file accepts the accepted changes and shows each rejection as Teton's own tracked change, so the other side sees it in Word.
- Word's automatic numbering isn't shown on the page (it isn't stored as text in the file).
- Sales reps can't upload rounds by default (RevOps uploads, per the matrix); change "Upload rounds" in Roles & permissions if reps should.

**V1: Word file rounds, changes read in.** Everyone edits in Word. Each side uploads its round as a .docx; the system reads the tracked changes and comments out of the file (and finds edits made with Track Changes off by comparing with the previous round) and shows them as a list of changes.

- Agreement tab on the shared link, next to Proposal and Deal room: rounds, people, files, the document, and a "whose turn" status.
- Rep workspace (full-screen, like the Resources editor): accept / reject each change, Teton-only notes, approval flags on changes that cross a price-book rule, compare rounds, recent activity.
- Teton's response: download a .docx with the decisions applied; counter-wording is written in Word and uploaded as the next round.
- Prospect people: signatory always has access; the rep sets, per person, which tabs they see (Proposal / Resources / Agreement) and their agreement level (View, Comment, Redline, Lead reviewer). The signatory can invite reviewers without rep approval (rep notified, can remove anyone); invitees get the Agreement tab by default and the rep decides whether the signatory may give more. Only Lead reviewers send a round to Teton.
- The signatory or a Lead reviewer can "Accept Teton's changes", which signals the agreement can be marked final.
- Mark final: blocked until nothing is open, rule-crossing changes are approved, and the deal's active version matches the agreed price, term, pilot and rooms. Makes a clean .docx and locks the tab. "Signed" moves the deal to Won.
- Permissions (to move into the matrix, #1): deal owner and admins accept / reject / send rounds and manage prospect people; collaborators view and write Teton-only notes only; RevOps (renamed from Deal Desk) uploads rounds; deal owner, RevOps and admins mark final and signed (may change once the matrix exists). Matrix cells have a reach: Own deals, + Collaborating, All deals.

**V1.1: several documents per deal — mocked, decisions made, not built.** Mock: `docs/mocks/agreement-redlines/4-multiple-documents.html`.
- Every deal starts with an MSA and an Order Form. Each has its own rounds, whose turn, Accept and Mark final, and moves on its own schedule.
- The rep can add a document (BAA, Pilot addendum, SOW, any name), rename one, mark one "Not needed for this deal" (e.g. an MSA already signed; hidden from the prospect, doesn't block signing, can be undone), or remove one before its first round is sent.
- People, levels, tab access and permissions stay deal-wide. Mark signed moves to the deal and waits until every needed document is final; a zip of all finals for DocuSign.
- Workspace and the prospect's tab get a document switcher with a status dot per document; the deal card, Inbox, emails and activity name the document.
- Decided: the version-match check is asked when finishing the Order Form only; existing V1 agreements become the deal's MSA; the default documents (MSA + Order Form) are an admin setting; keep "Not needed".

**Standard agreements as a baseline — ideas, not started.** Our MSA and Order Form are standard. Uploading a Word sample of each (fill-in fields bracketed, e.g. [Customer Name]) would let the system:
1. Create round 1 instead of uploading it: the Order Form filled from the deal's active version (customer, signatory, line items and quantities, totals, term, pilot length and rate, payment terms); the MSA's few fill-in fields (legal name, address, effective date). Same placeholder idea as proposal Templates; the output is still a normal Word file.
2. Replace the version-match checkbox with a real check: read the agreed Order Form back at Mark final and compare it with the active version ("Order Form says 24 months; active version says 36").
3. Measure each deal against standard, not just the last round: "3 clauses differ from our standard MSA", changes labelled by clause (§8.2 Limitation of liability), a deviation summary at final for legal sign-off.
4. Playbook per clause, with #2's approvals: standard, rep-acceptable and needs-approval positions (e.g. net 30 standard, net 45 rep OK, net 60+ VP). Changes flagged "Within playbook" or "Needs approval from …", replacing the keyword "Commercial terms" flag; final blocked until approvals are in.
5. Reporting: most-negotiated clauses, rounds and days to signature, time with each side, most common concessions.
6. Smaller: the prospect can read the standard MSA early (Resources tab); correct clause numbering on screen; the current standard versions are uploads in admin settings, not code.
Suggested order: 1 + 2 first, then 3, then 4 with the approval workflow, 5 once there's data. Needs: the real Word files with fill-in fields marked.

**V2: redline in the browser.** Suggesting mode on the document for prospects, Teton counters typed in place, "Send redlines to Teton" without a file, Word export with real tracked changes. Biggest single build; complex Word formatting may not look exactly the same in the browser.

**V3 (optional): DocuSign.** Send the final from the deal; signed comes back on its own.

## 5. Rooms with more than one resident (companion suites, semi-private) — built

Mock: `docs/mocks/scoping/shared-rooms.html`. Today every room is one resident, so a shared room either under-bills (1 room, 2 sensors → 1 bed) or overstates Edge units (2 rooms → 2 Edge units and 2 badges).

Proposal: a **Residents per room** number on each room type (default 1, so existing deals don't change).
- Billed beds = rooms × residents; Edge units = rooms (monitored care settings); sensors = rooms × sensors per room (+ allowance); extra sensors = sensors − Edge units. Sensors and pendants per room default to the residents until changed.
- Each community gets an Edge units figure beside its beds (equal to beds unless there are shared rooms); the engine uses it for everything that is per room: installation, equipment-purchase base package, Teton hardware and install labor. Monthly fee, E-Call billing, cloud/support/reserve stay per resident.
- Deal page: new counter on the room type card, a ×N pip on the badge, a Residents figure in the community totals line.
- Scope Mode: still one badge per room with the ×N pip; the hover card lists residents, Edge unit, sensors, pendants; floor plan download and scope PDF legend add a Residents column.
- Proposal scope summary (one-pagers, business case Scope page) shows Edge units beside residents when they differ.

Decided and built: monthly fee per resident; subscription installation per Edge unit plus additional sensors; equipment purchase one base package per room, the 2nd resident at the additional-sensor price; rooms only sometimes shared get their own room type (per-badge override later if asked for); occupancy unchanged. E-Call is billed per resident (the 'per room' billing option counts each resident); equipment purchase buys the 2nd resident's pendant as an extra device. One installation finish per room; generic items counted per room count rooms.

## 6. Edge units in Scope Mode — built

Mock: `docs/mocks/scoping/edge-units.html`. Edge units are dedicated to a resident room (never shared); one handles up to 3 sensors.
- Each room type has an Edge units per room counter (1 to 3, default 1), in Scope Mode and on the deal page; each tagged room can override it from its popover ("Edge units, this room only").
- Totals: the Scope Mode bottom bar, the floor plan Summary table (Edge units column and total), the scope PDF, the deal page room types summary, the proposal Scope page and one-pagers. Badges get a purple Edge marker, and room type chips "2 Edge each", only when a room needs more than one.
- The customer's price doesn't change: installation, the equipment-purchase base package and the included first sensor stay per room. The extra Edge units count in Teton's hardware and install-labor cost.
- A hint shows when a room has more than 3 sensors per Edge unit.
- On phones, Scope Mode popovers (tagged room, room type form) open as a sheet along the bottom of the screen.

