const { chromium } = require('playwright');
const B = 'http://localhost:3100', OUT = '/tmp/claude-0/-home-user-TetonCPQ/f858fe51-a88a-5942-af90-c35ac8773983/scratchpad/mock/';
const CSS = `
.re{position:fixed;inset:0;z-index:200;background:#FBF8F3;font-family:Inter,system-ui,sans-serif;color:#1C2430;display:flex;flex-direction:column}
.re *{box-sizing:border-box}
.re-bar{display:flex;align-items:center;gap:12px;height:64px;padding:0 20px;background:#16181D;color:#fff;flex-shrink:0}
.re-bar b{font-size:15px}.re-bar small{font-size:12px;color:#A9ADB4}
.re-tn{display:flex;align-items:center;gap:8px;margin-left:18px;font-size:12px;color:#A9ADB4}
.re-tn span{height:32px;padding:0 10px;border-radius:8px;border:1px solid #3A3D44;background:#22252B;color:#fff;display:inline-flex;align-items:center;font-size:13px;font-weight:600;gap:8px}
.re-btn{height:36px;padding:0 14px;border-radius:10px;border:1px solid #D5D9DE;background:#fff;font:600 13px Inter;display:inline-flex;align-items:center;gap:7px;color:#1C2430;white-space:nowrap}
.re-bar .re-btn{background:transparent;color:#fff;border-color:#4A4E56}
.re-btn.dk{background:#1C2430;color:#fff;border-color:#1C2430}
.re-bar .re-btn.wh{background:#fff;color:#1C2430;border-color:#fff}
.re-body{flex:1;min-height:0;display:flex}
.re-side{width:340px;flex-shrink:0;border-right:1px solid #ECE8DF;background:#F6F3EE;padding:16px 14px;overflow:auto}
.re-lbl{display:flex;align-items:center;font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;margin:16px 4px 8px}
.re-lbl:first-child{margin-top:0}.re-lbl i{margin-left:auto;font-style:normal;letter-spacing:0;text-transform:none;font-weight:600;color:#1F5FB5;font-size:11.5px}
.re-card{display:flex;gap:9px;align-items:flex-start;background:#fff;border:1px solid #E8E4DC;border-radius:12px;padding:10px 10px 10px 6px;margin-bottom:7px;position:relative}
.re-card.on{border-color:#3F8CEA;box-shadow:0 0 0 3px rgba(63,140,234,.15)}
.re-card.off{opacity:.55}
.re-gr{color:#B9BFC7;font-size:13px;line-height:34px;cursor:grab;padding:0 1px}
.re-ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;font-size:15px}
.re-card b{display:block;font-size:12.5px;line-height:1.3}
.re-card small{display:block;font-size:11px;color:#6B7380;margin-top:1px}
.re-st{display:flex;gap:9px;margin-top:5px;font-size:10.5px;color:#5A6270;flex-wrap:wrap}
.re-st span{display:inline-flex;gap:3px;align-items:center}
.re-st .hot{color:#256B41;font-weight:600}
.re-dots{margin-left:auto;color:#8A919C;padding:0 4px}
.re-add{width:100%;height:40px;border-radius:10px;border:1px dashed #B9BFC7;background:transparent;font:600 13px Inter;color:#5A6270;margin-top:6px;position:relative}
.re-menu{position:absolute;left:0;right:0;bottom:46px;background:#fff;border-radius:13px;box-shadow:0 16px 40px rgba(0,0,0,.18);border:1px solid #ECE8DF;padding:6px;text-align:left;z-index:3}
.re-mi{display:flex;gap:11px;padding:9px 10px;border-radius:9px;align-items:flex-start}
.re-mi.hov{background:#F3F7FD}
.re-mi b{display:block;font-size:13px;color:#1C2430}.re-mi small{display:block;font-size:11.5px;color:#6B7380;font-weight:400;line-height:1.35}
.re-main{flex:1;min-width:0;overflow:auto;padding:26px 34px 40px}
.re-in{max-width:780px}
.re-eb{font-size:10.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#8A919C}
.re-h{font-size:22px;font-weight:600;margin:4px 0 0;letter-spacing:-.3px}
.re-p{font-size:13px;color:#6B7380;margin-top:4px}
.re-sec{background:#fff;border:1px solid #E8E4DC;border-radius:15px;padding:16px 18px;margin-top:14px}
.re-sec h4{margin:0 0 10px;font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;display:flex;align-items:center}
.re-sec h4 i{margin-left:auto;font-style:normal;text-transform:none;letter-spacing:0;font-weight:600;font-size:12px;color:#1F5FB5}
.re-f{display:block;margin-bottom:11px}.re-f>span{display:block;font-size:12px;font-weight:600;margin-bottom:5px}
.re-in input,.re-in .re-ta,.re-in .re-sel{width:100%;height:38px;border-radius:10px;border:1px solid #D5D9DE;padding:0 11px;font:13px Inter;color:#1C2430;background:#fff;display:flex;align-items:center}
.re-in .re-ta{height:auto;min-height:64px;padding:9px 11px;align-items:flex-start;line-height:1.45}
.re-in .re-sel{justify-content:space-between}
.re-hint{font-size:11.5px;color:#8A919C;margin-top:4px}
.re-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.re-person{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #F1EEE7}
.re-person:first-of-type{border-top:0;padding-top:2px}
.re-av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font:700 14px Inter;color:#fff;flex-shrink:0}
.re-person b{font-size:13px;display:block}.re-person small{font-size:11.5px;color:#6B7380;display:block}
.re-person input{height:32px!important;font-size:12.5px!important}
.re-search{display:flex;align-items:center;gap:8px;height:38px;border:1px dashed #B9BFC7;border-radius:10px;padding:0 11px;font-size:13px;color:#8A919C;margin-top:8px}
.re-pop{margin-top:6px;border:1px solid #E3DFD8;border-radius:12px;background:#fff;box-shadow:0 10px 26px rgba(0,0,0,.1);padding:5px}
.re-pop .re-person{border:0;padding:7px 8px;border-radius:8px}.re-pop .re-person.hov{background:#F3F7FD}
.re-prof{display:flex;gap:14px;align-items:center}
.re-photo{width:72px;height:72px;border-radius:14px;background:linear-gradient(145deg,#E9A08E,#C4553F);display:grid;place-items:center;font:700 22px Inter;color:#fff;flex-shrink:0}
.re-src{display:flex;gap:10px;align-items:center;border:1px solid #E3DFD8;border-radius:11px;padding:10px 12px;background:#FBF8F3}
.re-src b{font-size:13px;display:block}.re-src small{font-size:11.5px;color:#6B7380}
.re-mom{display:grid;grid-template-columns:70px 1fr 24px;gap:8px;margin-bottom:6px}
.re-mom input{height:32px!important;font-size:12.5px!important}
.re-act{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #F1EEE7;font-size:12.5px}
.re-act:first-of-type{border-top:0}
.re-act .re-av{width:30px;height:30px;font-size:10.5px}
.re-bar2{height:6px;border-radius:3px;background:#EFECE6;margin-top:4px;overflow:hidden}.re-bar2 i{display:block;height:100%;background:#2E9E5B}
.re-sw{width:34px;height:20px;border-radius:10px;background:#3F8CEA;position:relative;flex-shrink:0}.re-sw::after{content:'';position:absolute;right:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff}
.re-sw.off{background:#D5D9DE}.re-sw.off::after{right:auto;left:2px}
.re-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #F1EEE7;font-size:13px}
`;
const card = (on, ic, bg, t, sub, st, cls = '') => `<div class="re-card ${on ? 'on' : ''} ${cls}"><span class="re-gr">⋮⋮</span><span class="re-ic" style="background:${bg}">${ic}</span><div style="min-width:0;flex:1"><b>${t}</b><small>${sub}</small>${st ? `<div class="re-st">${st}</div>` : ''}</div><span class="re-dots">⋯</span></div>`;
const side = (sel, menu) => `<aside class="re-side">
  <p class="re-lbl">Start here</p>
  ${card(sel === 'team', '👋', '#FDF0EE', 'Your Team', 'Always first · the landing page', '<span>👁 Dana, Chris</span>')}
  <p class="re-lbl">Decks & documents <i>Rename</i></p>
  ${card(false, '▤', '#E7E2FB', 'Teton overview deck', 'Uploaded PDF · 24 pages · 8 MB', '<span class="hot">👁 2 people · 9 min</span><span>⤓ Dana</span>')}
  ${card(false, '✓', '#EEF8F1', 'Pilot program one pager', 'From One Pagers · always current', '<span>👁 Dana</span>')}
  ${card(false, '🔒', '#F1EEE8', 'Security & privacy', 'Uploaded PDF · 6 pages', '<span>Not opened yet</span>')}
  <p class="re-lbl">Case studies <i>Rename</i></p>
  ${card(false, '★', '#FFF4D6', 'Sunrise Gardens: 38% fewer falls', 'Link · teton.ai/case-studies/…', '<span>↗ 1 click (Chris)</span>')}
  ${card(false, '★', '#FFF4D6', 'Harbor Pointe portfolio rollout', 'Hidden from the prospect', '', 'off')}
  <p class="re-lbl">Recordings <i>Rename</i></p>
  ${card(sel === 'call', '▶', '#1C2430;color:#fff', 'Discovery call', 'Uploaded video · 42 min', '<span class="hot">▶ Dana watched 18 min</span>')}
  ${card(false, '▶', '#1C2430;color:#fff', 'Product demo', 'Embedded · Loom', '<span>Not played yet</span>')}
  <button class="re-add">+ Add to Resources${menu ? `<div class="re-menu">
    <div class="re-mi hov"><span class="re-ic" style="background:#E7E2FB">⤒</span><div><b>Upload a file</b><small>PDF, deck, or a video (MP4, MOV). Prospects view it here and can download it.</small></div></div>
    <div class="re-mi"><span class="re-ic" style="background:#1C2430;color:#fff">▶</span><div><b>Embed a video</b><small>A YouTube, Vimeo, Loom, Wistia, Zoom or Gong share link; it plays right on the page.</small></div></div>
    <div class="re-mi"><span class="re-ic" style="background:#FFF4D6">↗</span><div><b>Add a link</b><small>Any web page (a case study, an article). Opens in a new tab.</small></div></div>
    <div class="re-mi"><span class="re-ic" style="background:#EEF8F1">✓</span><div><b>Add a one pager</b><small>From this deal’s One Pagers, kept up to date.</small></div></div>
    <div class="re-mi"><span class="re-ic" style="background:#F1EEE8">＋</span><div><b>New section</b><small>Group cards under your own heading.</small></div></div>
  </div>` : ''}</button>
</aside>`;
const bar = `<div class="re-bar"><div><b>Resources</b><br><small>ABC Senior Living · on the shared link</small></div>
  <div class="re-tn">Tab name <span>Resources ✎</span></div>
  <span style="flex:1"></span><span class="re-btn">👁 Preview as prospect</span><span class="re-btn">Activity</span><span class="re-btn wh">Done</span></div>`;
