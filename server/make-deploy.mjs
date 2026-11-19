// Gera /tmp/deploy-fazenda.js (código pro execute da Cloudflare) a partir do bundle do `wrangler deploy --dry-run --outdir dist`.
import { readFileSync, writeFileSync } from 'node:fs';
const script = readFileSync(new URL('./dist/index.js', import.meta.url), 'utf8');
const metadata = { main_module: 'index.js', compatibility_date: '2026-10-01', bindings: [{ type: 'd1', name: 'DB', id: '992d49c8-9c5f-48e9-80d0-d79c595ae896' }], observability: { enabled: true } };
const code = `async () => {
const script = ${JSON.stringify(script)};
const metadata = ${JSON.stringify(metadata)};
const form = new FormData();
form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
form.append("index.js", new Blob([script], { type: "application/javascript+module" }), "index.js");
const r = await cloudflare.request({ method: "PUT", path: \`/accounts/\${accountId}/workers/scripts/docao-fazenda-api\`, body: form });
let sub = null; try { sub = await cloudflare.request({ method: "POST", path: \`/accounts/\${accountId}/workers/scripts/docao-fazenda-api/subdomain\`, body: { enabled: true } }); } catch (e) { sub = String(e.message || e); }
return { ok: r.success, errors: r.errors, id: r.result && r.result.id, etag: r.result && r.result.etag, modified: r.result && r.result.modified_on, deployment: r.result && r.result.deployment_id, sub: sub && sub.success !== undefined ? sub.success : sub };
}`;
writeFileSync(process.argv[2] || '/tmp/deploy-fazenda.js', code); console.log('ok', script.length, 'bytes');
