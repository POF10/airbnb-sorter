// Builds dist/airbnb-sorter.user.js (Tampermonkey) and dist/airbnb-sorter.inject.js (no-Tampermonkey runner).
// `node build.mjs --dev` serves the viewer dev stand on http://localhost:8000/ with rebuild on change.
import * as esbuild from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const header = (await readFile('src/header.txt', 'utf8')).replace('{{version}}', pkg.version);
const common = { bundle: true, format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none', loader: { '.css': 'text' } };

if (process.argv.includes('--dev')) {
  const ctx = await esbuild.context({ ...common, entryPoints: ['dev/dev.js'], outfile: 'dev/dev.bundle.js', sourcemap: 'inline', logLevel: 'info' });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dev', host: '127.0.0.1', port: 8000 });
  console.log(`dev stand: http://localhost:${port}/`);
} else {
  await mkdir('dist', { recursive: true });
  await esbuild.build({ ...common, entryPoints: ['src/userscript.js'], outfile: 'dist/airbnb-sorter.user.js', banner: { js: header } });
  await esbuild.build({ ...common, entryPoints: ['dev/inject.js'], outfile: 'dist/airbnb-sorter.inject.js' });
  console.log('built dist/airbnb-sorter.user.js and dist/airbnb-sorter.inject.js');
}
