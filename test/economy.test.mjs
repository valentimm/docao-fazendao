import test from 'node:test';
import assert from 'node:assert/strict';
import { newFarm, settle, act, caps, housing, armySpace, steal, dayKey, lootable, baseSnapshot, HOUR } from '../shared/economy.js';
import { BUILDINGS, CROPS, UNITS, STEAL } from '../shared/rules.js';

const T0 = Date.UTC(2026, 10, 19, 15, 0, 0);
const find = (s, type) => s.buildings.find((b) => b.type === type);

test('fazenda nova: celeiro 1, 4 canteiros, 6 leitões e recursos iniciais', () => {
  const s = newFarm(T0);
  assert.equal(find(s, 'celeiro').lvl, 1);
  assert.equal(s.buildings.filter((b) => b.type === 'canteiro').length, 4);
  assert.equal(s.army.leitao, 6);
  assert.deepEqual(s.res, { grains: 300, ration: 250, planks: 1500 });
  assert.equal(housing(s), 20);
});

test('plantar, esperar e colher (3 culturas)', () => {
  const s = newFarm(T0); const plots = s.buildings.filter((b) => b.type === 'canteiro');
  for (const [i, crop] of ['milho', 'mandioca', 'milho'].entries()) assert.equal(act(s, { type: 'plant', id: plots[i].id, crop }, T0).ok, true);
  assert.equal(s.res.grains, 300 - 3 - 15 - 3);
  assert.equal(act(s, { type: 'plant', id: plots[0].id, crop: 'milho' }, T0).ok, false, 'canteiro ocupado');
  assert.equal(act(s, { type: 'harvest', id: plots[0].id }, T0 + 59000).ok, false, 'ainda não ficou pronto');
  const r = act(s, { type: 'harvest', id: plots[0].id }, T0 + 60000); assert.equal(r.ok, true); assert.equal(r.gain.grains, CROPS.milho.yield);
  assert.equal(act(s, { type: 'harvest', id: plots[1].id }, T0 + 60000).ok, false);
  assert.equal(act(s, { type: 'harvest', id: plots[1].id }, T0 + 240000).ok, true);
  assert.equal(act(s, { type: 'plant', id: plots[3].id, crop: 'abobora' }, T0).ok, false, 'abóbora só no Celeiro 2');
  assert.equal(act(s, { type: 'plant', id: plots[3].id, crop: 'trufa-falsa' }, T0).ok, false);
});

test('settle: serraria acumula offline com teto e sem perder fração de tempo', () => {
  const s = newFarm(T0); const ser = find(s, 'serraria');
  settle(s, T0 + 30 * 60000); assert.equal(ser.store, 300); // 600/h → 30 min = 300
  settle(s, T0 + 30 * 60000 + 3000); settle(s, T0 + 30 * 60000 + 6000); assert.equal(ser.store, 301); // 6 s = 1 tábua, mesmo com settles picados
  settle(s, T0 + 10 * HOUR); assert.equal(ser.store, BUILDINGS.serraria.cap[0], 'para no teto');
  const before = s.res.planks; const r = act(s, { type: 'collect', id: ser.id }, T0 + 10 * HOUR); assert.equal(r.ok, true);
  assert.equal(s.res.planks, Math.min(caps(s).planks, before + 1200)); assert.equal(ser.store, 0);
  settle(s, T0 + 10 * HOUR + 60000); assert.equal(ser.store, 10, 'depois de cheio volta a contar do momento da coleta');
});

test('settle: fábrica de ração come 2 grãos por ração e para sem grão', () => {
  const s = newFarm(T0); const f = find(s, 'racao'); s.res.grains = 100;
  settle(s, T0 + HOUR); assert.equal(f.store, 50); assert.equal(s.res.grains, 0);
  settle(s, T0 + 2 * HOUR); assert.equal(f.store, 50, 'sem grão não produz');
  s.res.grains = 1000; settle(s, T0 + 2 * HOUR + 12 * 60000); assert.equal(f.store, 110); assert.equal(s.res.grains, 880);
});

test('settle é idempotente e não depende de quantas vezes roda', () => {
  const a = newFarm(T0), b = newFarm(T0);
  for (let t = T0; t <= T0 + 3 * HOUR; t += 7777) settle(a, t);
  settle(b, T0 + 3 * HOUR);
  // a fração final pode diferir em 1 unidade só pelo arredondamento do último passo? não: prodAt carrega o resto
  assert.deepEqual(a.buildings.map((x) => x.store), b.buildings.map((x) => x.store));
  assert.deepEqual(a.res, b.res);
});

