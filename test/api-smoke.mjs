// Fumaça da API (local ou produção): node test/api-smoke.mjs <BASE> <TOKEN_A> [TOKEN_B]
// Faz o caminho inteiro: estado → plantar → colher (espera 61 s) → coletar → construir → treinar → roubar bot → atacar bot (e PvP se houver TOKEN_B).
import { Battle, deployOk } from '../shared/sim.js';
const [BASE, TA, TB] = process.argv.slice(2);
const call = async (tok, path, body) => { const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); return { status: r.status, ...j }; };
const ok = (c, m) => { if (!c) { console.error('FALHOU:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fight(tok, kind) {
  const st = await call(tok, '/api/farm/attack/start', { kind }); ok(st.ok, `ataque ${kind} começou: ${st.error || st.attack.target.name + (st.attack.target.bot ? ' (bot)' : '')}`); if (!st.ok) return;
  const a = st.attack, bt = new Battle(a.base, a.army, a.seed), cmds = []; let i = 0;
  const spots = []; for (let y = 1000; y < 30000; y += 700) spots.push([500, y]);
  for (const u in a.army) for (let n = 0; n < a.army[u]; n++) { const [x, y] = spots[i++ % spots.length]; if (deployOk(a.base, x, y)) cmds.push({ t: Math.min(40, i), u, x, y }); }
  cmds.sort((p, q) => p.t - q.t); let k = 0;
  while (!bt.over) { const now = []; while (k < cmds.length && cmds[k].t === bt.tick) now.push(cmds[k++]); bt.step(now); if (k >= cmds.length && bt.alive() === 0) break; }
  const mine = bt.result();
  const fin = await call(tok, '/api/farm/attack/finish', { id: a.id, cmds, end: bt.tick, hash: mine.hash });
  ok(fin.ok && fin.result.match, `servidor revalidou: ${fin.error || `${fin.result.pct}% · ${fin.result.stars}★ · saque ${JSON.stringify(fin.result.loot)} · medalhas ${fin.result.trophies} · hash ${fin.result.hash}=${mine.hash}`}`);
  const again = await call(tok, '/api/farm/attack/finish', { id: a.id, cmds, end: bt.tick });
  ok(!again.ok, 'finalizar 2x é recusado');
  return fin;
}

const me = await call(TA, '/api/farm/me'); ok(me.ok, `me: ${me.me && me.me.nick} · celeiro ${me.state && me.state.buildings.find((b) => b.type === 'celeiro').lvl}`);
const bad = await call('x'.repeat(30), '/api/farm/me'); ok(bad.status === 401, 'token inválido = 401');
const plots = me.state.buildings.filter((b) => b.type === 'canteiro');
const free = plots.find((b) => !b.crop); let plotId = free && free.id;
if (plotId) { const p = await call(TA, '/api/farm/act', { type: 'plant', id: plotId, crop: 'milho' }); ok(p.ok, 'plantar milho: ' + (p.msg || p.error)); }
else plotId = plots[0].id;
const early = await call(TA, '/api/farm/act', { type: 'harvest', id: plotId }); ok(!early.ok || early.msg, 'colher antes da hora: ' + (early.error || early.msg));
const cheat = await call(TA, '/api/farm/act', { type: 'collect', id: 9999 }); ok(!cheat.ok, 'coletar prédio que não existe é recusado');
const ser = me.state.buildings.find((b) => b.type === 'serraria'); const c = await call(TA, '/api/farm/act', { type: 'collect', id: ser.id }); ok(c.ok || /Nada/.test(c.error), 'coletar serraria: ' + (c.msg || c.error));
const tr = await call(TA, '/api/farm/act', { type: 'train', unit: 'leitao', n: 2 }); ok(tr.ok || /lotado|ração/.test(tr.error), 'treinar 2 leitões: ' + (tr.msg || tr.error));
const nb = await call(TA, '/api/farm/neighbors'); ok(nb.ok && nb.bots.length === 3, `vizinhos: ${nb.bots.map((b) => b.nick).join(', ')} + ${nb.players.length} jogadores`);
const v = await call(TA, '/api/farm/visit?who=bot:0'); ok(v.ok, 'visitar ' + v.farm.nick);
const target = v.farm.buildings.find((b) => b.type === 'canteiro' && !b.mine);
if (target) { const s = await call(TA, '/api/farm/steal', { who: 'bot:0', plot: target.id }); ok(s.ok, 'roubar bot: ' + (s.msg || s.error)); const s2 = await call(TA, '/api/farm/steal', { who: 'bot:0', plot: target.id }); ok(!s2.ok, 'roubar o mesmo canteiro 2x: ' + s2.error); }
await fight(TA, 'bot');
if (TB) {
  const mb = await call(TB, '/api/farm/me'); const pb = mb.state.buildings.find((b) => b.type === 'canteiro' && !b.crop);
  if (pb) ok((await call(TB, '/api/farm/act', { type: 'plant', id: pb.id, crop: 'milho' })).ok, 'B plantou milho');
}
console.log('esperando 61 s pro milho...'); await sleep(61000);
const h = await call(TA, '/api/farm/act', { type: 'harvest', id: plotId }); ok(h.ok, 'colher milho: ' + (h.msg || h.error));
if (TB) {
  const nb2 = await call(TA, '/api/farm/neighbors'); const pl = nb2.players.find((p) => p.ready > 0);
  if (pl) { const vv = await call(TA, '/api/farm/visit?who=' + pl.who); const pt = vv.farm.buildings.find((b) => b.type === 'canteiro' && b.crop && b.readyAt <= vv.now && !b.mine);
    const s = await call(TA, '/api/farm/steal', { who: pl.who, plot: pt.id }); ok(s.ok, `roubar ${pl.nick}: ${s.msg || s.error}`);
    const w = await call(TB, '/api/farm/wall'); ok(w.ok && w.wall.length > 0, `mural de B: ${JSON.stringify(w.wall[0])}`); }
  else ok(false, 'nenhum jogador com canteiro pronto');
  const f = await fight(TA, 'pvp'); if (f && f.ok) { const w = await call(TB, '/api/farm/wall'); ok(w.wall.some((x) => x.kind === 'attack'), 'mural de B mostra o ataque'); }
}
const rk = await call(TA, '/api/farm/rank'); ok(rk.ok, 'ranking: ' + rk.rows.map((r) => `${r.nick} ${r.trophies}`).join(' · '));
