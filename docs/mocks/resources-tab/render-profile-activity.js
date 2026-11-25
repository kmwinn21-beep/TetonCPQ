const { chromium } = require('playwright');
const fs = require('fs');
const M = '/tmp/claude-0/-home-user-TetonCPQ/f858fe51-a88a-5942-af90-c35ac8773983/scratchpad/mock/';
const B = 'http://localhost:3100';
const grab = (f) => { const t = fs.readFileSync(M + f, 'utf8'); return t.slice(t.indexOf('const CSS = `') + 13, t.indexOf('`;', t.indexOf('const CSS = `'))); };
const CSS = grab('roomedit.js') + grab('room.js') + `
.pf{font-family:Inter,system-ui,sans-serif;color:#1C2430;padding:28px 36px 48px;max-width:1180px}
.pf *{box-sizing:border-box}
.pf h1{font-size:24px;font-weight:700;margin:0}
.pf .sub{font-size:13.5px;color:#6B7380;margin-top:4px}
.pf-grid{display:grid;grid-template-columns:1fr 430px;gap:24px;margin-top:20px;align-items:start}
.pf-card{background:#fff;border:1px solid #E6E8EB;border-radius:16px;padding:18px 20px}
.pf-card h3{margin:0 0 12px;font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;display:flex;align-items:center}
.pf-photo{display:flex;gap:18px;align-items:center}
.pf-ph{width:112px;height:112px;border-radius:50%;background:linear-gradient(145deg,#E9A08E,#C4553F);display:grid;place-items:center;font:700 34px Inter;color:#fff;position:relative;flex-shrink:0}
.pf-ph::after{content:'';position:absolute;inset:-5px;border-radius:50%;border:2px dashed #C9CDD3}
.pf-f{display:block;margin-bottom:12px}.pf-f>span{display:block;font-size:12px;font-weight:600;margin-bottom:5px}
.pf-i{width:100%;min-height:38px;border-radius:10px;border:1px solid #D5D9DE;padding:9px 11px;font:13px Inter;color:#1C2430;background:#fff;line-height:1.4}
.pf-i.ro{background:#F6F7F9;color:#6B7380}
.pf-i.f{border-color:#3F8CEA;box-shadow:0 0 0 3px rgba(63,140,234,.15)}
.pf-h{font-size:11.5px;color:#8A919C;margin-top:4px}
.pf-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pf-btn{height:36px;padding:0 14px;border-radius:10px;border:1px solid #D5D9DE;background:#fff;font:600 13px Inter;display:inline-flex;align-items:center;gap:6px;color:#1C2430}
.pf-btn.dk{background:#1C2430;color:#fff;border-color:#1C2430}
.pf-prev{position:sticky;top:20px}
.pf-prev .rm-owner{margin-top:0;grid-template-columns:110px 1fr;gap:14px;padding:14px}
.pf-prev .rm-owner h2{font-size:18px}
.pf-prev .rm-photo{font-size:30px;border-radius:12px}
.pf-prev .rm-contact{font-size:12px;gap:4px 12px}
.pf-prev .rm-btns .rm-b{height:32px;font-size:12px;padding:0 11px}
.pf-tag{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8A919C;margin:14px 0 6px}
.pf-sw{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #F1EEE7;font-size:13px}
/* activity */
.av{position:fixed;inset:0;z-index:200;background:#FBF8F3;font-family:Inter,system-ui,sans-serif;color:#1C2430;display:flex;flex-direction:column}
.av *{box-sizing:border-box}
.av-body{flex:1;overflow:auto;padding:24px 34px 40px}
.av-in{max-width:1180px;margin:0 auto}
.av-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.av-k{background:#fff;border:1px solid #E8E4DC;border-radius:14px;padding:14px 16px}
.av-k b{display:block;font-size:24px;font-weight:700;letter-spacing:-.5px}
.av-k span{font-size:12px;color:#6B7380}
.av-k small{display:block;font-size:11.5px;color:#256B41;font-weight:600;margin-top:4px}
.av-grid{display:grid;grid-template-columns:1fr 360px;gap:16px;margin-top:16px;align-items:start}
.av-box{background:#fff;border:1px solid #E8E4DC;border-radius:15px;padding:14px 16px}
.av-box h4{margin:0 0 10px;font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;display:flex;align-items:center}
.av-box h4 i{margin-left:auto;font-style:normal;text-transform:none;letter-spacing:0;color:#6B7380;font-weight:500;font-size:11.5px}
.av-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.av-tbl th{font-size:10.5px;font-weight:700;color:#6B7380;text-align:center;padding:6px 4px 10px;vertical-align:bottom}
.av-tbl th:first-child{text-align:left}
.av-tbl td{padding:5px 4px;border-top:1px solid #F1EEE7;text-align:center}
.av-tbl td:first-child{text-align:left;padding-left:0}
.av-tbl td:first-child b{display:block;font-size:12.5px}.av-tbl td:first-child small{font-size:11px;color:#8A919C}
.cell{display:inline-grid;place-items:center;min-width:64px;padding:0 9px;white-space:nowrap;height:30px;border-radius:8px;font-size:11.5px;font-weight:600}
.c0{background:#F6F4F0;color:#B9BFC7}.c1{background:#E3F3E8;color:#256B41}.c2{background:#BFE6CB;color:#1E5A36}.c3{background:#2E9E5B;color:#fff}
.ppl{display:flex;flex-direction:column;align-items:center;gap:4px}
.ppl .re-av{width:30px;height:30px;font-size:10.5px}
.feed{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:9px 0;border-top:1px solid #F1EEE7;font-size:12.5px;line-height:1.4}
.feed:first-of-type{border-top:0}
.feed .re-av{width:30px;height:30px;font-size:10.5px}
.feed small{display:block;color:#8A919C;font-size:11px;margin-top:2px}
.hot{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:#B4442C;background:#FDF0EE;border-radius:999px;padding:2px 8px;margin-left:6px}
.av-filter{display:flex;gap:8px;align-items:center;margin-left:auto}
.av-filter span{height:32px;padding:0 11px;border-radius:9px;border:1px solid #D5D9DE;background:#fff;font:600 12.5px Inter;display:inline-flex;align-items:center;gap:6px}
`;
const PROFILE = `<div class="pf">
  <h1>Your profile</h1><p class="sub">What prospects see on a shared link’s Resources tab and in the emails you send. Teammates see it when you’re added to their deals.</p>
  <div class="pf-grid"><div>
    <div class="pf-card"><h3>Photo</h3>
      <div class="pf-photo"><span class="pf-ph">KW</span><div><div style="display:flex;gap:8px"><span class="pf-btn dk">⤒ Upload a photo</span><span class="pf-btn">Remove</span></div>
      <p class="pf-h" style="margin-top:8px">A clear, friendly headshot works best. JPG or PNG, square, at least 400 × 400. You can drag to position it in the circle.</p></div></div></div>
    <div class="pf-card" style="margin-top:14px"><h3>About you</h3>
      <div class="pf-2"><label class="pf-f"><span>Name</span><div class="pf-i">Kevin Winn</div></label><label class="pf-f"><span>Title</span><div class="pf-i f">Senior Account Executive</div></label></div>
      <div class="pf-2"><label class="pf-f"><span>Email</span><div class="pf-i ro">kevin@teton.ai</div><p class="pf-h">Your sign-in email; replies to your emails come here.</p></label><label class="pf-f"><span>Phone</span><div class="pf-i">(502) 555-0142</div></label></div>
      <label class="pf-f"><span>Scheduling link <span style="font-weight:400;color:#8A919C">(optional)</span></span><div class="pf-i">https://calendly.com/kevin-teton/30min</div><p class="pf-h">Calendly, HubSpot Meetings, Google or Outlook booking pages. Powers “Book a meeting”.</p></label>
      <label class="pf-f"><span>LinkedIn <span style="font-weight:400;color:#8A919C">(optional)</span></span><div class="pf-i">linkedin.com/in/kevinwinn</div></label>
      <label class="pf-f" style="margin-bottom:0"><span>Short bio <span style="font-weight:400;color:#8A919C">(optional, shown when a prospect opens your card)</span></span><div class="pf-i" style="min-height:62px">Eight years helping senior living operators adopt new care technology. Based in Louisville.</div></label></div>
    <div class="pf-card" style="margin-top:14px"><h3>On shared links</h3>
      <div class="pf-sw" style="border-top:0;padding-top:0"><span>Show my phone number to prospects</span><span class="re-sw"></span></div>
      <div class="pf-sw"><span>Show “Book a meeting” by default</span><span class="re-sw"></span></div>
      <div class="pf-sw"><span>Email me when a prospect opens a resource<br><small style="color:#8A919C">Otherwise it’s in your notifications only</small></span><span class="re-sw off"></span></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><span class="pf-btn">Cancel</span><span class="pf-btn dk">Save profile</span></div>
  </div>
  <div class="pf-prev"><div class="pf-card" style="background:#FBF8F3">
    <h3>How prospects see you</h3>
    <p class="pf-tag" style="margin-top:0">As the main point of contact</p>
    <div class="rm-owner"><div class="rm-photo" style="background:linear-gradient(145deg,#E9A08E,#C4553F)">KW</div><div><span class="rm-chip" style="background:#FDF0EE;color:#B4442C">Your main point of contact</span><h2>Kevin Winn</h2><div class="rm-title">Senior Account Executive · Teton</div><div class="rm-contact"><span><i>✉</i>kevin@teton.ai</span><span><i>☏</i>(502) 555-0142</span></div><div class="rm-btns"><span class="rm-b dk">✉ Email</span><span class="rm-b">📅 Book a meeting</span></div></div></div>
    <p class="pf-tag">On someone else’s deal</p>
    <div class="rm-mate"><span class="rm-av" style="background:linear-gradient(145deg,#E9A08E,#C4553F)">KW</span><div><b>Kevin Winn</b><div class="rm-title">Senior Account Executive</div><p>Their line for that deal goes here.</p><div class="rm-contact"><span><i>✉</i>kevin@teton.ai</span><span><i>☏</i>(502) 555-0142</span></div></div></div>
    <p class="pf-tag">In emails</p>
    <div style="display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #ECEEF1;border-radius:12px;padding:10px 12px;font-size:12.5px"><span style="font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#8A919C">Sent by:</span><span class="rm-av" style="width:28px;height:28px;font-size:10px;background:linear-gradient(145deg,#E9A08E,#C4553F)">KW</span><span>Kevin Winn · Senior Account Executive · Teton</span></div>
  </div></div></div></div>`;

