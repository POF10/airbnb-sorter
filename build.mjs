// Builds dist/airbnb-sorter.user.js (Tampermonkey), dist/airbnb-sorter.inject.js (no-Tampermonkey runner),
// dist/extension/ (Chrome extension, load unpacked) and dist/airbnb-sorter-extension-<version>.zip.
// `node build.mjs --dev` serves the dev stand on http://localhost:8000/ with rebuild on change.
import * as esbuild from 'esbuild';
import { zipSync } from 'fflate';
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { buildManifest } from './src/extension/manifest.js';
import { hasPlaceholderSupportLinks } from './src/config.js';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const header = (await readFile('src/header.txt', 'utf8')).replace('{{version}}', pkg.version);
// .png is only imported by the dev stand (the welcome page shows the extension icon).
const common = { bundle: true, format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none', loader: { '.css': 'text', '.png': 'dataurl' } };

// Every file under dir, as paths relative to it with forward slashes.
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/').slice(dir.length + 1))
    .sort();
}

async function buildExtension() {
  const out = 'dist/extension';
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const script of ['content', 'popup', 'welcome', 'background']) {
    await esbuild.build({ ...common, entryPoints: [`src/extension/${script}.js`], outfile: `${out}/${script}.js` });
  }
  await writeFile(`${out}/manifest.json`, `${JSON.stringify(buildManifest({ version: pkg.version }), null, 2)}\n`);
  for (const file of ['popup.html', 'popup.css', 'welcome.html', 'welcome.css']) await cp(`src/extension/${file}`, `${out}/${file}`);
  for (const dir of ['icons', '_locales']) await cp(`src/extension/${dir}`, `${out}/${dir}`, { recursive: true });
  // Leaflet is bundled into content.js; its licence (BSD-2-Clause) asks for the notice to travel with the code.
  await cp('node_modules/leaflet/LICENSE', `${out}/LEAFLET-LICENSE.txt`);

  // The zip holds the contents of dist/extension/ at its root, as the Web Store expects.
  const files = {};
  for (const path of await listFiles(out)) files[path] = new Uint8Array(await readFile(`${out}/${path}`));
  for (const name of await readdir('dist')) {
    if (/^airbnb-sorter-extension-.*\.zip$/.test(name)) await rm(`dist/${name}`);
  }
  const zip = `dist/airbnb-sorter-extension-${pkg.version}.zip`;
  await writeFile(zip, zipSync(files, { level: 9 }));
  return zip;
}

if (process.argv.includes('--dev')) {
  const ctx = await esbuild.context({
    ...common,
    entryPoints: { 'dev.bundle': 'dev/dev.js', 'popup-dev.bundle': 'dev/popup-dev.js', 'welcome-dev.bundle': 'dev/welcome-dev.js' },
    outdir: 'dev',
    sourcemap: 'inline',
    logLevel: 'info',
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dev', host: '127.0.0.1', port: 8000 });
  console.log(`dev stand: http://localhost:${port}/ (overlay), /popup.html (extension popup), /welcome.html (welcome page)`);
} else {
  await mkdir('dist', { recursive: true });
  await esbuild.build({ ...common, entryPoints: ['src/userscript.js'], outfile: 'dist/airbnb-sorter.user.js', banner: { js: header } });
  await esbuild.build({ ...common, entryPoints: ['dev/inject.js'], outfile: 'dist/airbnb-sorter.inject.js' });
  const zip = await buildExtension();
  console.log(`built dist/airbnb-sorter.user.js, dist/airbnb-sorter.inject.js, dist/extension/ and ${zip}`);
  if (hasPlaceholderSupportLinks()) console.warn('WARNING: src/config.js still has placeholder support links (example.com) — replace them before publishing');
}
