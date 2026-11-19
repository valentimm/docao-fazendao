// Docão Fazendão: economia pura (sem D1, sem DOM). O servidor é a autoridade: toda rota faz settle(state, agora)
// e aplica a intenção do cliente ("colher canteiro 3"); o cliente nunca manda quantidade nem horário.
// O cliente usa as mesmas funções só pra mostrar contagem regressiva / prévia.
import { GRID, BUILDERS, START_RES, BASE_CAP, PROTECTED, LOOT_PCT, RES, BUILDINGS, CROPS, UNITS, STEAL, lvlVal } from './rules.js';

export const HOUR = 3600000;
export const ACTIONS_PER_HOUR = 300;
// dia no fuso de Brasília (limites diários de roubo/busca)
export const dayKey = (now) => new Date(now - 3 * HOUR).toISOString().slice(0, 10);

export function newFarm(now) {
  const s = { v: 1, res: { ...START_RES }, buildings: [], army: { leitao: 6, atirador: 0, javali: 0, bomba: 0 }, queue: [],
    trophies: 0, shieldUntil: 0, stats: { harvests: 0, steals: 0, stolenFrom: 0, attacks: 0, wins: 0, stars: 0 },
    day: { d: dayKey(now), steals: 0, stolen: {}, finds: 0 }, rl: { h: 0, n: 0 }, nextId: 1, createdAt: now };
  const put = (type, x, y, lvl = 1) => { const b = { id: s.nextId++, type, lvl, x, y, busyUntil: 0, nextLvl: 0, store: 0, prodAt: now }; s.buildings.push(b); return b; };
  put('celeiro', 13, 13);
  put('serraria', 8, 13); put('racao', 19, 13); put('quartel', 13, 8); put('acampamento', 13, 19); put('torre', 9, 9);
  put('canteiro', 9, 18); put('canteiro', 11, 18); put('canteiro', 9, 20); put('canteiro', 11, 20);
  return s;
}

export const celeiroLvl = (s) => { const c = s.buildings.find((b) => b.type === 'celeiro'); return c ? Math.max(1, c.lvl) : 1; };
export function caps(s) {
  let extra = 0; for (const b of s.buildings) if (b.type === 'silo' && b.lvl >= 1) extra += lvlVal(BUILDINGS.silo.store, b.lvl);
  const c = BASE_CAP + (celeiroLvl(s) - 1) * 1000 + extra; return { grains: c, ration: c, planks: c };
}
export function housing(s) { let h = 0; for (const b of s.buildings) if (b.type === 'acampamento' && b.lvl >= 1) h += lvlVal(BUILDINGS.acampamento.housing, b.lvl); return h; }
export function armySpace(s, withQueue = true) {
  let n = 0; for (const u in s.army) n += (s.army[u] | 0) * (UNITS[u] ? UNITS[u].space : 0);
  if (withQueue) for (const q of s.queue) n += UNITS[q.unit].space;
  return n;
}
export const busyCount = (s, now) => s.buildings.filter((b) => b.busyUntil && b.busyUntil > now).length;
export const countOf = (s, type) => s.buildings.filter((b) => b.type === type).length;
export const maxCount = (s, type) => lvlVal(BUILDINGS[type].count, celeiroLvl(s));

// produção preguiçosa de um prédio até `t` (no nível atual). Sobra de tempo não se perde: prodAt anda só o que virou recurso.
function produce(s, b, t) {
  const d = BUILDINGS[b.type]; if (!d.makes || b.lvl < 1) { b.prodAt = Math.max(b.prodAt || 0, t); return; }
  const dt = t - b.prodAt; if (dt <= 0) return;
  const rate = lvlVal(d.rate, b.lvl), cap = lvlVal(d.cap, b.lvl);
  let gain = Math.floor(rate * dt / HOUR), limited = false;
  if (b.store + gain >= cap) { gain = Math.max(0, cap - b.store); limited = true; }
  if (d.eats) { const can = Math.floor(s.res.grains / d.eats); if (gain >= can) { gain = can; limited = true; } s.res.grains -= gain * d.eats; }
  b.store += gain;
  b.prodAt = limited ? t : b.prodAt + Math.floor(gain * HOUR / rate);
}

