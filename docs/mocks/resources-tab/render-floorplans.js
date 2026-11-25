const { chromium } = require('playwright');
const fs = require('fs');
const M = '/tmp/claude-0/-home-user-TetonCPQ/f858fe51-a88a-5942-af90-c35ac8773983/scratchpad/mock/';
const B = 'http://localhost:3100';
const grab = (f) => { const t = fs.readFileSync(M + f, 'utf8'); return t.slice(t.indexOf('const CSS = `') + 13, t.indexOf('`;', t.indexOf('const CSS = `'))); };
const TYPES = { ST: ['#3F6FD8', 'Studio', 'Assisted living', 1], '1B': ['#2E9E6B', 'One bedroom', 'Assisted living', 2], '2B': ['#E0782B', 'Two bedroom', 'Assisted living', 3], MC: ['#8E5BD6', 'Memory care suite', 'Memory care', 1] };
// A simple floor plan: two wings of rooms along corridors, with scope badges.
function plan(seed = 0, w = 1000, h = 640) {
  const rooms = [];
  const pick = (i) => (seed ? ['MC', 'MC', 'ST', 'MC', '1B', 'MC'] : ['ST', '1B', 'ST', '2B', 'ST', '1B', 'ST', 'ST'])[i % (seed ? 6 : 8)];
  let n = seed ? 201 : 101, k = 0;
  const row = (x0, y, cnt, rw, rh) => { for (let i = 0; i < cnt; i++) rooms.push({ x: x0 + i * rw, y, w: rw, h: rh, n: n++, t: pick(k++) }); };
  row(60, 60, 9, 82, 120); row(60, 240, 9, 82, 120);
  row(60, 420, 5, 82, 140); row(560, 420, 5, 82, 140);
  let s = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;background:#fff">`;
  s += `<rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="#3a3f47" stroke-width="5"/>`;
  s += `<rect x="60" y="184" width="738" height="52" fill="#F4F2EE"/><rect x="470" y="236" width="84" height="324" fill="#F4F2EE"/>`;
  s += `<text x="420" y="215" font-family="Inter" font-size="12" fill="#9AA0A8" text-anchor="middle" letter-spacing="2">CORRIDOR</text>`;
  s += `<rect x="820" y="60" width="140" height="180" fill="#F7F5F1" stroke="#3a3f47" stroke-width="2"/><text x="890" y="155" font-family="Inter" font-size="12" fill="#6B7380" text-anchor="middle">${seed ? 'Activity room' : 'Dining'}</text>`;
  s += `<rect x="820" y="260" width="140" height="140" fill="#F7F5F1" stroke="#3a3f47" stroke-width="2"/><text x="890" y="335" font-family="Inter" font-size="12" fill="#6B7380" text-anchor="middle">Nurse station</text>`;
  for (const r of rooms) {
    s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff" stroke="#3a3f47" stroke-width="2"/>`;
    s += `<text x="${r.x + 8}" y="${r.y + 18}" font-family="Inter" font-size="11" fill="#6B7380">${r.n}</text>`;
    const [c] = TYPES[r.t]; const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 6;
    s += `<circle cx="${cx}" cy="${cy}" r="15" fill="${c}" stroke="#fff" stroke-width="2.5"/><text x="${cx}" y="${cy + 4}" font-family="Inter" font-size="11" font-weight="800" fill="#fff" text-anchor="middle">${r.t}</text>`;
  }
  s += '</svg>';
  const counts = {}; rooms.forEach((r) => (counts[r.t] = (counts[r.t] || 0) + 1));
  return { svg: s, counts, rooms: rooms.length };
}
const P1 = plan(0), P2 = plan(1);
const mix = (p) => Object.entries(p.counts).map(([t, n]) => `${t} ${n}`).join(' · ');
const sensors = (p) => Object.entries(p.counts).reduce((a, [t, n]) => a + n * TYPES[t][3], 0);
const thumb = (p) => `<span style="width:56px;height:38px;border-radius:7px;overflow:hidden;border:1px solid #E3DFD8;flex-shrink:0;display:block;background:#fff">${p.svg}</span>`;
const legend = (p) => Object.entries(p.counts).map(([t, n]) => `<span class="lg"><i style="background:${TYPES[t][0]}">${t}</i>${TYPES[t][1]} <b>${n}</b></span>`).join('');
const summary = (p) => {
  const rows = Object.entries(p.counts).map(([t, n]) => `<tr><td><i class="bdg" style="background:${TYPES[t][0]}">${t}</i>${TYPES[t][1]}</td><td><span class="care ${TYPES[t][2] === 'Memory care' ? 'mc' : ''}">${TYPES[t][2]}</span></td><td>${n}</td><td>${TYPES[t][3]}</td><td><b>${n * TYPES[t][3]}</b></td></tr>`).join('');
  const tot = Object.entries(p.counts).reduce((a, [t, n]) => [a[0] + n, a[1] + n * TYPES[t][3]], [0, 0]);
  return `<table class="sum"><thead><tr><th>Room type</th><th>Care</th><th>Rooms</th><th>Sensors / room</th><th>Sensors</th></tr></thead><tbody>${rows}<tr class="tot"><td>Total</td><td></td><td>${tot[0]}</td><td></td><td><b>${tot[1]}</b></td></tr></tbody></table>`;
};
const grabB = () => { const t = fs.readFileSync(M + 'roomblocks.js', 'utf8'); const i = t.indexOf("grab('room.js') + `") + 17; return t.slice(i + 1, t.indexOf('`;', i)); };
const CSS = grab('roomedit.js') + grab('room.js') + grabB() + `
.lg{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 4px;border-radius:999px;background:#fff;border:1px solid #E8E4DC;font-size:12px;color:#3A4250}
.lg i,.bdg{width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;color:#fff;font:800 8.5px Inter;font-style:normal;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.bdg{margin-right:8px;vertical-align:-5px}
.lg b{font-weight:700;color:#1C2430}
.viewer{margin-top:14px;background:#EDEAE4;border-radius:16px;padding:16px;position:relative}
.viewer .sheet{border-radius:6px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.vctl{position:absolute;right:26px;top:26px;display:flex;flex-direction:column;gap:2px;background:#fff;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.15);padding:3px}
.vctl span{width:30px;height:30px;border-radius:7px;display:grid;place-items:center;font:600 15px Inter;color:#1C2430}
.vpages{position:absolute;left:26px;top:26px;display:flex;gap:4px;background:#fff;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.15);padding:3px}
.vpages span{height:28px;padding:0 10px;border-radius:7px;display:grid;place-items:center;font:600 12px Inter;color:#6B7380}
.vpages span.on{background:#1C2430;color:#fff}
.sum{width:100%;border-collapse:collapse;font-size:12.5px}
.sum th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8A919C;text-align:left;padding:0 8px 8px;font-weight:700}
.sum td{padding:8px;border-top:1px solid #F1EEE7}
.sum td:nth-child(n+3),.sum th:nth-child(n+3){text-align:right}
.sum .tot td{border-top:2px solid #1C2430;font-weight:700}
.care{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:#E7E2FB;color:#6A5BC7}
.care.mc{background:#FCE7F0;color:#B23A6E}
.dlg{position:fixed;inset:0;z-index:260;display:grid;place-items:center;background:rgba(0,0,0,.35);font-family:Inter,system-ui,sans-serif;color:#1C2430}
.dlg *{box-sizing:border-box}
.dlg-card{width:680px;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden}
.dlg-hd{padding:18px 22px 12px;border-bottom:1px solid #F1EEE7}
.dlg-hd b{font-size:17px}.dlg-hd p{margin:3px 0 0;font-size:12.5px;color:#6B7380}
.dlg-bd{padding:14px 22px 6px;max-height:560px;overflow:auto}
.dlg-c{font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;margin:6px 0 8px;display:flex}
.dlg-c i{margin-left:auto;font-style:normal;letter-spacing:0;text-transform:none;font-weight:600;color:#1F5FB5}
.pl{display:flex;gap:12px;align-items:center;border:1px solid #E8E4DC;border-radius:12px;padding:9px 12px;margin-bottom:8px}
.pl.on{border-color:#3F8CEA;background:#F6FAFF}
.pl .ck{width:20px;height:20px;border-radius:6px;border:1.5px solid #B9BFC7;display:grid;place-items:center;flex-shrink:0;color:#fff;font-size:12px;font-weight:800}
.pl.on .ck{background:#3F8CEA;border-color:#3F8CEA}
.pl b{display:block;font-size:13px}.pl small{font-size:11.5px;color:#6B7380}
.pl .thumbx{width:74px;height:48px;border-radius:7px;overflow:hidden;border:1px solid #E3DFD8;flex-shrink:0;background:#fff}
.dlg-ft{display:flex;gap:8px;align-items:center;padding:12px 22px 16px;border-top:1px solid #F1EEE7;background:#FAFAFB}
`;
const sideRep = (sel) => {
  const src = fs.readFileSync(M + 'roomedit.js', 'utf8');
  const card = eval('(' + src.slice(src.indexOf('const card =') + 12, src.indexOf(';\nconst side =')) + ')');
  return eval('(' + 'function(){' + src.slice(src.indexOf('const card ='), src.indexOf('const bar =')) + 'return side;}' + ')')()(sel, false)
    .replace('<p class="re-lbl">Recordings', `<p class="re-lbl">Floor plans <i>Rename</i></p>${card(sel === 'fp1', thumb(P1).replace('width:56px;height:38px', 'width:34px;height:34px'), '#fff', 'Forest Hills Commons · Level 1', 'Scoped floor plan · 28 rooms · with summary', '<span class="hot">👁 Dana · 6 min</span><span>⤓ Jordan’s IT contact</span>')}${card(false, thumb(P2).replace('width:56px;height:38px', 'width:34px;height:34px'), '#fff', 'Forest Hills Commons · Level 2 (MC)', 'Scoped floor plan · 28 rooms', '<span>Not opened yet</span>')}<p class="re-lbl">Recordings`);
};
const bar = `<div class="re-bar"><div><b>Resources</b><br><small>ABC Senior Living · on the shared link</small></div><div class="re-tn">Tab name <span>Resources ✎</span></div><span style="flex:1"></span><span class="re-btn">👁 Preview as prospect</span><span class="re-btn">Activity</span><span class="re-btn wh">Done</span></div>`;
const tb = (label) => `<div class="blk-tb"><span class="lbl">${label}</span><span>↑</span><span>↓</span><span>⧉</span><span>✕</span></div>`;
const EDIT = `<div class="re-in" style="max-width:900px">
  <div style="display:flex;align-items:flex-end;gap:14px"><div><p class="re-eb">Floor plans</p><h2 class="re-h">Forest Hills Commons · Level 1</h2><p class="re-p">From Scope Mode. Badges and counts stay in sync when you re-tag rooms.</p></div>
  <span class="re-seg" style="margin-left:auto"><span>Settings</span><span class="on">Page</span></span></div>
  <div class="pv">
    <p class="rm-eyebrow">Floor plan</p><h1 class="rm-h1" style="font-size:26px">Forest Hills Commons · Level 1</h1><p class="rm-lede" style="margin:4px 0 12px">Louisville, KY · 28 resident rooms tagged · scoped Nov 14</p>
    <div class="blk sel" style="margin-top:40px">${tb('Floor plan')}<div style="display:flex;gap:6px;flex-wrap:wrap">${legend(P1)}</div><div class="viewer"><div class="sheet">${P1.svg}</div><div class="vctl"><span>＋</span><span>−</span><span>⤢</span></div></div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;color:#3A4250"><span>☑ Room numbers</span><span>☑ Legend</span><span>☐ Plan notes</span><span>☑ Let them download (PDF with badges)</span></div></div>
    <div class="blk hov" style="margin-top:44px">${tb('Room summary')}<div class="rm-box"><h4>Rooms on this floor</h4>${summary(P1)}</div></div>
    <div class="blk" style="margin-top:16px"><div class="rm-box"><h4>Notes</h4><p style="margin:0;font-size:13px;line-height:1.55;color:#3A4250">Rooms 104 and 108 are larger two-bedrooms, so they get a second and third sensor. The dining room and nurse station aren’t monitored.</p></div></div>
    <div class="addline"><span>＋ Add a block</span></div>
  </div></div>`;
