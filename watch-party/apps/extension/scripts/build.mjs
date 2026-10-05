// Builds the unpacked extension into build/ (load it via chrome://extensions,
// "Load unpacked"). `--dev` also matches localhost for testing against the
// server's dev harness.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawIcon } from './icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'build');
const dev = process.argv.includes('--dev');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, 'icons'), { recursive: true });

const common = {
  define: { __DEV__: String(dev) },
  bundle: true,
  target: ['chrome116'],
  platform: 'browser',
  legalComments: 'none',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  logLevel: 'warning',
};
await Promise.all([
  build({
    ...common,
    entryPoints: [resolve(root, 'src/background.ts')],
    outfile: resolve(out, 'background.js'),
    format: 'esm',
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'src/content.ts')],
    outfile: resolve(out, 'content.js'),
    format: 'iife',
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'src/netflix-main.ts')],
    outfile: resolve(out, 'netflix-main.js'),
    format: 'iife',
  }),
  build({
    ...common,
    entryPoints: [resolve(root, 'src/popup.ts')],
    outfile: resolve(out, 'popup.js'),
    format: 'iife',
  }),
]);

// The manifest is generated from the shared service registry (bundled on the fly).
const manifestModule = await build({
  ...common,
  entryPoints: [resolve(root, 'src/manifest.ts')],
  format: 'esm',
  platform: 'node',
  write: false,
  minify: false,
  sourcemap: false,
});
const { buildManifest } = await import(
  `data:text/javascript;base64,${Buffer.from(manifestModule.outputFiles[0].text).toString('base64')}`
);
await writeFile(
  resolve(out, 'manifest.json'),
  `${JSON.stringify(buildManifest({ version: pkg.version, dev }), null, 2)}\n`,
);

await cp(resolve(root, 'static'), out, { recursive: true });
for (const size of [16, 32, 48, 128])
  await writeFile(resolve(out, `icons/${size}.png`), drawIcon(size));
console.log(`built extension${dev ? ' (dev)' : ''} -> ${out}`);