export function settle(s, now) {
  const done = s.buildings.filter((b) => b.busyUntil && b.busyUntil <= now).sort((a, b) => a.busyUntil - b.busyUntil || a.id - b.id);
  for (const b of done) { produce(s, b, b.busyUntil); b.lvl = b.nextLvl; b.nextLvl = 0; b.prodAt = b.busyUntil; b.busyUntil = 0; }
  for (const b of [...s.buildings].sort((a, b) => a.id - b.id)) produce(s, b, now);
  while (s.queue.length && s.queue[0].endAt <= now) { const q = s.queue.shift(); s.army[q.unit] = (s.army[q.unit] | 0) + 1; }
  const d = dayKey(now); if (!s.day || s.day.d !== d) s.day = { d, steals: 0, stolen: {}, finds: 0 };
  if (s.shieldUntil && s.shieldUntil < now) s.shieldUntil = 0;
  return s;
}

export function canPlace(s, type, x, y, ignoreId = 0) {
  const n = BUILDINGS[type].size;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1 || x + n > GRID - 1 || y + n > GRID - 1) return false; // 1 tile de borda livre pra tropa entrar
  for (const b of s.buildings) {
    if (b.id === ignoreId) continue; const m = BUILDINGS[b.type].size;
    if (x < b.x + m && b.x < x + n && y < b.y + m && b.y < y + n) return false;
  }
  return true;
}

const fail = (error) => ({ ok: false, error });
const pay = (s, res, amt) => { if ((s.res[res] | 0) < amt) return false; s.res[res] -= amt; return true; };
export function addRes(s, res, amt) { const c = caps(s)[res]; const before = s.res[res]; s.res[res] = Math.min(c, before + Math.max(0, amt | 0)); return { got: s.res[res] - before, lost: Math.max(0, amt - (s.res[res] - before)) }; }

// limite de 300 ações/hora por conta (anti-macro). Devolve false se estourou.
export function rateOk(s, now) { const h = Math.floor(now / HOUR); if (!s.rl || s.rl.h !== h) s.rl = { h, n: 0 }; s.rl.n++; return s.rl.n <= ACTIONS_PER_HOUR; }

