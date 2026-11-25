const { chromium } = require('playwright');
const B = 'http://localhost:3100', OUT = '/tmp/claude-0/-home-user-TetonCPQ/f858fe51-a88a-5942-af90-c35ac8773983/scratchpad/mock/';
const CSS = `
.op1-how{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:0 92px;background:#26282C;border-radius:16px;padding:16px 22px 18px;color:#fff}
.op1-hh{font-size:13.5px;font-weight:600;margin:0 0 8px;color:#fff}
.op1-acol .op1-hh{padding-left:68px}
.op1-hrow,.op1-arow{display:flex;align-items:center;gap:12px;border-top:1px solid #45484E;padding:8px 0}
.op1-hrow{justify-content:space-between}
.op1-htx b{display:block;font-size:12.5px;font-weight:600}
.op1-htx small{display:block;font-size:10px;line-height:1.35;color:#A9ADB4;margin-top:1px}
.op1-tile{width:56px;height:56px;border-radius:13px;display:grid;place-items:center;flex-shrink:0;position:relative;z-index:1}
.op1-hwimg{background:#1A1B1E;overflow:hidden}
.op1-hwimg img{width:44px;height:44px;object-fit:cover;border-radius:10px}
.op1-app1{background:#E7E2FB}.op1-app2{background:#F8E08E}.op1-app3{background:#B9EBC4}
.op1-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}

.op1 .bc-h1{font-size:27px;line-height:1.15}
.op1 .bc-lede{font-size:12.5px;margin-top:8px}
.op1 .bc-eyebrow{margin:16px 0 6px}
.op1 .bc-eyebrow.bc-gray{margin:15px 0 6px}
.op1-pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.op1-pill{display:inline-flex;align-items:center;height:24px;padding:0 12px;border-radius:999px;background:var(--bc-night);color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.2px}
.op1-row{display:grid;grid-template-columns:1.05fr 1fr;gap:16px;margin-top:14px;align-items:start}
.op1-price{background:var(--bc-mint-bg);border:1px solid #CFE7D7;border-radius:14px;padding:12px 16px}
.op1-pr{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;padding:4px 0}
.op1-pr+.op1-pr{border-top:1px dashed #CFE7D7}
.op1-pr b{font-size:12.5px;font-weight:700}
.op1-pr small{display:inline;margin-left:6px;font-size:9.5px;color:var(--bc-muted);font-weight:400}
.op1-pr i{border-bottom:1px solid #B8D9C3;transform:translateY(-4px)}
.op1-pr span{font-size:13px;font-weight:700;white-space:nowrap;text-align:right}
.op1-pr .op1-k{font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:#256B41;font-weight:800;grid-column:1/-1;padding-top:2px;text-align:left!important}
.op1-terms p{font-size:10.5px;line-height:1.45;color:var(--bc-body);margin:0 0 6px}
.op1-terms b{color:var(--bc-ink)}
.op1-site{display:grid;grid-template-columns:.9fr 1.1fr;gap:16px;align-items:start}
.op1-sc{padding:6px 11px;margin-bottom:5px}
.op1-sc b{font-size:12px;display:block}
.op1-sc small{font-size:10px;color:var(--bc-muted);line-height:1.35;display:block}
.op1-crit{padding:4px 14px}
.op1-ci{display:grid;grid-template-columns:24px 1fr;gap:4px;padding:3.5px 0;align-items:baseline}
.op1-ci+.op1-ci{border-top:1px solid var(--bc-line)}
.op1-ci em{font-style:normal;font-size:13px;color:#9C8FE0;font-weight:500}
.op1-ci b{font-size:12px}
.op1-ci small{display:inline;margin-left:6px;font-size:10px;color:#2E9E5B}
.op1-hw{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.op1-hwc{display:flex;gap:10px;align-items:center;padding:8px;overflow:hidden}
.op1-hwc img{width:46px;height:46px;object-fit:cover;border-radius:9px;flex-shrink:0;background:#f2efe9}
.op1-hwc b{font-size:11.5px;display:block}
.op1-hwc small{font-size:9.5px;color:var(--bc-muted);line-height:1.3;display:block}
.op1-opts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.op1-opt{padding:10px 12px;position:relative}
.op1-opt.dark{background:var(--bc-night);color:#fff;border-color:var(--bc-night)}
.op1-opt h4{margin:0;font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;font-weight:800;color:var(--bc-coral)}
.op1-opt.dark h4{color:var(--bc-mint)}
.op1-opt .t{font-size:13.5px;font-weight:700;margin-top:4px}
.op1-opt .p{font-size:20px;font-weight:700;letter-spacing:-.4px;margin-top:6px;line-height:1.1}
.op1-opt .p small{font-size:10px;font-weight:500;color:var(--bc-muted);letter-spacing:0}
.op1-opt.dark .p small{color:#A9B4BF}
.op1-opt ul{margin:6px 0 0;padding:0;list-style:none}
.op1-opt li{font-size:10px;line-height:1.35;padding:2px 0 2px 13px;position:relative;color:var(--bc-body)}
.op1-opt.dark li{color:#D5DCE3}
.op1-opt li::before{content:'✓';position:absolute;left:0;color:#2E9E5B;font-weight:700}
.op1-opt.dark li::before{color:var(--bc-mint)}
.op1-tag{position:absolute;top:-8px;right:10px;font-size:8.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;background:var(--bc-coral);color:#fff;border-radius:999px;padding:2px 7px}
.op1-fine{font-size:9px;color:var(--bc-muted);margin-top:8px;line-height:1.4}
.op1-app{width:46px;height:46px;border-radius:9px;flex-shrink:0;background:var(--bc-night);display:grid;place-items:center}
.op1-ed{outline:1.5px dashed rgba(63,140,234,.55);outline-offset:2px;border-radius:3px}
`;
const PHONE = '<svg width="18" height="28" viewBox="0 0 18 28"><rect x="1" y="1" width="16" height="26" rx="3.5" fill="#111"/><rect x="3" y="4" width="12" height="18" rx="1.5" fill="#2a2a2a"/><rect x="6.5" y="23.5" width="5" height="1.6" rx=".8" fill="#555"/></svg>';
const SCREENS = '<svg width="34" height="26" viewBox="0 0 34 26"><rect x="10" y="1" width="23" height="15" rx="2" fill="#111"/><rect x="1" y="9" width="17" height="11" rx="1.8" fill="#111" stroke="#fff" stroke-width="1.4"/><path d="M16 24h8l-1.5-4h-5z" fill="#fff"/></svg>';
const E = (t) => `<span class="op1-edt">${t}</span>`;
const PAGE = (imgs) => `
<section class="bc-page op1"><div class="bc-pad" style="padding:34px 54px 56px">
  <div class="bc-top" style="padding-bottom:14px"><span class="bc-logo"><img src="/teton-logo.png" alt="">Teton</span><span class="bc-crumb">Pilot program · Resident monitoring</span></div>
  <p class="bc-eyebrow">${E('Pilot program')}</p>
  <h1 class="bc-h1">${E('Start with a low-risk pilot.')}</h1>
  <p class="bc-lede">${E('AI resident monitoring and fall prevention, proven in your buildings before you commit. Here’s what a typical pilot costs, how it works, and the ways to pay for it after.')}</p>
  <div class="op1-pills"><span class="op1-pill">${E('1–5 communities · AL + MC')}</span><span class="op1-pill">${E('Pilot · 3 months')}</span><span class="op1-pill">${E('Post-pilot · 36 months')}</span></div>

  <p class="bc-eyebrow bc-gray" style="margin-top:18px">${E('Pilot cost & terms')}</p>
  <div class="op1-row" style="margin-top:0">
    <div class="op1-price">
      <div class="op1-pr"><span class="op1-k">${E('During the pilot')}</span></div>
      <div class="op1-pr"><b>${E('Installation & setup')}<small>${E('100% pilot install discount')}</small></b><i></i><span>${E('$0 / bed')}</span></div>
      <div class="op1-pr"><b>${E('Monthly subscription')}<small>${E('3 months, all pilot beds')}</small></b><i></i><span>${E('$0 / bed / mo')}</span></div>
      <div class="op1-pr"><span class="op1-k">${E('After the pilot')}</span></div>
      <div class="op1-pr"><b>${E('Post-pilot term')}<small>${E('36 months')}</small></b><i></i><span>${E('$99 / bed / mo')}</span></div>
      <div class="op1-pr"><b>${E('Portfolio expansion')}</b><i></i><span>${E('Priced to scope')}</span></div>
    </div>
    <div class="op1-terms">
      <p><b>${E('Installation subsidy.')}</b> ${E('Standard install is $400/bed; it’s waived for the pilot, including extra sensors for larger rooms (normally $300 each).')}</p>
      <p><b>${E('Break clause.')}</b> ${E('End it for any reason before the pilot’s three months are up, with written notice. Nothing more is owed.')}</p>
      <p><b>${E('Pilot extension.')}</b> ${E('Extend up to three more months at $99/bed/month, billed monthly; either side can stop at the end of any month.')}</p>
      <p><b>${E('Capital treatment.')}</b> ${E('Most of the spend (90%+) can be capitalized, so it needn’t hit NOI.')}</p>
    </div>
  </div>

  <p class="bc-eyebrow bc-gray">${E('How it works')}</p>
  <div class="op1-how" data-how>
    <div class="op1-hcol">
      <p class="op1-hh">${E('The hardware')}</p>
      <div class="op1-hrow"><div class="op1-htx"><b>${E('Sense')}</b><small>${E('The sensor captures continuous health and care-delivery data in each room.')}</small></div><span class="op1-tile op1-hwimg" data-n="sensor"><img src="${imgs[0]}" alt=""></span></div>
      <div class="op1-hrow"><div class="op1-htx"><b>${E('Understand')}</b><small>${E('The compute unit analyzes it on site and turns it into insights.')}</small></div><span class="op1-tile op1-hwimg" data-n="edge"><img src="${imgs[1]}" alt=""></span></div>
    </div>
    <div class="op1-acol">
      <p class="op1-hh">${E('Teton Applications')}</p>
      <div class="op1-arow"><span class="op1-tile op1-app1" data-n="a1">${PHONE}</span><div class="op1-htx"><b>${E('Care App')}</b><small>${E('For care staff: real-time alerts and fall video')}</small></div></div>
      <div class="op1-arow"><span class="op1-tile op1-app2" data-n="a2">${SCREENS}</span><div class="op1-htx"><b>${E('Community Platform')}</b><small>${E('For community leadership: trends and reports')}</small></div></div>
      <div class="op1-arow"><span class="op1-tile op1-app3" data-n="a3">${SCREENS}</span><div class="op1-htx"><b>${E('Portfolio Platform')}</b><small>${E('For the C-suite and ownership: every community at a glance')}</small></div></div>
    </div>
    <svg class="op1-wires" aria-hidden="true"></svg>
  </div>

  <p class="bc-eyebrow bc-gray">${E('Ways to pay after the pilot')}</p>
  <div class="op1-opts">
    <div class="bc-card op1-opt dark"><span class="op1-tag">${E('Most chosen')}</span><h4>${E('Subscription · OpEx')}</h4><div class="t">${E('All-in monthly')}</div><div class="p">${E('$99')} <small>${E('/ bed / month')}</small></div>
      <ul><li>${E('Hardware, software and support included')}</li><li>${E('Install $400/bed (waived for pilot beds)')}</li><li>${E('36-month term; hardware refreshed')}</li></ul></div>
    <div class="bc-card op1-opt"><h4>${E('Equipment purchase · CapEx')}</h4><div class="t">${E('Own the hardware')}</div><div class="p">${E('$4,600')} <small>${E('/ room, one-time')}</small></div>
      <ul><li>${E('Edge unit + first sensor, installed')}</li><li>${E('Extra sensors $450 each')}</li><li>${E('Software $10 / bed / month')}</li></ul></div>
    <div class="bc-card op1-opt"><h4>${E('Portfolio')}</h4><div class="t">${E('Enterprise rollout')}</div><div class="p" style="font-size:16px;padding-top:4px">${E('Priced to scope')}</div>
      <ul><li>${E('Set during the pilot')}</li><li>${E('Based on beds, term and rollout pace')}</li><li>${E('One agreement across communities')}</li></ul></div>
  </div>
  <p class="op1-fine">${E('Typical figures for planning; your proposal has the pricing for your communities. Resident monitoring only.')}</p>
</div><div class="bc-foot"><span>TETON.AI</span><span>${E('PILOT PROGRAM')}</span></div></section>`;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(B + '/login'); await p.getByLabel('Email').fill('kevin@example.com'); await p.getByLabel('Password').fill('admin password 123');
  await p.getByRole('button', { name: 'Sign in' }).click(); await p.waitForURL(/\/deals/);
  await p.goto(B + '/proposal/100'); await p.waitForTimeout(3000);
  await p.addStyleTag({ content: CSS });
  const imgs = await p.evaluate(() => [...document.querySelectorAll('[data-bc-page="sitescope"] img')].map((i) => i.getAttribute('src')).filter((s) => s && !s.includes('teton-logo')));
  console.log('imgs', imgs);
  await p.evaluate((html) => {
    const after = document.querySelector('[data-bc-page="pilot"]');
    const slot = document.createElement('div'); slot.className = 'bc-slot'; slot.dataset.mock = '1';
    slot.innerHTML = html; after.after(slot);
    slot.scrollIntoView();
  }, PAGE(imgs));
  await p.evaluate(() => document.querySelectorAll('body *').forEach((e) => { const c = getComputedStyle(e).position; if ((c === 'sticky' || c === 'fixed') && !e.closest('[data-mock]')) e.style.visibility = 'hidden'; }));
  await p.waitForTimeout(800);
  // The dotted wiring: sensor → compute unit → each app.
  await p.evaluate(() => {
    const box = document.querySelector('[data-how]'), svg = box.querySelector('.op1-wires'), o = box.getBoundingClientRect();
    const c = (n) => { const r = box.querySelector(`[data-n="${n}"]`).getBoundingClientRect(); return { l: r.left - o.left, r: r.right - o.left, t: r.top - o.top, b: r.bottom - o.top, y: r.top - o.top + r.height / 2, x: r.left - o.left + r.width / 2 }; };
    const s = c('sensor'), e = c('edge'), apps = ['a1', 'a2', 'a3'].map(c);
    const mid = (e.r + apps[0].l) / 2;
    const d = [`M${s.x} ${s.b} V${e.t}`, `M${e.r} ${e.y} H${mid}`, `M${mid} ${apps[0].y} V${apps[2].y}`, ...apps.map((a) => `M${mid} ${a.y} H${a.l}`)];
    svg.innerHTML = d.map((x) => `<path d="${x}" fill="none" stroke="#E9EAEC" stroke-width="1.6" stroke-dasharray="1.5 3.5" stroke-linecap="round"/>`).join('') + `<circle cx="${mid}" cy="${e.y}" r="3" fill="#7FD8A6"/>`;
  });
  await p.waitForTimeout(400);
  const el = p.locator('[data-mock] .bc-page');
  console.log('height px', await el.evaluate((e) => [e.scrollHeight, e.clientHeight, e.querySelector('.bc-pad').scrollHeight]));
  await el.screenshot({ path: OUT + 'onepager-pilot.png' });
  // Editable look: dashed outlines on a couple of fields to show what can be edited.
  await b.close();
})();
