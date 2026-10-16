// Source JPGs are excluded from installers because Vite emits hashed copies.
// Verify every catalogue map before packaging so size reduction cannot remove
// any material needed for offline generation or saved scenes.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const catalogue = JSON.parse(readFileSync('src/assets/materials/catalogue.json', 'utf8'));
const folder = '.vite/renderer/main_window/assets';
const emitted = new Set(readdirSync(folder)
  .filter(name => name.endsWith('.jpg'))
  .map(name => createHash('md5').update(readFileSync(path.join(folder, name))).digest('hex')));
let count = 0;
for (const material of catalogue) {
  for (const map of Object.values(material.maps)) {
    if (!emitted.has(map.md5)) throw new Error(`Missing bundled material: ${map.file}`);
    count++;
  }
}
if (!count) throw new Error('The material catalogue is empty');
console.log(`Verified ${count} material maps in the compiled renderer; source JPGs can be excluded.`);