const TEAM = `<div class="re-in">
  <p class="re-eb">Your Team · landing page</p><h2 class="re-h">ABC Senior Living’s Teton Team</h2><p class="re-p">The page they see first on the Resources tab.</p>
  <div class="re-sec"><h4>Page</h4>
    <label class="re-f"><span>Heading</span><input value="{customer}’s Teton Team" readonly></label>
    <p class="re-hint" style="margin:-6px 0 10px">{customer} becomes “ABC Senior Living”.</p>
    <label class="re-f" style="margin-bottom:0"><span>Note from you <span style="font-weight:400;color:#8A919C">(optional, under your card)</span></span><div class="re-ta">Great talking today. Everything we discussed is in here: the proposal, the deck, and the call recording.</div></label></div>
  <div class="re-sec"><h4>Main point of contact <i>Edit your profile ↗</i></h4>
    <div class="re-prof"><span class="re-photo">KW</span><div><b style="font-size:15px">Kevin Winn</b><div style="font-size:12.5px;color:#6B7380">Senior Account Executive · kevin@teton.ai · (502) 555-0142</div><div class="re-hint">From your profile (photo, title, phone). The deal owner, by default.</div></div>
    <span class="re-btn" style="margin-left:auto">Change</span></div>
    <div class="re-row" style="margin-top:12px"><span>Show “Book a meeting”<br><small style="color:#8A919C">Your scheduling link: calendly.com/kevin-teton</small></span><span class="re-sw"></span></div></div>
  <div class="re-sec"><h4>Also on their team</h4>
    <div class="re-person"><span class="re-gr">⋮⋮</span><span class="re-av" style="background:#6A5BC7">PN</span><div style="width:170px"><b>Priya Nair</b><small>Implementation Manager</small></div><input value="Runs your site survey, install and go-live." readonly><span class="re-dots">✕</span></div>
    <div class="re-person"><span class="re-gr">⋮⋮</span><span class="re-av" style="background:#2E9E5B">ML</span><div style="width:170px"><b>Marcus Lee</b><small>Clinical Success Lead</small></div><input value="Trains your staff and tracks outcomes during the pilot." readonly><span class="re-dots">✕</span></div>
    <div class="re-person"><span class="re-gr">⋮⋮</span><span class="re-av" style="background:#D9553F">JE</span><div style="width:170px"><b>Jordan Ellis</b><small>Solutions Engineer</small></div><input value="Your IT and network contact: WiFi, power, security review." readonly><span class="re-dots">✕</span></div>
    <div class="re-search">🔍 Add a teammate… <span style="color:#1C2430">al</span></div>
    <div class="re-pop">
      <div class="re-person hov"><span class="re-av" style="background:#1C2430">AR</span><div><b>Dr. Alana Ruiz</b><small>Chief Clinical Officer · alana@teton.ai</small></div></div>
      <div class="re-person"><span class="re-av" style="background:#B07A2A">AK</span><div><b>Alex Kim</b><small>Account Executive · alex@teton.ai</small></div></div>
    </div>
    <p class="re-hint">Name, title, photo and contact come from each person’s profile. The line beside them is just for this deal.</p></div>
</div>`;
const CALL = `<div class="re-in">
  <p class="re-eb">Recordings</p><h2 class="re-h">Discovery call</h2><p class="re-p">Uploaded video · added Nov 12</p>
  <div class="re-sec"><h4>Details</h4>
    <div class="re-2"><label class="re-f"><span>Title</span><input value="Discovery call" readonly></label><label class="re-f"><span>Section</span><div class="re-sel">Recordings <span>▾</span></div></label></div>
    <label class="re-f"><span>Short description (on the card)</span><input value="Nov 12 · Kevin, Dana Lee, Chris Fox" readonly></label>
    <span style="display:block;font-size:12px;font-weight:600;margin-bottom:5px">Source</span>
    <div class="re-src"><span class="re-ic" style="background:#1C2430;color:#fff">▶</span><div><b>discovery-call-nov-12.mp4</b><small>412 MB · 42:10 · plays on the page</small></div><span class="re-btn" style="margin-left:auto">Replace</span></div>
    <div class="re-row" style="margin-top:10px"><span>Let them download it</span><span class="re-sw off"></span></div>
    <div class="re-row"><span>Show this card to the prospect</span><span class="re-sw"></span></div></div>
  <div class="re-sec"><h4>Key moments <i>+ Add</i></h4>
    <div class="re-mom"><input value="04:55" readonly><input value="Falls at Maple Grove: what’s driving them" readonly><span class="re-dots">✕</span></div>
    <div class="re-mom"><input value="13:02" readonly><input value="How the sensor works without cameras in view" readonly><span class="re-dots">✕</span></div>
    <div class="re-mom"><input value="23:10" readonly><input value="Pilot scope: which communities and when" readonly><span class="re-dots">✕</span></div>
    <label class="re-f" style="margin:10px 0 0"><span>Summary</span><div class="re-ta">• Two AL/MC communities for a 3-month pilot, starting in January.<br>• IT review needed before install (Jordan to send the network checklist).<br>• Dana to bring in the COO for the pricing discussion.</div></label></div>
  <div class="re-sec"><h4>Who’s watched it</h4>
    <div class="re-act"><span class="re-av" style="background:#E7E2FB;color:#6A5BC7">DL</span><div><b>Dana Lee</b> watched 18 of 42 min · 2 visits<div class="re-bar2"><i style="width:43%"></i></div></div><span style="color:#8A919C;font-size:11.5px">Nov 13, 9:14 AM</span></div>
    <div class="re-act"><span class="re-av" style="background:#FCE7D6;color:#B4612C">CF</span><div><b>Chris Fox</b> opened it, didn’t play</div><span style="color:#8A919C;font-size:11.5px">Nov 14</span></div>
    <p class="re-hint" style="margin-top:8px">From who’s signed in to the link: opens, time watched, downloads and link clicks. Nothing else to install.</p></div>
</div>`;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(B + '/login'); await p.getByLabel('Email').fill('kevin@example.com'); await p.getByLabel('Password').fill('admin password 123');
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL(/\/deals/);
  await p.request.put(B + '/api/quotes/17/share', { data: { versionId: 100, emails: ['Dana Lee <dana.lee@abcseniorliving.com>', 'chris.fox@abcseniorliving.com'] } });
  await p.goto(B + '/proposal/100'); await p.waitForTimeout(2500);
  await p.addStyleTag({ content: CSS });
  // 1. The Share dialog gets a Resources section.
  await p.getByRole('button', { name: 'Share', exact: true }).click(); await p.waitForTimeout(900);
  await p.evaluate(() => {
    const dlg = document.querySelector('[aria-label="Share this proposal"]');
    const sec = [...dlg.querySelectorAll('button[aria-expanded]')].find((x) => /The email they get/.test(x.textContent));
    if (sec.getAttribute('aria-expanded') === 'true') sec.click();
    const box = sec.parentElement;
    const r = document.createElement('div'); r.className = 'mt-2 rounded-xl border border-teton-off-white';
    r.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px"><span style="font-size:13px;font-weight:600">Resources tab</span><span style="font-size:11.5px;color:#8A919C">8 items · Your Team, 3 documents, 2 case studies, 2 recordings</span><span class="re-sw" style="margin-left:auto"></span></div>
      <div style="padding:0 14px 12px;display:flex;gap:10px;align-items:center">
        <div style="display:flex">${['#1C2430', '#6A5BC7', '#2E9E5B', '#D9553F'].map((c, i) => `<span style="width:24px;height:24px;border-radius:50%;border:2px solid #fff;margin-left:${i ? -7 : 0}px;background:${c};color:#fff;font:700 9px/20px Inter;text-align:center">${['KW', 'PN', 'ML', 'JE'][i]}</span>`).join('')}</div>
        <span style="font-size:12px;color:#256B41;font-weight:600">Dana opened 4 · watched 18 min of the call</span>
        <span class="re-btn dk" style="margin-left:auto;height:32px">Edit Resources →</span></div>`;
    box.after(r);
    r.style.outline = '2px solid #3F8CEA'; r.style.outlineOffset = '2px';
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + 'res-share-dialog.png' });
  // 2. The editor: Your Team.
  const show = async (html) => p.evaluate((h) => { document.querySelectorAll('.re').forEach((x) => x.remove()); const d = document.createElement('div'); d.className = 're'; d.innerHTML = h; document.body.appendChild(d); }, html);
  await show(bar + `<div class="re-body">${side('team')}<main class="re-main">${TEAM}</main></div>`);
  await p.waitForTimeout(400); await p.screenshot({ path: OUT + 'res-edit-team.png' });
  await p.setViewportSize({ width: 1440, height: 1240 });
  await show(bar + `<div class="re-body">${side('call', true)}<main class="re-main">${CALL}</main></div>`);
  await p.evaluate(() => { const sd = document.querySelector('.re-side'); sd.scrollTop = sd.scrollHeight; });
  await p.waitForTimeout(400); await p.screenshot({ path: OUT + 'res-edit-call.png' });
  await p.request.delete(B + '/api/quotes/17/share');
  await b.close();
})();
