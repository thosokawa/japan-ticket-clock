// Minimal iCalendar (RFC 5545) writer for release reminders.

const pad = (n) => String(n).padStart(2, '0');

/** Date -> 20261110T010000Z */
export function icsStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
}

function escapeText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 octets must be folded.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * events: [{ uid, start: Date, minutes, title, description, url, alarmMinutes }]
 */
export function buildCalendar(events, { name = 'Japan ticket releases', now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Japan Ticket Clock//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const e of events) {
    const end = new Date(e.start.getTime() + (e.minutes ?? 30) * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsStamp(e.start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      `DESCRIPTION:${escapeText(e.description ?? '')}`,
    );
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarmMinutes != null) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:-PT${e.alarmMinutes}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google Calendar "add event" link. */
export function googleCalendarUrl({ start, minutes = 30, title, details }) {
  const end = new Date(start.getTime() + minutes * 60000);
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${icsStamp(start)}/${icsStamp(end)}`, details });
  return `https://calendar.google.com/calendar/render?${params}`;
}
