// Client-side: show release times in the visitor's time zone, countdowns,
// calendar links, and the trip planner. No tracking, no cookies.
import { releaseForVisit, upcomingReleases, describeRule, hasFixedReleases } from './rules.mjs';
import { buildCalendar, googleCalendarUrl } from './ics.mjs';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// When only the date is known, show the Japan date: converting midnight JST would shift it to the wrong day.
const fmtLocal = (d, timeKnown = true) => timeKnown
  ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d)
  : new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Tokyo', weekday: 'short', month: 'short', day: 'numeric' }).format(d) + ' (Japan date, time not set)';
const fmtJst = (d) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) + ' JST';
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
const coversText = (n) => `${n.coversFrom === n.coversTo ? n.coversFrom : `${n.coversFrom} to ${n.coversTo}`}${n.event ? ` (${n.event})` : ''}`;
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function countdown(target) {
  const ms = target - Date.now();
  if (ms <= 0) return 'Open now';
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
  return d > 0 ? `${d}d ${h}h ${m}m to go` : `${h}h ${m}m to go`;
}

function downloadIcs(name, events) {
  const blob = new Blob([buildCalendar(events, { name })], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/\W+/g, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Any <time data-at> gets the visitor's local time next to it.
for (const t of document.querySelectorAll('time[data-at]')) {
  const d = new Date(t.dataset.at);
  const local = t.closest('.next, .card')?.querySelector('[data-local]');
  if (local) local.textContent = `Your time (${tz}): ${fmtLocal(d, t.dataset.timeknown === 'true')}`;
}

// Home list: show each release in the visitor's time, filter by search and category.
const list = document.querySelector('[data-rows]');
if (list) {
  for (const t of list.querySelectorAll('time[data-at]')) {
    const d = new Date(t.dataset.at);
    const known = t.dataset.timeknown === 'true';
    const jst = t.parentElement.querySelector('[data-jst]');
    if (known && jst && jst.textContent === 'Japan time') jst.textContent = fmtJst(d);
    // Without a set time, keep the Japan date: converting midnight JST would show the wrong day.
    if (known) t.textContent = fmtLocal(d, true);
    else t.textContent = `${t.dataset.estimated === 'true' ? 'Around ' : ''}${new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Tokyo', weekday: 'short', month: 'short', day: 'numeric' }).format(d)}`;
  }
  document.querySelector('[data-tz]').textContent = `Times in your time zone (${tz})`;
  const rows = [...list.children];
  const input = document.querySelector('[data-search] input');
  const tabs = document.querySelector('[data-tabs]');
  let cat = '';
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    for (const r of rows) r.hidden = (cat && r.dataset.cat !== cat) || (q && !r.dataset.name.includes(q));
    document.querySelector('[data-noresult]').hidden = rows.some((r) => !r.hidden);
    return rows.filter((r) => !r.hidden);
  };
  input.addEventListener('input', apply);
  document.querySelector('[data-search]').addEventListener('submit', (e) => {
    e.preventDefault();
    const shown = apply();
    if (shown.length === 1) location.href = shown[0].querySelector('a').href;
    else document.getElementById('list').scrollIntoView({ behavior: 'smooth' });
  });
  tabs.hidden = false;
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    cat = b.dataset.cat;
    for (const x of tabs.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    apply();
  });
}

// Facility "next release" box: recompute live so a cached page is never stale.
const box = document.querySelector('.next[data-rule]');
if (box) {
  const rule = JSON.parse(box.dataset.rule);
  const name = box.dataset.name;
  const pageUrl = location.href;
  const [n] = hasFixedReleases(rule) ? upcomingReleases(rule, new Date(), 1) : [];
  if (n) {
    const time = box.querySelector('time');
    const openNow = n.opensAt <= new Date();
    box.querySelector('.eyebrow').textContent = n.label;
    time.textContent = openNow
      ? `Now, until ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric' }).format(new Date(n.closesAt - 1))} (Japan time)`
      : n.timeKnown ? fmtJst(n.opensAt) : `${fmtJst(n.opensAt).replace(/ \d\d:\d\d JST$/, '')} (time not confirmed)`;
    box.querySelector('[data-local]').textContent = openNow ? '' : `Your time (${tz}): ${fmtLocal(n.opensAt, n.timeKnown)}`;
    box.querySelector('.covers').textContent = `For visits ${coversText(n)}`;
    const cd = box.querySelector('[data-countdown]');
    // An expected date is only a guess, so no countdown to it.
    const tick = () => { cd.textContent = openNow || n.estimated ? '' : countdown(n.opensAt); };
    tick();
    setInterval(tick, 30000);
    box.querySelector('[data-gcal]').href = googleCalendarUrl({
      start: new Date(n.opensAt.getTime() - 10 * 60000),
      minutes: 30,
      title: `${name}: ${n.label.toLowerCase()}`,
      details: `${describeRule(rule)}\nBook: ${box.dataset.url}\nSold out? ${pageUrl}`,
    });
  } else if (hasFixedReleases(rule)) {
    // Every listed date has passed since the page was built.
    box.querySelector('.eyebrow').textContent = 'No upcoming sale date';
    box.querySelector('.when').textContent = 'The next sale date has not been announced yet';
    for (const x of box.querySelectorAll('[data-local], .covers, [data-countdown], [data-actions]')) x.remove();
  }
  const form = box.querySelector('[data-visit-form]');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const visit = new FormData(form).get('visit');
      const r = releaseForVisit(rule, visit);
      const label = r.kind === 'check' ? 'Start checking' : 'Booking opens';
      const gcal = googleCalendarUrl({ start: new Date(r.opensAt.getTime() - 10 * 60000), title: `${name}: ${label.toLowerCase()} for ${visit}`, details: `Book: ${box.dataset.url}\nSold out? ${pageUrl}` });
      const out = box.querySelector('[data-visit-result]');
      out.replaceChildren(el(`<p class="when">${escHtml(label)}: ${escHtml(r.timeKnown ? fmtJst(r.opensAt) : fmtJst(r.opensAt).replace(/ \d\d:\d\d JST$/, ''))}</p>
<p class="local">Your time (${escHtml(tz)}): ${escHtml(fmtLocal(r.opensAt, r.timeKnown))}</p>
<p class="countdown">${escHtml(countdown(r.opensAt))}</p>
<p><a class="btn" href="${escHtml(gcal)}" target="_blank" rel="noopener">Add to Google Calendar</a></p>`));
    });
  }
}

