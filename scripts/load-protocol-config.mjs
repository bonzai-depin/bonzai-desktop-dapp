import { createRequire } from 'node:module';
import { resolve } from 'node:path';
// Load at runtime so Vite's configuration bundler does not inline CommonJS
// built-in requires into its temporary ESM config bundle.
const require = createRequire(import.meta.url);
require(resolve(process.cwd(), 'scripts/protocol-config.cjs')).loadProtocolConfig();
