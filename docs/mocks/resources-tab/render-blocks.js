const { chromium } = require('playwright');
const fs = require('fs');
const M = '/tmp/claude-0/-home-user-TetonCPQ/f858fe51-a88a-5942-af90-c35ac8773983/scratchpad/mock/';
const B = 'http://localhost:3100';
const grab = (f) => { const t = fs.readFileSync(M + f, 'utf8'); return t.slice(t.indexOf('const CSS = `') + 13, t.indexOf('`;', t.indexOf('const CSS = `'))); };
const CSS = grab('roomedit.js') + grab('room.js') + `
.re-seg{display:inline-flex;background:#F1EEE8;border-radius:10px;padding:3px;gap:2px}
.re-seg span{padding:6px 14px;border-radius:8px;font:600 12.5px Inter;color:#6B7380}
.re-seg span.on{background:#fff;color:#1C2430;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.pv{background:#fff;border:1px solid #E8E4DC;border-radius:18px;padding:22px 24px 26px;margin-top:14px}
.pv .rm-video{margin-top:0;aspect-ratio:16/8}
.blk{position:relative;margin-top:14px;border-radius:14px;outline:1.5px dashed transparent;outline-offset:6px}
.blk.sel{outline-color:#3F8CEA}
.blk.hov{outline-color:#C9D3DF}
.blk-tb{position:absolute;right:-2px;top:-36px;display:flex;gap:2px;background:#1C2430;border-radius:9px;padding:3px;z-index:2}
.blk-tb span{height:26px;min-width:26px;padding:0 7px;border-radius:6px;display:grid;place-items:center;color:#fff;font:600 11.5px Inter}
.blk-tb span.lbl{color:#A9ADB4;padding-right:9px;border-right:1px solid #3A3D44;border-radius:0}
.blk-tag{position:absolute;left:-2px;top:-30px;font:700 10px Inter;letter-spacing:1px;text-transform:uppercase;color:#3F8CEA}
.ed{outline:1px solid #3F8CEA;border-radius:4px;background:#F3F7FD}
.addline{display:flex;align-items:center;gap:10px;margin:18px 0 6px;color:#8A919C;font:600 12px Inter}
.addline::before,.addline::after{content:'';flex:1;border-top:1px dashed #C9CDD3}
.addline span{height:28px;padding:0 12px;border-radius:999px;border:1px solid #C9CDD3;background:#fff;display:inline-flex;align-items:center;gap:6px;color:#1C2430}
.amenu{position:relative;margin:0 auto 4px;width:520px;background:#fff;border:1px solid #ECE8DF;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.16);padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:2px}
.amenu .re-mi{padding:8px 9px}
.amenu .re-mi b{font-size:12.5px}.amenu .re-mi small{font-size:11px}
.amenu .re-ic{width:30px;height:30px;font-size:13px}
.mom-add{display:inline-flex;gap:6px;align-items:center;height:30px;padding:0 11px;border-radius:9px;background:#EEF5FE;color:#1F5FB5;font:600 12px Inter;margin-top:8px}
.rtb{display:flex;gap:2px;margin-bottom:6px}
.rtb span{height:26px;min-width:26px;padding:0 7px;border-radius:6px;display:grid;place-items:center;font:700 12px Inter;color:#3A4250;background:#F6F4F0}
.quote{background:#FBF8F3;border-left:3px solid #D9553F;border-radius:0 14px 14px 0;padding:14px 18px}
.quote p{margin:0;font-size:16px;line-height:1.45;font-weight:500;letter-spacing:-.2px}
.quote small{display:block;margin-top:8px;font-size:12px;color:#6B7380}
.cta{display:flex;align-items:center;gap:14px;background:#16181D;color:#fff;border-radius:15px;padding:16px 18px}
.cta b{font-size:15px}.cta small{display:block;font-size:12px;color:#A9ADB4;margin-top:2px}
.cta span.go{margin-left:auto;height:38px;padding:0 15px;border-radius:10px;background:#fff;color:#1C2430;font:600 13px Inter;display:inline-flex;align-items:center;white-space:nowrap}
.rel{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rel div{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #E8E4DC;border-radius:12px;padding:10px 12px;font-size:12.5px}
.rel b{display:block;font-size:13px}
.rm-box ul{list-style:disc}
`;
const MOMENTS = (edit) => `<div class="rm-box"><h4>Key moments</h4>
  <div class="rm-mom"><b>04:55</b><span>Falls at Maple Grove: what’s driving them</span></div>
  <div class="rm-mom"><b ${edit ? 'class="ed"' : ''}>13:02</b><span ${edit ? 'class="ed"' : ''}>How the sensor works without cameras in view</span></div>
  <div class="rm-mom"><b>23:10</b><span>Pilot scope: which communities and when</span></div>
  <div class="rm-mom"><b>32:40</b><span>Pricing and the post-pilot term</span></div>
  ${edit ? '<span class="mom-add">＋ Add a moment at 13:02 <span style="color:#8A919C;font-weight:500">(where the video is paused)</span></span>' : ''}</div>`;
