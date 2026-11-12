# lib/model — the ROI / cost-benefit engine

Pure TypeScript port of `KW_CostBenefit_With_12moCF_Final_V1.xlsx`. No React,
no database, no clock: `runModel(inputs)` always returns the same result for the
same inputs, so a saved quote version can be re-run and must match what was sent.

| File | Workbook tab it replaces |
|---|---|
| `annual.ts` | ROI Calculations (drivers), Teton ROI (components, totals, NOI, valuation), BREAKEVEN TABLE |
| `cashflow.ts` | 12 Mo Cash Flow rows 15–81, Cash Flow Helpers rows 3–63 and 85–329 |
| `kpis.ts` | 12 Mo Cash Flow KPI cards (row 12), KPI Card Guide |
| `implementation.ts` | Assumptions H29:I35 |
| `vendor.ts` | 12 Mo Cash Flow rows 120–210 (Teton's own 36-month margin view; internal only) |
| `traces.ts` | — new: drill-down for every headline number |
| `defaults.ts` | Assumptions defaults, standard case metrics |

## How it's verified

`tests/reconcile.test.ts` runs the engine against 12 scenarios generated from
the workbook itself (`tools/oracle/`): the saved workbook, each ROI case,
without pilot, reimbursement on, uniform case metrics, components switched off,
zero delay/no ramp, a paid pilot with special pricing / partial pilot units /
custom occupancy / sensors / per-site delays, a 3-site deal, and a no-pilot
Stretch case with reimbursement. 48,951 workbook values are compared at 1e-9
relative tolerance; all match.

## Horizon

The workbook's client view is 12 months. The engine runs `schedule.horizonMonths`
(CPQ default 36). With a 36-month horizon:

- "— 12 Mo" cards still cover months 1–12 (identical to the workbook).
- Discounted payback is searched across all 36 months.
- Run-rate and per-unit figures use month 36 — when every site is live and
  ramped — instead of month 12. In the workbook, sites going live in month 9–12
  are still ramping at month 12, so its run-rate understates steady state.

## Behaviour carried over from the workbook (worth knowing in front of a CFO)

- Occupied units are rounded per community (`ROUND(units × occupancy)`).
- Night-shift cost is sized on **total** units, not occupied units.
- Fall cost avoidance rounds hospitalizations before multiplying by cost;
  LOS revenue uses unrounded discharges.
- Pilot communities accrue **no** benefit during the pilot; benefits start at
  the later of the first post-pilot month and go-live + ROI delay. (The
  workbook's "pilot-period ROI" column can never take effect, so it was dropped.)
- During a pilot, units outside the pilot unit count are not billed.
- Return on Cost, Breakeven, Net RevPOR, NOI and Valuation are a steady-state
  view: every unit at post-pilot price plus full install, ignoring pilot pricing
  and credits.
- Move-in impact counts `yr1RevenueMonthsPerMoveIn` months of revenue per
  incremental move-in, and recurs every year in the annual ROI.
