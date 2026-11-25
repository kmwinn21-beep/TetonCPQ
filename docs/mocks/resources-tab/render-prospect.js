const { chromium, devices } = require('playwright');
const B = 'http://localhost:3100', OUT = '/tmp/claude-0/-home-user-TetonCPQ/f858fe51-a88a-5942-af90-c35ac8773983/scratchpad/mock/';
const CSS = `
.rm{font-family:Inter,system-ui,sans-serif;color:#1C2430;display:flex;min-height:calc(100vh - 61px);background:#FBF8F3}
.rm *{box-sizing:border-box}
.rm-side{width:316px;flex-shrink:0;border-right:1px solid #ECE8DF;background:#F6F3EE;padding:18px 14px 24px;position:sticky;top:61px;height:calc(100vh - 61px);overflow:auto}
.rm-lbl{font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;margin:16px 6px 8px}
.rm-lbl:first-child{margin-top:2px}
.rm-card{display:flex;gap:11px;align-items:flex-start;background:#fff;border:1px solid #E8E4DC;border-radius:13px;padding:11px 12px;margin-bottom:8px;position:relative;cursor:pointer}
.rm-card.on{border-color:#1C2430;box-shadow:0 0 0 1px #1C2430,0 6px 16px rgba(0,0,0,.07)}
.rm-card.on::before{content:'';position:absolute;left:-15px;top:12px;bottom:12px;width:3px;border-radius:2px;background:#D9553F}
.rm-ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex-shrink:0;font-size:17px}
.rm-card b{display:block;font-size:13px;line-height:1.3}
.rm-card small{display:block;font-size:11.5px;color:#6B7380;line-height:1.35;margin-top:2px}
.rm-meta{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}
.rm-chip{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:999px;background:#F1EEE8;color:#5A6270;font-size:10.5px;font-weight:600}
.rm-new{position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%;background:#3F8CEA}
.rm-stack{display:flex}.rm-stack span{width:22px;height:22px;border-radius:50%;border:2px solid #fff;margin-left:-6px;display:grid;place-items:center;font:700 8.5px Inter;color:#fff}
.rm-stack span:first-child{margin-left:0}
.rm-main{flex:1;min-width:0;padding:34px 44px 60px}
.rm-in{max-width:880px;margin:0 auto;animation:fadeUp .3s ease-out}
.rm-eyebrow{font-size:11px;letter-spacing:3px;font-weight:800;color:#D9553F;text-transform:uppercase}
.rm-h1{font-size:30px;font-weight:600;letter-spacing:-.5px;margin:6px 0 0;line-height:1.15}
.rm-lede{font-size:14px;color:#5A6270;margin-top:8px;line-height:1.55;max-width:620px}
.rm-owner{margin-top:22px;display:grid;grid-template-columns:150px 1fr;gap:22px;background:#fff;border:1px solid #E8E4DC;border-radius:18px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.rm-photo{border-radius:14px;display:grid;place-items:end start;padding:10px;font:700 46px Inter;color:rgba(255,255,255,.95);position:relative;overflow:hidden}
.rm-owner h2{font-size:22px;font-weight:600;margin:4px 0 0;letter-spacing:-.3px}
.rm-title{font-size:13.5px;color:#5A6270;margin-top:2px}
.rm-contact{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:12px;font-size:13px}
.rm-contact span{display:inline-flex;gap:7px;align-items:center;color:#1C2430}
.rm-contact i{font-style:normal;color:#8A919C}
.rm-btns{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.rm-b{height:38px;padding:0 15px;border-radius:10px;border:1px solid #D5D9DE;background:#fff;font:600 13px Inter;display:inline-flex;align-items:center;gap:7px;color:#1C2430}
.rm-b.dk{background:#1C2430;border-color:#1C2430;color:#fff}
.rm-note{margin-top:12px;font-size:12.5px;color:#3A4250;background:#FBF8F3;border-left:3px solid #D9553F;border-radius:0 10px 10px 0;padding:9px 12px;line-height:1.5}
.rm-h3{font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C;margin:26px 0 10px}
.rm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rm-mate{display:flex;gap:13px;background:#fff;border:1px solid #E8E4DC;border-radius:15px;padding:14px}
.rm-av{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font:700 17px Inter;color:#fff;flex-shrink:0}
.rm-mate b{font-size:14px;display:block}
.rm-mate .rm-title{font-size:12px}
.rm-mate p{font-size:12px;color:#5A6270;margin:6px 0 0;line-height:1.45}
.rm-mate .rm-contact{font-size:12px;margin-top:8px;gap:4px 12px}
.rm-tabs{display:inline-flex;background:#F1EEE8;border-radius:10px;padding:3px;gap:2px;margin-left:6px}
.rm-tabs span{padding:6px 13px;border-radius:8px;font:600 13px Inter;color:#6B7380;display:inline-flex;gap:6px;align-items:center}
.rm-tabs span.on{background:#fff;color:#1C2430;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.rm-tabs em{font-style:normal;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:#3F8CEA;color:#fff;font-size:10px;display:grid;place-items:center}
.rm-video{margin-top:20px;aspect-ratio:16/9;border-radius:16px;background:linear-gradient(135deg,#1B2430,#2C3A4A);position:relative;overflow:hidden;display:grid;place-items:center}
.rm-play{width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.95);display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.rm-vbar{position:absolute;left:16px;right:16px;bottom:14px;display:flex;align-items:center;gap:10px;color:#fff;font-size:11.5px}
.rm-vbar div{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.25);position:relative}
.rm-vbar div i{position:absolute;left:0;top:0;bottom:0;width:31%;background:#D9553F;border-radius:2px}
.rm-vbar div s{position:absolute;top:-3px;width:2px;height:10px;background:#7FD8A6}
.rm-cols{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;margin-top:16px}
.rm-box{background:#fff;border:1px solid #E8E4DC;border-radius:15px;padding:14px 16px}
.rm-box h4{margin:0 0 8px;font-size:10.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:#8A919C}
.rm-mom{display:grid;grid-template-columns:52px 1fr;gap:8px;padding:7px 0;border-top:1px solid #F1EEE7;font-size:12.5px}
.rm-mom:first-of-type{border-top:0}
.rm-mom b{color:#1F5FB5;font-weight:600;font-variant-numeric:tabular-nums}
.rm-box ul{margin:0;padding-left:17px;list-style:disc;font-size:12.5px;line-height:1.6;color:#3A4250}
.rm-doc{margin-top:18px;display:grid;grid-template-columns:1fr 120px;gap:14px;align-items:start}
.rm-docmain{background:#E9E5DE;border-radius:16px;padding:22px;display:grid;place-items:center}
.rm-slide{width:100%;aspect-ratio:16/9;border-radius:8px;background:radial-gradient(120% 90% at 85% 20%,#3A2A24 0%,#16181D 55%);box-shadow:0 10px 30px rgba(0,0,0,.25);color:#fff;padding:7% 7%;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.rm-slide small{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#E9A08E;font-weight:800}
.rm-slide h2{font-size:34px;line-height:1.08;font-weight:600;letter-spacing:-.6px;margin:8px 0 0;max-width:70%}
.rm-slide p{font-size:12px;color:#B9BEC6;margin:0}
.rm-slide i{position:absolute;right:-6%;bottom:-18%;width:46%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#D9553F 0%,rgba(217,85,63,.0) 70%);opacity:.7}
.rm-pager{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;color:#5A6270;width:100%}
.rm-thumbs{display:flex;flex-direction:column;gap:8px}
.rm-thumbs span{aspect-ratio:16/9;border-radius:6px;background:#fff;border:1px solid #E3DFD8;display:block;position:relative;overflow:hidden}
.rm-thumbs span.on{outline:2px solid #1C2430;outline-offset:1px}
.rm-thumbs span::after{content:'';position:absolute;left:14%;right:14%;top:16%;height:6%;background:#ECE7DF;border-radius:2px;box-shadow:0 12px 0 #F1EEE7,0 22px 0 #F1EEE7,0 32px 0 #F1EEE7}
.rm-thumbs span.cv{background:#16181D}.rm-thumbs span.cv::after{background:rgba(255,255,255,.5);box-shadow:none;top:55%}
.rm-top{display:flex;align-items:flex-start;gap:14px}
.rm-top .rm-btns{margin:0 0 0 auto;flex-shrink:0}
@media (max-width:700px){.rm{display:block}.rm-side{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid #ECE8DF;padding:12px 0 12px 14px;display:flex;gap:9px;overflow-x:auto}
 .rm-side .rm-lbl{display:none}.rm-card{flex:0 0 228px;margin:0}.rm-card.on::before{display:none}.rm-main{padding:22px 16px 40px}.rm-h1{font-size:24px}
 .rm-owner{grid-template-columns:1fr;gap:14px}.rm-photo{height:150px}.rm-grid{grid-template-columns:1fr}.rm-cols,.rm-doc{grid-template-columns:1fr}.rm-thumbs{display:none}}
`;
const P = (c1, c2) => `linear-gradient(145deg,${c1},${c2})`;
const card = (on, ic, bg, t, sub, meta, extra = '') => `<div class="rm-card ${on ? 'on' : ''}">${extra}<span class="rm-ic" style="background:${bg}">${ic}</span><div style="min-width:0"><b>${t}</b><small>${sub}</small>${meta ? `<div class="rm-meta">${meta}</div>` : ''}</div></div>`;
const chip = (t) => `<span class="rm-chip">${t}</span>`;
const side = (sel) => `<aside class="rm-side">
  <p class="rm-lbl">Start here</p>
  ${card(sel === 'team', '👋', '#FDF0EE', 'Your Team', 'Who’s working on your pilot, and how to reach us', `<span class="rm-stack"><span style="background:#1C2430">KW</span><span style="background:#6A5BC7">PN</span><span style="background:#2E9E5B">ML</span><span style="background:#D9553F">JE</span></span>${chip('4 people')}`)}
  <p class="rm-lbl">Decks & documents</p>
  ${card(sel === 'deck', '▤', '#E7E2FB', 'Teton overview deck', 'The deck from our first meeting', chip('PDF') + chip('24 pages') + chip('⤓ Download'))}
  ${card(false, '✓', '#EEF8F1', 'Pilot program one pager', 'Pilot cost, terms and how it works', chip('PDF') + chip('1 page'))}
  ${card(false, '🔒', '#F1EEE8', 'Security & privacy', 'HIPAA, data handling, on-site processing', chip('PDF') + chip('6 pages'))}
  <p class="rm-lbl">Case studies</p>
  ${card(false, '★', '#FFF4D6', 'Sunrise Gardens: 38% fewer falls', 'A 120-bed AL/MC community, 6 months in', chip('Case study') + chip('5 min read'), '<span class="rm-new" title="New"></span>')}
  ${card(false, '★', '#FFF4D6', 'Harbor Pointe portfolio rollout', '9 communities, one platform', chip('Case study'))}
  <p class="rm-lbl">Recordings</p>
  ${card(sel === 'call', '▶', '#1C2430;color:#fff', 'Discovery call', 'Nov 12 · Kevin, Dana Lee, Chris Fox', chip('42 min') + chip('Summary'))}
  ${card(false, '▶', '#1C2430;color:#fff', 'Product demo', 'Nov 19 · with clinical walkthrough', chip('35 min'), '<span class="rm-new" title="New"></span>')}
</aside>`;
const contact = (e, ph) => `<div class="rm-contact"><span><i>✉</i>${e}</span><span><i>☏</i>${ph}</span></div>`;
const mate = (ini, bg, n, t, what, e, ph) => `<div class="rm-mate"><span class="rm-av" style="background:${bg}">${ini}</span><div style="min-width:0"><b>${n}</b><div class="rm-title">${t}</div><p>${what}</p>${contact(e, ph)}</div></div>`;
const TEAM = `<div class="rm-in">
  <p class="rm-eyebrow">Your Teton team</p>
  <h1 class="rm-h1">ABC Senior Living’s Teton Team</h1>
  <p class="rm-lede">The people working on your pilot. Reach any of us directly; Kevin is your main point of contact.</p>
  <div class="rm-owner">
    <div class="rm-photo" style="background:${P('#E9A08E', '#C4553F')}">KW<span style="position:absolute;top:10px;left:10px;font:700 9.5px Inter;letter-spacing:1px;background:rgba(0,0,0,.35);color:#fff;border-radius:999px;padding:3px 8px">PHOTO</span></div>
    <div>
      <span class="rm-chip" style="background:#FDF0EE;color:#B4442C">Your main point of contact</span>
      <h2>Kevin Winn</h2>
      <div class="rm-title">Senior Account Executive · Teton</div>
      ${contact('kevin@teton.ai', '(502) 555-0142')}
      <div class="rm-note">“Great talking today. Everything we discussed is in here: the proposal, the deck, and the call recording.”</div>
      <div class="rm-btns"><span class="rm-b dk">✉ Email Kevin</span><span class="rm-b">📅 Book a meeting</span><span class="rm-b">☏ Call</span></div>
    </div>
  </div>
  <p class="rm-h3">Also on your team</p>
  <div class="rm-grid">
    ${mate('PN', '#6A5BC7', 'Priya Nair', 'Implementation Manager', 'Runs your site survey, install and go-live.', 'priya@teton.ai', '(502) 555-0188')}
    ${mate('ML', '#2E9E5B', 'Marcus Lee', 'Clinical Success Lead', 'Trains your staff and tracks outcomes during the pilot.', 'marcus@teton.ai', '(502) 555-0119')}
    ${mate('JE', '#D9553F', 'Jordan Ellis', 'Solutions Engineer', 'Your IT and network contact: WiFi, power, security review.', 'jordan@teton.ai', '(502) 555-0160')}
    ${mate('AR', '#1C2430', 'Dr. Alana Ruiz', 'Chief Clinical Officer', 'Executive sponsor for the partnership.', 'alana@teton.ai', '(502) 555-0101')}
  </div>
</div>`;
const CALL = `<div class="rm-in">
  <div class="rm-top"><div><p class="rm-eyebrow">Recording</p><h1 class="rm-h1">Discovery call</h1><p class="rm-lede" style="margin-top:6px">Nov 12, 2026 · 42 min · Kevin Winn, Dana Lee, Chris Fox</p></div>
  <div class="rm-btns"><span class="rm-b">💬 Comment</span><span class="rm-b">⤓ Transcript</span></div></div>
  <div class="rm-video"><span class="rm-play"><svg width="24" height="26" viewBox="0 0 24 26"><path d="M3 2l19 11L3 24z" fill="#1C2430"/></svg></span>
    <div class="rm-vbar"><span>13:02</span><div><i></i><s style="left:12%"></s><s style="left:31%"></s><s style="left:55%"></s><s style="left:78%"></s></div><span>42:10</span></div></div>
  <div class="rm-cols">
    <div class="rm-box"><h4>Key moments</h4>
      <div class="rm-mom"><b>04:55</b><span>Falls at Maple Grove: what’s driving them</span></div>
      <div class="rm-mom"><b>13:02</b><span>How the sensor works without cameras in view</span></div>
      <div class="rm-mom"><b>23:10</b><span>Pilot scope: which communities and when</span></div>
      <div class="rm-mom"><b>32:40</b><span>Pricing and the post-pilot term</span></div></div>
    <div class="rm-box"><h4>Summary</h4><ul><li>Two AL/MC communities for a 3-month pilot, starting in January.</li><li>IT review needed before install (Jordan to send the network checklist).</li><li>Dana to bring in the COO for the pricing discussion.</li></ul></div>
  </div></div>`;
