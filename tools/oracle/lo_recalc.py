"""Open the workbook in headless LibreOffice, apply edits, recalc, dump every
cell value of every sheet to JSON. Usage: lo_recalc.py in.xlsx edits.json out.json"""
import json, sys, subprocess, time, os, uno
from com.sun.star.beans import PropertyValue

def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

src, edits_path, out_path = sys.argv[1:4]
port = 2002 + os.getpid() % 1000
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore',
    f'--accept=socket,host=localhost,port={port};urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ctx = None
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
for _ in range(60):
    try:
        ctx = resolver.resolve(f'uno:socket,host=localhost,port={port};urp;StarOffice.ComponentContext'); break
    except Exception:
        time.sleep(0.5)
smgr = ctx.ServiceManager
desktop = smgr.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)), '_blank', 0, (prop('Hidden', True),))
sheets = doc.Sheets
edits = json.load(open(edits_path)) if edits_path != '-' else {}
for ref, val in edits.items():
    sh, cell = ref.split('!')
    c = sheets.getByName(sh).getCellRangeByName(cell)
    if val is None: c.setString('')
    elif isinstance(val, str):
        if val.startswith('='): c.setFormula(val)
        else: c.setString(val)
    else: c.setValue(val)
doc.calculateAll()
out = {}
for i in range(sheets.Count):
    sh = sheets.getByIndex(i)
    cur = sh.createCursor(); cur.gotoEndOfUsedArea(False)
    maxc, maxr = cur.RangeAddress.EndColumn, cur.RangeAddress.EndRow
    data = sh.getCellRangeByPosition(0, 0, maxc, maxr).getDataArray()
    vals = {}
    for r, row in enumerate(data):
        for c, v in enumerate(row):
            if v == '' : continue
            col = ''; n = c + 1
            while n: n, rem = divmod(n - 1, 26); col = chr(65 + rem) + col
            vals[f'{col}{r+1}'] = v
    out[sh.Name] = vals
json.dump(out, open(out_path, 'w'))
doc.close(True)
try: desktop.terminate()
except Exception: pass
proc.wait(timeout=30)
