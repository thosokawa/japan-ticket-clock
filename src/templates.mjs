// HTML templates. Plain template strings; every dynamic value goes through esc().
import { describeRule, upcomingReleases, hasFixedReleases } from './rules.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STATUS = {
  official: { label: 'Confirmed on the official site', cls: 'ok' },
  secondary: { label: 'Confirmed from several travel sources', cls: 'mid' },
  unconfirmed: { label: 'Not yet confirmed on the official site', cls: 'warn' },
};

// How hard a place is to book, in plain words. Lottery places get their own wording,
// since nothing "sells out" there. `rank` orders the home list's "Hardest to get" sort.
export const DIFFICULTY = {
  minutes: { rank: 0, long: 'Usually sells out within minutes of release', short: 'Sells out in minutes', lotteryLong: 'Given out by lottery, and hard to win', lotteryShort: 'Lottery, hard to win' },
  days: { rank: 1, long: 'Usually sells out within days or weeks', short: 'Sells out in days', lotteryLong: 'Given out by lottery', lotteryShort: 'Lottery' },
  available: { rank: 2, long: 'Usually still available', short: 'Usually available', lotteryLong: 'Given out by lottery; most entries win', lotteryShort: 'Lottery, usually won' },
};
const isLottery = (rule) => rule.type === 'lottery' || rule.kind === 'lottery';
/** "Usually sells out within minutes of release" (size 'long') or "Sells out in minutes" (size 'short'). */
export const difficultyText = (f, size = 'long') => {
  const d = DIFFICULTY[f.difficulty];
  if (!d) return '';
  return isLottery(f.rule) ? d[size === 'long' ? 'lotteryLong' : 'lotteryShort'] : d[size];
};

const fmtJst = (d) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) + ' JST';
const fmtJstDay = (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', year: 'numeric' }).format(d);
// What a release covers: "2027-01-10 to 2027-01-24", with the event name when there is one.
const coversText = (n) => `${n.coversFrom === n.coversTo ? n.coversFrom : `${n.coversFrom} to ${n.coversTo}`}${n.event ? ` (${n.event})` : ''}`;

export function layout({ site, title, description, path, body, jsonLd = [], scripts = '' }) {
  const canonical = site.baseUrl + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">${site.indexable === false ? '\n<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;700;800&display=swap">
<link rel="stylesheet" href="/assets/style.css">${site.travelpayoutsDriveSrc ? `
<script nowprocket data-noptimize="1" data-cfasync="false" data-wpfc-render="false" seraph-accel-crit="1" data-no-defer="1" data-cmp-ab="2">
  (function () {
      var script = document.createElement("script");
      script.async = 1;
      script.setAttribute("data-cmp-ab","2");
      script.src = ${JSON.stringify(site.travelpayoutsDriveSrc)};
      document.head.appendChild(script);
  })();
</script>` : ''}
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
  <p>© ${new Date().getFullYear()} ${esc(site.operator)}</p>
</div></footer>
<script type="module" src="/assets/app.js"></script>
${scripts}
</body>
</html>`;
}

// Labels for the facts list, in display order. Facts without a value are left out.
const FACTS = [['location', 'Where'], ['price', 'Price'], ['visitLength', 'Time needed'], ['bookAhead', 'Book ahead']];

function introBlock(f) {
  const facts = FACTS.filter(([k]) => f.facts?.[k]);
  return `${f.intro ? `<p class="intro">${esc(f.intro)}</p>` : ''}${facts.length ? `
<dl class="facts">${facts.map(([k, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(f.facts[k])}</dd></div>`).join('')}</dl>` : ''}`;
}

