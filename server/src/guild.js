// Guildas do Docão Fazendão: até 3 membros, uma guilda por jogador, chat por polling (REST). Sem Durable Objects.
// Regras no servidor: o teto de 3 é garantido num INSERT ... SELECT ... WHERE COUNT < 3 (uma instrução = atômica no D1),
// e "uma guilda por jogador" é a PRIMARY KEY de farm_guild_members.
import { GUILD, guildKey, guildNameErr, UNITS } from '../../shared/rules.js';
import { settle, rateOk, housing, armySpace, addRes, dayKey } from '../../shared/economy.js';

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { const r = crypto.getRandomValues(new Uint8Array(6)); return [...r].map((x) => CODE_ABC[x % CODE_ABC.length]).join(''); };
const fail = (error, status = 400) => ({ ok: false, error, status });

export async function guildOf(env, id) {
  return env.DB.prepare('SELECT g.* FROM farm_guild_members m JOIN farm_guilds g ON g.id = m.guild_id WHERE m.account_id = ?').bind(id).first();
}
// account_ids dos colegas de guilda (sem eu)
export async function guildmates(env, id) {
  const { results } = await env.DB.prepare('SELECT account_id FROM farm_guild_members WHERE guild_id = (SELECT guild_id FROM farm_guild_members WHERE account_id = ?1) AND account_id != ?1').bind(id).all();
  return new Set((results || []).map((r) => r.account_id));
}
// SQL pra excluir colegas de guilda da busca de alvo (?1 = eu)
export const NOT_GUILDMATE_SQL = 'account_id NOT IN (SELECT account_id FROM farm_guild_members WHERE guild_id = (SELECT guild_id FROM farm_guild_members WHERE account_id = ?1))';

const sys = (env, gid, text, now) => env.DB.prepare("INSERT INTO farm_guild_chat (guild_id, account_id, nick, kind, text, created_at) VALUES (?, 0, '', 'sys', ?, ?)").bind(gid, text, now);
// entra com teto duro: só insere se a guilda existe e tem < max membros; PK impede estar em duas
const capInsert = (env, acct, gid, now) => env.DB.prepare(`INSERT OR IGNORE INTO farm_guild_members (account_id, guild_id, joined_at)
  SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM farm_guilds WHERE id = ?2) AND (SELECT COUNT(*) FROM farm_guild_members WHERE guild_id = ?2) < ?4`).bind(acct, gid, now, GUILD.max);
const count = async (env, gid) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM farm_guild_members WHERE guild_id = ?').bind(gid).first()).n;
async function whyNotJoin(env, acct, gid) {
  if (await guildOf(env, acct)) return fail('Você já está numa guilda. Saia dela antes.');
  if (!(await env.DB.prepare('SELECT 1 AS x FROM farm_guilds WHERE id = ?').bind(gid).first())) return fail('Essa guilda não existe mais', 404);
  return fail(`Guilda cheia (máximo ${GUILD.max})`, 409);
}
async function joined(env, acct, gid, now) {
  await env.DB.batch([env.DB.prepare('DELETE FROM farm_guild_requests WHERE account_id = ?').bind(acct.id), sys(env, gid, `🐷 ${acct.nick} entrou na guilda`, now)]);
}

