// HTML templates. Plain template strings; every dynamic value goes through esc().
import { describeRule, upcomingReleases } from './rules.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STATUS = {
  official: { label: 'Confirmed on the official site', cls: 'ok' },
  secondary: { label: 'Confirmed from several travel sources', cls: 'mid' },
  unconfirmed: { label: 'Not yet confirmed on the official site', cls: 'warn' },
};

const fmtJst = (d) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) + ' JST';
const fmtJstDay = (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', year: 'numeric' }).format(d);

export function layout({ site, title, description, path, body, jsonLd = [], scripts = '' }) {
  const canonical = site.baseUrl + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="/assets/style.css">
${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/">${esc(site.name)}</a>
  <nav><a href="/planner/">Trip planner</a><a href="/mt-fuji-visibility/">Mt Fuji today</a><a href="/changelog/">Updates</a></nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="foot"><div class="wrap">
  <p>Release times are checked daily against official sources. Always confirm on the official site before booking.</p>
  <p>Some links are affiliate links: we may earn a commission at no extra cost to you. <a href="/about/">About &amp; methodology</a> · <a href="/privacy/">Privacy</a></p>
</div></footer>
<script type="module" src="/assets/app.js"></script>
${scripts}
</body>
</html>`;
}

function statusBadge(f) {
  const s = STATUS[f.status] ?? STATUS.unconfirmed;
  return `<span class="badge ${s.cls}" title="${esc(f.statusNote)}">${esc(s.label)}</span>`;
}

function affiliateLink(item, affiliates) {
  if (item.internal) return `<a href="${esc(item.internal)}">${esc(item.label)}</a>`;
  if (item.url) return `<a href="${esc(item.url)}" rel="noopener" target="_blank">${esc(item.label)}</a>`;
  const p = affiliates[item.partner];
  if (!p) return esc(item.label);
  const href = p.searchUrl.replace('{query}', encodeURIComponent(item.query));
  return `<a href="${esc(href)}" rel="sponsored noopener" target="_blank">${esc(item.label)}</a> <span class="muted">(${esc(p.name)})</span>`;
}

/** The "next release" box. Server-rendered for crawlers; app.js recomputes it live in the visitor's time zone. */
function nextReleaseBox(f, now) {
  const rule = f.rule;
  const ruleAttr = esc(JSON.stringify(rule));
  if (rule.type === 'monthly' || rule.type === 'lottery') {
    const [n] = upcomingReleases(rule, now, 1);
    return `<section class="next" data-rule="${ruleAttr}" data-name="${esc(f.shortName)}" data-id="${esc(f.id)}" data-url="${esc(f.officialUrl)}">
  <p class="eyebrow">${esc(n.label)}</p>
  <p class="when"><time data-at="${n.opensAt.toISOString()}" data-timeknown="${n.timeKnown}">${esc(n.opensAt <= now ? `Now, until ${fmtJstDay(new Date(n.closesAt - 1))}` : n.timeKnown ? fmtJst(n.opensAt) : fmtJstDay(n.opensAt) + ' (time not confirmed)')}</time></p>
  <p class="local" data-local></p>
  <p class="covers">For visits ${esc(n.coversFrom)} to ${esc(n.coversTo)}</p>
  <p class="countdown" data-countdown></p>
  <div class="actions" data-actions>
    <a class="btn" data-gcal href="#">Add to Google Calendar</a>
    <a class="btn ghost" href="/calendars/${esc(f.id)}.ics">Subscribe to all ${esc(f.shortName)} release dates (.ics)</a>
  </div>
</section>`;
  }
  if (rule.type === 'days_before') {
    return `<section class="next" data-rule="${ruleAttr}" data-name="${esc(f.shortName)}" data-id="${esc(f.id)}" data-url="${esc(f.officialUrl)}">
  <p class="eyebrow">Bookings open every day</p>
  <p class="when">${esc(rule.time ?? '')} JST, for the date ${esc(rule.days)} days later</p>
  <form class="visit" data-visit-form>
    <label>Your visit date <input type="date" name="visit" required></label>
    <button class="btn" type="submit">When can I book?</button>
  </form>
  <div data-visit-result></div>
</section>`;
  }
  return `<section class="next" data-rule="${ruleAttr}" data-name="${esc(f.shortName)}" data-id="${esc(f.id)}" data-url="${esc(f.officialUrl)}">
  <p class="eyebrow">No fixed release date</p>
  <p class="when">Start checking about ${esc(rule.checkFromDaysBefore)} days before your visit</p>
  <form class="visit" data-visit-form>
    <label>Your visit date <input type="date" name="visit" required></label>
    <button class="btn" type="submit">Remind me when to check</button>
  </form>
  <div data-visit-result></div>
</section>`;
}

export function facilityPage({ site, f, affiliates, changelog, now }) {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: f.faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
  };
  const history = changelog.filter((c) => c.facility === f.id);
  const body = `
<p class="crumbs"><a href="/">Home</a> › ${esc(f.shortName)}</p>
<h1>When do ${esc(f.shortName)} tickets go on sale?</h1>
<p class="lede">${esc(describeRule(f.rule))}</p>
<p>${statusBadge(f)} <span class="muted">Last checked ${esc(fmtJst(new Date(f.lastVerifiedAt)))}</span></p>
${nextReleaseBox(f, now)}
<p><a class="official" href="${esc(f.officialUrl)}" rel="noopener" target="_blank">Official booking page ↗</a></p>

<h2>How to buy</h2>
<ol>${f.howToBuy.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
${f.rulesToKnow.length ? `<h2>Rules to know</h2><ul>${f.rulesToKnow.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

<h2>Sold out? Other ways in</h2>
<ul class="alts">${f.soldOut.map((x) => `<li>${affiliateLink(x, affiliates)}</li>`).join('')}</ul>

<h2>FAQ</h2>
${f.faq.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}

<h2>Sources</h2>
<ul class="sources">${f.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(new URL(s.url).hostname)}</a>: “${esc(s.quote)}” <span class="muted">(checked ${esc(s.checkedAt)})</span></li>`).join('')}</ul>
<p class="muted">${esc(f.statusNote)}</p>
${history.length ? `<h2>Rule changes</h2><ul>${history.map((c) => `<li>${esc(c.date)}: ${esc(c.text)}</li>`).join('')}</ul>` : ''}
`;
  return layout({
    site,
    title: `${f.shortName} tickets: when they go on sale (${new Date(now).getUTCFullYear()}) | ${site.name}`,
    description: `${describeRule(f.rule)} See the next release in your time zone and add it to your calendar.`,
    path: `/tickets/${f.id}/`,
    body,
    jsonLd: [faqLd],
  });
}

export function homePage({ site, facilities, now }) {
  const rows = facilities
    .map((f) => {
      const [n] = f.rule.type === 'monthly' || f.rule.type === 'lottery' ? upcomingReleases(f.rule, now, 1) : [];
      return { f, n };
    })
    .sort((a, b) => (a.n?.opensAt ?? Infinity) - (b.n?.opensAt ?? Infinity));
  const body = `
<section class="hero">
  <h1>Japan's hardest tickets, on your clock</h1>
  <p class="lede">${esc(site.tagline)}</p>
  <p><a class="btn" href="/planner/">Plan my bookings</a> <a class="btn ghost" href="/mt-fuji-visibility/">Can I see Mt Fuji today?</a></p>
</section>
<h2>Opening next</h2>
<ul class="cards">
${rows
  .map(({ f, n }) => `<li class="card">
  <a href="/tickets/${esc(f.id)}/"><strong>${esc(f.shortName)}</strong></a> ${statusBadge(f)}
  ${n && n.opensAt <= now ? `<p><strong>Open now</strong>, until ${esc(fmtJstDay(new Date(n.closesAt - 1)))} (Japan time)</p><p class="muted">Lottery for visits ${esc(n.coversFrom)} to ${esc(n.coversTo)}</p>`
    : n ? `<p><time data-at="${n.opensAt.toISOString()}" data-timeknown="${n.timeKnown}">${esc(n.timeKnown ? fmtJst(n.opensAt) : fmtJstDay(n.opensAt))}</time><span class="local" data-local></span></p><p class="muted">${esc(n.label)} for ${esc(n.coversFrom)} to ${esc(n.coversTo)}</p>`
    : `<p class="muted">${esc(describeRule(f.rule))}</p>`}
</li>`)
  .join('\n')}
</ul>`;
  return layout({ site, title: `${site.name}: when Japan's popular attractions open bookings`, description: site.tagline, path: '/', body });
}

export function plannerPage({ site, facilities }) {
  const body = `
<h1>Trip booking planner</h1>
<p class="lede">Enter your trip dates and pick the places you want to visit. We'll list when each one opens bookings, in your time zone, and you can add them all to your calendar at once.</p>
<form class="planner" data-planner>
  <div class="row"><label>Arrive <input type="date" name="from" required></label><label>Leave <input type="date" name="to" required></label></div>
  <fieldset><legend>Places</legend>
  ${facilities.map((f) => `<label class="check"><input type="checkbox" name="f" value="${esc(f.id)}" checked> ${esc(f.shortName)}</label>`).join('')}
  </fieldset>
  <button class="btn" type="submit">Show my booking dates</button>
</form>
<div data-planner-result></div>`;
  return layout({ site, title: `Japan trip booking planner | ${site.name}`, description: 'Find out when to book Ghibli Museum, Ghibli Park, Shibuya Sky, Nintendo Museum and more for your travel dates.', path: '/planner/', body });
}

export function fujiPage({ site, forecasts, affiliates }) {
  const block = (fc, label) => {
    if (!fc) return `<section class="fc"><h3>${esc(label)}</h3><p class="muted">The forecast could not be loaded. See the <a href="https://www.jma.go.jp/bosai/forecast/" rel="noopener" target="_blank">Japan Meteorological Agency forecast</a>.</p></section>`;
    return `<section class="fc"><h3>${esc(label)}</h3>
<table><thead><tr><th>Date</th><th>Forecast</th><th>Chance of rain</th></tr></thead><tbody>
${fc.days.map((d) => `<tr><td>${esc(d.date)}</td><td><strong>${esc(d.weatherEn)}</strong><br><span class="muted">${esc(d.weatherText)} (${esc(d.weatherJa)})</span></td><td>${d.pops.length ? d.pops.map((p) => `${esc(p.time)} ${esc(p.pop)}%`).join('<br>') : '—'}</td></tr>`).join('')}
</tbody></table>
<p class="muted">Source: Japan Meteorological Agency, ${esc(fc.office)}, area “${esc(fc.area)}”, issued ${esc(fc.reportDatetime)}. Shown as published; English is a word-for-word rendering of the original.</p>
</section>`;
  };
  const klook = affiliates.klook;
  const body = `
<h1>Can I see Mt Fuji today?</h1>
<p class="lede">Mt Fuji hides behind cloud on many days. Check the official forecast for the area and the live cameras before you travel.</p>
${block(forecasts.north, 'Kawaguchiko and the Fuji Five Lakes (north side)')}
<h2>Live cameras</h2>
<p>Look before you go: <a href="https://www.yamanashi-kankou.jp/fujisanwatcher/live/index.html" rel="noopener" target="_blank">Yamanashi Prefecture's official Mt Fuji live cameras ↗</a></p>
<h2>When is Mt Fuji easiest to see?</h2>
<ul>
<li>Clear days are most common from November to February. June and July, during and after the rainy season, are the hardest months.</li>
<li>Mornings are usually clearer than afternoons, when clouds build up around the summit.</li>
<li>Fuji City's 8 a.m. observations from 1991 to 2025 record the mountain as fully visible on about 134 days a year, a little over one day in three.</li>
</ul>
<h2>Stay or tour</h2>
<ul class="alts">
<li><a href="${esc(klook.searchUrl.replace('{query}', 'mt fuji day tour'))}" rel="sponsored noopener" target="_blank">Mt Fuji day tours from Tokyo</a> <span class="muted">(${esc(klook.name)})</span></li>
<li><a href="${esc(klook.searchUrl.replace('{query}', 'kawaguchiko hotel'))}" rel="sponsored noopener" target="_blank">Stay a night at Kawaguchiko for two chances at a clear morning</a> <span class="muted">(${esc(klook.name)})</span></li>
</ul>
<p class="muted">We show the Japan Meteorological Agency's forecast as published. This site does not make its own weather forecasts.</p>`;
  return layout({ site, title: `Can I see Mt Fuji today? Forecast and live cams | ${site.name}`, description: 'Official weather forecast for Kawaguchiko and the Fuji Five Lakes, live cameras, and the best months to see Mt Fuji.', path: '/mt-fuji-visibility/', body });
}

export function simplePage({ site, title, path, html, description }) {
  return layout({ site, title: `${title} | ${site.name}`, description: description ?? title, path, body: html });
}
