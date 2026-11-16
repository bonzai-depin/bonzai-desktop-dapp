// Arrangement estimate, not a prediction of the generated vocal timing.
// Bracketed sections retain repeated choruses; production directions aren't sung.
export function estimateLyricsDuration(lyrics, bpm = 120, beatsPerBar = 4) {
  const tempo = Number(bpm) > 0 ? Number(bpm) : 120;
  const meter = Number(beatsPerBar) > 0 ? Number(beatsPerBar) : 4;
  const sections = [];
  let section = { name: 'verse', lines: [] };
  for (const raw of String(lyrics || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tag = line.match(/^\[([^\]]+)\]$/);
    if (tag) { sections.push(section); section = { name: tag[1].toLowerCase(), lines: [] }; }
    else if (!/^\(.*\)$/.test(line)) section.lines.push(line);
  }
  sections.push(section);
  let bars = 0;
  for (const {name, lines} of sections) {
    if (!lines.length) {
      if (/intro|outro|instrumental|solo|break|build|drop/.test(name)) bars += 4;
      continue;
    }
    // Short hooks fit one bar; longer phrases get two or more. Round each
    // section to a four-bar musical phrase, including non-Latin lyrics.
    const phraseBars = lines.reduce((sum, line) => {
      const words = line.match(/[\p{L}\p{N}]+/gu) || [];
      const cjk = (line.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
      return sum + Math.max(1, Math.ceil(Math.max(words.length, cjk / 2) / 7));
    }, 0);
    bars += Math.ceil(phraseBars / 4) * 4;
  }
  return Math.ceil(bars * meter * 60 / tempo);
}
