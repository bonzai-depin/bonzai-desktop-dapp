export function sceneEnvironmentChanged(response, previous = {}) {
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
  return ['timeOfDay', 'lighting', 'weather'].some(key =>
    response[key] && normalize(response[key]) !== normalize(previous[key]));
}

// Only expose the JSON dialogue field while it arrives, never model reasoning or metadata.
export function streamedDialogue(raw) {
  const visible = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '');
  const match = /"response"\s*:\s*"/.exec(visible);
  if (!match) return '';
  const tail = visible.slice(match.index + match[0].length);
  let encoded = '';
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] === '"') break;
    if (tail[i] === '\\') {
      if (i + 1 >= tail.length) break;
      if (tail[i + 1] === 'u' && tail.length - i < 6) break;
      encoded += tail[i] + tail[++i];
    } else encoded += tail[i];
  }
  try { return JSON.parse('"' + encoded + '"'); } catch { return ''; }
}