const SUMMARY = (edit) => `<div class="rm-box">${edit ? '<div class="rtb"><span>B</span><span><i>I</i></span><span>•</span><span>1.</span><span>🔗</span></div>' : ''}<h4>What we heard</h4><ul><li>Two AL/MC communities for a 3-month pilot, starting in January.</li><li>IT review needed before install (Jordan sends the network checklist).</li><li>Dana brings in the COO for the pricing discussion.</li></ul></div>`;
const QUOTE = `<div class="quote"><p>“If we can catch even half of the unwitnessed falls at Maple Grove, this pays for itself.”</p><small>Dana Lee, VP of Operations · 05:40 in the call</small></div>`;
const CTA = `<div class="cta"><div><b>Ready to pick your pilot dates?</b><small>Book 30 minutes with Kevin to lock in January.</small></div><span class="go">📅 Book the kickoff</span></div>`;
const REL = `<div class="rel"><div><span class="rm-ic" style="background:#E7E2FB;width:34px;height:34px">▤</span><span><b>Teton overview deck</b>The slides from this call</span></div><div><span class="rm-ic" style="background:#FFF4D6;width:34px;height:34px">★</span><span><b>Sunrise Gardens case study</b>The 38% result Kevin mentioned</span></div></div>`;
const VIDEO = `<div class="rm-video"><span class="rm-play"><svg width="24" height="26" viewBox="0 0 24 26"><path d="M3 2l19 11L3 24z" fill="#1C2430"/></svg></span><div class="rm-vbar"><span>13:02</span><div><i></i><s style="left:12%"></s><s style="left:31%"></s><s style="left:55%"></s><s style="left:78%"></s></div><span>42:10</span></div></div>`;
const tb = (label) => `<div class="blk-tb"><span class="lbl">${label}</span><span>↑</span><span>↓</span><span>⧉</span><span>✕</span></div>`;

const EDITOR = (side) => `<div class="re-bar"><div><b>Resources</b><br><small>ABC Senior Living · on the shared link</small></div><div class="re-tn">Tab name <span>Resources ✎</span></div><span style="flex:1"></span><span class="re-btn">👁 Preview as prospect</span><span class="re-btn">Activity</span><span class="re-btn wh">Done</span></div>
<div class="re-body">${side}<main class="re-main"><div class="re-in" style="max-width:900px">
  <div style="display:flex;align-items:flex-end;gap:14px"><div><p class="re-eb">Recordings</p><h2 class="re-h">Discovery call</h2><p class="re-p">Click anything on the page to change it; hover a block to move or remove it.</p></div>
  <span class="re-seg" style="margin-left:auto"><span>Settings</span><span class="on">Page</span></span></div>
  <div class="pv">
    <p class="rm-eyebrow">Recording</p><h1 class="rm-h1" style="font-size:26px">Discovery call</h1><p class="rm-lede" style="margin:4px 0 16px">Nov 12, 2026 · 42 min · Kevin Winn, Dana Lee, Chris Fox</p>
    ${VIDEO}
    <div class="rm-cols" style="margin-top:44px">
      <div class="blk sel">${tb('Key moments')}${MOMENTS(true)}</div>
      <div class="blk hov">${tb('Text')}${SUMMARY(true)}</div>
    </div>
    <div class="blk" style="margin-top:18px">${QUOTE}</div>
    <div class="addline"><span>＋ Add a block</span></div>
    <div class="amenu">
      <div class="re-mi"><span class="re-ic" style="background:#EEF5FE">⏱</span><div><b>Key moments</b><small>Times that jump the video</small></div></div>
      <div class="re-mi"><span class="re-ic" style="background:#F1EEE8">¶</span><div><b>Text</b><small>A heading and a paragraph or bullets</small></div></div>
      <div class="re-mi"><span class="re-ic" style="background:#FDF0EE">❝</span><div><b>Quote</b><small>Something the customer said, with a time</small></div></div>
      <div class="re-mi hov"><span class="re-ic" style="background:#16181D;color:#fff">▸</span><div><b>Button</b><small>Book a meeting, open the proposal, any link</small></div></div>
      <div class="re-mi"><span class="re-ic" style="background:#E7E2FB">▤</span><div><b>Related resources</b><small>Point to other cards on this tab</small></div></div>
      <div class="re-mi"><span class="re-ic" style="background:#EEF8F1">☑</span><div><b>Next steps</b><small>A short checklist: who does what, by when</small></div></div>
      <div class="re-mi"><span class="re-ic" style="background:#FFF4D6">🖼</span><div><b>Image</b><small>A screenshot or photo, with a caption</small></div></div>
      <div class="re-mi"><span class="re-ic" style="background:#F1EEE8">⤓</span><div><b>File</b><small>A download that goes with this video</small></div></div>
    </div>
  </div>
</div></main></div>`;