const PICK = `<div class="dlg"><div class="dlg-card"><div class="dlg-hd"><b>Add scoped floor plans</b><p>Plans tagged in Scope Mode for this deal. Each one becomes a card in Floor plans.</p></div>
  <div class="dlg-bd">
    <p class="dlg-c">Forest Hills Commons · Louisville, KY <i>Select all</i></p>
    <div class="pl on"><span class="ck">✓</span><span class="thumbx">${P1.svg}</span><div style="flex:1"><b>Level 1</b><small>${P1.rooms} rooms tagged · ${mix(P1)}</small></div><span class="rm-chip">Scoped</span></div>
    <div class="pl on"><span class="ck">✓</span><span class="thumbx">${P2.svg}</span><div style="flex:1"><b>Level 2 · Memory care</b><small>${P2.rooms} rooms tagged · ${mix(P2)}</small></div><span class="rm-chip">Scoped</span></div>
    <p class="dlg-c" style="margin-top:14px">Maple Grove · Lexington, KY</p>
    <div class="pl"><span class="ck"></span><span class="thumbx" style="background:#F6F4F0;display:grid;place-items:center;font-size:11px;color:#8A919C">PDF</span><div style="flex:1"><b>Main building</b><small>Uploaded, not tagged yet</small></div><span class="rm-chip" style="background:#FFF4D6;color:#8A5A00">Not scoped</span></div>
    <div style="margin-top:12px;border-top:1px solid #F1EEE7;padding-top:6px">
      <div class="re-row" style="border-top:0"><span>Show the room summary under each plan</span><span class="re-sw"></span></div>
      <div class="re-row"><span>Add a community summary card<br><small style="color:#8A919C">All floors of a community in one table</small></span><span class="re-sw"></span></div>
      <div class="re-row"><span>Show room numbers</span><span class="re-sw"></span></div>
      <div class="re-row"><span>Show plan notes<br><small style="color:#8A919C">Your team’s notes stay internal unless this is on</small></span><span class="re-sw off"></span></div>
      <div class="re-row"><span>Let them download (PDF with badges)</span><span class="re-sw"></span></div>
    </div>
  </div>
  <div class="dlg-ft"><span style="font-size:12px;color:#6B7380">2 plans selected</span><span style="flex:1"></span><span class="re-btn">Cancel</span><span class="re-btn dk">Add 2 floor plans</span></div></div></div>`;
