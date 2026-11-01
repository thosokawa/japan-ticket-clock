// Turn an HTML page into stable plain text for change detection.
import { createHash } from 'node:crypto';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

export function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .split('\n')
    .map((l) => l.replace(/[ \t　]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// Lines that change every day on their own (today's date, sunrise and sunset times).
// Comparing them would flag a page as changed daily.
const VOLATILE = [
  /^\d{4}\s*[./\-年]\s*\d{1,2}\s*[./\-月]\s*\d{1,2}\s*日?\s*[.(（]?\s*([A-Za-z]{3}|[日月火水木金土])?\s*[)）]?$/,
  /^(日の出|日の入り?|sunrise|sunset)\s*:?\s*\d{1,2}:\d{2}$/i,
];

/** Drop lines that change daily regardless of the booking rules. */
export const dropVolatileLines = (text) =>
  text.split('\n').filter((l) => !VOLATILE.some((re) => re.test(l))).join('\n');

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Lines added and removed between two texts (order-insensitive, good enough to show a reviewer). */
export function lineDiff(before, after) {
  const a = new Set(before.split('\n'));
  const b = new Set(after.split('\n'));
  return { added: [...b].filter((l) => !a.has(l)), removed: [...a].filter((l) => !b.has(l)) };
}

/** Is `quote` really on the page? Whitespace-insensitive, to catch invented evidence. */
export function quoteAppears(quote, text) {
  const norm = (s) => s.replace(/\s+/g, '').toLowerCase();
  return Boolean(quote) && norm(text).includes(norm(quote));
}