export async function createGuild(env, acct, b, h) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim(), emblem = String(b.emblem || ''), color = String(b.color || '');
  const e = guildNameErr(name); if (e) return fail(e);
  if (!GUILD.emblems.includes(emblem)) return fail('Escolha um brasão'); if (!GUILD.colors.includes(color)) return fail('Escolha uma cor');
  if (await guildOf(env, acct.id)) return fail('Você já está numa guilda. Saia dela antes.');
  if (await env.DB.prepare('SELECT 1 AS x FROM farm_guilds WHERE name_key = ?').bind(guildKey(name)).first()) return fail('Já existe uma guilda com esse nome', 409);
  const now = Date.now(); const row = await h.ensureRow(env, acct, now), s0 = settle(JSON.parse(row.state), now);
  for (const k in GUILD.cost) if ((s0.res[k] | 0) < GUILD.cost[k]) return fail(`Fundar custa ${GUILD.cost.planks} 🪵 e ${GUILD.cost.grains} 🌾`);
  let gid = 0, code = '';
  for (let i = 0; i < 4 && !gid; i++) {
    code = newCode();
    try {
      const [g] = await env.DB.batch([
        env.DB.prepare('INSERT INTO farm_guilds (name, name_key, emblem, color, code, leader, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(name, guildKey(name), emblem, color, code, acct.id, now),
        env.DB.prepare('INSERT INTO farm_guild_members (account_id, guild_id, joined_at) VALUES (?, last_insert_rowid(), ?)').bind(acct.id, now),
      ]);
      gid = g.meta.last_row_id;
    } catch (err) {
      const msg = String(err && err.message || err);
      if (/name_key/.test(msg)) return fail('Já existe uma guilda com esse nome', 409);
      if (/account_id/.test(msg)) return fail('Você já está numa guilda. Saia dela antes.');
      if (!/code/.test(msg)) throw err; // código repetido: tenta outro
    }
  }
  if (!gid) return fail('Não deu pra criar agora. Tenta de novo.', 500);
  const r = await h.withFarm(env, acct, (s) => { for (const k in GUILD.cost) if ((s.res[k] | 0) < GUILD.cost[k]) return fail('Recurso insuficiente'); for (const k in GUILD.cost) s.res[k] -= GUILD.cost[k]; return { ok: true }; });
  if (!r || !r.ok) { await env.DB.batch([env.DB.prepare('DELETE FROM farm_guild_members WHERE guild_id = ?').bind(gid), env.DB.prepare('DELETE FROM farm_guilds WHERE id = ?').bind(gid)]); return r; }
  await sys(env, gid, `🏰 ${acct.nick} fundou a guilda ${name}`, now).run();
  return { ...r, msg: `Guilda ${name} fundada! Código: ${code}`, guildId: gid };
}

export async function joinByCode(env, acct, code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const g = await env.DB.prepare('SELECT id, name FROM farm_guilds WHERE code = ?').bind(code).first(); if (!g) return fail('Código não encontrado', 404);
  const now = Date.now(); const r = await capInsert(env, acct.id, g.id, now).run();
  if (r.meta.changes !== 1) return whyNotJoin(env, acct.id, g.id);
  await joined(env, acct, g.id, now); return { ok: true, msg: `Você entrou na ${g.name}!` };
}

export async function requestJoin(env, acct, gid) {
  if (await guildOf(env, acct.id)) return fail('Você já está numa guilda. Saia dela antes.');
  const g = await env.DB.prepare('SELECT id, name FROM farm_guilds WHERE id = ?').bind(gid).first(); if (!g) return fail('Essa guilda não existe mais', 404);
  if ((await count(env, gid)) >= GUILD.max) return fail(`Guilda cheia (máximo ${GUILD.max})`, 409);
  const mine = (await env.DB.prepare('SELECT COUNT(*) AS n FROM farm_guild_requests WHERE account_id = ?').bind(acct.id).first()).n;
  if (mine >= GUILD.requestsMax) return fail(`No máximo ${GUILD.requestsMax} pedidos abertos`);
  const now = Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO farm_guild_requests (guild_id, account_id, nick, created_at) VALUES (?, ?, ?, ?)').bind(gid, acct.id, acct.nick, now).run();
  return { ok: true, msg: `Pedido enviado pra ${g.name}. O líder precisa aceitar.` };
}
export async function cancelRequest(env, acct, gid) { await env.DB.prepare('DELETE FROM farm_guild_requests WHERE guild_id = ? AND account_id = ?').bind(gid, acct.id).run(); return { ok: true }; }

async function asLeader(env, acct) {
  const g = await guildOf(env, acct.id); if (!g) return [null, fail('Você não está numa guilda')];
  if (g.leader !== acct.id) return [null, fail('Só o líder pode fazer isso', 403)]; return [g, null];
}
const nickOf = async (env, id) => { const r = await env.DB.prepare('SELECT nick FROM farm_players WHERE account_id = ?').bind(id).first(); return r ? r.nick : 'alguém'; };