/** Google Maps embeds for the places a facility lists; nothing without a key. */
function mapBlock(f, site) {
  if (!site.googleMapsEmbedKey || !f.mapPlaces?.length) return '';
  const src = (q) => `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(site.googleMapsEmbedKey)}&q=${encodeURIComponent(q)}`;
  return `<h2>Where it is</h2>
<div class="maps">${f.mapPlaces.map((m) => `<figure class="map"><iframe src="${esc(src(m.query))}" title="Map: ${esc(m.label)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>${f.mapPlaces.length > 1 ? `<figcaption>${esc(m.label)}</figcaption>` : ''}</figure>`).join('')}</div>`;
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
  if (hasFixedReleases(rule)) {
    const [n, ...later] = upcomingReleases(rule, now, rule.type === 'fixed_dates' ? 6 : 1);
    if (!n) {
      return `<section class="next">
  <p class="eyebrow">No upcoming sale date</p>
  <p class="when">The next sale date has not been announced yet</p>
</section>`;
    }
    return `<section class="next" data-rule="${ruleAttr}" data-name="${esc(f.shortName)}" data-id="${esc(f.id)}" data-url="${esc(f.officialUrl)}">
  <p class="eyebrow">${esc(n.label)}</p>
  <p class="when"><time data-at="${n.opensAt.toISOString()}" data-timeknown="${n.timeKnown}">${esc(n.opensAt <= now ? `Now, until ${fmtJstDay(new Date(n.closesAt - 1))}` : n.timeKnown ? fmtJst(n.opensAt) : fmtJstDay(n.opensAt) + ' (time not confirmed)')}</time></p>
  <p class="local" data-local></p>
  <p class="covers">For visits ${esc(coversText(n))}</p>
  <p class="countdown" data-countdown></p>
  <div class="actions" data-actions>
    <a class="btn" data-gcal href="#">Add to Google Calendar</a>
    <a class="btn ghost" href="/calendars/${esc(f.id)}.ics">Subscribe to all ${esc(f.shortName)} release dates (.ics)</a>
  </div>
</section>${later.length ? `
<h2>Later sale dates</h2>
<ul class="later">${later.map((x) => `<li>${esc(x.timeKnown ? fmtJst(x.opensAt) : fmtJstDay(x.opensAt))}${x.estimated ? ' (expected, not announced yet)' : ''}: for ${esc(coversText(x))}</li>`).join('')}</ul>` : ''}`;
  }
  if (rule.type === 'days_before' || rule.type === 'months_before') {
    const ahead = rule.type === 'days_before' ? `the date ${rule.days} days later` : `the same date ${rule.monthsAhead} month${rule.monthsAhead === 1 ? '' : 's'} later`;
    return `<section class="next" data-rule="${ruleAttr}" data-name="${esc(f.shortName)}" data-id="${esc(f.id)}" data-url="${esc(f.officialUrl)}">
  <p class="eyebrow">Bookings open every day</p>
  <p class="when">${esc(rule.time ?? '')} JST, for ${esc(ahead)}</p>
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
<h1>When do ${esc(f.shortName)} ${esc(f.ticketNoun ?? 'tickets')} go on sale?</h1>
<p class="lede">${esc(describeRule(f.rule))}</p>
${introBlock(f)}
<p>${statusBadge(f)} <span class="muted">Last checked ${esc(fmtJst(new Date(f.lastVerifiedAt)))}</span></p>
${f.difficulty ? `<p class="difficulty"><strong>How hard to get:</strong> ${esc(difficultyText(f))}. <a href="#basis">Why we say this</a></p>` : ''}
${nextReleaseBox(f, now)}
<p><a class="official" href="${esc(f.officialUrl)}" rel="noopener" target="_blank">Official booking page ↗</a></p>

<h2>How to book, step by step</h2>
<ol class="steps">${f.bookingSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
${f.visitorTips?.length ? `<h2>Good to know for overseas visitors</h2>
<ul class="tips">${f.visitorTips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
${mapBlock(f, site)}

<h2>Sold out? Other ways in</h2>
<ul class="alts">${f.soldOut.map((x) => `<li>${affiliateLink(x, affiliates)}</li>`).join('')}</ul>

<h2>FAQ</h2>
${f.faq.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}

<h2>Sources</h2>
<ul class="sources">${f.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(new URL(s.url).hostname)}</a>: “${esc(s.quote)}” <span class="muted">(checked ${esc(s.checkedAt)})</span></li>`).join('')}</ul>
<p class="muted">${esc(f.statusNote)}</p>
${f.difficultyNote ? `<p class="muted" id="basis">How hard to get (“${esc(difficultyText(f))}”): ${esc(f.difficultyNote)}</p>` : ''}
${history.length ? `<h2>Rule changes</h2><ul>${history.map((c) => `<li>${esc(c.date)}: ${esc(c.text)}</li>`).join('')}</ul>` : ''}
`;
  return layout({
    site,
    title: `${f.shortName} ${f.ticketNoun ?? 'tickets'}: when they go on sale (${new Date(now).getUTCFullYear()}) | ${site.name}`,
    description: `${describeRule(f.rule)} See the next release in your time zone and add it to your calendar.`,
    path: `/tickets/${f.id}/`,
    body,
    jsonLd: [faqLd],
  });
}

const CATEGORIES = { attractions: 'Attractions', trains: 'Trains', events: 'Events', sights: 'Sights' };
// Home list sort options. The server renders "soonest"; app.js re-orders for the others.
const SORTS = {
  soonest: { label: 'Opening soonest', heading: 'Opening next' },
  popular: { label: 'Most popular', heading: 'Most popular' },
  hardest: { label: 'Hardest to get', heading: 'Hardest to get' },
};

const monthYear = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
const dayMonth = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
const lastDay = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).getUTCDate();

/** "For December 2026 visits", "For Jan 10 to Jan 24 visits" or the event name, for the home list. */
function shortCovers(n) {
  if (n.event) return n.event;
  const { coversFrom: a, coversTo: b } = n;
  if (a.slice(0, 7) === b.slice(0, 7) && a.endsWith('-01') && +b.slice(8) === lastDay(b)) return `For ${monthYear(a)} visits`;
  return a === b ? `For ${dayMonth(a)} visits` : `For ${dayMonth(a)} to ${dayMonth(b)} visits`;
}

/** Two short lines for rules with no single next date. */
function shortRule(rule) {
  const t = rule.time ? `${rule.time} Japan time` : '';
  switch (rule.type) {
    case 'months_before': return [`Daily, ${rule.monthsAhead === 1 ? '1 month' : `${rule.monthsAhead} months`} ahead`, t];
    case 'days_before': return [`${rule.days} days before your visit`, t];
    case 'rolling': return ['No fixed date', `Check about ${rule.checkFromDaysBefore} days ahead`];
    default: return [describeRule(rule), ''];
  }
}

export function homePage({ site, facilities, now, affiliates }) {
  const rows = facilities
    .map((f) => {
      const [n] = hasFixedReleases(f.rule) ? upcomingReleases(f.rule, now, 1) : [];
      return { f, n };
    })
    .sort((a, b) => (a.n?.opensAt ?? Infinity) - (b.n?.opensAt ?? Infinity));
  const when = (n, f) => {
    if (n && n.opensAt <= now) return `<span class="when-main ok">Open now</span><span class="muted">until ${esc(fmtJstDay(new Date(n.closesAt - 1)))}, Japan time</span>`;
    if (n) return `<time class="when-main" data-at="${n.opensAt.toISOString()}" data-timeknown="${n.timeKnown}" data-estimated="${!!n.estimated}">${esc(n.timeKnown ? fmtJst(n.opensAt) : fmtJstDay(n.opensAt))}</time><span class="muted" data-jst>${n.estimated ? 'Expected, not announced yet' : 'Japan time'}</span>`;
    const [main, sub] = shortRule(f.rule);
    return `<span class="when-main">${esc(main)}</span><span class="muted">${esc(sub)}</span>`;
  };
  const body = `
<section class="hero">
  <h1>Know when to book in Japan, in your time.</h1>
  <p class="lede">Ghibli, Disney, sumo, the Shinkansen and more. Release times from official sites, checked every day.</p>
  <ul class="what">
    <li>When bookings open, in your time zone</li>
    <li>How to book, step by step, plus tips for overseas visitors</li>
    <li>Add release times to your calendar so you don't miss them</li>
  </ul>
  <form class="search" role="search" data-search>
    <label for="q" class="sr">Search</label>
    <input id="q" name="q" type="search" list="places" placeholder="Search a place, train or event" autocomplete="off">
    <datalist id="places">${facilities.map((f) => `<option value="${esc(f.shortName)}"></option>`).join('')}</datalist>
    <button class="btn" type="submit">Search</button>
  </form>
</section>
<section class="box trip">
  <h2>Already know your dates?</h2>
  <p class="muted">We'll list when to book each place for your trip.</p>
  <form class="trip-form" action="/planner/" method="get">
    <label>Arrive <input type="date" name="from" required></label>
    <label>Leave <input type="date" name="to" required></label>
    <button class="btn dark" type="submit">Show booking dates</button>
  </form>
</section>
<div class="list-head" id="list">
  <h2>Opening next</h2>
  <p class="muted" data-tz>Times in Japan time (JST)</p>
</div>
<div class="filters" data-filters hidden>
  <div class="tabs" data-tabs role="group" aria-label="Category">
    <button type="button" aria-pressed="true" data-cat="">All</button>
    ${Object.entries(CATEGORIES).map(([k, v]) => `<button type="button" aria-pressed="false" data-cat="${k}">${v}</button>`).join('')}
  </div>
  <div class="tabs sort" data-sort role="group" aria-label="Sort">
    <span class="sort-label">Sort</span>
    ${Object.entries(SORTS).map(([k, v], i) => `<button type="button" aria-pressed="${i === 0}" data-by="${k}" data-heading="${esc(v.heading)}">${esc(v.label)}</button>`).join('')}
  </div>
</div>
<ul class="rows" data-rows>
${rows
  .map(({ f, n }, i) => `<li class="card" data-cat="${esc(f.category ?? '')}" data-name="${esc(`${f.name} ${f.shortName}`.toLowerCase())}" data-soonest="${i}" data-popular="${esc(f.popularity ?? 999)}" data-hardest="${esc(DIFFICULTY[f.difficulty]?.rank ?? 9)}">
  <div><span class="cat">${esc(CATEGORIES[f.category] ?? '')}</span>
  <a href="/tickets/${esc(f.id)}/">${esc(f.shortName)}</a>${n ? `<span class="for muted">${esc(shortCovers(n))}</span>` : ''}${f.difficulty ? `<span class="diff diff-${esc(f.difficulty)}">${esc(difficultyText(f, 'short'))}</span>` : ''}</div>
  <div class="when">${when(n, f)}</div>
</li>`)
  .join('\n')}
</ul>
<p class="muted" data-noresult hidden>Nothing matches. Try another name, or <a href="/planner/">plan by trip dates</a>.</p>
${affiliates?.klook?.homeUrl ? `<p class="muted">Missed a release? Some attractions are also offered as tours that include entry on <a href="${esc(affiliates.klook.homeUrl)}" rel="sponsored noopener" target="_blank">Klook</a>.</p>` : ''}`;
  return layout({ site, title: `${site.name}: when to book Japan's popular attractions, trains and events`, description: site.tagline, path: '/', body });
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
  return layout({ site, title: `Japan trip booking planner | ${site.name}`, description: 'Find out when to book the Shinkansen, Tokyo Disney, Ghibli Museum, sumo tickets and more for your travel dates.', path: '/planner/', body });
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