const prospectSide = (sel) => {
  const src = fs.readFileSync(M + 'room.js', 'utf8');
  const side = eval('(' + 'function(){' + src.slice(src.indexOf('const P ='), src.indexOf('const contact =')) + 'return side;}' + ')')();
  const card = eval('(' + 'function(){' + src.slice(src.indexOf('const P ='), src.indexOf('const contact =')) + 'return card;}' + ')')();
  const chip = (t) => `<span class="rm-chip">${t}</span>`;
  return side(sel).replace('<p class="rm-lbl">Recordings', `<p class="rm-lbl">Your floor plans</p>${card(sel === 'fp1', thumb(P1).replace('width:56px;height:38px', 'width:38px;height:38px'), '#fff', 'Forest Hills Commons · Level 1', 'Every resident room, scoped', chip(P1.rooms + ' rooms') + chip(sensors(P1) + ' sensors'))}${card(false, thumb(P2).replace('width:56px;height:38px', 'width:38px;height:38px'), '#fff', 'Forest Hills Commons · Level 2', 'Memory care floor', chip(P2.rooms + ' rooms') + chip(sensors(P2) + ' sensors'), '<span class="rm-new"></span>')}<p class="rm-lbl">Recordings`);
};
const PVIEW = `<div class="rm-in" style="max-width:960px">
  <div class="rm-top"><div><p class="rm-eyebrow">Floor plan</p><h1 class="rm-h1">Forest Hills Commons · Level 1</h1><p class="rm-lede" style="margin-top:6px">Louisville, KY · 28 resident rooms · where each sensor goes</p></div>
  <div class="rm-btns"><span class="rm-b dk">⤓ Download PDF</span><span class="rm-b">💬 Comment</span></div></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:16px">${legend(P1)}</div>
  <div class="viewer"><div class="sheet">${P1.svg}</div><div class="vpages"><span class="on">Level 1</span><span>Level 2</span></div><div class="vctl"><span>＋</span><span>−</span><span>⤢</span></div></div>
  <div class="rm-cols" style="grid-template-columns:1.5fr 1fr">
    <div class="rm-box"><h4>Rooms on this floor</h4>${summary(P1)}</div>
    <div class="rm-box"><h4>Notes</h4><p style="margin:0;font-size:12.5px;line-height:1.55;color:#3A4250">Rooms 104 and 108 are larger two-bedrooms, so they get a second and third sensor. The dining room and nurse station aren’t monitored.</p>
      <p style="margin:12px 0 0;font-size:12px;color:#6B7380">Something look off? Click a room on the plan to comment on it.</p></div>
  </div></div>`;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1240 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(B + '/login'); await p.getByLabel('Email').fill('kevin@example.com'); await p.getByLabel('Password').fill('admin password 123');
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL(/\/deals/);
  await p.goto(B + '/proposal/100'); await p.waitForTimeout(2000);
  await p.addStyleTag({ content: CSS });
  const put = (h) => p.evaluate((h) => { document.querySelectorAll('.re,.dlg').forEach((x) => x.remove()); const d = document.createElement('div'); d.innerHTML = h; document.body.append(...d.children); }, h);
  // 1. Add menu gains "Add scoped floor plans" → picker.
  const src = fs.readFileSync(M + 'roomedit.js', 'utf8');
  const sideFn = eval('(' + 'function(){' + src.slice(src.indexOf('const card ='), src.indexOf('const bar =')) + 'return side;}' + ')')();
  await put(`<div class="re">${bar}<div class="re-body">${sideFn('team', false)}<main class="re-main"></main></div></div>` + PICK);
  await p.waitForTimeout(400); await p.screenshot({ path: M + 'fp-pick.png' });
  // 2. Editor with the plan selected (Page mode).
  await put(`<div class="re">${bar}<div class="re-body">${sideRep('fp1')}<main class="re-main">${EDIT}</main></div></div>`);
  await p.evaluate(() => { const s = document.querySelector('.re-side'); const c = [...s.querySelectorAll('.re-card')].find((x) => /Level 1/.test(x.textContent)); s.scrollTop = c.offsetTop - 200; });
  await p.waitForTimeout(400); await p.screenshot({ path: M + 'fp-edit.png' });
  // 3. Prospect view.
  const { link } = await (await p.request.put(B + '/api/quotes/17/share', { data: { versionId: 100, emails: ['dana.lee@abcseniorliving.com'] } })).json();
  const pr = await (await b.newContext({ viewport: { width: 1440, height: 1240 }, deviceScaleFactor: 2 })).newPage();
  await pr.goto(B + '/p/' + link.token); await pr.getByLabel('Your work email').fill('dana.lee@abcseniorliving.com');
  await pr.getByRole('button', { name: 'Open the proposal' }).click(); await pr.waitForSelector('article#proposal'); await pr.waitForTimeout(1800);
  await pr.addStyleTag({ content: CSS });
  await pr.evaluate((html) => {
    const hdr = document.querySelector('[data-prospect] header .flex');
    const tabs = document.createElement('span'); tabs.className = 'rm-tabs'; tabs.innerHTML = '<span>Proposal</span><span class="on">Resources</span>';
    hdr.children[0].after(tabs);
    [...hdr.querySelectorAll('button')].forEach((x) => { if (/Contents|PDF|Table of contents/.test(x.getAttribute('aria-label') || x.title || x.textContent)) x.style.display = 'none'; });
    const sp = [...hdr.children].find((c) => /Proposal for/.test(c.textContent)); if (sp) sp.style.display = 'none';
    const wrap = document.querySelector('.proposal-doc').parentElement; wrap.className = ''; wrap.style.padding = '0'; wrap.innerHTML = html;
    document.querySelectorAll('nav[aria-label="Contents"]').forEach((n) => (n.style.display = 'none'));
    const s = document.querySelector('.rm-side'); const c = [...s.querySelectorAll('.rm-card')].find((x) => /Level 1/.test(x.textContent)); s.scrollTop = c.offsetTop - 260;
  }, `<div class="rm">${prospectSide('fp1')}<main class="rm-main">${PVIEW}</main></div>`);
  await pr.waitForTimeout(600); await pr.screenshot({ path: M + 'fp-prospect.png' });
  await p.request.delete(B + '/api/quotes/17/share');
  await b.close();
})();
