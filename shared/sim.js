// Docão Fazendão: simulação de batalha DETERMINÍSTICA. Mesmo arquivo no cliente (desenha ao vivo) e no Worker (revalida).
// Regras: só inteiros (posições em milésimos de tile), PRNG mulberry32 com semente do servidor, sem Math.random/sin/cos/Date,
// ordem fixa por id. 10 ticks por segundo, no máximo 1.800 ticks (3 min).
import { GRID, BUILDINGS, UNITS, ATTACK, lvlVal } from './rules.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0); };
}
export function isqrt(n) { if (n <= 0) return 0; let x = Math.floor(Math.sqrt(n)); while (x * x > n) x--; while ((x + 1) * (x + 1) <= n) x++; return x; }
const isDef = (type) => !!BUILDINGS[type].def;

// distância (milésimos) de um ponto até o retângulo do prédio
function distRect(px, py, b) {
  const cx = Math.max(b.x0, Math.min(px, b.x1)), cy = Math.max(b.y0, Math.min(py, b.y1));
  const dx = px - cx, dy = py - cy; return { d: isqrt(dx * dx + dy * dy), cx, cy };
}

// a tropa só pode cair fora dos prédios (com 1 tile de folga) e dentro do mapa
export function deployOk(base, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > GRID * 1000 || y > GRID * 1000) return false;
  for (const b of base) { const n = BUILDINGS[b.type].size; if (x > (b.x - 1) * 1000 && x < (b.x + n + 1) * 1000 && y > (b.y - 1) * 1000 && y < (b.y + n + 1) * 1000) return false; }
  return true;
}

// valida os comandos [{t, u, x, y}] contra o exército levado. Devolve mensagem de erro ou null.
export function validateCmds(base, army, cmds, endTick) {
  if (!Array.isArray(cmds) || cmds.length > ATTACK.maxCmds) return 'Comandos inválidos';
  if (!Number.isInteger(endTick) || endTick < 0 || endTick > ATTACK.maxTicks) return 'Fim de batalha inválido';
  const left = { ...army }; let last = 0;
  for (const c of cmds) {
    if (!c || !Number.isInteger(c.t) || c.t < last || c.t >= ATTACK.maxTicks || c.t > endTick) return 'Comando fora do tempo';
    if (!UNITS[c.u] || !((left[c.u] | 0) > 0)) return 'Tropa que você não levou';
    if (!deployOk(base, c.x, c.y)) return 'Tropa lançada fora da área';
    left[c.u]--; last = c.t;
  }
  return null;
}