const DECK = (img) => `<div class="rm-in" style="max-width:940px">
  <div class="rm-top"><div><p class="rm-eyebrow">Deck</p><h1 class="rm-h1">Teton overview deck</h1><p class="rm-lede" style="margin-top:6px">24 pages · shared Nov 12 · the deck from our first meeting</p></div>
  <div class="rm-btns"><span class="rm-b dk">⤓ Download PDF</span><span class="rm-b">💬 Comment</span></div></div>
  <div class="rm-doc"><div class="rm-docmain" style="display:block"><div class="rm-slide"><div><small>Teton</small><h2>The autonomous operating system for care.</h2></div><p>Teton overview · ABC Senior Living · November 2026</p><i></i></div><div class="rm-pager"><span>‹ Prev</span><span>1 / 24</span><span>Next ›</span></div></div><div class="rm-thumbs"><span class="cv on"></span><span></span><span></span><span></span><span></span><span></span></div></div></div>`;

(async () => {
  const b = await chromium.launch();
  const rep = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await rep.goto(B + '/login'); await rep.getByLabel('Email').fill('kevin@example.com'); await rep.getByLabel('Password').fill('admin password 123');
  await rep.getByRole('button', { name: 'Sign in' }).click(); await rep.waitForURL(/\/deals/);
  // A cover image for the deck preview.
  await rep.goto(B + '/proposal/100'); await rep.waitForTimeout(2500);
  await rep.evaluate(() => document.querySelectorAll('body *').forEach((e) => { const c = getComputedStyle(e).position; if (c === 'sticky' || c === 'fixed') e.style.visibility = 'hidden'; }));
  const buf = await rep.locator('[data-bc-page="cover"] .bc-page').screenshot();
  const cover = 'data:image/png;base64,' + buf.toString('base64');
  const { link } = await (await rep.request.put(B + '/api/quotes/17/share', { data: { versionId: 100, emails: ['Dana Lee <dana.lee@abcseniorliving.com>'] } })).json();
  const shoot = async (opts, sel, file, phone = false) => {
    const p = await (await b.newContext(opts)).newPage();
    await p.goto(B + '/p/' + link.token); await p.getByLabel('Your work email').fill('dana.lee@abcseniorliving.com');
    await p.getByRole('button', { name: 'Open the proposal' }).click(); await p.waitForSelector('article#proposal'); await p.waitForTimeout(1800);
    await p.addStyleTag({ content: CSS });
    await p.evaluate(({ html, phone }) => {
      const hdr = document.querySelector('[data-prospect] header .flex');
      const tabs = document.createElement('span'); tabs.className = 'rm-tabs';
      tabs.innerHTML = phone ? '<span>Proposal</span><span class="on">Deal room</span>' : '<span>Proposal</span><span class="on">Deal room <em>2</em></span>';
      const logo = hdr.children[0]; logo.after(tabs);
      // The proposal-only buttons step aside on this tab.
      [...hdr.querySelectorAll('button')].forEach((x) => { if (/Contents|Comment$|PDF|Table of contents/.test(x.getAttribute('aria-label') || x.title || x.textContent)) x.style.display = 'none'; });
      const span = [...hdr.children].find((c) => /Proposal for/.test(c.textContent)); if (span) span.style.display = 'none';
      document.querySelectorAll('[data-prospect] nav, [data-prospect] > div > div:not(header)').forEach(() => {});
      const doc = document.querySelector('.proposal-doc'); const wrap = doc.parentElement;
      wrap.innerHTML = html; wrap.className = ''; wrap.style.padding = '0';
    }, { html: `<div class="rm">${side(sel)}<main class="rm-main">${sel === 'team' ? TEAM : sel === 'call' ? CALL : DECK(cover)}</main></div>`, phone });
    await p.evaluate(() => document.querySelectorAll('nav[aria-label="Contents"]').forEach((n) => (n.style.display = 'none')));
    await p.waitForTimeout(600);
    console.log(file, 'scrollW', await p.evaluate(() => document.documentElement.scrollWidth));
    await p.screenshot({ path: OUT + file, fullPage: phone });
  };
  await shoot({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, 'team', 'room-team.png');
  await shoot({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, 'call', 'room-call.png');
  await shoot({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, 'deck', 'room-deck.png');
  await shoot({ ...devices['iPhone 13'] }, 'team', 'room-phone.png', true);
  await rep.request.delete(B + '/api/quotes/17/share');
  await b.close();
})();