export async function answerRequest(env, acct, target, accept) {
  const [g, e] = await asLeader(env, acct); if (e) return e;
  const rq = await env.DB.prepare('SELECT nick FROM farm_guild_requests WHERE guild_id = ? AND account_id = ?').bind(g.id, target).first(); if (!rq) return fail('Pedido não encontrado', 404);
  if (!accept) { await env.DB.prepare('DELETE FROM farm_guild_requests WHERE guild_id = ? AND account_id = ?').bind(g.id, target).run(); return { ok: true, msg: 'Pedido recusado' }; }
  const now = Date.now(); const r = await capInsert(env, target, g.id, now).run();
  if (r.meta.changes !== 1) { const w = await whyNotJoin(env, target, g.id); if (/já está/.test(w.error)) { await env.DB.prepare('DELETE FROM farm_guild_requests WHERE account_id = ?').bind(target).run(); return fail(`${rq.nick} já entrou em outra guilda`); } return w; }
  await joined(env, { id: target, nick: rq.nick }, g.id, now); return { ok: true, msg: `${rq.nick} entrou na guilda!` };
}

export async function leaveGuild(env, acct) {
  const g = await guildOf(env, acct.id); if (!g) return fail('Você não está numa guilda');
  const now = Date.now();
  if (g.leader === acct.id) {
    const next = await env.DB.prepare('SELECT account_id FROM farm_guild_members WHERE guild_id = ? AND account_id != ? ORDER BY joined_at, account_id LIMIT 1').bind(g.id, acct.id).first();
    if (!next) { // último a sair: a guilda acaba
      await env.DB.batch(['farm_guild_chat', 'farm_guild_requests', 'farm_guild_members'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE guild_id = ?`).bind(g.id)).concat(env.DB.prepare('DELETE FROM farm_guilds WHERE id = ?').bind(g.id)));
      return { ok: true, msg: `Você saiu e a ${g.name} acabou` };
    }
    await env.DB.batch([env.DB.prepare('UPDATE farm_guilds SET leader = ? WHERE id = ? AND leader = ?').bind(next.account_id, g.id, acct.id), env.DB.prepare('DELETE FROM farm_guild_members WHERE account_id = ?').bind(acct.id),
      sys(env, g.id, `👋 ${acct.nick} saiu. ${await nickOf(env, next.account_id)} agora é o líder 👑`, now)]);
    return { ok: true, msg: `Você saiu da ${g.name}` };
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM farm_guild_members WHERE account_id = ? AND guild_id = ?').bind(acct.id, g.id), sys(env, g.id, `👋 ${acct.nick} saiu da guilda`, now)]);
  return { ok: true, msg: `Você saiu da ${g.name}` };
}

export async function kickMember(env, acct, target) {
  const [g, e] = await asLeader(env, acct); if (e) return e; if (target === acct.id) return fail('Pra sair, use "Sair da guilda"');
  const nick = await nickOf(env, target);
  const [r] = await env.DB.batch([env.DB.prepare('DELETE FROM farm_guild_members WHERE account_id = ? AND guild_id = ?').bind(target, g.id), sys(env, g.id, `🥾 ${nick} foi expulso da guilda`, Date.now())]);
  if (r.meta.changes !== 1) return fail('Esse jogador não está na guilda', 404);
  return { ok: true, msg: `${nick} foi expulso` };
}

export async function transferLeader(env, acct, target) {
  const [g, e] = await asLeader(env, acct); if (e) return e; if (target === acct.id) return fail('Você já é o líder');
  const r = await env.DB.prepare('UPDATE farm_guilds SET leader = ?1 WHERE id = ?2 AND leader = ?3 AND EXISTS (SELECT 1 FROM farm_guild_members WHERE account_id = ?1 AND guild_id = ?2)').bind(target, g.id, acct.id).run();
  if (r.meta.changes !== 1) return fail('Esse jogador não está na guilda', 404);
  const nick = await nickOf(env, target); await sys(env, g.id, `👑 ${nick} agora é o líder`, Date.now()).run(); return { ok: true, msg: `${nick} agora é o líder` };
}

export async function postChat(env, acct, text) {
  const g = await guildOf(env, acct.id); if (!g) return fail('Você não está numa guilda');
  text = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, GUILD.chatMax); if (!text) return fail('Mensagem vazia');
  const now = Date.now();
  const last = await env.DB.prepare('SELECT created_at FROM farm_guild_chat WHERE guild_id = ? AND account_id = ? ORDER BY id DESC LIMIT 1').bind(g.id, acct.id).first();
  if (last && now - last.created_at < GUILD.chatGapMs) return fail('Calma, uma mensagem de cada vez', 429);
  const r = await env.DB.prepare("INSERT INTO farm_guild_chat (guild_id, account_id, nick, kind, text, created_at) VALUES (?, ?, ?, 'msg', ?, ?)").bind(g.id, acct.id, acct.nick, text, now).run();
  await env.DB.prepare('DELETE FROM farm_guild_chat WHERE guild_id = ? AND id < ?').bind(g.id, r.meta.last_row_id - 300).run(); // guarda só as últimas 300
  return { ok: true, id: r.meta.last_row_id };
}

// doação: tropa sai do seu acampamento e vai pro acampamento do colega (até 10 por dia, se couber lá)
export async function donate(env, acct, b, h) {
  const to = b.to | 0, unit = String(b.unit || ''), n = Math.max(1, Math.min(5, b.n | 0)); if (!UNITS[unit]) return fail('Tropa inválida');
  const mates = await guildmates(env, acct.id); if (!mates.has(to)) return fail('Só dá pra doar pra colega de guilda');
  for (let i = 0; i < 3; i++) {
    const now = Date.now(); const meRow = await h.ensureRow(env, acct, now), oRow = await h.loadRow(env, to); if (!oRow) return fail('Colega não encontrado');
    const s = settle(JSON.parse(meRow.state), now), o = settle(JSON.parse(oRow.state), now);
    if (!rateOk(s, now)) return fail('Calma, fazendeiro! Muitas ações nesta hora.', 429);
    if (s.day.d !== dayKey(now)) s.day = { d: dayKey(now), steals: 0, stolen: {}, finds: 0 };
    if ((s.army[unit] | 0) < n) return fail('Você não tem essa tropa toda');
    if ((s.day.donated | 0) + n > 10) return fail('Limite de 10 doações por dia');
    if (armySpace(o) + UNITS[unit].space * n > housing(o)) return fail(`O acampamento do ${oRow.nick} está cheio`);
    s.army[unit] -= n; s.day.donated = (s.day.donated | 0) + n; o.army[unit] = (o.army[unit] | 0) + n;
    const tok = h.rtok();
    const [x, y] = await env.DB.batch([h.saveStmt(env, to, oRow.nick, o, oRow.version, tok, now),
      env.DB.prepare('UPDATE farm_players SET state = ?, nick = ?, version = version + 1, wtok = ?, updated_at = ? WHERE account_id = ? AND version = ? AND (SELECT wtok FROM farm_players WHERE account_id = ?) = ?').bind(JSON.stringify(s), acct.nick, h.rtok(), now, acct.id, meRow.version, to, tok)]);
    if (x.meta.changes === 1 && y.meta.changes === 1) {
      const g = await guildOf(env, acct.id); if (g) await sys(env, g.id, `🎁 ${acct.nick} doou ${n} ${UNITS[unit].name} pro ${oRow.nick}`, now).run();
      return { ok: true, state: s, now, msg: `Doou ${n} ${UNITS[unit].name} pro ${oRow.nick}` };
    }
    if (x.meta.changes === 1) { o.army[unit] -= n; await h.saveStmt(env, to, oRow.nick, o, oRow.version + 1, h.rtok(), now).run(); }
  }
  return fail('A fazenda mudou no meio. Tenta de novo.', 409);
}

const SUM_SQL = 'SELECT g.id, g.name, g.emblem, g.color, COUNT(m.account_id) AS members, COALESCE(SUM(p.trophies), 0) AS trophies FROM farm_guilds g JOIN farm_guild_members m ON m.guild_id = g.id LEFT JOIN farm_players p ON p.account_id = m.account_id';
export async function guildRank(env) { const { results } = await env.DB.prepare(`${SUM_SQL} GROUP BY g.id ORDER BY trophies DESC, g.id LIMIT 20`).all(); return { ok: true, rows: results || [] }; }
export async function guildList(env, acct, q) {
  const k = guildKey(q).slice(0, 20);
  const { results } = await env.DB.prepare(`${SUM_SQL} WHERE g.name_key LIKE ? GROUP BY g.id HAVING COUNT(m.account_id) < ? ORDER BY trophies DESC LIMIT 20`).bind(`%${k.replace(/[%_]/g, '')}%`, GUILD.max).all();
  const mine = await env.DB.prepare('SELECT guild_id FROM farm_guild_requests WHERE account_id = ?').bind(acct.id).all();
  const asked = new Set((mine.results || []).map((r) => r.guild_id));
  return { ok: true, rows: (results || []).map((r) => ({ ...r, asked: asked.has(r.id) })) };
}

export async function guildInfo(env, acct, after) {
  const g = await guildOf(env, acct.id);
  if (!g) { const { results } = await env.DB.prepare('SELECT r.guild_id AS id, g.name, g.emblem, g.color FROM farm_guild_requests r JOIN farm_guilds g ON g.id = r.guild_id WHERE r.account_id = ?').bind(acct.id).all(); return { ok: true, guild: null, requests: results || [] }; }
  const now = Date.now();
  const [mem, chat, reqs, rank] = await env.DB.batch([
    env.DB.prepare('SELECT m.account_id AS id, m.joined_at, p.nick, p.trophies, p.level, p.updated_at FROM farm_guild_members m LEFT JOIN farm_players p ON p.account_id = m.account_id WHERE m.guild_id = ? ORDER BY m.joined_at').bind(g.id),
    env.DB.prepare('SELECT id, account_id, nick, kind, text, created_at FROM farm_guild_chat WHERE guild_id = ? AND id > ? ORDER BY id DESC LIMIT 60').bind(g.id, after | 0),
    env.DB.prepare('SELECT account_id AS id, nick, created_at FROM farm_guild_requests WHERE guild_id = ? ORDER BY created_at').bind(g.id),
    env.DB.prepare(`SELECT COUNT(*) + 1 AS pos FROM (${SUM_SQL} GROUP BY g.id HAVING COALESCE(SUM(p.trophies), 0) > (SELECT COALESCE(SUM(p2.trophies), 0) FROM farm_guild_members m2 LEFT JOIN farm_players p2 ON p2.account_id = m2.account_id WHERE m2.guild_id = ?))`).bind(g.id),
  ]);
  const members = (mem.results || []).map((m) => ({ id: m.id, nick: m.nick || '?', trophies: m.trophies | 0, level: m.level | 0, leader: m.id === g.leader, me: m.id === acct.id, online: now - (m.updated_at | 0) < 5 * 60e3, seen: m.updated_at | 0, who: 'p:' + m.id }));
  return { ok: true, now, guild: { id: g.id, name: g.name, emblem: g.emblem, color: g.color, code: g.code, leader: g.leader, iAmLeader: g.leader === acct.id, max: GUILD.max,
    trophies: members.reduce((a, m) => a + m.trophies, 0), rank: rank.results && rank.results[0] ? rank.results[0].pos : 0, members },
    chat: (chat.results || []).reverse().map((c) => ({ id: c.id, me: c.account_id === acct.id, nick: c.nick, kind: c.kind, text: c.text, at: c.created_at })),
    requests: g.leader === acct.id ? (reqs.results || []) : [] };
}