export class Battle {
  constructor(base, army, seed) {
    this.rng = mulberry32(seed); this.tick = 0; this.nextUnit = 1; this.army = { ...army };
    this.blds = base.map((b) => { const d = BUILDINGS[b.type], n = d.size; const hp = lvlVal(d.hp, b.lvl);
      return { id: b.id, type: b.type, lvl: b.lvl, x0: b.x * 1000, y0: b.y * 1000, x1: (b.x + n) * 1000, y1: (b.y + n) * 1000, cx: (b.x * 2 + n) * 500, cy: (b.y * 2 + n) * 500,
        hp, maxHp: hp, dead: false, cd: 0, def: d.def ? { range: d.def.range, dmg: lvlVal(d.def.dmg, b.lvl), cd: d.def.cd } : null }; }).sort((a, b) => a.id - b.id);
    this.units = []; this.events = []; this.over = false; this.deployed = 0;
  }
  deploy(u, x, y) {
    if (!UNITS[u] || !((this.army[u] | 0) > 0)) return false; this.army[u]--; this.deployed++;
    const d = UNITS[u]; this.units.push({ id: this.nextUnit++, u, x, y, hp: d.hp, maxHp: d.hp, dead: false, cd: 0, tgt: 0 }); return true;
  }
  target(un) {
    const d = UNITS[un.u]; let best = null, bd = Infinity;
    const pick = (onlyDef) => { for (const b of this.blds) { if (b.dead || (onlyDef && !b.def)) continue; const { d: dist } = distRect(un.x, un.y, b); if (dist < bd) { bd = dist; best = b; } } };
    if (d.pref === 'def') pick(true); if (!best) pick(false); return best;
  }
  hit(b, dmg) { if (b.dead) return; b.hp -= dmg; if (b.hp <= 0) { b.hp = 0; b.dead = true; this.events.push({ k: 'boom', b: b.id }); } }
  step(cmds = []) {
    if (this.over) return;
    this.events = [];
    for (const c of cmds) this.deploy(c.u, c.x, c.y);
    // tropas, por id
    for (const un of this.units) {
      if (un.dead) continue; const d = UNITS[un.u]; if (un.cd > 0) un.cd--;
      let b = un.tgt ? this.blds.find((x) => x.id === un.tgt) : null;
      if (!b || b.dead) { b = this.target(un); un.tgt = b ? b.id : 0; }
      if (!b) continue;
      const { d: dist, cx, cy } = distRect(un.x, un.y, b);
      if (dist <= d.range) {
        if (un.cd > 0) continue;
        if (d.blast) { // Leitão-Bomba: explode e morre
          for (const o of this.blds) if (!o.dead && distRect(un.x, un.y, o).d <= d.blast) this.hit(o, d.dmg);
          un.dead = true; un.hp = 0; this.events.push({ k: 'blast', x: un.x, y: un.y, id: un.id }); continue;
        }
        const crit = this.rng() % 100 < 10; const dmg = crit ? Math.floor(d.dmg * 3 / 2) : d.dmg;
        this.hit(b, dmg); un.cd = d.cd; this.events.push({ k: 'atk', id: un.id, b: b.id, crit });
      } else {
        const dx = cx - un.x, dy = cy - un.y, step = Math.min(d.speed, dist - d.range + 1);
        un.x += Math.trunc(dx * step / dist); un.y += Math.trunc(dy * step / dist);
      }
    }
    // defesas, por id: tropa viva mais perto no alcance (desempate pelo id)
    for (const b of this.blds) {
      if (b.dead || !b.def) continue; if (b.cd > 0) { b.cd--; continue; }
      let best = null, bd = Infinity;
      for (const un of this.units) { if (un.dead) continue; const dx = un.x - b.cx, dy = un.y - b.cy, dist = isqrt(dx * dx + dy * dy); if (dist <= b.def.range && dist < bd) { bd = dist; best = un; } }
      if (!best) continue;
      best.hp -= b.def.dmg; b.cd = b.def.cd; this.events.push({ k: 'shot', b: b.id, id: best.id });
      if (best.hp <= 0) { best.hp = 0; best.dead = true; this.events.push({ k: 'die', id: best.id }); }
    }
    this.tick++;
    if (this.blds.every((b) => b.dead) || this.tick >= ATTACK.maxTicks) this.over = true;
  }
  alive() { return this.units.filter((u) => !u.dead).length; }
  left() { let n = 0; for (const k in this.army) n += this.army[k] | 0; return n; }
  result() {
    const total = this.blds.length || 1, down = this.blds.filter((b) => b.dead).length, pct = Math.floor(down * 100 / total);
    const cel = this.blds.find((b) => b.type === 'celeiro');
    const stars = (pct >= 50 ? 1 : 0) + (cel && cel.dead ? 1 : 0) + (pct === 100 ? 1 : 0);
    const used = {}; for (const u of this.units) used[u.u] = (used[u.u] | 0) + 1;
    return { pct, stars, destroyed: down, total, used, ticks: this.tick, hash: this.hash() };
  }
  hash() {
    let h = 2166136261 >>> 0; const mix = (n) => { n = n | 0; for (let i = 0; i < 4; i++) { h ^= (n >>> (i * 8)) & 255; h = Math.imul(h, 16777619) >>> 0; } };
    for (const b of this.blds) { mix(b.id); mix(b.hp); }
    for (const u of this.units) { mix(u.id); mix(u.hp); if (!u.dead) { mix(u.x); mix(u.y); } }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}

// roda a batalha inteira (servidor). Para cedo quando não há mais nada pra acontecer (resultado idêntico).
export function runBattle(base, army, seed, cmds, endTick) {
  const bt = new Battle(base, army, seed); let i = 0;
  while (!bt.over && bt.tick < endTick) {
    const now = []; while (i < cmds.length && cmds[i].t === bt.tick) now.push(cmds[i++]);
    if (i >= cmds.length && !now.length && bt.alive() === 0 && bt.tick > 0) break;
    bt.step(now);
  }
  return bt.result();
}