// Trip planner.
const planner = document.querySelector('[data-planner]');
if (planner) {
  const facilities = await (await fetch('/assets/facilities.json')).json();
  planner.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(planner);
    const from = fd.get('from');
    const to = fd.get('to');
    const chosen = facilities.filter((f) => fd.getAll('f').includes(f.id));
    // One release per facility for the first day of the trip; a second if the trip crosses into another release window.
    // Fixed-date sales (sumo, festivals) cover only some days, so check every day of the trip for those.
    const tripDays = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`) && tripDays.length < 120; d.setUTCDate(d.getUTCDate() + 1)) tripDays.push(d.toISOString().slice(0, 10));
    const items = [];
    const notCovered = [];
    for (const f of chosen) {
      const seen = new Set();
      for (const day of f.rule.type === 'fixed_dates' ? tripDays : [from, to]) {
        const r = releaseForVisit(f.rule, day);
        if (!r) continue;
        const key = r.opensAt.toISOString();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ f, r, day });
      }
      if (!seen.size) notCovered.push(f);
    }
    items.sort((a, b) => a.r.opensAt - b.r.opensAt);
    const now = Date.now();
    const rows = items.map(({ f, r, day }) => {
      const past = r.opensAt.getTime() < now;
      const label = r.estimated ? 'Expected sale (not announced yet)' : r.kind === 'check' ? 'Start checking' : r.kind === 'lottery' ? 'Lottery entries open' : 'Booking opens';
      return `<tr class="${past ? 'past' : ''}"><td><a href="/tickets/${escHtml(f.id)}/">${escHtml(f.shortName)}</a><br><span class="muted">for ${escHtml(day)}</span></td>
<td>${escHtml(label)}<br><strong>${escHtml(fmtLocal(r.opensAt, r.timeKnown))}</strong><br><span class="muted">${escHtml(r.timeKnown ? fmtJst(r.opensAt) : 'Japan time')}</span></td>
<td>${past ? (r.kind === 'lottery' ? 'Entries open now' : 'Already open: book now') : escHtml(countdown(r.opensAt))}</td></tr>`;
    });
    const result = document.querySelector('[data-planner-result]');
    const skipped = notCovered.length ? `<p class="muted">No sale dates listed for your trip: ${notCovered.map((f) => `<a href="/tickets/${escHtml(f.id)}/">${escHtml(f.shortName)}</a>`).join(', ')}</p>` : '';
    result.replaceChildren(el(`<table class="plan"><thead><tr><th>Place</th><th>When (your time)</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>${skipped}
<p><button class="btn" type="button" data-ics>Add all to my calendar (.ics)</button></p>`));
    result.querySelector('[data-ics]').addEventListener('click', () => {
      const events = items.filter(({ r }) => r.opensAt.getTime() > now).map(({ f, r, day }) => ({
        uid: `${f.id}-${day}-${r.opensAt.getTime()}@planner`,
        start: new Date(r.opensAt.getTime() - 10 * 60000),
        minutes: 30,
        title: `${f.shortName}: booking for ${day}`,
        description: `Book: ${f.officialUrl}\nSold out? ${location.origin}/tickets/${f.id}/`,
        alarmMinutes: 15,
      }));
      downloadIcs('Japan trip bookings', events);
    });
  });
}

// Dates handed over from the home page: fill them in and show the result straight away.
if (planner) {
  const params = new URLSearchParams(location.search);
  if (params.get('from') && params.get('to')) {
    planner.elements.from.value = params.get('from');
    planner.elements.to.value = params.get('to');
    planner.requestSubmit();
  }
}
