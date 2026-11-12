"""
Build golden test fixtures for lib/model from the cost-benefit workbook.

For each scenario below, the workbook is opened in headless LibreOffice, the
scenario's cell edits are applied, everything is recalculated, and two things
are written to tests/fixtures/<scenario>.json:

  inputs    - the scenario expressed as engine ModelInputs (read back out of
              the recalculated workbook, so the engine sees exactly what Excel saw)
  expected  - every output the engine must reproduce, read from the same cells
              the workbook's own tabs display

Community names are replaced with "Community N" so fixtures carry no customer
data. The workbook itself is never committed.

LibreOffice 24.2 reproduces the saved Excel values on 11,525 of 11,529 numeric
cells; the 4 that differ are display-only XLOOKUP/FILTER labels, which this
script does not read. Values only Excel can compute (LET formulas) are taken
from the workbook's saved cache, and only for the unmodified "workbook_as_saved"
scenario.

Usage:
  python3 tools/oracle/build_fixtures.py /path/to/KW_CostBenefit.xlsx
"""
import json, os, subprocess, sys, datetime, warnings
warnings.filterwarnings('ignore')
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(HERE, '.work')
OUT = os.path.join(ROOT, 'tests', 'fixtures')

A, R, C, CF, H = 'Assumptions', 'Teton ROI', 'ROI Calculations (Do not edit)', '12 Mo Cash Flow', 'Cash Flow Helpers (Do Not Edit)'
BE = 'BREAKEVEN TABLE (Do Not Edit)'
CASES = ['stretch', 'target', 'base', 'underperforming']
MAX_COMMUNITIES = 57  # Assumptions rows 29..85

def col(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s

def colnum(s):
    n = 0
    for ch in s: n = n * 26 + ord(ch) - 64
    return n

def cols(a, b):
    return [col(i) for i in range(colnum(a), colnum(b) + 1)]

MONTH_COLS = cols('J', 'U')  # months 1..12 on 12 Mo Cash Flow / helpers

SCENARIOS = {
    'workbook_as_saved': {},
    'case_stretch': {f'{CF}!D3': 'STRETCH'},
    'case_base': {f'{CF}!D3': 'BASE'},
    'case_underperforming': {f'{CF}!D3': 'UNDERPERFORMING'},
    'without_pilot': {f'{CF}!D2': 'Without Pilot'},
    'reimbursement_on': {f'{CF}!D7': 'Yes'},
    'standard_case_metrics': {f'{A}!E12': 'NO', f'{A}!F12': 'NO', f'{A}!G12': 'NO'},
    'components_partly_off': {f'{A}!C13': 'NO', f'{A}!C16': 'NO', f'{A}!C17': 'NO'},
    'roi_delay_zero_ramp_one': {f'{CF}!D4': 0, f'{CF}!D5': 1},
    'paid_pilot_special_pricing': {
        f'{A}!O12': 0.25, f'{A}!O13': 1, f'{A}!O11': 0.5,     # $75 pilot platform, free pilot e-call, 50% pilot install
        f'{A}!S20': 89, f'{A}!T20': 6,                         # special post-pilot platform price for 6 months
        f'{A}!O29': 80, f'{A}!T29': 10, f'{A}!T30': 5,         # partial pilot units, extra sensors
        f'{A}!O27': 'YES', f'{A}!Q29': 0.85, f'{A}!Q31': 0.95, # custom occupancy
        f'{A}!S30': 1, f'{A}!R29': 2, f'{A}!P31': 'YES',       # per-site ROI delay, go-live override, second pilot
        f'{CF}!D4': 2, f'{CF}!D5': 4,
        f'{A}!I29': '=DATE(2027;6;15)', f'{A}!C40': 0.1, f'{A}!C42': 90,
    },
    'small_three_site_deal': {
        **{f'{A}!L{r}': None for r in range(32, 60)},
        **{f'{A}!M{r}': None for r in range(32, 60)},
        **{f'{A}!N{r}': None for r in range(32, 60)},
        f'{CF}!H19': 2, f'{CF}!H20': 3,
    },
    'no_pilot_stretch_reimbursed': {
        f'{CF}!D2': 'Without Pilot', f'{CF}!D3': 'STRETCH', f'{CF}!D7': 'Yes', f'{CF}!D4': 1, f'{CF}!D5': 6,
    },
}

def serial_to_iso(v):
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))).isoformat()

