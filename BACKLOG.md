# Backlog

Agreed work not started yet, in the order to build it.

## 1. Roles & permissions (matrix)

Mock: Settings → Roles & permissions, modeled on parlay-demo's Role Scope (`lib/auth-shared.ts`, `lib/requireCapability.ts`).

- A capability list with recommended defaults per role (Sales rep, Deal Desk, VP Sales, CEO, Admin), editable by admins and saved.
- Every capability checked on the server, not only hidden in the UI.
- Admin column all on and locked; admins can't make or remove Admins.
- **Super Admin**: reserved for Kevin, can't be assigned by anyone; scope to be defined later (for now: everything Admin has, plus making or removing Admins).
- Approval rows ("approve prices below the hard floor", "approve deep discounts") shown as coming soon until #2 exists.
- Open questions before building:
  1. Reps see only deals they own or collaborate on, or every deal (as today)?
  2. Approval flow in this build, or approvals stay warnings for now?
  3. Price book Admin-only, or can Deal Desk change list prices?
  4. Can reps delete their own deals (as today), or only Admins?

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
