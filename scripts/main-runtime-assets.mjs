import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// These are build outputs, never files exposed by a development HTTP route.
export function mainRuntimeAssets(root = process.cwd()) {
  return {
    name: 'bonzai-main-runtime-assets',
    apply: 'build',
    generateBundle() {
      const files = ['diffuser', 'hub_publish', 'inference_serialization', 'video_enhance', 'seedvr2_worker']
        .map(name => [`src/server/${name}.py`, `${name}.py`]);
      files.push(['src/template.jinja', 'template.jinja']);
      for (const name of readdirSync(resolve(root, 'src/main/db/migrations')).sort()) {
        if (name.endsWith('.sql')) files.push([`src/main/db/migrations/${name}`, `migrations/${name}`]);
      }
      for (const [source, fileName] of files) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(root, source)) });
      }
    },
  };
}
