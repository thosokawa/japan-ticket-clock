// Client-side: show release times in the visitor's time zone, countdowns,
// calendar links, and the trip planner. No tracking, no cookies.
import { releaseForVisit, upcomingReleases, describeRule } from './rules.mjs';
import { buildCalendar, googleCalendarUrl } from './ics.mjs';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// When only the date is known, show the Japan date: converting midnight JST would shift it to the wrong day.
const fmtLocal = (d, timeKnown = true) => timeKnown
  ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d)
  : new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Tokyo', weekday: 'short', month: 'short', day: 'numeric' }).format(d) + ' (Japan date, time not set)';
const fmtJst = (d) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) + ' JST';
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; };
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

// Facility "next release" box: recompute live so a cached page is never stale.
const box = document.querySelector('.next[data-rule]');
if (box) {
  const rule = JSON.parse(box.dataset.rule);
  const name = box.dataset.name;
  const pageUrl = location.href;
  if (rule.type === 'monthly' || rule.type === 'lottery') {
    const [n] = upcomingReleases(rule, new Date(), 1);
    const time = box.querySelector('time');
    const openNow = n.opensAt <= new Date();
    box.querySelector('.eyebrow').textContent = n.label;
    time.textContent = openNow
      ? `Now, until ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric' }).format(new Date(n.closesAt - 1))} (Japan time)`
      : n.timeKnown ? fmtJst(n.opensAt) : `${fmtJst(n.opensAt).replace(/ \d\d:\d\d JST$/, '')} (time not confirmed)`;
    box.querySelector('[data-local]').textContent = openNow ? '' : `Your time (${tz}): ${fmtLocal(n.opensAt, n.timeKnown)}`;
    box.querySelector('.covers').textContent = `For visits ${n.coversFrom} to ${n.coversTo}`;
    const cd = box.querySelector('[data-countdown]');
    const tick = () => { cd.textContent = openNow ? '' : countdown(n.opensAt); };
    tick();
    setInterval(tick, 30000);
    box.querySelector('[data-gcal]').href = googleCalendarUrl({
      start: new Date(n.opensAt.getTime() - 10 * 60000),
      minutes: 30,
      title: `${name}: ${n.label.toLowerCase()}`,
      details: `${describeRule(rule)}\nBook: ${box.dataset.url}\nSold out? ${pageUrl}`,
    });
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
    const items = [];
    for (const f of chosen) {
      const seen = new Set();
      for (const day of [from, to]) {
        const r = releaseForVisit(f.rule, day);
        const key = r.opensAt.toISOString();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ f, r, day });
      }
    }
    items.sort((a, b) => a.r.opensAt - b.r.opensAt);
    const now = Date.now();
    const rows = items.map(({ f, r, day }) => {
      const past = r.opensAt.getTime() < now;
      const label = r.kind === 'check' ? 'Start checking' : r.kind === 'lottery' ? 'Lottery entries open' : 'Booking opens';
      return `<tr class="${past ? 'past' : ''}"><td><a href="/tickets/${escHtml(f.id)}/">${escHtml(f.shortName)}</a><br><span class="muted">for ${escHtml(day)}</span></td>
<td>${escHtml(label)}<br><strong>${escHtml(fmtLocal(r.opensAt, r.timeKnown))}</strong><br><span class="muted">${escHtml(r.timeKnown ? fmtJst(r.opensAt) : 'Japan time')}</span></td>
<td>${past ? (r.kind === 'lottery' ? 'Entries open now' : 'Already open: book now') : escHtml(countdown(r.opensAt))}</td></tr>`;
    });
    const result = document.querySelector('[data-planner-result]');
    result.replaceChildren(el(`<table class="plan"><thead><tr><th>Place</th><th>When (your time)</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>
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
