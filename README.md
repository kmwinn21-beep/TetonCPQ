# Teton Proposal Generator (CPQ)

Internal tool for Teton's US sales team: enter deal assumptions, run the ROI /
cost-benefit model, check pricing guardrails, save versioned quotes, and
(next) generate the client proposal.

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