// intenção do cliente → muda o estado. a = { type, ... }. Sempre chamar settle(s, now) antes.
export function act(s, a, now) {
  if (!a || typeof a.type !== 'string') return fail('Pedido inválido');
  const byId = (id) => s.buildings.find((b) => b.id === (id | 0));
  switch (a.type) {
    case 'plant': {
      const b = byId(a.id); if (!b || b.type !== 'canteiro') return fail('Canteiro não encontrado');
      if (b.lvl < 1) return fail('Canteiro ainda em obra'); if (b.crop) return fail('Esse canteiro já está plantado');
      const c = CROPS[a.crop]; if (!c) return fail('Semente desconhecida');
      if (celeiroLvl(s) < c.unlock) return fail(`${c.name} libera no Celeiro ${c.unlock}`);
      if (!pay(s, 'grains', c.seed)) return fail(`Faltam grãos pra semente (${c.seed})`);
      b.crop = a.crop; b.plantedAt = now; b.readyAt = now + c.time * 1000; b.stolenPct = 0; b.thieves = [];
      return { ok: true, msg: `${c.name} plantado! Fica pronto em ${fmtDur(c.time)}.` };
    }
    case 'harvest': {
      const b = byId(a.id); if (!b || b.type !== 'canteiro' || !b.crop) return fail('Nada plantado aqui');
      if (now < b.readyAt) return fail('Ainda não está pronto');
      const c = CROPS[b.crop], amt = Math.floor(c.yield * (100 - (b.stolenPct | 0)) / 100);
      const r = addRes(s, 'grains', amt); s.stats.harvests++;
      const stolen = b.stolenPct | 0; b.crop = null; b.plantedAt = 0; b.readyAt = 0; b.stolenPct = 0; b.thieves = [];
      return { ok: true, gain: { grains: r.got }, msg: `+${r.got} grãos de ${c.name}` + (stolen ? ` (roubaram ${stolen}% 🐷)` : '') + (r.lost ? ` · silo cheio, ${r.lost} perdidos` : '') };
    }
    case 'collect': {
      const b = byId(a.id); const d = b && BUILDINGS[b.type]; if (!d || !d.makes) return fail('Esse prédio não produz');
      if (!b.store) return fail('Nada pra coletar ainda');
      const wasFull = b.store >= lvlVal(d.cap, b.lvl);
      const r = addRes(s, d.makes, b.store); b.store -= r.got;
      if (wasFull && r.got) b.prodAt = now; // estava cheio: volta a produzir a partir de agora
      if (!r.got) return fail('Depósito cheio! Suba o Silo ou gaste um pouco.');
      return { ok: true, gain: { [d.makes]: r.got }, msg: `+${r.got} ${d.makes === 'planks' ? 'tábuas' : 'ração'}` + (b.store ? ' · depósito cheio, o resto ficou no prédio' : '') };
    }
    case 'build': {
      const d = BUILDINGS[a.building]; if (!d || a.building === 'celeiro') return fail('Construção desconhecida');
      if (celeiroLvl(s) < d.unlock) return fail(`${d.name} libera no Celeiro ${d.unlock}`);
      if (countOf(s, a.building) >= maxCount(s, a.building)) return fail(`Limite de ${d.name} pro seu Celeiro. Suba o Celeiro.`);
      if (!canPlace(s, a.building, a.x, a.y)) return fail('Não cabe aí');
      const t = d.time[0];
      if (t > 0 && busyCount(s, now) >= BUILDERS) return fail('Os 2 Porcos Construtores estão ocupados');
      if (!pay(s, 'planks', d.cost[0])) return fail(`Faltam tábuas (${d.cost[0]})`);
      const b = { id: s.nextId++, type: a.building, lvl: t > 0 ? 0 : 1, x: a.x, y: a.y, busyUntil: t > 0 ? now + t * 1000 : 0, nextLvl: t > 0 ? 1 : 0, store: 0, prodAt: now };
      s.buildings.push(b);
      return { ok: true, id: b.id, msg: t > 0 ? `${d.name} em obra (${fmtDur(t)})` : `${d.name} pronto!` };
    }
    case 'upgrade': {
      const b = byId(a.id); if (!b) return fail('Prédio não encontrado'); const d = BUILDINGS[b.type];
      if (b.busyUntil) return fail('Já está em obra'); if (b.lvl >= d.max) return fail('Nível máximo');
      if (b.type !== 'celeiro' && b.lvl + 1 > celeiroLvl(s)) return fail(`Suba o Celeiro pro nível ${b.lvl + 1} antes`);
      if (busyCount(s, now) >= BUILDERS) return fail('Os 2 Porcos Construtores estão ocupados');
      const cost = d.cost[b.lvl], t = d.time[b.lvl];
      if (!pay(s, 'planks', cost)) return fail(`Faltam tábuas (${cost})`);
      produce(s, b, now); b.nextLvl = b.lvl + 1; b.busyUntil = now + t * 1000;
      return { ok: true, msg: `${d.name} subindo pro nível ${b.nextLvl} (${fmtDur(t)})` };
    }
    case 'move': {
      const b = byId(a.id); if (!b) return fail('Prédio não encontrado');
      if (!canPlace(s, b.type, a.x, a.y, b.id)) return fail('Não cabe aí');
      b.x = a.x; b.y = a.y; return { ok: true, msg: 'Mudou de lugar' };
    }
    case 'train': {
      const u = UNITS[a.unit]; if (!u) return fail('Tropa desconhecida');
      const n = Math.max(1, Math.min(20, a.n | 0 || 1));
      const q = s.buildings.find((b) => b.type === 'quartel' && b.lvl >= 1); if (!q) return fail('Precisa de um Chiqueiro-Quartel pronto');
      if (celeiroLvl(s) < u.unlock) return fail(`${u.name} libera no Celeiro ${u.unlock}`);
      if (armySpace(s) + u.space * n > housing(s)) return fail('Acampamento lotado. Suba o Acampamento de Lama.');
      if (!pay(s, 'ration', u.cost * n)) return fail(`Falta ração (${u.cost * n})`);
      const t = Math.max(1000, Math.floor(u.time * 1000 * (100 - lvlVal(BUILDINGS.quartel.speed, q.lvl)) / 100));
      for (let i = 0; i < n; i++) { const start = s.queue.length ? Math.max(now, s.queue[s.queue.length - 1].endAt) : now; s.queue.push({ unit: a.unit, endAt: start + t }); }
      return { ok: true, msg: `${n}× ${u.name} na fila do quartel` };
    }
    default: return fail('Ação desconhecida');
  }
}

