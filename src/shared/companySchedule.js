/**
 * Deterministic deadline and recurrence rules shared by the main process,
 * the renderer and tests. Calendar cadences are computed from local Date
 * components so "every day at 09:00" stays at 09:00 across DST changes.
 */

export const MIN_INTERVAL_MINUTES = 15;
const UNIT = { h: 'hours', d: 'days', w: 'weeks' };

function validDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const date = new Date(year, month - 1, day, hour, minute, second, ms);
  // Reject rolled-over dates such as 31 February instead of silently moving the deadline.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
}

/** Epoch ms, ISO date/datetime, or relative "+24h" / "+3d" / "+2w" → epoch ms, else null. */
export function parseDeadline(value, now = Date.now()) {
  try {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (/^\d{11,14}$/.test(text)) return Number(text);
    const relative = /^\+\s*(\d{1,4})\s*([hdw])$/i.exec(text);
    if (relative) {
      const amount = Number(relative[1]), unit = UNIT[relative[2].toLowerCase()];
      if (!amount || !Number.isFinite(Number(now))) return null;
      if (unit === 'hours') return Number(now) + amount * 3_600_000;
      const date = new Date(Number(now));
      date.setDate(date.getDate() + amount * (unit === 'weeks' ? 7 : 1));
      return date.getTime();
    }
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    // A date without a time is due at the end of that local day.
    if (day) return validDate(Number(day[1]), Number(day[2]), Number(day[3]), 23, 59, 59, 999);
    const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (local) {
      const [, y, m, d, hh, mm, ss] = local.map(Number);
      if (hh > 23 || mm > 59 || (ss || 0) > 59) return null;
      return validDate(y, m, d, hh, mm, ss || 0);
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/.test(text)) return null;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  } catch { return null; }
}

function timeOf(at) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(at ?? ''));
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

/** Returns a normalised cadence, or throws a message the owner can act on. */
export function validateCadence(cadence) {
  if (!cadence || typeof cadence !== 'object' || Array.isArray(cadence)) throw new Error('Choose how often this work repeats.');
  if (cadence.everyMinutes != null) {
    const minutes = Number(cadence.everyMinutes);
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > 525_600) throw new Error(`Repeat interval must be at least ${MIN_INTERVAL_MINUTES} minutes.`);
    return { everyMinutes: minutes };
  }
  if (!timeOf(cadence.at)) throw new Error('Enter the time of day as HH:MM.');
  if (cadence.every === 'day') return { every: 'day', at: cadence.at };
  if (cadence.every === 'week') {
    const weekday = Number(cadence.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('Choose a day of the week.');
    return { every: 'week', weekday, at: cadence.at };
  }
  if (cadence.every === 'month') {
    const day = Number(cadence.day);
    // Days 29-31 do not exist in every month; a schedule must never skip a month.
    if (!Number.isInteger(day) || day < 1 || day > 28) throw new Error('Choose a day of the month between 1 and 28.');
    return { every: 'month', day, at: cadence.at };
  }
  throw new Error('Choose how often this work repeats.');
}

/** First occurrence strictly after `after` (epoch ms), in local time. */
export function nextRun(cadence, after = Date.now()) {
  const rule = validateCadence(cadence);
  const from = Number(after);
  if (!Number.isFinite(from)) throw new Error('Invalid schedule reference time.');
  if (rule.everyMinutes) return from + rule.everyMinutes * 60_000;
  const { hour, minute } = timeOf(rule.at);
  const start = new Date(from);
  const at = (year, month, day) => new Date(year, month, day, hour, minute, 0, 0).getTime();
  if (rule.every === 'month') {
    for (let offset = 0; offset < 3; offset += 1) {
      const candidate = at(start.getFullYear(), start.getMonth() + offset, rule.day);
      if (candidate > from) return candidate;
    }
  }
  // Calendar-day steps keep the wall-clock time when a day is 23 or 25 hours long.
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = at(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    if (candidate <= from) continue;
    if (rule.every === 'day' || new Date(candidate).getDay() === rule.weekday) return candidate;
  }
  throw new Error('Could not compute the next occurrence.');
}
