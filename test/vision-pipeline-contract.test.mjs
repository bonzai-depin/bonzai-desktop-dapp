import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('workflow vision readiness requests resolve to the server plan and include the model plus projector', () => {
 const callers = ['src/components/SmartAgent.vue', 'src/components/skills/RoleplayChat.vue', 'src/components/skills/SkillDownloader.vue', 'src/services/company/workflowExecution.js'];
 const pipelines = callers.map(file => {
  const source = readFileSync(file, 'utf8');
  const match = source.slice(source.indexOf(file.endsWith('workflowExecution.js') ? 'const pipelines = {' : file.endsWith('RoleplayChat.vue') ? 'const PIPELINE_MAP = {' : 'const pipelineMap = {')).match(/\bvision:\s*['"]([^'"]+)['"]/);
  assert.ok(match, `${file}: explicit vision routing`);
  return match[1];
 });
 // Execute the actual planner in isolation: no Flask server or model loading.
 const plans = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, sys
from pathlib import Path
module = ast.parse(Path('src/server/diffuser.py').read_text())
node = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == '_plan_for')
node.returns = None
for arg in node.args.args: arg.annotation = None
scope = {'VISION_GGUF_NAME':'vision.gguf','VISION_GGUF_URL':'model-url','VISION_MMPROJ_NAME':'mmproj.gguf','VISION_MMPROJ_URL':'projector-url','_sf':lambda name,url: {'name':name,'url':url}}
exec(compile(ast.Module(body=[node], type_ignores=[]), '<planner>', 'exec'), scope)
print(json.dumps([scope['_plan_for'](p) for p in json.loads(sys.argv[1])]))
`, JSON.stringify(pipelines)], {encoding:'utf8'}));
 for(const plan of plans) assert.deepEqual(plan.single_files.map(file=>file.name), ['vision.gguf','mmproj.gguf']);
});
