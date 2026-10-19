// Include complete API sections, ranked for the actual subject. Essentials get
// reserved space so a long general cheatsheet cannot crowd out useful APIs.
export function focusedThreeReferences(brief, files, maxChars = 6000) {
  const text = String(brief || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = new Set(text.match(/[a-z]{4,}/g) || []);
  const route = {
    textures: /wood|oak|stone|fabric|leather|marble|brick|rust|texture|bois|chene|pierre|tissu|beton|metal/.test(text),
    animation: /water|fountain|move|spin|anim|clock|game|hinge|door|tourne|fontaine|mouv|porte|jeu/.test(text),
    shaders: /shader|hologra|lava|iridescen|dissolve/.test(text),
    lighting: /light|lamp|lantern|night|emissive|interior|lumi|eclair|nuit|lanterne|led\b/.test(text),
    interaction: /game|interact|click|pick|control|jeu|jouable/.test(text),
  };
  const essentials = new Set(['geometry:Basic Shapes', 'geometry:Path-Based', 'geometry:Curves', 'geometry:BufferGeometry', 'geometry:InstancedMesh',
    'materials:MeshStandardMaterial (PBR — recommended)', 'materials:MeshPhysicalMaterial (extends Standard)', 'materials:Common Properties',
    'lighting:Light Types']);
  const sections = [];
  for (const [path, content] of Object.entries(files)) {
    const topic = path.match(/threejs-([^/]+)\//)?.[1];
    if (!['geometry','materials'].includes(topic) && !route[topic]) continue;
    for (const section of String(content).split(/(?=^## )/m)) {
      const heading = section.match(/^## ([^\n]+)/)?.[1];
      if (!heading || /requestAnimationFrame|new THREE\.(?:Scene|WebGLRenderer|PerspectiveCamera)|new OrbitControls|renderer\.|scene\.(?:background|environment)|Loader\(\)\s*→\s*\.load/.test(section)) continue;
      const essential = essentials.has(`${topic}:${heading}`);
      const words = new Set(section.toLowerCase().match(/[a-z]{4,}/g) || []);
      const overlap = [...tokens].filter(token => words.has(token)).length;
      // Irrelevant alternate material systems and point clouds are omitted.
      if (!essential && !overlap && ['geometry','materials'].includes(topic)) continue;
      sections.push({ topic, essential, section: section.trim(), rank: (essential ? 100 : 0) + overlap * 3 + (route[topic] ? 10 : 0) });
    }
  }
  sections.sort((a,b) => b.rank-a.rank || a.topic.localeCompare(b.topic) || a.section.localeCompare(b.section));
  const selected = [];
  const topicCounts = new Map();
  let used = 0;
  for (const item of sections) {
    if (!item.essential && (topicCounts.get(item.topic) || 0) >= 2) continue;
    const entry = `# ${item.topic}\n${item.section}`;
    const size = entry.length + (selected.length ? 2 : 0);
    if (used + size > maxChars) continue;
    selected.push(entry); used += size;
    if(!item.essential)topicCounts.set(item.topic,(topicCounts.get(item.topic)||0)+1);
  }
  return selected.join('\n\n');
}
