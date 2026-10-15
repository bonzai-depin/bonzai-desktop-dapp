// Apply to accumulated output, not individual tokens: reasoning blocks may span
// chunks. An unfinished block (or opening tag) stays hidden until it is closed.
export function visibleText(value) {
  const text = String(value ?? '').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  const tags = /<\s*(\/?)\s*(think|thinking|reasoning|analysis|reflection)\b[^>]*>/gi;
  let depth = 0, cursor = 0, result = '', match;
  while ((match = tags.exec(text))) {
    if (!depth) result += text.slice(cursor, match.index);
    if (match[1]) depth = Math.max(0, depth - 1);
    else depth++;
    cursor = tags.lastIndex;
  }
  if (!depth) result += text.slice(cursor);
  const names = ['think', 'thinking', 'reasoning', 'analysis', 'reflection'];
  return result.replace(/<\s*\/?\s*([a-z]+)(?:\s[^>]*)?$/i,
    (tag, name) => names.some(value => value.startsWith(name.toLowerCase())) ? '' : tag)
    .replace(/<\s*\/?\s*$/, '').trim();
}

export function visibleRecord(value) {
  if (typeof value === 'string') return /(?:<|&lt;)\s*\/?\s*(?:think|thinking|reasoning|analysis|reflection)/i.test(value) ? visibleText(value) : value;
  if (Array.isArray(value)) return value.map(visibleRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['reasoning_content', 'reasoning', 'thinking'].includes(key))
    .map(([key, item]) => [key, visibleRecord(item)]));
  return value;
}
