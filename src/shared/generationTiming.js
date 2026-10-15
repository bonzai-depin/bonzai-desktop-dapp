// Persist milliseconds. Legacy inference-store `elapsed` values are seconds.
const milliseconds = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function generationElapsedMs(record = {}) {
  const data = record.answer?.data || {};
  for (const value of [record.elapsedMs, record.elapsed_ms, data.elapsed_ms, record.metadata?.elapsedMs]) {
    const ms = milliseconds(value);
    if (ms !== null) return ms;
  }
  for (const value of [record.elapsed, record.metadata?.elapsed]) {
    const seconds = milliseconds(value);
    if (seconds !== null) return seconds * 1000;
  }
  // Old inspector callers supplied a formatted millisecond string.
  const legacy = String(record.extra?.elapsedMs ?? '').match(/^(\d+(?:\.\d+)?)\s*ms$/);
  return legacy ? Number(legacy[1]) : milliseconds(record.extra?.elapsedMs);
}

export function formatGenerationTime(value, locale = 'en') {
  const ms = milliseconds(value);
  if (ms === null) return '';
  const unit = (value, unit) => new Intl.NumberFormat(locale, {
    style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 0,
  }).format(value);
  if (ms < 1000) return unit(Math.round(ms), 'millisecond');
  let seconds = Math.round(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [hours ? unit(hours, 'hour') : '', minutes ? unit(minutes, 'minute') : '',
    seconds || (!hours && !minutes) ? unit(seconds, 'second') : ''].filter(Boolean).join(' ');
}
