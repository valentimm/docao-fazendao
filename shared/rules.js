// Docão Fazendão: regras e números de balanceamento (cliente + servidor usam o MESMO arquivo).
// Timers curtos de propósito: v1 é pra playtest entre amigos, ninguém espera 5 dias por upgrade.
export const GRID = 30;            // grid 30x30 tiles (briefing fala 40x40; v1 libera 30x30)
export const BUILDERS = 2;         // Porcos Construtores: 2 obras ao mesmo tempo
export const START_RES = { grains: 300, ration: 250, planks: 1500 };
export const BASE_CAP = 3000;      // teto do depósito sem Silo (cada recurso)
export const PROTECTED = 20;       // % do depósito que o Celeiro protege de saque
export const LOOT_PCT = 20;        // saque máximo: 20% do não protegido, proporcional à destruição
export const RES = ['grains', 'ration', 'planks'];
export const RES_NAME = { grains: 'Grãos', ration: 'Ração', planks: 'Tábuas' };

// cost[i] = tábuas pra chegar no nível i+1 (cost[0] = construir); time[i] em segundos; count[c-1] = quantas com Celeiro c
export const BUILDINGS = {
  celeiro:    { name: 'Celeiro', size: 4, max: 5, unlock: 1, count: [1, 1, 1, 1, 1], cost: [0, 800, 2500, 6000, 12000], time: [0, 60, 180, 600, 1200], hp: [1500, 1900, 2400, 3000, 3700],
                desc: 'A prefeitura do chiqueiro. Define o nível máximo de tudo e protege 20% do depósito.' },
  canteiro:   { name: 'Canteiro', size: 2, max: 1, unlock: 1, count: [6, 8, 10, 12, 14], cost: [30], time: [0], hp: [150],
                desc: 'Planta uma cultura por vez. Vizinho pode roubar se você demorar pra colher.' },
  serraria:   { name: 'Serraria', size: 3, max: 5, unlock: 1, count: [1, 2, 2, 3, 3], cost: [200, 500, 1200, 2500, 5000], time: [20, 60, 180, 480, 900], hp: [400, 480, 570, 680, 800],
                rate: [600, 900, 1300, 1800, 2400], cap: [1200, 2500, 4500, 7000, 10000], makes: 'planks',
                desc: 'Gera tábuas sozinha, mesmo com você offline. Enche e para: volta pra coletar.' },
  racao:      { name: 'Fábrica de Ração', size: 3, max: 5, unlock: 1, count: [1, 1, 2, 2, 2], cost: [250, 600, 1400, 2800, 5500], time: [20, 60, 180, 480, 900], hp: [400, 480, 570, 680, 800],
                rate: [300, 450, 650, 900, 1200], cap: [600, 1200, 2000, 3200, 5000], makes: 'ration', eats: 2,
                desc: 'Transforma 2 grãos do depósito em 1 ração, sozinha. Sem grão, sem ração.' },
  silo:       { name: 'Silo', size: 3, max: 5, unlock: 1, count: [1, 1, 2, 2, 3], cost: [300, 700, 1600, 3200, 6000], time: [20, 60, 180, 480, 900], hp: [500, 600, 720, 860, 1000],
                store: [2000, 4000, 7000, 11000, 16000],
                desc: 'Aumenta o teto de grãos, ração e tábuas do depósito.' },
  quartel:    { name: 'Chiqueiro-Quartel', size: 3, max: 3, unlock: 1, count: [1, 1, 1, 1, 1], cost: [150, 1000, 3000], time: [10, 120, 400], hp: [450, 550, 650],
                speed: [0, 15, 30],
                desc: 'Treina a tropa. Cada nível treina mais rápido (−15% / −30%).' },
  acampamento:{ name: 'Acampamento de Lama', size: 4, max: 5, unlock: 1, count: [1, 1, 1, 2, 2], cost: [150, 600, 1500, 3000, 6000], time: [10, 60, 180, 480, 900], hp: [400, 470, 540, 620, 700],
                housing: [20, 30, 40, 50, 60],
                desc: 'Onde a tropa espera o ataque, chafurdando. Define quantos espaços de exército você tem.' },
  torre:      { name: 'Torre do Milho', size: 2, max: 5, unlock: 1, count: [1, 2, 2, 3, 4], cost: [250, 600, 1500, 3000, 6000], time: [15, 60, 180, 480, 900], hp: [420, 500, 590, 690, 800],
                def: { range: 7000, dmg: [22, 28, 35, 43, 52], cd: 8 },
                desc: 'Canhão de espiga. Atira milho em quem invade, até 7 tiles.' },
  casinha:    { name: 'Casinha do Cachorro', size: 2, max: 3, unlock: 2, count: [0, 1, 1, 2, 2], cost: [400, 1200, 3000], time: [20, 120, 400], hp: [500, 600, 720],
                def: { range: 3000, dmg: [30, 38, 46], cd: 4 },
                desc: 'O Caramelo morde quem chega perto no ataque e tem 30% de chance de morder ladrão de canteiro.' },
};
export const BUILD_ORDER = ['canteiro', 'serraria', 'racao', 'silo', 'torre', 'casinha', 'acampamento', 'quartel'];