test('construir: custo, posição válida, limite por celeiro e 2 construtores', () => {
  const s = newFarm(T0);
  assert.equal(act(s, { type: 'build', building: 'serraria', x: 13, y: 13 }, T0).ok, false, 'em cima do celeiro');
  assert.equal(act(s, { type: 'build', building: 'serraria', x: 29, y: 2 }, T0).ok, false, 'fora do mapa');
  assert.equal(act(s, { type: 'build', building: 'serraria', x: 2, y: 2 }, T0).ok, false, 'Celeiro 1 só deixa 1 serraria');
  const p = s.res.planks; const r = act(s, { type: 'build', building: 'silo', x: 2, y: 2 }, T0); assert.equal(r.ok, true); assert.equal(s.res.planks, p - 300);
  const silo = s.buildings.find((b) => b.id === r.id); assert.equal(silo.lvl, 0);
  assert.equal(act(s, { type: 'upgrade', id: find(s, 'serraria').id }, T0).ok, false, 'serraria não passa do celeiro');
  s.res.planks = 3000;
  assert.equal(act(s, { type: 'upgrade', id: find(s, 'celeiro').id }, T0).ok, true);
  assert.equal(act(s, { type: 'build', building: 'torre', x: 2, y: 8 }, T0).ok, false, 'dois construtores ocupados');
  settle(s, T0 + 20000); assert.equal(silo.lvl, 1); assert.equal(caps(s).planks, 3000 + 2000);
  settle(s, T0 + 60000); assert.equal(find(s, 'celeiro').lvl, 2); assert.equal(caps(s).planks, 3000 + 1000 + 2000);
  assert.equal(act(s, { type: 'plant', id: s.buildings.find((b) => b.type === 'canteiro').id, crop: 'abobora' }, T0 + 60000).ok, true);
  assert.equal(act(s, { type: 'build', building: 'canteiro', x: 2, y: 8 }, T0 + 60000).ok, true, 'canteiro é instantâneo');
  assert.equal(act(s, { type: 'move', id: find(s, 'torre').id, x: 24, y: 24 }, T0 + 60000).ok, true);
});

test('treinar: custo em ração, fila sequencial e espaço do acampamento', () => {
  const s = newFarm(T0); s.res.ration = 2000;
  assert.equal(act(s, { type: 'train', unit: 'javali' }, T0).ok, false, 'javali só no Celeiro 2');
  assert.equal(act(s, { type: 'train', unit: 'atirador', n: 4 }, T0).ok, true);
  assert.equal(s.res.ration, 2000 - 200);
  assert.equal(armySpace(s), 6 + 4);
  settle(s, T0 + 8000); assert.equal(s.army.atirador, 1);
  settle(s, T0 + 32000); assert.equal(s.army.atirador, 4); assert.equal(s.queue.length, 0);
  assert.equal(act(s, { type: 'train', unit: 'leitao', n: 11 }, T0 + 32000).ok, false, 'passa de 20 espaços');
  assert.equal(act(s, { type: 'train', unit: 'leitao', n: 10 }, T0 + 32000).ok, true);
});

test('roubo: 10% por visita, 1x por canteiro, teto 30%, limite diário', () => {
  const owner = newFarm(T0), thief = newFarm(T0); const plot = owner.buildings.find((b) => b.type === 'canteiro');
  act(owner, { type: 'plant', id: plot.id, crop: 'mandioca' }, T0);
  assert.equal(steal(owner, thief, plot.id, 2, 'p1', T0 + 1000).ok, false, 'não está pronto');
  const g = thief.res.grains; const r = steal(owner, thief, plot.id, 2, 'p1', T0 + 240000);
  assert.equal(r.ok, true); assert.equal(r.amount, 15); assert.equal(thief.res.grains, g + 15);
  assert.equal(steal(owner, thief, plot.id, 2, 'p1', T0 + 240000).ok, false, 'mesma pessoa 2x');
  const t3 = newFarm(T0), t4 = newFarm(T0), t5 = newFarm(T0);
  assert.equal(steal(owner, t3, plot.id, 3, 'p1', T0 + 240000).ok, true);
  assert.equal(steal(owner, t4, plot.id, 4, 'p1', T0 + 240000).ok, true);
  assert.equal(steal(owner, t5, plot.id, 5, 'p1', T0 + 240000).ok, false, 'teto de 30%');
  const h = act(owner, { type: 'harvest', id: plot.id }, T0 + 240000); assert.equal(h.gain.grains, 105, 'dono colhe 70%');
  thief.day.steals = STEAL.perDay; act(owner, { type: 'plant', id: plot.id, crop: 'milho' }, T0 + 240000);
  assert.equal(steal(owner, thief, plot.id, 2, 'p1', T0 + 400000).ok, false, 'limite diário');
  settle(thief, T0 + 24 * HOUR); assert.equal(thief.day.steals, 0, 'zera no dia seguinte'); assert.notEqual(thief.day.d, dayKey(T0));
});

test('cachorro morde ~30% dos ladrões (sorteio determinístico)', () => {
  let bites = 0;
  for (let i = 0; i < 300; i++) {
    const owner = newFarm(T0); owner.buildings.push({ id: 99, type: 'casinha', lvl: 1, x: 2, y: 2, busyUntil: 0, nextLvl: 0, store: 0, prodAt: T0 });
    const plot = owner.buildings.find((b) => b.type === 'canteiro'); act(owner, { type: 'plant', id: plot.id, crop: 'milho' }, T0 + i);
    const r = steal(owner, newFarm(T0), plot.id, 1000 + i, 'p1', T0 + 100000, 'seg'); assert.equal(r.ok, true); if (r.bitten) bites++;
  }
  assert.ok(bites > 60 && bites < 120, `mordidas ${bites}/300`);
});

test('saque: só 20% do que não é protegido; snapshot sem canteiros e sem obra', () => {
  const s = newFarm(T0); s.res = { grains: 1000, ration: 500, planks: 2000 };
  assert.deepEqual(lootable(s), { grains: 160, ration: 80, planks: 320 });
  act(s, { type: 'build', building: 'silo', x: 2, y: 2 }, T0);
  const snap = baseSnapshot(s); assert.ok(snap.every((b) => b.type !== 'canteiro' && b.type !== 'silo')); assert.equal(snap.length, 6);
});
