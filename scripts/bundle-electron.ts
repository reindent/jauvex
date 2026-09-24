// Bundle the Electron main process (backend included) and the preload script.
import { build, type BuildOptions } from 'esbuild';
const common: BuildOptions = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, logLevel: 'warning' };
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.mjs', format: 'esm',
  external: ['electron', '@anthropic-ai/claude-agent-sdk'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs', format: 'cjs', external: ['electron'] });
console.log('dist-electron/ ready');
