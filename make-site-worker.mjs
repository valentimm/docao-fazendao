// Plano B de hospedagem (a Vercel recusou criar projeto pelo conector): Worker `docao-fazendao` servindo o dist/ embutido.
// Gera /tmp/deploy-site.js (código pro execute da Cloudflare). Uso: node build.mjs && node make-site-worker.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const js = readFileSync('dist/app.js', 'utf8'); const v = createHash('sha256').update(js).digest('hex').slice(0, 10);
const html = readFileSync('dist/index.html', 'utf8').replace('./app.js', './app.js?v=' + v);
const worker = `const HTML = ${JSON.stringify(html)};
const JS = ${JSON.stringify(js)};
export default { async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === '/app.js') return new Response(JS, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  if (u.pathname === '/health') return new Response('ok ${v}');
  return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
} };`;
const code = `async () => {
const script = ${JSON.stringify(worker)};
const metadata = { main_module: "index.js", compatibility_date: "2026-10-01" };
const form = new FormData();
form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
form.append("index.js", new Blob([script], { type: "application/javascript+module" }), "index.js");
const r = await cloudflare.request({ method: "PUT", path: \`/accounts/\${accountId}/workers/scripts/docao-fazendao\`, body: form });
let sub = null; try { sub = await cloudflare.request({ method: "POST", path: \`/accounts/\${accountId}/workers/scripts/docao-fazendao/subdomain\`, body: { enabled: true } }); } catch (e) { sub = String(e.message || e); }
return { ok: r.success, errors: r.errors, etag: r.result && r.result.etag, deployment: r.result && r.result.deployment_id, sub: sub && sub.success !== undefined ? sub.success : sub, v: "${v}" };
}`;
writeFileSync('/tmp/deploy-site.js', code); console.log('site', v, code.length);