def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def build(src, name, edits, formulas):
    os.makedirs(WORK, exist_ok=True)
    ep, op = os.path.join(WORK, f'{name}.edits.json'), os.path.join(WORK, f'{name}.values.json')
    json.dump(edits, open(ep, 'w'))
    subprocess.run([sys.executable, os.path.join(HERE, 'lo_recalc.py'), src, ep, op], check=True, timeout=600)
    v = json.load(open(op))
    g = lambda sh, ref: v[sh].get(ref)
    a = lambda ref: g(A, ref)
    yes = lambda x: str(x or '').strip().upper() == 'YES'

    # ---- communities ----
    rows = [r for r in range(29, 29 + MAX_COMMUNITIES) if str(a(f'L{r}') or '').strip()]
    communities = []
    for i, r in enumerate(rows):
        cf_row = 18 + (r - 29)
        h_ref = f'{CF}!H{cf_row}'
        h_is_constant = h_ref in edits or not str(formulas[CF][f'H{cf_row}'].value).startswith('=')
        go_live = num(g(CF, f'H{cf_row}')) if h_is_constant else (num(a(f'R{r}')) if (num(a(f'R{r}')) or 0) > 0 else None)
        communities.append({
            'name': f'Community {i + 1}',
            'market': a(f'M{r}') or '',
            'units': a(f'N{r}'),
            'pilot': yes(a(f'P{r}')),
            'pilotUnits': num(a(f'O{r}')),
            'occupancy': num(a(f'Q{r}')) if yes(a('O27')) else None,
            'goLiveMonth': go_live,
            'roiDelayMonths': num(a(f'S{r}')),
            'additionalSensors': num(a(f'T{r}')) or 0,
        })
    n = len(rows)

    case_cols = {'stretch': ('J', 'K'), 'target': ('T', 'U'), 'base': ('AD', 'AE'), 'underperforming': ('AN', 'AO')}
    case_metrics = {}
    for k, cs in enumerate(CASES):
        er = 19 + k
        case_metrics[cs] = {
            'fallReduction': g(R, f'{case_cols[cs][0]}17'),
            'locGapIdentifiedPerMonth': g(R, f'{case_cols[cs][1]}17'),
            'moveInUplift': a(f'E{er}'),
            'staffingAlignment': a(f'F{er}'),
            'techReplacement': a(f'G{er}'),
        }

    special = num(a('S20'))
    inputs = {
        'roiCase': str(g(CF, 'D3')).lower(),
        'components': {
            'careRevenueRecapture': yes(a('C12')),
            'fallsHospitalization': yes(a('C13')),
            'fallsDischarge': yes(a('C14')),
            'staffingAlignment': yes(a('C15')),
            'moveInImpact': yes(a('C16')),
            'techReplacement': yes(a('C17')),
        },
        'caseMetrics': case_metrics,
        'valuation': {'capRate': a('E9'), 'operatingMargin': a('G9')},
        'monthsUntilCocNoticed': a('C21'),
        'client': {
            'occupancy': a('C29'), 'avgRent': a('C30'), 'careRevenuePerResident': a('C31'),
            'locGapUpliftPerTierStep': a('C32'), 'moveInRatePerMonth': a('C34'),
            'yr1RevenueMonthsPerMoveIn': a('C35'), 'avgRevenuePerResident': a('C36'),
            'fallsPerResidentYear': a('E29'), 'pctFallsHospitalization': a('E31'),
            'costPerHospitalization': a('E33'), 'pctFallsDischarge': a('E34'), 'losIncreaseMonths': a('E35'),
            'nightResidentToStaffRatio': a('G29'), 'nightShiftHours': a('G30'), 'nightHourlyWage': a('G31'),
            'newNightResidentToStaffRatio': a('G32'), 'supportiveTechSpendPerResident': a('G33'),
        },
        'cfo': {'annualDiscountRate': a('C40'), 'portfolioUnits': a('C41'), 'reimbursementPerOccupiedUnitMonth': a('C42')},
        'pricing': {
            'pilotFeePerBedMonth': a('P12') + a('P13'),
            'postPilotFeePerBedMonth': a('P20') + a('P21'),
            'pilotInstallPerBed': a('P11'),
            'postPilotInstallPerBed': a('P19'),
            'pilotSensorPrice': a('P14'),
            'postPilotSensorPrice': a('P22'),
            'specialFeePerBedMonth': (special + a('P21')) if (special or 0) > 0 else None,
            'specialTermMonths': (num(a('T20')) or 0) if (special or 0) > 0 else 0,
        },
        'schedule': {
            'withPilot': g(CF, 'D2') == 'With Pilot',
            'pilotLengthMonths': a('O9'),
            'roiStartDelayMonths': num(g(CF, 'D4')) or 0,
            'rampMonths': num(g(CF, 'D5')) or 0,
            'startDate': serial_to_iso(g(CF, 'D6')),
            'horizonMonths': 12,
            'includeReimbursement': g(CF, 'D7') == 'Yes',
        },
        'implementation': {
            'desiredGoLive': serial_to_iso(a('I29')),
            'communicationWeeks': a('I31'), 'installationWeeks': a('I32'),
            'baselineWeeks': a('I33'), 'onboardingDays': a('I34'),
        },
        'communities': communities,
    }

    # ---- expected: drivers & annual ROI per case ----
    drivers, annual, totals = {}, {}, {}
    drv_keys = ['totalFalls', 'fallsAvoided', 'fallsToHospitalization', 'fallsToDischarge', 'locGapsIdentifiedPerMonth',
                'residentsRealigned', 'nightShiftCostBase', 'availableBeds', 'baseMoveInsPerMonth',
                'incrementalMoveInsUncapped', 'incrementalMoveIns']
    ann_keys = ['residentsRealigned', 'costlyFallsPrevented', 'fallCostAvoidance', 'recapturedCareRevenue',
                'revenueFromLosIncrease', 'nightShiftSavings', 'moveInImpact', 'techReplacement', 'totalRevenuePerMonth', 'annualRoi']
    first_cols = {'stretch': 'J', 'target': 'T', 'base': 'AD', 'underperforming': 'AN'}
    for k, cs in enumerate(CASES):
        base_row = 6 + 62 * k
        drivers[cs] = [{key: g(C, f'{c}{base_row + i}') for key, c in zip(drv_keys, cols('F', 'P'))} for i in range(n)]
        c0 = colnum(first_cols[cs])
        ccols = [col(c0 + j) for j in range(10)]
        annual[cs] = [{key: g(R, f'{c}{19 + i}') for key, c in zip(ann_keys, ccols)} for i in range(n)]
        t = {key: g(R, f'{c}76') for key, c in zip(ann_keys, ccols)}
        last = ccols[-1]
        t.update({'returnOnCost': g(R, f'{last}82'), 'netRevpor': g(R, f'{last}84'),
                  'annualNetNoiImpact': g(R, f'{last}85'), 'valuationImpact': g(R, f'{last}86'),
                  'breakevenMonths': g(BE, f'H{13 + k}'), 'totalCostBasis': g(BE, 'C9')})
        totals[cs] = t

    occupied = [g(R, f'H{19 + i}') for i in range(n)]

    # ---- expected: 12-month cash flow ----
    cfr = lambda i: 18 + i
    month_row = lambda r: [g(CF, f'{c}{r}') for c in MONTH_COLS]
    cashflow = {
        'goLiveMonth': [g(CF, f'H{cfr(i)}') for i in range(n)],
        'installByCommunity': [g(CF, f'I{cfr(i)}') for i in range(n)],
        'feesByCommunity': [[g(CF, f'{c}{cfr(i)}') for c in MONTH_COLS] for i in range(n)],
        'grossByCommunity': [[g(H, f'{c}{6 + i}') for c in MONTH_COLS] for i in range(n)],
        'roiStartMonth': [g(H, f'I{87 + i}') for i in range(n)],
        'fullRoiMonth': [g(H, f'S{87 + i}') for i in range(n)],
        'reimbursementByCommunity': [g(H, f'R{87 + i}') for i in range(n)],
        'recurringFees': month_row(75), 'install': month_row(76), 'reimbursement': month_row(77),
        'totalCost': month_row(78), 'grossBenefit': month_row(79), 'netBenefit': month_row(80),
        'cumulativeNet': month_row(81),
        'discountedNet': [g(H, f'{c}70') for c in MONTH_COLS],
        'cumulativeDiscountedNet': [g(H, f'{c}71') for c in MONTH_COLS],
    }
    pay = lambda x: x if isinstance(x, (int, float)) else None
    kpis = {
        'totalInvestment12': g(CF, 'B12'), 'netBenefit12': g(CF, 'E12'), 'grossReturnPerDollar12': g(CF, 'H12'),
        'netReturnMultiple12': g(H, 'I81'),
        'discountedPaybackMonth': pay(g(H, 'I75')), 'undiscountedPaybackMonth': pay(g(H, 'I76')),
        'firstBillingMonth': pay(g(H, 'I77')),
        'runRateAnnualNetBenefit': g(CF, 'N12'),
        'netBenefitPerOccupiedUnitMonth': g(CF, 'S12'), 'netBenefitPerUnitMonth': g(CF, 'S13'),
        'stabilizedNetPerOccupiedUnitMonth': g(CF, 'U12'), 'stabilizedNetPerUnitMonth': g(CF, 'U13'),
        'totalOccupiedUnits': g(H, 'I82'),
    }

    # ---- expected: Teton vendor view (36 months) ----
    vcols = cols('G', 'R')
    vrow = lambda r0: [g(CF, f'{c}{r0 + y * 26}') for y in range(3) for c in vcols]
    vendor = {
        'billedUnits': vrow(137), 'pilotFees': vrow(139), 'postPilotFees': vrow(140), 'oneTimeFees': vrow(141),
        'revenue': vrow(142), 'hardware': vrow(144), 'installLabor': vrow(145), 'sensors': vrow(146),
        'cloudHosting': vrow(147), 'support': vrow(148), 'maintenanceReserve': vrow(149), 'costToServe': vrow(150),
        'grossMargin': vrow(151), 'cac': vrow(153), 'netCashFlow': vrow(154), 'discountedNetCashFlow': vrow(157),
        'cumulativeDiscountedNetCashFlow': vrow(158),
        'summary': {'totalRevenue36': g(CF, 'M123'), 'grossMarginPct36': g(CF, 'M124'), 'netMarginPct36': g(CF, 'M125'),
                    'peakCashOutlay': g(CF, 'M126'), 'npv36': g(CF, 'M129')},
        'costAssumptions': {'hardwarePerBed': g(CF, 'D124'), 'installLaborPerBed': g(CF, 'D125'),
                            'sensorCost': g(CF, 'D126'), 'cacPerBed': g(CF, 'D127'),
                            'cloudPerBilledBedMonth': g(CF, 'D128'), 'supportPerBilledBedMonth': g(CF, 'D129'),
                            'maintenancePerBilledBedMonth': g(CF, 'D130')},
    }

    implementation = {'totalImplementationWeeks': a('I30'), 'latestKickoffDate': serial_to_iso(a('I35'))}

    return {'scenario': name, 'edits': {k: v for k, v in edits.items()}, 'inputs': inputs,
            'expected': {'occupiedUnits': occupied, 'drivers': drivers, 'annual': annual, 'annualTotals': totals,
                         'cashflow': cashflow, 'kpis': kpis, 'vendor': vendor, 'implementation': implementation}}

def main():
    src = os.path.abspath(sys.argv[1])
    only = sys.argv[2:]
    formulas = openpyxl.load_workbook(src)
    cached = openpyxl.load_workbook(src, data_only=True)
    os.makedirs(OUT, exist_ok=True)
    for name, edits in SCENARIOS.items():
        if only and name not in only: continue
        fx = build(src, name, edits, formulas)
        if name == 'workbook_as_saved':
            # LET-based payback labels only Excel can evaluate; keep the saved strings as a cross-check.
            fx['expected']['vendor']['summary']['paybackLabel'] = cached[CF]['M127'].value
            fx['expected']['vendor']['summary']['discountedPaybackLabel'] = cached[CF]['M128'].value
            fx['expected']['kpis']['discountedPaybackLabel'] = cached[CF]['K12'].value
        with open(os.path.join(OUT, f'{name}.json'), 'w') as f:
            json.dump(fx, f, indent=1)
        print('wrote', name, len(fx['inputs']['communities']), 'communities')

if __name__ == '__main__':
    main()
