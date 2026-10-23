import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listTemplates } from '../src/services/company/templates.js';
import { TEMPLATE_PRESENTATION } from '../src/services/company/templateCatalog.js';

// Adding an exposed workflow must also add a user-verifiable outcome to QA.
test('release acceptance covers every shipped team template', () => {
  const plan = readFileSync(new URL('../docs/WORKFLOW_ACCEPTANCE.md', import.meta.url), 'utf8');
  for (const id of new Set([...listTemplates().map(item => item.id), ...Object.keys(TEMPLATE_PRESENTATION)])) {
    assert.ok(plan.includes(`\`${id}\``), `Missing acceptance procedure for ${id}`);
  }
});

// Read catalog declarations without booting renderer-only inference imports.
test('release acceptance covers every selectable flagship workflow', () => {
  const source = readFileSync(new URL('../src/skills/flagship.js', import.meta.url), 'utf8');
  const media = readFileSync(new URL('../src/skills/mediaProduction.js', import.meta.url), 'utf8');
  const catalog = source.match(/const flagshipSkillCatalog = \[([\s\S]*?)\];/)[1].replace(/\/\/[^\n]*/g, '').split(',').map(name => name.trim()).filter(Boolean);
  const plan = readFileSync(new URL('../docs/WORKFLOW_ACCEPTANCE.md', import.meta.url), 'utf8');
  for (const name of catalog) {
    const declaration = source.split(`export const ${name} = createSkillDefinition({`)[1];
    const id = declaration ? declaration.match(/id:\s*["']([^"']+)/)[1] : media.split(`export const ${name} = definition('`)[1]?.split("'")[0];
    assert.ok(id, `Resolve catalog declaration ${name} before accepting its QA coverage`);
    assert.ok(plan.includes(`\`${id}\``), `Missing acceptance procedure for ${id}`);
  }
});
