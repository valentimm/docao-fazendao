// Bases e vizinhos de bot: pouca gente jogando ainda, então sempre tem alguém pra atacar e roubar.
// Tudo gerado por semente (mesma semente = mesma base), sem guardar nada no banco.
import { mulberry32 } from './sim.js';
import { canPlace, CROPS } from './economy.js';
import { BUILDINGS } from './rules.js';

export const BOT_NAMES = ['Sítio Pé de Lama', 'Rancho do Tio Bacon', 'Granja Torresmo', 'Chácara Leitão Feliz', 'Fazenda Chiqueirinho', 'Haras do Pernil', 'Sítio Linguiça Toscana', 'Recanto do Porco Espinho'];
export const BOT_SIGNS = ['Proibido roubar milho, Paulo', 'Aqui o Wi-Fi não cai (cai sim)', 'Cuidado: cachorro bravo e porco mais bravo', 'Vende-se torresmo', 'Chiqueiro com carinho', 'Lama premium'];

// base de bot pro nível L (1..5)
export function botBase(L, seed) {
  L = Math.max(1, Math.min(5, L | 0)); const r = mulberry32(seed); const s = { buildings: [] }; let id = 1;
  const put = (type, lvl, tries = 60) => {
    const n = BUILDINGS[type].size;
    for (let k = 0; k < tries; k++) { const span = 8 + L * 2, x = 15 - (span >> 1) + (r() % span) - (n >> 1), y = 15 - (span >> 1) + (r() % span) - (n >> 1);
      if (canPlace(s, type, x, y)) { s.buildings.push({ id: id++, type, lvl, x, y }); return; } }
  };
  s.buildings.push({ id: id++, type: 'celeiro', lvl: L, x: 13, y: 13 });
  const towers = Math.min(4, 1 + Math.floor(L / 2) + (L >= 3 ? 1 : 0)), lv = (b) => Math.max(1, Math.min(BUILDINGS[b].max, L - (r() % 2)));
  for (let i = 0; i < towers; i++) put('torre', lv('torre'));
  if (L >= 2) put('casinha', Math.min(3, lv('casinha')));
  for (const t of ['serraria', 'racao', 'silo', 'quartel', 'acampamento']) put(t, lv(t));
  if (L >= 3) { put('serraria', lv('serraria')); put('silo', lv('silo')); }
  return s.buildings;
}
export const botLoot = (L) => ({ grains: 150 * L + 50, ration: 120 * L + 40, planks: 350 * L + 100 });
export const botTrophies = (L) => (L - 1) * 60 + 20;

// vizinhos bot pra roubo: 6 canteiros sempre prontos, mudam por dia
export function botFarm(i, day) {
  const seed = (i + 1) * 7919 + Number(day.replace(/-/g, '')); const r = mulberry32(seed); const crops = Object.keys(CROPS).slice(0, 3);
  const L = 1 + (i % 3);
  const base = botBase(L, seed).map((b) => ({ ...b, busyUntil: 0, nextLvl: 0, store: 0 }));
  const s = { buildings: base, res: { grains: 0, ration: 0, planks: 0 }, stats: {}, day: { d: day, steals: 0, stolen: {} } };
  const spots = [[4, 4], [6, 4], [4, 6], [6, 6], [22, 22], [24, 22]]; let id = 100;
  for (const [x, y] of spots) if (canPlace(s, 'canteiro', x, y)) s.buildings.push({ id: id++, type: 'canteiro', lvl: 1, x, y, crop: crops[r() % crops.length], plantedAt: 1, readyAt: 1, stolenPct: 0, thieves: [] });
  return { key: `bot:${i}`, nick: BOT_NAMES[i % BOT_NAMES.length], sign: BOT_SIGNS[i % BOT_SIGNS.length], level: L, state: s };
}
export const BOT_NEIGHBORS = 3;
