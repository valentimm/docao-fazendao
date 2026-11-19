// Guildas: roda o Worker de verdade contra um D1 local (node:sqlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeD1 } from './d1shim.mjs';
import worker from '../server/src/index.js';
import { GUILD } from '../shared/rules.js';

const DB = makeD1(); const env = { DB, STEAL_SECRET: 't' };
DB.raw.exec(`CREATE TABLE accounts (id INTEGER PRIMARY KEY, nick TEXT, coins INTEGER DEFAULT 0); CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER, expires_at INTEGER);`);
for (const f of ['0001_fazenda.sql', '0002_guildas.sql']) DB.raw.exec(readFileSync(new URL('../server/migrations/' + f, import.meta.url), 'utf8'));
const tok = (i) => `tokentokentokentoken${i}`;
const NICKS = ['ana', 'beto', 'caio', 'duda', 'enzo'];
NICKS.forEach((n, i) => { DB.raw.prepare('INSERT INTO accounts (id, nick) VALUES (?, ?)').run(i + 1, n); DB.raw.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(tok(i + 1)).digest('hex'), i + 1, 9e9); });
const call = async (id, path, body) => { const r = await worker.fetch(new Request('https://x' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tok(id), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env); return { status: r.status, ...(await r.json()) }; };
const [A, B, C, D, E] = [1, 2, 3, 4, 5];
const edit = (id, fn) => { const r = DB.raw.prepare('SELECT state FROM farm_players WHERE account_id = ?').get(id); const s = JSON.parse(r.state); fn(s); DB.raw.prepare('UPDATE farm_players SET state = ?, trophies = ?, shield_until = 0, lock_until = 0 WHERE account_id = ?').run(JSON.stringify(s), s.trophies | 0, id); };
let code = '', gid = 0;

test('fundar guilda: nome, brasão, custo, nome único', async () => {
  for (const i of [A, B, C, D, E]) await call(i, '/api/farm/me');
  edit(A, (s) => { s.res.planks = 1000; s.res.grains = 500; });
  assert.equal((await call(A, '/api/farm/guild/create', { name: 'x', emblem: '🐷', color: GUILD.colors[0] })).ok, undefined);
  const r = await call(A, '/api/farm/guild/create', { name: 'Os Porcões', emblem: '🐷', color: GUILD.colors[0] }); assert.ok(r.ok, r.error);
  assert.equal(r.state.res.planks, 1000 - GUILD.cost.planks); assert.equal(r.state.res.grains, 500 - GUILD.cost.grains);
  edit(E, (s) => { s.res.planks = 1000; s.res.grains = 500; });
  const dup = await call(E, '/api/farm/guild/create', { name: 'os porcoes', emblem: '🐗', color: GUILD.colors[1] }); assert.equal(dup.status, 409);
  edit(B, (s) => { s.res.planks = 10; });
  const poor = await call(B, '/api/farm/guild/create', { name: 'Sem Grana', emblem: '🐗', color: GUILD.colors[1] }); assert.match(poor.error, /custa/);
  const info = await call(A, '/api/farm/guild'); code = info.guild.code; gid = info.guild.id; assert.equal(info.guild.members.length, 1); assert.ok(info.guild.iAmLeader);
});

test('teto de 3 membros: o 4º é recusado (código e pedido)', async () => {
  assert.ok((await call(B, '/api/farm/guild/join', { code })).ok);
  const rq = await call(C, '/api/farm/guild/request', { id: gid }); assert.ok(rq.ok, rq.error);
  assert.equal((await call(B, '/api/farm/guild/accept', { account: C })).status, 403, 'só líder aceita');
  assert.ok((await call(A, '/api/farm/guild/accept', { account: C })).ok);
  const d = await call(D, '/api/farm/guild/join', { code }); assert.equal(d.ok, undefined); assert.equal(d.status, 409); assert.match(d.error, /cheia/);
  assert.equal((await call(D, '/api/farm/guild/request', { id: gid })).status, 409);
  const n = DB.raw.prepare('SELECT COUNT(*) AS n FROM farm_guild_members WHERE guild_id = ?').get(gid).n; assert.equal(n, 3);
  assert.equal((await call(A, '/api/farm/guild')).guild.members.length, 3);
});

test('uma guilda por jogador', async () => {
  edit(B, (s) => { s.res.planks = 1000; s.res.grains = 500; });
  assert.match((await call(B, '/api/farm/guild/create', { name: 'Outra', emblem: '🐗', color: GUILD.colors[1] })).error, /já está/);
  assert.ok((await call(E, '/api/farm/guild/create', { name: 'Galinheiro', emblem: '🐔', color: GUILD.colors[2] })).ok);
  const ecode = (await call(E, '/api/farm/guild')).guild.code;
  assert.match((await call(B, '/api/farm/guild/join', { code: ecode })).error, /já está/);
  assert.match((await call(A, '/api/farm/guild/join', { code: ecode })).error, /já está/);
});

test('colega de guilda: visita sim, roubo e ataque não', async () => {
  edit(B, (s) => { const c = s.buildings.find((b) => b.type === 'canteiro'); c.crop = 'milho'; c.plantedAt = Date.now() - 120e3; c.readyAt = Date.now() - 60e3; c.stolenPct = 0; s.trophies = 0; });
  const v = await call(A, '/api/farm/visit?who=p:' + B); assert.ok(v.ok); assert.equal(v.farm.guild, true);
  const plot = v.farm.buildings.find((b) => b.crop);
  assert.match((await call(A, '/api/farm/steal', { who: 'p:' + B, plot: plot.id })).error, /guilda/);
  const nb = await call(A, '/api/farm/neighbors'); const bn = nb.players.find((p) => p.who === 'p:' + B); assert.equal(bn.guild, true); assert.equal(bn.ready, 0);
  // única fazenda de jogador possível no alcance de medalhas é a do Beto (D e E fora do alcance, C também colega)
  edit(D, (s) => { s.trophies = 5000; }); edit(E, (s) => { s.trophies = 5000; }); edit(C, (s) => { s.trophies = 0; });
  for (let i = 0; i < 3; i++) { edit(A, (s) => { s.res.ration = 500; s.army.leitao = 6; s.day.finds = 0; }); const r = await call(A, '/api/farm/attack/start', { kind: 'pvp' }); assert.ok(r.ok, r.error); assert.equal(r.attack.target.bot, true, 'caiu no bot, não no colega'); }
  // fora da guilda, o Beto vira alvo de novo (ataque e roubo)
  assert.ok((await call(B, '/api/farm/guild/leave', {})).ok);
  edit(A, (s) => { s.res.ration = 500; s.army.leitao = 6; s.day.finds = 0; }); edit(C, (s) => { s.trophies = 5000; });
  const r = await call(A, '/api/farm/attack/start', { kind: 'pvp' }); assert.equal(r.attack.target.bot, false); assert.equal(r.attack.target.name, 'beto');
  DB.raw.exec('UPDATE farm_players SET lock_until = 0');
  const st = await call(A, '/api/farm/steal', { who: 'p:' + B, plot: plot.id }); assert.ok(st.ok, st.error);
});

test('sair, expulsar, passar liderança, guilda acaba com o último', async () => {
  let info = await call(A, '/api/farm/guild'); assert.equal(info.guild.members.length, 2); assert.ok(info.chat.some((c) => /beto saiu/.test(c.text)));
  assert.ok((await call(D, '/api/farm/guild/join', { code })).ok, 'vaga liberada');
  assert.equal((await call(C, '/api/farm/guild/kick', { account: D })).status, 403, 'só líder expulsa');
  assert.ok((await call(A, '/api/farm/guild/kick', { account: D })).ok);
  assert.equal((await call(D, '/api/farm/guild')).guild, null);
  assert.ok((await call(A, '/api/farm/guild/leader', { account: C })).ok);
  assert.equal((await call(A, '/api/farm/guild/kick', { account: C })).status, 403);
  assert.ok((await call(C, '/api/farm/guild')).guild.iAmLeader);
  assert.ok((await call(C, '/api/farm/guild/leave', {})).ok);
  info = await call(A, '/api/farm/guild'); assert.ok(info.guild.iAmLeader, 'liderança passa pra quem sobrou'); assert.equal(info.guild.members.length, 1);
  assert.ok((await call(A, '/api/farm/guild/leave', {})).ok);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM farm_guilds WHERE id = ?').get(gid).n, 0);
  assert.equal((await call(A, '/api/farm/guild/join', { code })).status, 404);
});

test('chat, ranking por soma de medalhas e doação de tropa', async () => {
  const e = await call(E, '/api/farm/guild'); assert.ok((await call(B, '/api/farm/guild/join', { code: e.guild.code })).ok);
  const m = await call(B, '/api/farm/guild/chat', { text: '  oi   galera <b>  ' }); assert.ok(m.ok);
  assert.equal((await call(B, '/api/farm/guild/chat', { text: 'spam' })).status, 429);
  const c = await call(E, '/api/farm/guild'); const last = c.chat[c.chat.length - 1]; assert.equal(last.text, 'oi galera <b>'); assert.equal(last.nick, 'beto');
  assert.equal((await call(E, '/api/farm/guild?after=' + last.id)).chat.length, 0, 'polling incremental');
  edit(B, (s) => { s.trophies = 40; }); edit(E, (s) => { s.trophies = 5000; s.army.leitao = 0; });
  const rk = await call(A, '/api/farm/guild/rank'); assert.equal(rk.rows[0].name, 'Galinheiro'); assert.equal(rk.rows[0].trophies, 5040);
  edit(B, (s) => { s.army.leitao = 6; s.day.donated = 0; });
  const d = await call(B, '/api/farm/guild/donate', { to: E, unit: 'leitao', n: 3 }); assert.ok(d.ok, d.error); assert.equal(d.state.army.leitao, 3);
  assert.equal(JSON.parse(DB.raw.prepare('SELECT state FROM farm_players WHERE account_id = ?').get(E).state).army.leitao, 3);
  assert.match((await call(B, '/api/farm/guild/donate', { to: A, unit: 'leitao', n: 1 })).error, /colega/);
});
