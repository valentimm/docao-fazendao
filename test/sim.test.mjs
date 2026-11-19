import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, runBattle, validateCmds, deployOk, mulberry32, isqrt } from '../shared/sim.js';
import { botBase } from '../shared/bots.js';
import { newFarm, baseSnapshot } from '../shared/economy.js';

const army = { leitao: 10, atirador: 6, javali: 2, bomba: 3 };
function plan(base, a, seed) { // comandos "aleatórios" mas válidos, gerados por semente
  const r = mulberry32(seed ^ 0xabc), cmds = []; let t = 0; const left = { ...a };
  for (const u of Object.keys(left)) while (left[u] > 0) {
    let x, y, k = 0; do { const side = r() % 4, p = r() % 30000; [x, y] = side === 0 ? [p, 0] : side === 1 ? [p, 30000] : side === 2 ? [0, p] : [30000, p]; } while (!deployOk(base, x, y) && ++k < 20);
    t += r() % 15; cmds.push({ t, u, x, y }); left[u]--;
  }
  return cmds;
}

test('isqrt e mulberry32 são inteiros e estáveis', () => {
  for (const n of [0, 1, 2, 15, 16, 17, 999999, 1e12 + 7]) { const x = isqrt(n); assert.ok(x * x <= n && (x + 1) * (x + 1) > n); }
  const r = mulberry32(42); assert.deepEqual([r(), r(), r()], [2581720956, 1925393290, 3661312704]);
});

test('mesma semente + mesmos comandos = mesmo resultado (100 ataques)', () => {
  for (let i = 0; i < 100; i++) {
    const base = botBase(1 + (i % 5), 1000 + i), cmds = plan(base, army, i);
    assert.equal(validateCmds(base, army, cmds, 1800), null);
    const a = runBattle(base, army, 77 + i, cmds, 1800), b = runBattle(JSON.parse(JSON.stringify(base)), { ...army }, 77 + i, JSON.parse(JSON.stringify(cmds)), 1800);
    assert.deepEqual(a, b);
  }
});

test('cliente passo a passo (para no fim) dá o mesmo hash do servidor', () => {
  for (let i = 0; i < 20; i++) {
    const base = botBase(2, 500 + i), cmds = plan(base, army, i), seed = 9 + i;
    const bt = new Battle(base, army, seed); let k = 0;
    while (!bt.over) { const now = []; while (k < cmds.length && cmds[k].t === bt.tick) now.push(cmds[k++]); bt.step(now); if (k >= cmds.length && bt.alive() === 0) break; }
    const end = bt.tick; // o cliente manda o tick em que acabou
    assert.equal(runBattle(base, army, seed, cmds, end).hash, bt.result().hash);
  }
});

test('exército forte destrói a base de bot nível 1; nada lançado = 0%', () => {
  const base = botBase(1, 3); const big = { leitao: 20, atirador: 10, javali: 4, bomba: 4 };
  const r = runBattle(base, big, 5, plan(base, big, 3), 1800);
  assert.ok(r.pct >= 50, `pct ${r.pct}`); assert.ok(r.stars >= 1);
  const z = runBattle(base, big, 5, [], 1800); assert.equal(z.pct, 0); assert.equal(z.stars, 0);
});

test('só 6 leitõezinhos contra base de jogador nova: dá pra tirar alguma coisa', () => {
  const base = baseSnapshot(newFarm(0)); const a = { leitao: 6 };
  const r = runBattle(base, a, 1, [0, 1, 2, 3, 4, 5].map((i) => ({ t: i, u: 'leitao', x: 0, y: 14000 + i * 300 })), 1800);
  assert.ok(r.destroyed >= 1, JSON.stringify(r));
});

test('validação barra trapaça', () => {
  const base = botBase(1, 1); const a = { leitao: 2 };
  assert.match(validateCmds(base, a, [{ t: 0, u: 'leitao', x: 0, y: 0 }, { t: 0, u: 'leitao', x: 0, y: 0 }, { t: 1, u: 'leitao', x: 0, y: 0 }], 1800), /não levou/);
  assert.match(validateCmds(base, a, [{ t: 0, u: 'javali', x: 0, y: 0 }], 1800), /não levou/);
  assert.match(validateCmds(base, a, [{ t: 0, u: 'leitao', x: 15000, y: 15000 }], 1800), /fora da área/);
  assert.match(validateCmds(base, a, [{ t: 5, u: 'leitao', x: 0, y: 0 }, { t: 2, u: 'leitao', x: 0, y: 0 }], 1800), /tempo/);
  assert.match(validateCmds(base, a, [{ t: 1900, u: 'leitao', x: 0, y: 0 }], 1800), /tempo|Fim/);
  assert.match(validateCmds(base, a, [], 99999), /Fim/);
  assert.match(validateCmds(base, a, [{ t: 0.5, u: 'leitao', x: 0, y: 0 }], 1800), /tempo/);
});

test('batalha de 1.800 ticks com 60 tropas roda rápido', () => {
  const base = botBase(5, 11); const a = { leitao: 30, atirador: 20, javali: 6, bomba: 4 };
  const t = performance.now(); runBattle(base, a, 3, plan(base, a, 8), 1800); const ms = performance.now() - t;
  assert.ok(ms < 200, `${ms.toFixed(1)} ms`);
});