// culturas (time em s, seed e yield em grãos)
export const CROPS = {
  milho:    { name: 'Milho', time: 60, seed: 3, yield: 30, unlock: 1, color: '#f2c12e' },
  mandioca: { name: 'Mandioca', time: 240, seed: 15, yield: 150, unlock: 1, color: '#8a5a2b' },
  abobora:  { name: 'Abóbora', time: 600, seed: 50, yield: 500, unlock: 2, color: '#f07c1a' },
  cana:     { name: 'Cana', time: 1800, seed: 90, yield: 900, unlock: 3, color: '#7fbf3f' },
};
export const STEAL = { pct: 10, maxPct: 30, perDay: 20, bitePct: 30 };

// tropas: hp, dmg por golpe, cd em ticks (10 ticks = 1 s), range e speed em milésimos de tile (speed por tick)
export const UNITS = {
  leitao:   { name: 'Leitãozinho', space: 1, hp: 120, dmg: 18, cd: 10, range: 600, speed: 200, pref: 'any', cost: 25, time: 5, unlock: 1,
              desc: 'Rápido e barato. Morde qualquer coisa que estiver perto.' },
  atirador: { name: 'Porco-Espinho Atirador', space: 1, hp: 60, dmg: 14, cd: 10, range: 3500, speed: 150, pref: 'any', cost: 50, time: 8, unlock: 1,
              desc: 'Atira espinho de longe (3,5 tiles). Frágil, fica atrás.' },
  javali:   { name: 'Javali Tanque', space: 5, hp: 900, dmg: 22, cd: 10, range: 700, speed: 100, pref: 'def', cost: 250, time: 30, unlock: 2,
              desc: 'Lento e parrudo. Vai direto nas defesas e aguenta o milho na cara.' },
  bomba:    { name: 'Leitão-Bomba', space: 2, hp: 40, dmg: 600, cd: 1, range: 500, speed: 200, pref: 'any', blast: 1600, cost: 100, time: 20, unlock: 3,
              desc: 'Corre pro prédio mais perto e explode (600 em área). Só ida, sem volta.' },
};
export const UNIT_ORDER = ['leitao', 'atirador', 'javali', 'bomba'];
export const ATTACK = { cost: 30, maxTicks: 1800, tps: 10, ttl: 5 * 60 * 1000, lock: 5 * 60 * 1000, maxCmds: 120, perDay: 60, shieldH: [0, 4, 6, 8] };

export const lvlVal = (arr, lvl) => arr[Math.max(0, Math.min(arr.length - 1, lvl - 1))];

// ---------- guildas ----------
export const GUILD = {
  max: 3,                                   // teto duro de membros
  cost: { planks: 200, grains: 50 },        // custo pra fundar (recurso da fazenda)
  emblems: ['🐷', '🐗', '🌽', '🥕', '🎃', '🐔', '🐄', '🚜', '🌻', '🍎', '🐶', '🥔'],
  colors: ['#e7708a', '#8b5a2b', '#f2b134', '#5aa83a', '#3f8fd2', '#8e5bd1'],
  nameMin: 3, nameMax: 20, chatMax: 200, chatGapMs: 1500, requestsMax: 5,
};
// "Os Porcões " → "os porcoes" (nome único sem diferença de caixa/acento/espaço)
export const guildKey = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function guildNameErr(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (n.length < GUILD.nameMin || n.length > GUILD.nameMax) return `Nome com ${GUILD.nameMin} a ${GUILD.nameMax} letras`;
  if (!/^[\p{L}\p{N} '._-]+$/u.test(n)) return 'Só letras, números, espaço e . _ -';
  return '';
}
