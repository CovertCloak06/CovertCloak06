// Builds the dev harness bundle and writes the injected controller as a
// standalone file, both into public/dev/ (git-ignored build output).
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { INJECTED_PLAYER_SCRIPT } = await import('@watch-party/shared/player');

await build({
  entryPoints: [resolve(root, 'harness/harness.ts')],
  outfile: resolve(root, 'public/dev/harness.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  sourcemap: true,
  minify: true,
  logLevel: 'warning',
});
if (typeof INJECTED_PLAYER_SCRIPT !== 'string' || INJECTED_PLAYER_SCRIPT.length < 1000) {
  throw new Error('INJECTED_PLAYER_SCRIPT missing: build @watch-party/shared first');
}
await writeFile(resolve(root, 'public/dev/injected.js'), `${INJECTED_PLAYER_SCRIPT}\n`);
console.log('built dev harness');