// ---------- roubo (Colheita Feliz) ----------
// hash simples e determinístico (sorteio da mordida do cachorro com semente do servidor)
export function hash32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
// owner: estado do dono (já com settle). stealer: estado de quem rouba. Muda os dois. key = id estável do dono ("p12" ou "bot:2").
export function steal(owner, stealer, plotId, stealerId, ownerKey, now, secret = '') {
  if (stealer.day.steals >= STEAL.perDay) return fail(`Limite de ${STEAL.perDay} roubos por dia. Volta amanhã, ladrão.`);
  const b = owner.buildings.find((x) => x.id === (plotId | 0) && x.type === 'canteiro');
  if (!b || !b.crop) return fail('Esse canteiro está vazio');
  if (now < b.readyAt) return fail('Ainda não está pronto pra roubar');
  const k = `${ownerKey}:${b.id}:${b.plantedAt}`;
  if ((b.thieves || []).includes(stealerId) || stealer.day.stolen[k]) return fail('Você já passou a mão nesse canteiro');
  if ((b.stolenPct | 0) + STEAL.pct > STEAL.maxPct) return fail('Já roubaram demais daqui, deixa um pouco pro dono');
  b.thieves = [...(b.thieves || []), stealerId].slice(-10); stealer.day.stolen[k] = 1; stealer.day.steals++;
  const dog = owner.buildings.some((x) => x.type === 'casinha' && x.lvl >= 1);
  if (dog && hash32(`${secret}|${k}|${stealerId}`) % 100 < STEAL.bitePct) return { ok: true, bitten: true, amount: 0, crop: b.crop, msg: 'AU AU! O Caramelo te mordeu e você largou tudo 🐶' };
  const amount = Math.floor(CROPS[b.crop].yield * STEAL.pct / 100);
  b.stolenPct = (b.stolenPct | 0) + STEAL.pct;
  const r = addRes(stealer, 'grains', amount); stealer.stats.steals++; owner.stats.stolenFrom = (owner.stats.stolenFrom | 0) + 1;
  return { ok: true, bitten: false, amount: r.got, crop: b.crop, msg: `Roubou ${r.got} grãos de ${CROPS[b.crop].name} 🐷` };
}
export const readyPlots = (s, now) => s.buildings.filter((b) => b.type === 'canteiro' && b.crop && now >= b.readyAt && (b.stolenPct | 0) + STEAL.pct <= STEAL.maxPct).length;

// ---------- ataque ----------
// snapshot da base pra simulação: só prédios prontos (nível ≥ 1) e sem canteiros (não são alvo)
export function baseSnapshot(s) {
  return s.buildings.filter((b) => b.type !== 'canteiro' && (b.lvl >= 1 || b.nextLvl > 1)).map((b) => ({ id: b.id, type: b.type, lvl: Math.max(1, b.lvl), x: b.x, y: b.y }));
}
export function lootable(s) { const o = {}; for (const r of RES) o[r] = Math.floor((s.res[r] | 0) * (100 - PROTECTED) / 100 * LOOT_PCT / 100); return o; }
export const lootFor = (avail, pct) => { const o = {}; for (const r of RES) o[r] = Math.floor((avail[r] | 0) * pct / 100); return o; };
export const trophyDelta = (stars, myT, theirT) => { const diff = Math.max(-10, Math.min(10, Math.trunc(((theirT | 0) - (myT | 0)) / 20))); return stars > 0 ? 10 + stars * 5 + diff : -Math.max(3, 10 - diff); };

export function fmtDur(sec) {
  sec = Math.max(0, Math.ceil(sec)); if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), r = sec % 60; if (m < 60) return r ? `${m}min ${r}s` : `${m}min`;
  const h = Math.floor(m / 60); return `${h}h ${m % 60}min`;
}
export { GRID, BUILDINGS, CROPS, UNITS };
