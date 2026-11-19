// Docão Fazendão — Worker docao-fazenda-api. REST + D1, sem Durable Objects e sem websocket.
// Login: o MESMO do Docão Shooter. O cliente entra pelo Worker do Shooter (/api/auth/login) e manda o token aqui;
// este Worker só LÊ sessions/accounts (nunca escreve nelas) e guarda a fazenda nas tabelas farm_*.
// Tudo é calculado na hora a partir de timestamps (settle). O cliente só manda intenções; o servidor decide o resto.
import { newFarm, settle, act, rateOk, steal, readyPlots, baseSnapshot, lootable, lootFor, trophyDelta, celeiroLvl, addRes, hash32, dayKey } from '../../shared/economy.js';
import { ATTACK, RES, UNITS } from '../../shared/rules.js';
import { validateCmds, runBattle } from '../../shared/sim.js';
import { botBase, botLoot, botTrophies, botFarm, BOT_NAMES, BOT_NEIGHBORS } from '../../shared/bots.js';

const VERSION = 'v1.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256hex = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rnd32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const rtok = () => hex(crypto.getRandomValues(new Uint8Array(8)));

async function readJson(req, max = 16384) {
  const len = parseInt(req.headers.get('Content-Length') || '0'); if (len > max) return null;
  try { const t = await req.text(); if (t.length > max) return null; const o = JSON.parse(t || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
}

// ---------- sessão compartilhada com o Shooter (só leitura) ----------
async function account(env, req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,64})$/.exec(req.headers.get('Authorization') || ''); if (!m) return null;
  return env.DB.prepare('SELECT a.id, a.nick, a.coins FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256hex(m[1]), Math.floor(Date.now() / 1000)).first();
}

// ---------- fazenda ----------
async function loadRow(env, id) { return env.DB.prepare('SELECT account_id, nick, state, version, trophies, shield_until, lock_until FROM farm_players WHERE account_id = ?').bind(id).first(); }
async function ensureRow(env, acct, now) {
  let row = await loadRow(env, acct.id); if (row) return row;
  const s = newFarm(now);
  await env.DB.prepare('INSERT OR IGNORE INTO farm_players (account_id, nick, state, version, level, trophies, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 0, ?, ?)').bind(acct.id, acct.nick, JSON.stringify(s), now, now).run();
  return loadRow(env, acct.id);
}
const saveStmt = (env, id, nick, s, version, tok, now) => env.DB.prepare('UPDATE farm_players SET state = ?, nick = ?, version = version + 1, wtok = ?, level = ?, trophies = ?, shield_until = ?, updated_at = ? WHERE account_id = ? AND version = ?')
  .bind(JSON.stringify(s), nick, tok, celeiroLvl(s), s.trophies | 0, s.shieldUntil | 0, now, id, version);
// lê → settle → fn(s) → grava com lock otimista (até 3 tentativas se outra aba escreveu no meio)
async function withFarm(env, acct, fn) {
  for (let i = 0; i < 3; i++) {
    const now = Date.now(); const row = await ensureRow(env, acct, now); const s = settle(JSON.parse(row.state), now);
    if (!rateOk(s, now)) return { ok: false, status: 429, error: 'Calma, fazendeiro! Muitas ações nesta hora.' };
    const r = await fn(s, now, row); if (!r || !r.ok) return r || { ok: false, error: 'Erro' };
    const res = await saveStmt(env, acct.id, acct.nick, s, row.version, rtok(), now).run();
    if (res.meta.changes === 1) return { ...r, state: s, now };
  }
  return { ok: false, status: 409, error: 'A fazenda mudou em outra aba. Tenta de novo.' };
}
const view = (s, now) => ({ ...s, rl: undefined, day: { d: s.day.d, steals: s.day.steals, finds: s.day.finds } });
async function wall(env, owner, actor, kind, payload, now) {
  await env.DB.prepare('INSERT INTO farm_wall (owner, actor, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)').bind(owner, actor, kind, JSON.stringify(payload), now).run();
}
// visão pública (visita): sem recursos nem exército
const publicFarm = (s, now, me) => ({ level: celeiroLvl(s), buildings: s.buildings.map((b) => ({ id: b.id, type: b.type, lvl: b.lvl, x: b.x, y: b.y, busyUntil: b.busyUntil, crop: b.crop || null, readyAt: b.readyAt || 0, plantedAt: b.plantedAt || 0, stolenPct: b.stolenPct | 0, mine: !!(b.thieves || []).includes(me) })) });

async function neighbors(env, acct, now) {
  const day = dayKey(now), me = await ensureRow(env, acct, now), ms = settle(JSON.parse(me.state), now);
  const bots = []; for (let i = 0; i < BOT_NEIGHBORS; i++) { const f = botFarm(i, day); const ready = f.state.buildings.filter((b) => b.type === 'canteiro' && !ms.day.stolen[`${f.key}:${b.id}:${b.plantedAt}`]).length; bots.push({ who: f.key, nick: f.nick, level: f.level, ready, bot: true, sign: f.sign }); }
  const { results } = await env.DB.prepare('SELECT account_id, nick, state, trophies FROM farm_players WHERE account_id != ? ORDER BY updated_at DESC LIMIT 12').bind(acct.id).all();
  const players = (results || []).map((r) => { const s = settle(JSON.parse(r.state), now); const ready = s.buildings.filter((b) => b.type === 'canteiro' && b.crop && now >= b.readyAt && (b.stolenPct | 0) + 10 <= 30 && !(b.thieves || []).includes(acct.id)).length; return { who: 'p:' + r.account_id, nick: r.nick, level: celeiroLvl(s), trophies: r.trophies, ready }; });
  return { players, bots, stealsLeft: Math.max(0, 20 - (ms.day.steals | 0)) };
}

async function visit(env, acct, who, now) {
  if (/^bot:\d$/.test(who)) { const i = +who.slice(4); if (i >= BOT_NEIGHBORS) return null; const f = botFarm(i, dayKey(now));
    const me = await ensureRow(env, acct, now), ms = settle(JSON.parse(me.state), now);
    const pub = publicFarm(f.state, now, acct.id); for (const b of pub.buildings) if (b.type === 'canteiro') b.mine = !!ms.day.stolen[`${f.key}:${b.id}:${b.plantedAt}`];
    return { who, nick: f.nick, sign: f.sign, bot: true, ...pub }; }
  const m = /^p:(\d+)$/.exec(who); if (!m || +m[1] === acct.id) return null;
  const row = await loadRow(env, +m[1]); if (!row) return null;
  return { who, nick: row.nick, trophies: row.trophies, ...publicFarm(settle(JSON.parse(row.state), now), now, acct.id) };
}

async function doSteal(env, acct, who, plot) {
  if (/^bot:\d$/.test(who)) {
    const i = +who.slice(4); if (i >= BOT_NEIGHBORS) return { ok: false, error: 'Vizinho não encontrado' };
    return withFarm(env, acct, (s, now) => { const f = botFarm(i, dayKey(now)); return steal(f.state, s, plot, acct.id, f.key, now, env.STEAL_SECRET || 'fz'); });
  }
  const m = /^p:(\d+)$/.exec(who); const oid = m ? +m[1] : 0; if (!oid || oid === acct.id) return { ok: false, error: 'Vizinho não encontrado' };
  for (let i = 0; i < 3; i++) {
    const now = Date.now(); const meRow = await ensureRow(env, acct, now), oRow = await loadRow(env, oid); if (!oRow) return { ok: false, error: 'Vizinho não encontrado' };
    const s = settle(JSON.parse(meRow.state), now), o = settle(JSON.parse(oRow.state), now);
    if (!rateOk(s, now)) return { ok: false, status: 429, error: 'Calma, fazendeiro! Muitas ações nesta hora.' };
    const r = steal(o, s, plot, acct.id, 'p' + oid, now, env.STEAL_SECRET || 'fz'); if (!r.ok) return r;
    // escrita dupla atômica: o 2º UPDATE só vale se o 1º gravou o token desta tentativa
    const tok = rtok();
    const [a, b] = await env.DB.batch([
      saveStmt(env, oid, oRow.nick, o, oRow.version, tok, now),
      env.DB.prepare('UPDATE farm_players SET state = ?, nick = ?, version = version + 1, wtok = ?, updated_at = ? WHERE account_id = ? AND version = ? AND (SELECT wtok FROM farm_players WHERE account_id = ?) = ?')
        .bind(JSON.stringify(s), acct.nick, rtok(), now, acct.id, meRow.version, oid, tok),
    ]);
    if (a.meta.changes === 1 && b.meta.changes === 1) {
      await wall(env, oid, acct.nick, r.bitten ? 'bite' : 'steal', { crop: r.crop, amount: r.amount }, now);
      return { ...r, state: s, now };
    }
    if (a.meta.changes === 1) { // dono gravou e ladrão não: desfaz o roubo no dono (raro: outra aba do ladrão)
      await saveStmt(env, oid, oRow.nick, settle(JSON.parse(oRow.state), now), oRow.version + 1, rtok(), now).run();
    }
  }
  return { ok: false, status: 409, error: 'A fazenda mudou no meio do roubo. Tenta de novo.' };
}

// ---------- ataque ----------
async function attackStart(env, acct, kind) {
  let attack = null;
  const r = await withFarm(env, acct, async (s, now) => {
    let n = 0; for (const u in s.army) n += s.army[u] | 0; if (!n) return { ok: false, error: 'Você não tem tropa. Treine no Chiqueiro-Quartel.' };
    if ((s.day.finds | 0) >= ATTACK.perDay) return { ok: false, error: 'Chega de ataque por hoje, general.' };
    if ((s.res.ration | 0) < ATTACK.cost) return { ok: false, error: `Buscar alvo custa ${ATTACK.cost} de ração` };
    s.res.ration -= ATTACK.cost; s.day.finds = (s.day.finds | 0) + 1; s.shieldUntil = 0; // atacar tira o seu escudo
    await env.DB.prepare("UPDATE farm_attacks SET status = 'abandoned' WHERE attacker = ? AND status = 'open'").bind(acct.id).run();
    let target = null;
    if (kind === 'pvp') {
      const lo = (s.trophies | 0) - 300, hi = (s.trophies | 0) + 300;
      const { results } = await env.DB.prepare(`SELECT account_id, nick, state, trophies FROM farm_players WHERE account_id != ?1 AND shield_until < ?2 AND lock_until < ?2 AND trophies BETWEEN ?3 AND ?4
        AND account_id NOT IN (SELECT defender FROM farm_attacks WHERE attacker = ?1 AND status = 'done' AND created_at > ?5) ORDER BY updated_at DESC LIMIT 15`).bind(acct.id, now, lo, hi, now - 24 * 3600e3).all();
      const list = results || [];
      for (let k = 0; k < list.length && !target; k++) {
        const c = list[(rnd32() + k) % list.length];
        const lk = await env.DB.prepare('UPDATE farm_players SET lock_until = ? WHERE account_id = ? AND lock_until < ? AND shield_until < ?').bind(now + ATTACK.lock, c.account_id, now, now).run();
        if (lk.meta.changes !== 1) continue;
        const ds = settle(JSON.parse(c.state), now);
        target = { defender: c.account_id, name: c.nick, base: baseSnapshot(ds), loot: lootable(ds), trophies: c.trophies | 0, level: celeiroLvl(ds), bot: false };
      }
    }
    if (!target) {
      const L = Math.max(1, Math.min(5, celeiroLvl(s) + (rnd32() % 3) - 1)), seed = rnd32();
      target = { defender: 0, name: BOT_NAMES[seed % BOT_NAMES.length], base: botBase(L, seed), loot: botLoot(L), trophies: botTrophies(L), level: L, bot: true, fallback: kind === 'pvp' };
    }
    const seed = rnd32() >>> 1, army = {}; for (const u in s.army) if (s.army[u] > 0) army[u] = s.army[u];
    const snap = { base: target.base, loot: target.loot, trophies: target.trophies, level: target.level, bot: target.bot, atk: s.trophies | 0 };
    const ins = await env.DB.prepare('INSERT INTO farm_attacks (attacker, defender, target, seed, snapshot, army, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, \'open\', ?, ?)')
      .bind(acct.id, target.defender, target.name, seed, JSON.stringify(snap), JSON.stringify(army), now, now + ATTACK.ttl).run();
    attack = { id: ins.meta.last_row_id, seed, army, target: { name: target.name, level: target.level, trophies: target.trophies, bot: target.bot, fallback: !!target.fallback }, base: target.base, loot: target.loot, expiresAt: now + ATTACK.ttl };
    return { ok: true };
  });
  return r && r.ok ? { ...r, attack } : r;
}

async function attackFinish(env, acct, b) {
  const id = b.id | 0, cmds = Array.isArray(b.cmds) ? b.cmds : null, end = b.end;
  const row = await env.DB.prepare('SELECT * FROM farm_attacks WHERE id = ? AND attacker = ?').bind(id, acct.id).first();
  if (!row) return { ok: false, error: 'Ataque não encontrado' };
  if (row.status !== 'open') return { ok: false, error: 'Esse ataque já foi encerrado' };
  const now = Date.now(); if (now > row.expires_at) { await env.DB.prepare("UPDATE farm_attacks SET status = 'abandoned' WHERE id = ?").bind(id).run(); return { ok: false, error: 'O ataque expirou (5 min)' }; }
  const snap = JSON.parse(row.snapshot), army = JSON.parse(row.army);
  const clean = cmds ? cmds.map((c) => ({ t: c && c.t, u: c && c.u, x: c && c.x, y: c && c.y })) : null;
  const err = validateCmds(snap.base, army, clean, end); if (err) return { ok: false, error: err };
  const res = runBattle(snap.base, army, row.seed, clean, end); // resultado do cliente é ignorado: o servidor resimula do zero
  // exatamente uma vez: só quem virar open → resolving segue
  const claim = await env.DB.prepare("UPDATE farm_attacks SET status = 'resolving', cmds = ? WHERE id = ? AND status = 'open'").bind(JSON.stringify(clean), id).run();
  if (claim.meta.changes !== 1) return { ok: false, error: 'Esse ataque já foi encerrado' };
  let loot = lootFor(snap.loot, res.pct);
  if (row.defender) { // defensor de verdade: tira dele primeiro (o que ele ainda tiver), dá escudo e solta a trava
    for (let i = 0; i < 3; i++) {
      const dRow = await loadRow(env, row.defender); if (!dRow) { loot = { grains: 0, ration: 0, planks: 0 }; break; }
      const t = Date.now(), d = settle(JSON.parse(dRow.state), t), took = {};
      for (const r of RES) { took[r] = Math.min(loot[r], d.res[r] | 0); d.res[r] -= took[r]; }
      d.trophies = Math.max(0, (d.trophies | 0) + (res.stars ? -Math.floor(trophyDelta(res.stars, snap.atk | 0, snap.trophies) / 2) : 3)); // defendeu: +3
      if (res.stars) d.shieldUntil = t + ATTACK.shieldH[res.stars] * 3600e3;
      const u = await env.DB.prepare('UPDATE farm_players SET state = ?, version = version + 1, wtok = ?, trophies = ?, shield_until = ?, lock_until = 0, updated_at = updated_at WHERE account_id = ? AND version = ?')
        .bind(JSON.stringify(d), rtok(), d.trophies | 0, d.shieldUntil | 0, row.defender, dRow.version).run();
      if (u.meta.changes === 1) { loot = took; break; }
    }
  }
  let dT = 0;
  const r = await withFarm(env, acct, (s, t) => {
    for (const u in res.used) s.army[u] = Math.max(0, (s.army[u] | 0) - res.used[u]); // tropa lançada não volta
    const got = {}; for (const k of RES) got[k] = addRes(s, k, loot[k]).got; loot = got;
    dT = trophyDelta(res.stars, s.trophies, snap.trophies); s.trophies = Math.max(0, (s.trophies | 0) + dT);
    s.stats.attacks++; if (res.stars) s.stats.wins++; s.stats.stars += res.stars;
    return { ok: true };
  });
  if (!r || !r.ok) { await env.DB.prepare("UPDATE farm_attacks SET status = 'open' WHERE id = ?").bind(id).run(); return r; }
  const result = { ...res, loot, trophies: dT, clientHash: typeof b.hash === 'string' ? b.hash.slice(0, 16) : null, match: b.hash === res.hash };
  await env.DB.prepare("UPDATE farm_attacks SET status = 'done', result = ? WHERE id = ?").bind(JSON.stringify(result), id).run();
  if (row.defender) await wall(env, row.defender, acct.nick, 'attack', { stars: res.stars, pct: res.pct, loot }, now);
  return { ...r, result };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname, m = req.method;
    if (m === 'OPTIONS') return new Response(null, { headers: cors });
    if (p === '/' || p === '/api/health') return json({ ok: true, name: 'docao-fazenda-api', version: VERSION, db: !!env.DB, time: Date.now() });
    if (!p.startsWith('/api/farm/')) return json({ error: 'Não encontrado' }, 404);
    if (!env.DB) return json({ error: 'Banco indisponível' }, 503);
    try {
      const acct = await account(env, req); if (!acct) return json({ error: 'Sessão inválida. Entre de novo.' }, 401);
      const me = { nick: acct.nick, coins: acct.coins | 0 };
      const out = (r) => r && r.ok ? json({ ...r, ok: true, state: r.state ? view(r.state) : undefined, me }) : json({ error: (r && r.error) || 'Erro' }, (r && r.status) || 400);
      if (p === '/api/farm/me' && m === 'GET') {
        const now = Date.now(); const row = await ensureRow(env, acct, now); const s = settle(JSON.parse(row.state), now);
        const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM farm_wall WHERE owner = ? AND created_at > ?').bind(acct.id, now - 24 * 3600e3).all();
        return json({ ok: true, me, state: view(s), now, wall24h: results && results[0] ? results[0].n : 0, version: VERSION });
      }
      if (p === '/api/farm/act' && m === 'POST') {
        const b = await readJson(req, 2048); if (!b) return json({ error: 'Pedido inválido' }, 400);
        const a = { type: String(b.type || ''), id: b.id | 0, crop: String(b.crop || ''), building: String(b.building || ''), x: b.x, y: b.y, unit: String(b.unit || ''), n: b.n | 0 };
        return out(await withFarm(env, acct, (s, now) => act(s, a, now)));
      }
      if (p === '/api/farm/neighbors' && m === 'GET') return json({ ok: true, ...(await neighbors(env, acct, Date.now())) });
      if (p === '/api/farm/visit' && m === 'GET') { const v = await visit(env, acct, String(url.searchParams.get('who') || ''), Date.now()); return v ? json({ ok: true, farm: v, now: Date.now() }) : json({ error: 'Vizinho não encontrado' }, 404); }
      if (p === '/api/farm/steal' && m === 'POST') { const b = await readJson(req, 512); if (!b) return json({ error: 'Pedido inválido' }, 400); return out(await doSteal(env, acct, String(b.who || ''), b.plot | 0)); }
      if (p === '/api/farm/attack/start' && m === 'POST') { const b = await readJson(req, 512); if (!b) return json({ error: 'Pedido inválido' }, 400); return out(await attackStart(env, acct, b.kind === 'pvp' ? 'pvp' : 'bot')); }
      if (p === '/api/farm/attack/finish' && m === 'POST') { const b = await readJson(req, 16384); if (!b) return json({ error: 'Pedido inválido' }, 400); return out(await attackFinish(env, acct, b)); }
      if (p === '/api/farm/wall' && m === 'GET') {
        const { results } = await env.DB.prepare('SELECT actor, kind, payload, created_at FROM farm_wall WHERE owner = ? ORDER BY created_at DESC LIMIT 30').bind(acct.id).all();
        return json({ ok: true, wall: (results || []).map((r) => ({ actor: r.actor, kind: r.kind, at: r.created_at, ...JSON.parse(r.payload) })) });
      }
      if (p === '/api/farm/attacks' && m === 'GET') {
        const { results } = await env.DB.prepare("SELECT id, target, result, created_at FROM farm_attacks WHERE attacker = ? AND status = 'done' ORDER BY created_at DESC LIMIT 10").bind(acct.id).all();
        return json({ ok: true, attacks: (results || []).map((r) => ({ id: r.id, target: r.target, at: r.created_at, ...JSON.parse(r.result || '{}') })) });
      }
      if (p === '/api/farm/rank' && m === 'GET') {
        const { results } = await env.DB.prepare('SELECT nick, trophies, level FROM farm_players ORDER BY trophies DESC, updated_at DESC LIMIT 20').all();
        return json({ ok: true, rows: results || [] });
      }
      return json({ error: 'Não encontrado' }, 404);
    } catch (e) {
      console.error('fazenda', e && e.stack || e);
      return json({ error: 'Algo deu errado. Tente de novo.' }, 500);
    }
  },
};
