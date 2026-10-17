// Release-rule engine. Pure functions, no dependencies, runs in Node and the browser.
// Japan has no daylight saving time, so JST is always UTC+9.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Build a Date for a wall-clock time in JST. month is 1-12 and may overflow. */
export function jstDate(year, month, day, time = '00:00') {
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hh, mm) - JST_OFFSET_MS);
}

/** Calendar parts of a Date as seen in JST. */
export function jstParts(date) {
  const d = new Date(date.getTime() + JST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Parse 'YYYY-MM-DD' into parts. */
export function parseDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) throw new Error(`Invalid date: ${str}`);
  return { year: +m[1], month: +m[2], day: +m[3] };
}

/** Format parts as 'YYYY-MM-DD', normalising overflowed months/days. */
export function formatDay(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

function addMonths({ year, month }, n) {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

const daysInMonth = ({ year, month }) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Rules with release moments on fixed calendar dates (as opposed to a release every day). */
export function hasFixedReleases(rule) {
  return rule.type === 'monthly' || rule.type === 'lottery' || rule.type === 'fixed_dates';
}

const jstDay = (str, time) => {
  const { year, month, day } = parseDay(str);
  return jstDate(year, month, day, time);
};

/** A fixed_dates sale as a release: { opensAt, closesAt?, timeKnown, coversFrom, coversTo, event, estimated }. */
function fixedSale(s) {
  return {
    opensAt: jstDay(s.opensAt, s.time ?? '00:00'),
    closesAt: s.closesAt ? jstDay(s.closesAt, s.closesTime ?? '23:59') : undefined,
    timeKnown: Boolean(s.time) && !s.estimated,
    coversFrom: s.coversFrom,
    coversTo: s.coversTo,
    event: s.event,
    estimated: Boolean(s.estimated),
  };
}

/**
 * When does booking open for a visit on visitDay ('YYYY-MM-DD')?
 * Returns { opensAt: Date|null, timeKnown, kind, steps?: [{label, at, timeKnown}] }.
 */
export function releaseForVisit(rule, visitDay) {
  const v = parseDay(visitDay);
  switch (rule.type) {
    case 'monthly': {
      // A release on `day` of month M covers visits from windowStartDay of month M+monthsAhead
      // up to the day before windowStartDay of the month after that.
      const start = rule.windowStartDay ?? 1;
      let visitWindow = { year: v.year, month: v.month };
      if (v.day < start) visitWindow = addMonths(visitWindow, -1);
      const rel = addMonths(visitWindow, -rule.monthsAhead);
      return {
        kind: 'release',
        opensAt: jstDate(rel.year, rel.month, rule.day, rule.time ?? '00:00'),
        timeKnown: Boolean(rule.time),
      };
    }
    case 'days_before': {
      return {
        kind: 'release',
        opensAt: jstDate(v.year, v.month, v.day - rule.days, rule.time ?? '00:00'),
        timeKnown: Boolean(rule.time),
      };
    }
    case 'lottery': {
      const entry = addMonths(v, -rule.monthsAhead);
      const results = addMonths(entry, 1);
      return {
        kind: 'lottery',
        opensAt: jstDate(entry.year, entry.month, 1, rule.entryTime ?? '00:00'),
        timeKnown: Boolean(rule.entryTime),
        steps: [
          { label: 'Lottery entries open', at: jstDate(entry.year, entry.month, 1, rule.entryTime ?? '00:00'), timeKnown: Boolean(rule.entryTime) },
          { label: 'Results announced', at: jstDate(results.year, results.month, rule.resultsDay, '12:00'), timeKnown: false },
          { label: 'Payment deadline', at: jstDate(results.year, results.month, rule.paymentDay, '23:59'), timeKnown: false },
        ],
      };
    }
    case 'months_before': {
      // Same date N months earlier. If that date does not exist (e.g. Feb 30), the 1st of the next month.
      const rel = addMonths(v, -rule.monthsAhead);
      const day = v.day > daysInMonth(rel) ? daysInMonth(rel) + 1 : v.day;
      return {
        kind: 'release',
        opensAt: jstDate(rel.year, rel.month, day, rule.time ?? '00:00'),
        timeKnown: Boolean(rule.time),
      };
    }
    case 'fixed_dates': {
      // Only visit dates covered by a listed sale have a release; anything else returns null.
      const s = rule.sales.find((x) => x.coversFrom <= visitDay && visitDay <= x.coversTo);
      if (!s) return null;
      const r = fixedSale(s);
      return { kind: r.estimated ? 'check' : rule.kind ?? 'release', opensAt: r.opensAt, timeKnown: r.timeKnown, estimated: r.estimated };
    }
    case 'rolling': {
      return {
        kind: 'check',
        opensAt: jstDate(v.year, v.month, v.day - rule.checkFromDaysBefore, '00:00'),
        timeKnown: false,
      };
    }
    default:
      throw new Error(`Unknown rule type: ${rule.type}`);
  }
}

/**
 * Upcoming release moments after `now`, for monthly, lottery and fixed_dates rules.
 * Returns [{ opensAt, timeKnown, coversFrom, coversTo, label }]. Daily rules return [] (they release every day).
 * fixed_dates entries also carry `event` and `estimated`; a lottery window still open is included.
 */
export function upcomingReleases(rule, now = new Date(), count = 3) {
  const out = [];
  const today = jstParts(now);
  if (rule.type === 'monthly') {
    const start = rule.windowStartDay ?? 1;
    for (let i = -1; out.length < count && i < count + 2; i++) {
      const rel = addMonths(today, i);
      const opensAt = jstDate(rel.year, rel.month, rule.day, rule.time ?? '00:00');
      if (opensAt <= now) continue;
      const cover = addMonths(rel, rule.monthsAhead);
      const next = addMonths(cover, 1);
      out.push({
        opensAt,
        timeKnown: Boolean(rule.time),
        coversFrom: formatDay(cover.year, cover.month, start),
        coversTo: formatDay(next.year, next.month, start - 1),
        label: 'Booking opens',
      });
    }
  } else if (rule.type === 'lottery') {
    for (let i = 0; out.length < count && i < count + 2; i++) {
      const entry = addMonths(today, i);
      const opensAt = jstDate(entry.year, entry.month, 1, rule.entryTime ?? '00:00');
      // Entry stays open through the month, so the current month still counts until it ends.
      const closesAt = jstDate(entry.year, entry.month + 1, 1, '00:00');
      if (closesAt <= now) continue;
      const visit = addMonths(entry, rule.monthsAhead);
      out.push({
        opensAt,
        timeKnown: Boolean(rule.entryTime),
        coversFrom: formatDay(visit.year, visit.month, 1),
        coversTo: formatDay(visit.year, visit.month + 1, 0),
        closesAt,
        label: opensAt <= now ? 'Lottery entries open now' : 'Lottery entries open',
      });
    }
  } else if (rule.type === 'fixed_dates') {
    const lottery = rule.kind === 'lottery';
    for (const r of rule.sales.map(fixedSale).sort((a, b) => a.opensAt - b.opensAt)) {
      if (out.length >= count) break;
      if ((r.opensAt > now ? r.opensAt : r.closesAt ?? r.opensAt) <= now) continue;
      const open = r.opensAt <= now;
      r.label = r.estimated ? 'Expected to open (date not announced yet)'
        : lottery ? (open ? 'Lottery entries open now' : 'Lottery entries open')
        : open ? 'On sale now' : 'Tickets go on sale';
      out.push(r);
    }
  }
  return out;
}

/** Plain-English one-liner describing a rule. */
export function describeRule(rule) {
  const t = rule.time ? `${rule.time} JST` : 'a time not yet confirmed (JST)';
  const ord = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  switch (rule.type) {
    case 'monthly': {
      const ahead = rule.monthsAhead === 1 ? 'the following month' : `the month ${rule.monthsAhead} months later`;
      const window = (rule.windowStartDay ?? 1) === 1 ? ahead : `${ahead} (the ${ord(rule.windowStartDay)} to the ${ord(rule.windowStartDay - 1)} of the next month)`;
      return `Tickets go on sale on the ${ord(rule.day)} of each month at ${t}, for visits in ${window}.`;
    }
    case 'days_before':
      return `Bookings open ${rule.days} days before your visit date, at ${t}.`;
    case 'lottery':
      return `Tickets are allocated by lottery. Enter during the month that is ${rule.monthsAhead} months before your visit; results arrive on the ${ord(rule.resultsDay)} of the next month and payment is due by the ${ord(rule.paymentDay)}.`;
    case 'months_before': {
      const n = ['', 'one', 'two', 'three', 'four', 'five', 'six'][rule.monthsAhead] ?? rule.monthsAhead;
      return `Bookings open every day at ${t}, for the same date ${n} month${rule.monthsAhead === 1 ? '' : 's'} later. Dates that don't exist in the earlier month (such as the 31st) open on the 1st of the next month.`;
    }
    case 'fixed_dates':
      return rule.kind === 'lottery'
        ? 'Tickets are allocated by lottery, with an entry window for each round on dates set by the organiser.'
        : 'Tickets go on sale on fixed dates set by the organiser for each event.';
    case 'rolling':
      return `There is no fixed release rule. Start checking about ${rule.checkFromDaysBefore} days before your visit.`;
    default:
      return '';
  }
}
