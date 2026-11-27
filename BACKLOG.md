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
