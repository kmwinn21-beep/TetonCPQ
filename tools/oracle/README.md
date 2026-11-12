# Excel oracle

Regenerates `tests/fixtures/*.json` from the cost-benefit workbook so the engine
can be checked against the spreadsheet.

Requires LibreOffice (`soffice`) with Python UNO (`import uno`), and `openpyxl`.

```bash
python3 tools/oracle/build_fixtures.py /path/to/KW_CostBenefit_With_12moCF_Final_V1.xlsx
npm test
```

- Scenarios are defined in `SCENARIOS` at the top of `build_fixtures.py`, as
  cell edits (`"Sheet!A1": value`). Add one there to cover a new case.
- LibreOffice 24.2 reproduces the saved Excel values on 11,525 of 11,529
  numeric cells; the 4 differences are display-only XLOOKUP/FILTER labels the
  script doesn't read.
- Community names are anonymized. Never commit the workbook (`*.xlsx` is ignored).
- If the workbook's formulas change, re-run this and `npm test`; any test that
  fails is a place the engine needs the same change.
