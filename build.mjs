// Gera dist/ (2 arquivos): index.html com o CSS embutido + app.js (three.js + jogo num bundle só). Usado no deploy estático.
// Uso: node build.mjs   (precisa do esbuild: npx esbuild ou o do wrangler)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const esbuild = process.env.ESBUILD || 'esbuild';
mkdirSync('dist', { recursive: true });
execFileSync(esbuild, ['src/main.js', '--bundle', '--format=esm', '--minify', '--target=es2020', '--alias:three=./vendor/three.module.js', '--outfile=dist/app.js', '--log-level=warning'], { stdio: 'inherit' });
let html = readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="./style.css">', `<style>${readFileSync('style.css', 'utf8')}</style>`)
  .replace(/<script type="importmap">.*?<\/script>\n/, '')
  .replace('<script type="module" src="./src/main.js"></script>', '<script type="module" src="./app.js"></script>');
writeFileSync('dist/index.html', html);
console.log('dist/index.html', html.length, 'dist/app.js', readFileSync('dist/app.js').length);
