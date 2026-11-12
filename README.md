# Teton Proposal Generator (CPQ)

Internal tool for Teton's US sales team: enter deal assumptions, run the ROI /
cost-benefit model, check pricing guardrails, save versioned quotes, compare
versions, and generate the client proposal (HTML that prints to PDF).

Stack: Next.js 14 (App Router), TypeScript, Tailwind, `@libsql/client` (Turso),
react-hook-form, Recharts — same shape as Parlay.

## Run it

```bash
npm install
cp .env.example .env.local   # set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN, or use file:local.db
npm run dev
```

Tables are created on first request (`lib/db/migrations.ts`), and the price
book is seeded from `lib/pricing/catalog.ts`.

Set `JWT_SECRET` (48 random bytes, see `.env.example`). On first visit the app
asks you to create the admin account; add the rest of the team under
**Users**. Changing `JWT_SECRET` signs everyone out.

## Sign-in

Email and password (bcrypt), session in an httpOnly cookie (signed JWT, 14
days). Middleware sends signed-out visitors to `/login`; every page and API
also re-checks the user against the database, so deactivating someone takes
effect on their next click. Roles: Sales rep, Deal Desk, VP Sales, CEO, Admin —
only Admin is special today (user management); the others are recorded for the
approval workflow. Deal owner, who saved each version and who sent each
proposal are stored and shown.

```bash
npm test          # engine reconciliation against the workbook + unit tests
npm run typecheck
```

## Layout

| Path | What |
|---|---|
| `lib/model/` | The ROI engine — pure functions, reconciled to the Excel workbook. See its README. |
| `lib/pricing/` | Price book seed, pricing policy, concession ladder and guardrails. |
| `lib/quote/` | `QuoteDraft` (what the form edits) and `toModelInputs` (commercial terms → per-bed rates). |
| `lib/data/` | Data access (deals, quotes, versions). Takes a DB client so it's testable. |
| `lib/db/` | Client, migrations. |
| `components/quote/` | The deal input form. |
| `tools/oracle/` | Regenerates the engine's golden fixtures from the workbook via LibreOffice. |

## Versioning

Each quote has one editable draft (autosaved). **Save version** freezes it:
the server recomputes the outputs from the stored inputs and stores inputs,
outputs, guardrail findings and the engine version together, then opens the
next draft. Database triggers reject any edit or delete of a saved version.

## Proposals

A proposal is generated from a **saved version** only (`/proposal/<versionId>`),
from that version's stored inputs, outputs and price lines — never recalculated.
"Record as sent" marks the version sent (to whom, when) and stores a standalone
HTML copy of exactly what was on screen (`proposal_exports`), viewable later
from the proposal toolbar.

The results page compares any two versions: input changes in plain words and
the effect on the headline numbers.