const cell = (lvl, t) => `<span class="cell c${lvl}">${t}</span>`;
const ACT = `<div class="re-bar"><div><b>Activity</b><br><small>ABC Senior Living · Resources and proposal</small></div><span style="flex:1"></span><span class="re-btn">← Back to Resources</span><span class="re-btn wh">Done</span></div>
<div class="av-body"><div class="av-in">
  <div style="display:flex;align-items:flex-end"><div><p class="re-eb">Engagement</p><h2 class="re-h">Who’s looked at what</h2><p class="re-p">From the people signed in to this deal’s link. Times are time on the page or time watched.</p></div>
  <div class="av-filter"><span>Last 30 days ▾</span><span>Everyone ▾</span><span>⤓ Export</span></div></div>
  <div class="av-kpis">
    <div class="av-k"><b>3 of 4</b><span>people on the link have visited</span><small>Marcus Hill (COO) visited for the first time today</small></div>
    <div class="av-k"><b>1 h 12 m</b><span>total time spent</span><small>↑ 38 min this week</small></div>
    <div class="av-k"><b>7 of 8</b><span>resources opened</span><small style="color:#8A919C">Security & privacy not opened yet</small></div>
    <div class="av-k"><b>2 h ago</b><span>last visit · Dana Lee</span><small>Watched the pricing part of the call twice</small></div>
  </div>
  <div class="av-grid">
    <div class="av-box"><h4>By resource and person <i>darker = more time</i></h4>
      <table class="av-tbl"><thead><tr><th></th>
        <th><div class="ppl"><span class="re-av" style="background:#E7E2FB;color:#6A5BC7">DL</span>Dana Lee</div></th>
        <th><div class="ppl"><span class="re-av" style="background:#FCE7D6;color:#B4612C">CF</span>Chris Fox</div></th>
        <th><div class="ppl"><span class="re-av" style="background:#DDEBFA;color:#1F5FB5">MH</span>Marcus Hill</div></th>
        <th><div class="ppl"><span class="re-av" style="background:#EEF0F2;color:#8A919C">RS</span>R. Shah</div></th></tr></thead>
      <tbody>
        <tr><td><b>Proposal</b><small>14 pages</small></td><td>${cell(3, '24 min · p.6 ×3')}</td><td>${cell(1, '6 min')}</td><td>${cell(2, '11 min')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Your Team</b></td><td>${cell(1, '2 min')}</td><td>${cell(1, '1 min')}</td><td>${cell(1, '1 min')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Teton overview deck</b><small>PDF</small></td><td>${cell(2, '7 min · ⤓')}</td><td>${cell(1, '2 min')}</td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Pilot program one pager</b></td><td>${cell(1, '3 min')}</td><td>${cell(0, '—')}</td><td>${cell(2, '4 min · ⤓')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Security & privacy</b><small>PDF</small></td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Sunrise Gardens case study</b><small>Link</small></td><td>${cell(0, '—')}</td><td>${cell(1, '↗ clicked')}</td><td>${cell(1, '↗ clicked')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Discovery call</b><small>Video · 42 min</small></td><td>${cell(3, '18 of 42 min')}</td><td>${cell(1, 'opened')}</td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td></tr>
        <tr><td><b>Product demo</b><small>Video · Loom</small></td><td>${cell(1, 'played')}</td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td><td>${cell(0, '—')}</td></tr>
      </tbody></table>
      <p class="re-hint" style="margin-top:10px">Click a cell for that person’s visits. “p.6 ×3”: the proposal page they came back to most. Loom shows “played”; uploaded, YouTube and Vimeo videos show how much was watched.</p></div>
    <div>
      <div class="av-box"><h4>Recent</h4>
        <div class="feed"><span class="re-av" style="background:#DDEBFA;color:#1F5FB5">MH</span><div><b>Marcus Hill</b> opened the link for the first time <span class="hot">New person</span><small>Today, 11:42 AM · added to the link Nov 20</small></div></div>
        <div class="feed"><span class="re-av" style="background:#DDEBFA;color:#1F5FB5">MH</span><div><b>Marcus Hill</b> downloaded the Pilot program one pager<small>Today, 11:49 AM</small></div></div>
        <div class="feed"><span class="re-av" style="background:#E7E2FB;color:#6A5BC7">DL</span><div><b>Dana Lee</b> watched 32:40–38:10 of the Discovery call <b>(Pricing)</b>, twice<small>Today, 9:14 AM</small></div></div>
        <div class="feed"><span class="re-av" style="background:#E7E2FB;color:#6A5BC7">DL</span><div><b>Dana Lee</b> spent 9 min on <b>The investment</b> (proposal p.6)<small>Yesterday, 4:02 PM</small></div></div>
        <div class="feed"><span class="re-av" style="background:#FCE7D6;color:#B4612C">CF</span><div><b>Chris Fox</b> clicked the Sunrise Gardens case study<small>Nov 23</small></div></div>
        <div class="feed"><span class="re-av" style="background:#E7E2FB;color:#6A5BC7">DL</span><div><b>Dana Lee</b> downloaded the Teton overview deck<small>Nov 22</small></div></div>
      </div>
      <div class="av-box" style="margin-top:14px"><h4>Worth a follow-up</h4>
        <div class="feed" style="border-top:0"><span>🔥</span><div>Dana keeps coming back to <b>pricing</b> (proposal p.6, call 32:40).<small>Maybe send the CapEx option or offer a pricing call.</small></div></div>
        <div class="feed"><span>👀</span><div><b>R. Shah</b> hasn’t opened the link.<small>Emailed Nov 12 · <u>Send again</u></small></div></div>
        <div class="feed"><span>🔒</span><div>No one has opened <b>Security & privacy</b>.<small>Jordan may want to walk their IT through it.</small></div></div>
      </div>
    </div>
  </div>
</div></div>`;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(B + '/login'); await p.getByLabel('Email').fill('kevin@example.com'); await p.getByLabel('Password').fill('admin password 123');
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL(/\/deals/); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: CSS });
  const ok = await p.evaluate((html) => { const m = document.querySelector('main'); if (!m) return false; m.innerHTML = html; m.scrollTop = 0; return true; }, PROFILE);
  console.log('main found', ok);
  await p.waitForTimeout(500);
  await p.screenshot({ path: M + 'profile.png' });
  await p.evaluate((h) => { const d = document.createElement('div'); d.className = 'av'; d.innerHTML = h; document.body.appendChild(d); }, ACT);
  await p.waitForTimeout(400);
  await p.screenshot({ path: M + 'activity.png' });
  await b.close();
})();
