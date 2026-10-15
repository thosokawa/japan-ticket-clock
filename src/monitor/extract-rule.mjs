// Ask Claude whether a changed official page changes the booking-release rule.
// The model only drafts; a person approves every change through a pull request.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const MODEL = process.env.MONITOR_MODEL ?? 'claude-opus-5-5';

// Flat schema (nullable fields) so it maps cleanly onto JSON Schema; converted to our rule shape below.
const Extraction = z.object({
  ruleChanged: z.boolean().describe('True only if the page states a release rule that differs from the current rule.'),
  ruleType: z.enum(['monthly', 'days_before', 'lottery', 'rolling', 'unknown']),
  day: z.number().int().nullable().describe('monthly: day of month bookings open'),
  time: z.string().nullable().describe('HH:MM in Japan time, or null if the page gives no time'),
  monthsAhead: z.number().int().nullable(),
  windowStartDay: z.number().int().nullable(),
  days: z.number().int().nullable().describe('days_before: how many days before the visit'),
  resultsDay: z.number().int().nullable(),
  paymentDay: z.number().int().nullable(),
  checkFromDaysBefore: z.number().int().nullable(),
  evidenceQuote: z.string().describe('Exact sentence copied from the page that states the rule. Empty if none.'),
  summary: z.string().describe('One plain-English sentence describing what changed, for the reviewer.'),
});

const KEYS = {
  monthly: ['day', 'time', 'monthsAhead', 'windowStartDay'],
  days_before: ['days', 'time'],
  lottery: ['monthsAhead', 'resultsDay', 'paymentDay'],
  rolling: ['checkFromDaysBefore'],
};

/** Convert the flat extraction into a rule object, or null if it is incomplete. */
export function toRule(x) {
  const keys = KEYS[x.ruleType];
  if (!keys) return null;
  const rule = { type: x.ruleType };
  for (const k of keys) if (x[k] != null) rule[k] = x[k];
  if (rule.time != null && !/^\d{2}:\d{2}$/.test(rule.time)) return null;
  const required = { monthly: ['day', 'monthsAhead'], days_before: ['days'], lottery: ['monthsAhead', 'resultsDay', 'paymentDay'], rolling: ['checkFromDaysBefore'] }[x.ruleType];
  return required.every((k) => rule[k] != null) ? rule : null;
}

const SYSTEM = `You check official Japanese attraction booking pages for changes to when tickets or reservations go on sale.
You are given the attraction's current rule (as JSON) and the current text of its official page.
Decide whether the page states a release rule that differs from the current rule. Report times in Japan Standard Time.
Only use what the page states. If the page does not state a release rule, set ruleChanged to false and ruleType to "unknown".
Copy the evidence sentence exactly as it appears on the page.`;

export async function extractRule({ facility, url, pageText, client = new Anthropic() }) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Attraction: ${facility.name}\nOfficial page: ${url}\n\nCurrent rule:\n${JSON.stringify(facility.rule)}\n\nPage text:\n<page>\n${pageText.slice(0, 60000)}\n</page>`,
    }],
    output_config: { format: zodOutputFormat(Extraction) },
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return { ok: false, reason: response.stop_reason === 'refusal' ? 'model declined' : 'no structured output' };
  }
  return { ok: true, extraction: response.parsed_output };
}