const PROSPECT = `<div class="rm-in">
  <div class="rm-top"><div><p class="rm-eyebrow">Recording</p><h1 class="rm-h1">Discovery call</h1><p class="rm-lede" style="margin-top:6px">Nov 12, 2026 · 42 min · Kevin Winn, Dana Lee, Chris Fox</p></div>
  <div class="rm-btns"><span class="rm-b">💬 Comment</span></div></div>
  ${VIDEO.replace('rm-video', 'rm-video" style="margin-top:20px')}
  <div class="rm-cols">${MOMENTS(false)}${SUMMARY(false)}</div>
  <div style="margin-top:16px">${QUOTE}</div>
  <div style="margin-top:16px">${CTA}</div>
  <p class="rm-h3" style="margin-top:22px">Related</p>${REL}
</div>`;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1240 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(B + '/login'); await p.getByLabel('Email').fill('kevin@example.com'); await p.getByLabel('Password').fill('admin password 123');
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL(/\/deals/);
  await p.goto(B + '/proposal/100'); await p.waitForTimeout(2000);
  await p.addStyleTag({ content: CSS });
  // Reuse the editor's left list from the earlier mock.
  const src = fs.readFileSync(M + 'roomedit.js', 'utf8');
  const sideFn = eval('(' + 'function(){' + src.slice(src.indexOf('const card ='), src.indexOf('const bar =')) + 'return side;}' + ')')();
  await p.evaluate((h) => { const d = document.createElement('div'); d.className = 're'; d.innerHTML = h; document.body.appendChild(d); }, EDITOR(sideFn('call', false)));
  await p.waitForTimeout(500);
  await p.screenshot({ path: M + 'res-blocks-edit.png' });
  // Prospect result.
  const { link } = await (await p.request.put(B + '/api/quotes/17/share', { data: { versionId: 100, emails: ['dana.lee@abcseniorliving.com'] } })).json();
  const pr = await (await b.newContext({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 2 })).newPage();
  await pr.goto(B + '/p/' + link.token); await pr.getByLabel('Your work email').fill('dana.lee@abcseniorliving.com');
  await pr.getByRole('button', { name: 'Open the proposal' }).click(); await pr.waitForSelector('article#proposal'); await pr.waitForTimeout(1800);
  await pr.addStyleTag({ content: CSS });
  const rsrc = fs.readFileSync(M + 'room.js', 'utf8');
  const rside = eval('(' + 'function(){' + rsrc.slice(rsrc.indexOf('const P ='), rsrc.indexOf('const contact =')) + 'return side;}' + ')')();
  await pr.evaluate((html) => {
    const hdr = document.querySelector('[data-prospect] header .flex');
    const tabs = document.createElement('span'); tabs.className = 'rm-tabs'; tabs.innerHTML = '<span>Proposal</span><span class="on">Resources</span>';
    hdr.children[0].after(tabs);
    [...hdr.querySelectorAll('button')].forEach((x) => { if (/Contents|PDF|Table of contents/.test(x.getAttribute('aria-label') || x.title || x.textContent)) x.style.display = 'none'; });
    const sp = [...hdr.children].find((c) => /Proposal for/.test(c.textContent)); if (sp) sp.style.display = 'none';
    const wrap = document.querySelector('.proposal-doc').parentElement; wrap.className = ''; wrap.style.padding = '0'; wrap.innerHTML = html;
    document.querySelectorAll('nav[aria-label="Contents"]').forEach((n) => (n.style.display = 'none'));
  }, `<div class="rm">${rside('call')}<main class="rm-main">${PROSPECT}</main></div>`);
  await pr.waitForTimeout(600);
  await pr.screenshot({ path: M + 'res-blocks-prospect.png' });
  await p.request.delete(B + '/api/quotes/17/share');
  await b.close();
})();
