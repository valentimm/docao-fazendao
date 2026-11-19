// Docão Fazendão: cliente. Login da conta Docão (Shooter), fazenda, construir, plantar/colher, treinar, roubar e atacar.
import { World } from './scene.js';
import { hpBar, setBar } from './scene.js';
import { BUILDINGS, BUILD_ORDER, CROPS, UNITS, UNIT_ORDER, ATTACK, STEAL, GRID, lvlVal, GUILD } from '../shared/rules.js';
import { settle, caps, housing, armySpace, celeiroLvl, countOf, maxCount, canPlace, busyCount, fmtDur } from '../shared/economy.js';
import { Battle, deployOk } from '../shared/sim.js';

const q = new URLSearchParams(location.search);
const FARM_API = (q.get('api') || 'https://docao-fazenda-api.valentimm.workers.dev').replace(/\/+$/, '');
const AUTH_API = (q.get('auth') || 'https://docao-shooter-server.valentimm.workers.dev').replace(/\/+$/, '');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (n) => Math.floor(n || 0).toLocaleString('pt-BR');
const CROP_EMO = { milho: '🌽', mandioca: '🥔', abobora: '🎃', cana: '🎋' };
const UNIT_EMO = { leitao: '🐷', atirador: '🦔', javali: '🐗', bomba: '💣' };
const B_EMO = { celeiro: '🏚️', canteiro: '🟫', serraria: '🪚', racao: '🏭', silo: '🛢️', quartel: '🐖', acampamento: '⛺', torre: '🌽', casinha: '🐶' };

let token = localStorage.getItem('fz_token') || '';
let S = null, ME = null, offset = 0, mode = 'home', sel = null, place = null, visitFarm = null, battle = null, sheetKind = null;
const now = () => Date.now() + offset;
const world = new World($('#world'), (p, e) => onTap(p, e));
world.onHover = (p) => { if (place) movePlace(p); };

// ---------- API ----------
async function api(path, body, base = FARM_API) {
  let r; try { r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { return { ok: false, error: 'Sem conexão com a fazenda. Tenta de novo.' }; }
  let j = {}; try { j = await r.json(); } catch (e) { /* */ }
  if (r.status === 401 && base === FARM_API) { showLogin('Sua sessão venceu. Entra de novo.'); }
  return { status: r.status, ok: r.ok && j.ok !== false, ...j };
}
function absorb(r) { if (r.state) S = r.state; if (r.me) ME = r.me; if (r.now) offset = r.now - Date.now(); refresh(); }

// ---------- login ----------
let registering = false;
function showLogin(msg = '') { $('#login').classList.remove('hidden'); $('#hud').classList.add('hidden'); $('#dock').classList.add('hidden'); $('#l-err').textContent = msg; }
$('#l-toggle').onclick = () => { registering = !registering; $('#l-pass2').classList.toggle('hidden', !registering); $('#l-go').textContent = registering ? 'Criar conta e entrar' : 'Entrar'; $('#l-toggle').textContent = registering ? 'Já tenho conta' : 'Não tem conta? Criar agora'; $('#l-err').textContent = ''; };
$('#login-form').onsubmit = async (e) => {
  e.preventDefault(); const nick = $('#l-nick').value.trim(), password = $('#l-pass').value;
  if (registering && password !== $('#l-pass2').value) { $('#l-err').textContent = 'As senhas não batem'; return; }
  $('#l-go').disabled = true; $('#l-err').textContent = '';
  const r = await api(registering ? '/api/auth/register' : '/api/auth/login', { nick, password }, AUTH_API); $('#l-go').disabled = false;
  if (!r.token) { $('#l-err').textContent = r.error || 'Não deu pra entrar'; return; }
  token = r.token; localStorage.setItem('fz_token', token); $('#l-pass').value = ''; $('#l-pass2').value = ''; await boot();
};
async function boot() {
  if (!token) return showLogin();
  const r = await api('/api/farm/me'); if (!r.ok) { if (r.status !== 401) showLogin(r.error); return; }
  absorb(r); $('#login').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#dock').classList.remove('hidden');
  $('#wall-dot').classList.toggle('hidden', !r.wall24h);
  goHome(); if (!localStorage.getItem('fz_intro')) { localStorage.setItem('fz_intro', '1'); intro(); }
}
function intro() {
  modal(`<div class="logo">🐷👒</div><h2>Bem-vindo ao Fazendão, ${esc(ME.nick)}!</h2><p class="desc">Você herdou um chiqueiro. Planta milho nos canteiros, coleta as tábuas da Serraria, treina porco e vai saquear a fazenda dos outros.</p>
    <p class="desc">Tudo continua andando com você offline. Se demorar pra colher, o vizinho rouba. 🤚</p><button class="ok" data-close>Bora!</button>`);
}

// ---------- HUD ----------
function local() { return S ? settle(JSON.parse(JSON.stringify(S)), now()) : null; }
function refresh() {
  const s = local(); if (!s || !ME) return; const c = caps(s);
  $('#nick').textContent = ME.nick; $('#lvl').textContent = `Celeiro ${celeiroLvl(s)} · 🐷 ${armySpace(s, false)}/${housing(s)}`;
  for (const r of ['grains', 'ration', 'planks']) { $('#r-' + r).textContent = n0(s.res[r]); $('#c-' + r).textContent = '/' + n0(c[r]); const f = $('#f-' + r), k = Math.min(1, s.res[r] / c[r]); f.style.width = (k * 100).toFixed(1) + '%'; f.classList.toggle('full', k >= 0.98); }
  $('#r-trophies').textContent = n0(s.trophies); $('#r-coins').textContent = n0(ME.coins);
  if (mode === 'home' || mode === 'place') { world.sync(s.buildings, now()); icons(s); world.setCampTroops(s.army, s.buildings); }
  if (sheetKind) renderSheet(sheetKind, true);
}
function icons(s) {
  const t = now();
  for (const b of s.buildings) {
    const d = BUILDINGS[b.type];
    if (b.busyUntil > t) world.setIcon(b.id, '🔨', '#ffe08a');
    else if (b.type === 'canteiro') world.setIcon(b.id, b.crop && t >= b.readyAt ? CROP_EMO[b.crop] : !b.crop ? '🌱' : '', b.crop ? '#c8f7a8' : '#ffffff');
    else if (d.makes) world.setIcon(b.id, b.store >= Math.max(10, lvlVal(d.cap, b.lvl) * 0.05) ? (d.makes === 'planks' ? '🪵' : '🥣') : '', b.store >= lvlVal(d.cap, b.lvl) ? '#ffb3a7' : '#ffffff');
    else if (b.type === 'quartel' && s.queue.length) world.setIcon(b.id, '🐷', '#ffd6e0');
    else world.setIcon(b.id, '');
  }
}
setInterval(() => { if (mode === 'home' || mode === 'place') refresh(); else if (mode === 'visit' && visitFarm) world.sync(visitFarm.buildings, now()); }, 1000);

// ---------- toasts / floats / modal ----------
function toast(msg, kind = '') { const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = msg; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2600); }
function float(text, b) { const n = BUILDINGS[b.type].size; const p = world.toScreen(b.x + n / 2, 2.5, b.y + n / 2); const d = document.createElement('div'); d.className = 'float'; d.textContent = text; d.style.left = p.x + 'px'; d.style.top = p.y + 'px'; $('#floats').appendChild(d); setTimeout(() => d.remove(), 1400); }
function modal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target.id === 'modal') $('#modal').classList.add('hidden'); });

// ---------- ações ----------
async function act(a, b) {
  const r = await api('/api/farm/act', a);
  if (!r.ok) { toast(r.error || 'Não deu', 'bad'); return r; }
  absorb(r); if (r.msg) toast(r.msg, 'good');
  if (r.gain && b) { for (const k in r.gain) float(`+${n0(r.gain[k])} ${k === 'grains' ? '🌾' : k === 'planks' ? '🪵' : '🥣'}`, b); const n = BUILDINGS[b.type].size, k0 = Object.keys(r.gain)[0]; world.burst(b.x + n / 2, b.y + n / 2, k0 === 'grains' ? '#ffd23f' : k0 === 'planks' ? '#c08850' : '#ffb38a', 12, n > 2 ? 2.2 : 1); }
  else if (b && (a.type === 'build' || a.type === 'upgrade' || a.type === 'move' || a.type === 'plant')) { const n = BUILDINGS[b.type || a.building].size; world.puff(b.x + n / 2, b.y + n / 2, '#fff6d8', n * 0.6); }
  return r;
}

// ---------- folha de baixo ----------
function openSheet(kind) { sheetKind = kind; $('#sheet').classList.remove('hidden'); renderSheet(kind); }
function closeSheet() { sheetKind = null; sel = null; world.highlight(0); $('#sheet').classList.add('hidden'); }
$('#sheet-x').onclick = closeSheet;
document.querySelectorAll('#dock button').forEach((b) => b.onclick = () => { if (mode !== 'home') return; const k = b.dataset.open; if (sheetKind === k) return closeSheet(); sel = null; world.highlight(0); openSheet(k); });

function renderSheet(kind, soft = false) {
  const s = local(); if (!s) return; const t = now(); let h = '';
  const body = $('#sheet-body');
  if (soft && (kind === 'neighbors' || kind === 'wall' || kind === 'guild')) return;
  if (kind === 'building') {
    const b = s.buildings.find((x) => x.id === sel); if (!b) return closeSheet(); const d = BUILDINGS[b.type]; const busy = b.busyUntil > t;
    h += `<h2>${B_EMO[b.type]} ${d.name} <span class="tag">${b.lvl < 1 ? 'em obra' : 'nível ' + b.lvl}</span></h2><p class="desc">${d.desc}</p>`;
    if (busy) { const tot = (lvlVal(d.time, b.nextLvl) || 1) * 1000; h += `<p><b>🔨 Obra pro nível ${b.nextLvl}:</b> falta ${fmtDur((b.busyUntil - t) / 1000)}</p><div class="bar"><i style="width:${Math.min(100, 100 - (b.busyUntil - t) / tot * 100)}%"></i></div>`; }
    if (b.type === 'canteiro' && b.lvl >= 1) {
      if (!b.crop) { h += `<h3>O que plantar?</h3><div class="grid">` + Object.entries(CROPS).map(([k, c]) => { const lock = celeiroLvl(s) < c.unlock;
        return `<div class="card2 ${lock ? 'locked' : ''}"><b>${CROP_EMO[k]} ${c.name}</b><small>${fmtDur(c.time)} · rende ${c.yield} 🌾<br>semente ${c.seed} 🌾</small><div class="btns"><button ${lock ? 'disabled' : ''} data-plant="${k}">${lock ? 'Celeiro ' + c.unlock : 'Plantar'}</button></div></div>`; }).join('') + '</div>'; }
      else { const c = CROPS[b.crop], ready = t >= b.readyAt, k = Math.min(100, (t - b.plantedAt) / (b.readyAt - b.plantedAt) * 100);
        h += `<p><b>${CROP_EMO[b.crop]} ${c.name}</b> ${ready ? '— pronto pra colher!' : `— falta ${fmtDur((b.readyAt - t) / 1000)}`}${b.stolenPct ? ` · roubaram ${b.stolenPct}% 🐷` : ''}</p><div class="bar"><i style="width:${k}%"></i></div>
          <div class="row"><button class="ok" ${ready ? '' : 'disabled'} data-harvest>Colher ${Math.floor(c.yield * (100 - (b.stolenPct | 0)) / 100)} 🌾</button></div>`; }
    }
    if (d.makes && b.lvl >= 1) { const cap = lvlVal(d.cap, b.lvl); h += `<dl class="kv"><dt>Guardado</dt><dd>${n0(b.store)} / ${n0(cap)} ${d.makes === 'planks' ? '🪵' : '🥣'}</dd><dt>Produção</dt><dd>${n0(lvlVal(d.rate, b.lvl))}/h${d.eats ? ` (come ${d.eats} 🌾 cada)` : ''}</dd></dl>
        <div class="bar"><i style="width:${b.store / cap * 100}%"></i></div><div class="row"><button class="ok" ${b.store ? '' : 'disabled'} data-collect>Coletar</button></div>`; }
    if (b.type === 'silo' && b.lvl >= 1) h += `<dl class="kv"><dt>Teto extra</dt><dd>+${n0(lvlVal(d.store, b.lvl))} de cada recurso</dd></dl>`;
    if (b.type === 'acampamento' && b.lvl >= 1) h += `<dl class="kv"><dt>Espaço</dt><dd>${lvlVal(d.housing, b.lvl)} 🐷</dd></dl>`;
    if (b.type === 'quartel' && b.lvl >= 1) h += `<div class="row"><button class="ok" data-goto="army">🐷 Treinar tropa</button></div>`;
    if (d.def && b.lvl >= 1) h += `<dl class="kv"><dt>Dano</dt><dd>${lvlVal(d.def.dmg, b.lvl)} a cada ${(d.def.cd + 1) / 10}s</dd><dt>Alcance</dt><dd>${d.def.range / 1000} tiles</dd></dl>`;
    if (b.type === 'celeiro') { const c = caps(s); h += `<dl class="kv"><dt>Depósito</dt><dd>${n0(c.grains)} de cada</dd><dt>Construtores</dt><dd>${busyCount(s, t)}/2 ocupados</dd><dt>Protegido</dt><dd>20% do depósito</dd></dl>`; }
    const can = !busy && b.lvl < d.max && (b.type === 'celeiro' || b.lvl + 1 <= celeiroLvl(s)) && s.res.planks >= (d.cost[b.lvl] || 0), cost = d.cost[b.lvl], tm = d.time[b.lvl];
    if (b.lvl >= 1) h += `<div class="row">${b.lvl < d.max ? `<button ${can ? '' : 'disabled'} data-upgrade>⬆️ Nível ${b.lvl + 1} · ${n0(cost)} 🪵 · ${fmtDur(tm)}</button>` : '<span class="tag">nível máximo</span>'}<button class="ghost" data-move>↔️ Mover</button></div>`;
    if (b.lvl >= 1 && b.lvl < d.max && b.type !== 'celeiro' && b.lvl + 1 > celeiroLvl(s)) h += `<small>Precisa do Celeiro ${b.lvl + 1} antes.</small>`;
  } else if (kind === 'build') {
    h += `<h2>🏗️ Construir</h2><p class="desc">Porcos Construtores: ${busyCount(s, t)}/2 ocupados · 🪵 ${n0(s.res.planks)}</p><div class="grid">`;
    for (const k of BUILD_ORDER) { const d = BUILDINGS[k], have = countOf(s, k), max = maxCount(s, k), lock = celeiroLvl(s) < d.unlock, full = have >= max;
      h += `<div class="card2 ${lock || full ? 'locked' : ''}"><b>${B_EMO[k]} ${d.name}</b><small>${d.desc}</small><small>${have}/${max} · ${n0(d.cost[0])} 🪵${d.time[0] ? ' · ' + fmtDur(d.time[0]) : ''}</small><div class="btns"><button ${lock || full ? 'disabled' : ''} data-build="${k}">${lock ? 'Celeiro ' + d.unlock : full ? 'Limite' : 'Construir'}</button></div></div>`; }
    h += '</div>';
  } else if (kind === 'army') {
    const hs = housing(s), sp = armySpace(s);
    h += `<h2>🐷 Exército</h2><p class="desc">Acampamento: ${sp}/${hs} espaços (com a fila) · 🥣 ${n0(s.res.ration)}</p>`;
    h += `<div class="row">` + UNIT_ORDER.map((u) => `<span class="tag">${UNIT_EMO[u]} ${s.army[u] | 0}</span>`).join('') + `</div>`;
    if (s.queue.length) { const q0 = s.queue[0]; h += `<p>Na fila: ${s.queue.length} · próximo ${UNIT_EMO[q0.unit]} em ${fmtDur((q0.endAt - t) / 1000)} · tudo pronto em ${fmtDur((s.queue[s.queue.length - 1].endAt - t) / 1000)}</p>`; }
    h += `<div class="grid">` + UNIT_ORDER.map((k) => { const u = UNITS[k], lock = celeiroLvl(s) < u.unlock;
      return `<div class="card2 ${lock ? 'locked' : ''}"><b>${UNIT_EMO[k]} ${u.name}</b><small>${u.desc}</small><small>❤️ ${u.hp} · 💥 ${u.blast ? u.dmg + ' área' : u.dmg} · 📦 ${u.space} · ${u.cost} 🥣 · ${u.time}s</small>
        <div class="btns"><button ${lock ? 'disabled' : ''} data-train="${k}" data-n="1">${lock ? 'Celeiro ' + u.unlock : '+1'}</button>${lock ? '' : `<button data-train="${k}" data-n="5">+5</button>`}</div></div>`; }).join('') + '</div>';
  } else if (kind === 'attack') {
    let n = 0; for (const u in s.army) n += s.army[u] | 0;
    h += `<h2>⚔️ Atacar</h2><p class="desc">Você joga contra uma cópia congelada da base. O servidor refaz a batalha inteira pra conferir. Tropa lançada não volta. Buscar alvo custa ${ATTACK.cost} 🥣.</p>
      <div class="row">` + UNIT_ORDER.map((u) => `<span class="tag">${UNIT_EMO[u]} ${s.army[u] | 0}</span>`).join('') + `</div>
      <div class="grid"><div class="card2"><b>🤖 Base de bot</b><small>Sempre tem alvo. Saque garantido se destruir.</small><div class="btns"><button class="ok" ${n ? '' : 'disabled'} data-attack="bot">Atacar bot</button></div></div>
      <div class="card2"><b>🐷 Fazenda de jogador</b><small>Alguém com medalhas parecidas e sem escudo. Se não tiver ninguém, cai num bot.</small><div class="btns"><button class="danger" ${n ? '' : 'disabled'} data-attack="pvp">Buscar jogador</button></div></div></div>
      ${n ? '' : '<p><b>Sem tropa!</b> Treine no Chiqueiro-Quartel.</p>'}<p class="desc">Ataques hoje: ${s.day.finds | 0}/${ATTACK.perDay} · ${s.shieldUntil > t ? `🛡️ escudo por ${fmtDur((s.shieldUntil - t) / 1000)} (atacar tira)` : 'sem escudo'}</p>`;
  } else if (kind === 'neighbors') { h += `<h2>🤚 Vizinhos</h2><p class="desc">Canteiro pronto e não colhido pode ser roubado: ${STEAL.pct}% por visita, no máximo ${STEAL.maxPct}%. Cuidado com o cachorro.</p><div id="nb-list">Carregando…</div>`; loadNeighbors(); }
  else if (kind === 'guild') { h += `<div id="guild-box">Carregando…</div>`; body.innerHTML = h; loadGuild(); return; }
  else if (kind === 'wall') { h += `<h2>📜 Mural</h2><div id="wall-list">Carregando…</div>`; loadWall(); }
  body.innerHTML = h;
}
async function loadNeighbors() {
  const r = await api('/api/farm/neighbors'); const el = $('#nb-list'); if (!el) return; if (!r.ok) { el.textContent = r.error; return; }
  const row = (p) => `<div class="it"><div><b>${p.bot ? '🤖' : p.guild ? '🤝' : '🐷'} ${esc(p.nick)}${p.guild ? ' <span class="tag">guilda</span>' : ''}</b><small>Celeiro ${p.level}${p.trophies != null ? ` · 🏅 ${p.trophies}` : ''} · ${p.guild ? 'colega de guilda (não se rouba)' : p.ready ? `🤚 ${p.ready} canteiro(s) dando sopa` : 'nada pra roubar agora'}</small></div><button ${p.ready ? 'class="ok"' : 'class="ghost"'} data-visit="${esc(p.who)}">Visitar</button></div>`;
  el.innerHTML = `<p class="desc">Roubos restantes hoje: <b>${r.stealsLeft}/${STEAL.perDay}</b></p><h3>Jogadores</h3><div class="list">${r.players.length ? r.players.map(row).join('') : '<small>Ninguém mais jogando ainda. Chama a galera!</small>'}</div><h3>Fazendas de bot</h3><div class="list">${r.bots.map(row).join('')}</div>`;
}
async function loadWall() {
  const [w, a, rk] = await Promise.all([api('/api/farm/wall'), api('/api/farm/attacks'), api('/api/farm/rank')]); const el = $('#wall-list'); if (!el) return;
  const ago = (ts) => { const m = Math.floor((now() - ts) / 60000); return m < 1 ? 'agora' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
  const txt = (e) => e.kind === 'steal' ? `<b>${esc(e.actor)}</b> roubou ${e.amount} grãos do seu ${CROPS[e.crop] ? CROPS[e.crop].name : e.crop} 🐷` : e.kind === 'bite' ? `O Caramelo mordeu <b>${esc(e.actor)}</b> tentando roubar seu ${CROPS[e.crop] ? CROPS[e.crop].name : ''} 🐶` : `<b>${esc(e.actor)}</b> atacou sua fazenda: ${'★'.repeat(e.stars)}${'☆'.repeat(3 - e.stars)} ${e.pct}% · levou ${n0(e.loot.grains)}🌾 ${n0(e.loot.ration)}🥣 ${n0(e.loot.planks)}🪵`;
  el.innerHTML = `<div class="list">${(w.wall || []).length ? w.wall.map((e) => `<div class="it"><div>${txt(e)}<small>${ago(e.at)}</small></div></div>`).join('') : '<small>Nada ainda. Ninguém mexeu no seu chiqueiro.</small>'}</div>
    <h3>Seus ataques</h3><div class="list">${(a.attacks || []).length ? a.attacks.map((x) => `<div class="it"><div><b>${esc(x.target)}</b> ${'★'.repeat(x.stars | 0)}${'☆'.repeat(3 - (x.stars | 0))} ${x.pct}%<small>+${n0(x.loot && x.loot.grains)}🌾 +${n0(x.loot && x.loot.ration)}🥣 +${n0(x.loot && x.loot.planks)}🪵 · ${x.trophies > 0 ? '+' : ''}${x.trophies}🏅 · ${ago(x.at)}</small></div></div>`).join('') : '<small>Nenhum ainda.</small>'}</div>
    <h3>🏅 Ranking de Medalhas de Lama</h3><div class="list">${(rk.rows || []).map((r, i) => `<div class="it"><div><b>${i + 1}. ${esc(r.nick)}</b><small>Celeiro ${r.level}</small></div><span class="tag">🏅 ${r.trophies}</span></div>`).join('')}</div>`;
  $('#wall-dot').classList.add('hidden');
}

$('#sheet-body').addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t || t.disabled || t.dataset.g) return; const s = local(); const b = s && s.buildings.find((x) => x.id === sel);
  if (t.dataset.plant) await act({ type: 'plant', id: sel, crop: t.dataset.plant }, b);
  else if ('harvest' in t.dataset) await act({ type: 'harvest', id: sel }, b);
  else if ('collect' in t.dataset) await act({ type: 'collect', id: sel }, b);
  else if ('upgrade' in t.dataset) await act({ type: 'upgrade', id: sel }, b);
  else if ('move' in t.dataset) startPlace(b.type, b);
  else if (t.dataset.goto) { sel = null; world.highlight(0); openSheet(t.dataset.goto); }
  else if (t.dataset.build) startPlace(t.dataset.build);
  else if (t.dataset.train) await act({ type: 'train', unit: t.dataset.train, n: +t.dataset.n });
  else if (t.dataset.attack) { t.disabled = true; await startAttack(t.dataset.attack); }
  else if (t.dataset.visit) await startVisit(t.dataset.visit);
  renderSheet(sheetKind || 'building', false);
});

// ---------- guilda ----------
let G = null, gForm = { emblem: GUILD.emblems[0], color: GUILD.colors[0] }, gSeen = +localStorage.getItem('fz_gseen') || 0, gBusy = false;
const ago2 = (ts) => { const m = Math.floor((now() - ts) / 60000); return m < 1 ? 'agora' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
const badge = (g, sm) => `<span class="g-badge ${sm ? 'sm' : ''}" style="background:${esc(g.color)}">${esc(g.emblem)}</span>`;
async function loadGuild(full = true) {
  const r = await api('/api/farm/guild'); const el = $('#guild-box'); if (!r.ok) { if (el) el.textContent = r.error; return; }
  const keep = el && el.querySelector('#g-text') ? el.querySelector('#g-text').value : ''; G = r; markGuildSeen();
  if (!el || sheetKind !== 'guild') return;
  if (!r.guild) { if (full) renderNoGuild(el); return; }
  if (!full && el.querySelector('#g-chat')) { el.querySelector('#g-top').innerHTML = topHtml(r.guild); el.querySelector('#g-mem').innerHTML = memHtml(r); el.querySelector('#g-req').innerHTML = reqHtml(r); fillChat(r.chat); return; }
  const g = r.guild;
  el.innerHTML = `<div class="g-head" id="g-top">${topHtml(g)}</div>
    <p class="desc">Colega de guilda não se ataca nem se rouba. Dá pra visitar e doar tropa.</p>
    <div class="g-row"><span>Código de convite:</span><span class="g-code">${esc(g.code)}</span><button class="ghost" data-g="copy">Copiar</button></div>
    <h3>Membros</h3><div class="list" id="g-mem">${memHtml(r)}</div><div id="g-req">${reqHtml(r)}</div>
    <h3>💬 Conversa da guilda</h3><div class="g-chat" id="g-chat"></div>
    <form class="g-row" id="g-form" onsubmit="return false"><input id="g-text" maxlength="${GUILD.chatMax}" placeholder="Fala com a guilda…" autocomplete="off"><button class="ok" data-g="send">Enviar</button></form>
    <h3>🏆 Ranking de guildas</h3><div class="list" id="g-rank">Carregando…</div>
    <div class="row" style="margin-top:10px"><button class="danger" data-g="leave">Sair da guilda</button></div>`;
  el.querySelector('#g-text').value = keep; fillChat(r.chat, true); loadGuildRank();
}
const topHtml = (g) => `${badge(g)}<div><h2>${esc(g.name)}</h2><small>🏅 ${n0(g.trophies)} medalhas${g.rank ? ` · #${g.rank} no ranking` : ''} · ${g.members.length}/${g.max} membros</small></div>`;
function memHtml(r) {
  const g = r.guild; return g.members.map((m) => `<div class="it g-mem"><div><b>${m.leader ? '👑 ' : ''}${esc(m.nick)}${m.me ? ' (você)' : ''}</b><small>🏅 ${n0(m.trophies)} · Celeiro ${m.level || 1}${m.me ? '' : ` · ${m.online ? '<i class="on"></i> mexeu agora' : `mexeu na fazenda há ${ago2(m.seen)}`}`}</small></div>
    <div class="btns">${m.me ? '' : `<button class="ghost" data-g="visit" data-v="${esc(m.who)}">🏡 Visitar</button><button class="ghost" data-g="gift" data-v="${m.id}">🎁 Doar</button>${g.iAmLeader ? `<button class="ghost" data-g="lead" data-v="${m.id}">👑</button><button class="danger" data-g="kick" data-v="${m.id}">Expulsar</button>` : ''}`}</div></div>`).join('');
}
function reqHtml(r) { if (!r.requests || !r.requests.length) return ''; return `<h3>Pedidos pra entrar</h3><div class="list">${r.requests.map((q) => `<div class="it"><div><b>${esc(q.nick)}</b><small>${ago2(q.created_at)}</small></div><div class="btns"><button class="ok" data-g="accept" data-v="${q.id}">Aceitar</button><button class="ghost" data-g="reject" data-v="${q.id}">Recusar</button></div></div>`).join('')}</div>`; }
function fillChat(list, force) {
  const box = $('#g-chat'); if (!box) return; const atEnd = force || box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.innerHTML = list.length ? list.map((c) => c.kind === 'sys' ? `<div class="g-sys">${esc(c.text)} · ${ago2(c.at)}</div>` : `<div class="g-msg ${c.me ? 'me' : ''}">${c.me ? '' : `<b>${esc(c.nick)}</b>`}${esc(c.text)} <small>${ago2(c.at)}</small></div>`).join('') : '<div class="g-sys">Ninguém falou nada ainda. Dá um oi!</div>';
  if (atEnd) box.scrollTop = box.scrollHeight;
}
function renderNoGuild(el) {
  const s = local(), cost = GUILD.cost, can = s && s.res.planks >= cost.planks && s.res.grains >= cost.grains;
  const reqs = (G && G.requests) || [];
  el.innerHTML = `<h2>🏰 Guilda</h2><p class="desc">Junte até <b>${GUILD.max}</b> fazendeiros: colega não ataca nem rouba colega, vocês conversam, doam tropa e somam Medalhas de Lama no ranking de guildas.</p>
    <h3>Entrar com código</h3><form class="g-row" onsubmit="return false"><input id="g-code" maxlength="8" placeholder="Ex.: K7PQ2M" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase"><button class="ok" data-g="join">Entrar</button></form>
    ${reqs.length ? `<h3>Seus pedidos</h3><div class="list">${reqs.map((q) => `<div class="it"><div class="g-row">${badge(q, 1)}<b>${esc(q.name)}</b></div><button class="ghost" data-g="cancel" data-v="${q.id}">Cancelar</button></div>`).join('')}</div>` : ''}
    <h3>Procurar guilda</h3><form class="g-row" onsubmit="return false"><input id="g-q" placeholder="Nome da guilda" autocomplete="off"><button class="ghost" data-g="search">🔎</button></form><div class="list" id="g-list" style="margin-top:6px">Carregando…</div>
    <h3>Fundar guilda</h3><div class="card2"><input id="g-name" maxlength="${GUILD.nameMax}" placeholder="Nome (${GUILD.nameMin} a ${GUILD.nameMax} letras)" autocomplete="off">
      <small>Brasão</small><div class="g-pick">${GUILD.emblems.map((e) => `<button data-g="emb" data-v="${e}" class="${e === gForm.emblem ? 'sel' : ''}">${e}</button>`).join('')}</div>
      <small>Cor</small><div class="g-pick">${GUILD.colors.map((c) => `<button data-g="col" data-v="${c}" class="col ${c === gForm.color ? 'sel' : ''}" style="background:${c}" aria-label="cor"></button>`).join('')}</div>
      <div class="btns"><button class="ok" ${can ? '' : 'disabled'} data-g="create">🏰 Fundar · ${n0(cost.planks)} 🪵 + ${n0(cost.grains)} 🌾</button></div></div>
    <h3>🏆 Ranking de guildas</h3><div class="list" id="g-rank">Carregando…</div>`;
  searchGuilds(''); loadGuildRank();
}
async function searchGuilds(q) {
  const r = await api('/api/farm/guild/list?q=' + encodeURIComponent(q)); const el = $('#g-list'); if (!el) return; if (!r.ok) { el.textContent = r.error; return; }
  el.innerHTML = r.rows.length ? r.rows.map((g) => `<div class="it"><div class="g-row">${badge(g, 1)}<div><b>${esc(g.name)}</b><small>${g.members}/${GUILD.max} · 🏅 ${n0(g.trophies)}</small></div></div>${g.asked ? '<span class="tag">pedido enviado</span>' : `<button class="ghost" data-g="request" data-v="${g.id}">Pedir pra entrar</button>`}</div>`).join('') : '<small>Nenhuma guilda com vaga. Funde a sua!</small>';
}
async function loadGuildRank() {
  const r = await api('/api/farm/guild/rank'); const el = $('#g-rank'); if (!el || !r.ok) return;
  el.innerHTML = r.rows.length ? r.rows.map((g, i) => `<div class="it"><div class="g-row"><b>${i + 1}.</b>${badge(g, 1)}<div><b>${esc(g.name)}</b><small>${g.members}/${GUILD.max} membros</small></div></div><span class="tag">🏅 ${n0(g.trophies)}</span></div>`).join('') : '<small>Nenhuma guilda ainda.</small>';
}
function markGuildSeen() { const last = G && G.chat && G.chat.length ? G.chat[G.chat.length - 1].id : 0; if (sheetKind === 'guild' && last > gSeen) { gSeen = last; localStorage.setItem('fz_gseen', gSeen); } $('#guild-dot').classList.toggle('hidden', !(last > gSeen)); }
async function gAct(path, body) { if (gBusy) return; gBusy = true; try { const r = await api('/api/farm/guild/' + path, body); if (!r.ok) { toast(r.error || 'Não deu', 'bad'); return r; } absorb(r); if (r.msg) toast(r.msg, 'good'); await loadGuild(true); return r; } finally { gBusy = false; } }
$('#sheet-body').addEventListener('click', async (e) => {
  const t = e.target.closest('button[data-g]'); if (!t || t.disabled) return; const k = t.dataset.g, v = t.dataset.v;
  if (k === 'emb' || k === 'col') { gForm[k === 'emb' ? 'emblem' : 'color'] = v; t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b === t)); }
  else if (k === 'create') gAct('create', { name: $('#g-name').value, ...gForm });
  else if (k === 'join') gAct('join', { code: $('#g-code').value });
  else if (k === 'search') searchGuilds($('#g-q').value);
  else if (k === 'request') gAct('request', { id: +v });
  else if (k === 'cancel') gAct('cancel', { id: +v });
  else if (k === 'accept' || k === 'reject' || k === 'kick' || k === 'lead') {
    const m = G && G.guild && G.guild.members.find((x) => x.id === +v);
    if (k === 'kick' || k === 'lead') return modal(`<h2>${k === 'kick' ? '🥾 Expulsar' : '👑 Passar liderança'}</h2><p>${k === 'kick' ? `Tirar <b>${esc(m && m.nick)}</b> da guilda?` : `<b>${esc(m && m.nick)}</b> vira o líder e você vira membro.`}</p><div class="row"><button class="${k === 'kick' ? 'danger' : 'ok'}" data-close data-gm="${k === 'kick' ? 'kick' : 'leader'}" data-v="${v}">Confirmar</button><button class="ghost" data-close>Voltar</button></div>`);
    gAct(k, { account: +v });
  }
  else if (k === 'leave') modal(`<h2>Sair da guilda?</h2><p>${G && G.guild && G.guild.members.length === 1 ? 'Você é o último: a guilda acaba.' : G && G.guild && G.guild.iAmLeader ? 'A liderança passa pro membro mais antigo.' : 'Dá pra voltar depois com o código, se tiver vaga.'}</p><div class="row"><button class="danger" data-close data-gm="leave">Sair</button><button class="ghost" data-close>Ficar</button></div>`);
  else if (k === 'send') { const i = $('#g-text'), text = i.value.trim(); if (!text) return; i.value = ''; const r = await api('/api/farm/guild/chat', { text }); if (!r.ok) { toast(r.error, 'bad'); i.value = text; } else loadGuild(false); i.focus(); }
  else if (k === 'copy') { const c = G && G.guild && G.guild.code; try { await navigator.clipboard.writeText(c); toast('Código copiado: ' + c, 'good'); } catch (_) { toast('Código: ' + c); } }
  else if (k === 'visit') startVisit(v);
  else if (k === 'gift') { const s = local(), m = G.guild.members.find((x) => x.id === +v); const have = UNIT_ORDER.filter((u) => (s.army[u] | 0) > 0);
    modal(`<h2>🎁 Doar tropa pro ${esc(m.nick)}</h2><p class="desc">Sai do seu acampamento e vai pro dele (até 10 por dia, se couber lá).</p><div class="grid">${have.length ? have.map((u) => `<div class="card2"><b>${UNIT_EMO[u]} ${UNITS[u].name}</b><small>você tem ${s.army[u]}</small><div class="btns"><button data-gm="donate" data-v="${v}" data-u="${u}" data-n="1">+1</button>${s.army[u] >= 3 ? `<button data-gm="donate" data-v="${v}" data-u="${u}" data-n="3">+3</button>` : ''}</div></div>`).join('') : '<p>Você não tem tropa pronta.</p>'}</div><div class="row"><button class="ghost" data-close>Fechar</button></div>`); }
});
$('#sheet-body').addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const id = e.target.id; if (id === 'g-text' || id === 'g-code' || id === 'g-q') { e.preventDefault(); const b = e.target.parentElement.querySelector('button[data-g]'); if (b) b.click(); } });
$('#modal').addEventListener('click', (e) => { const t = e.target.closest('button[data-gm]'); if (!t) return; const k = t.dataset.gm;
  if (k === 'leave') gAct('leave', {}); else if (k === 'donate') { gAct('donate', { to: +t.dataset.v, unit: t.dataset.u, n: +t.dataset.n }); $('#modal').classList.add('hidden'); } else gAct(k, { account: +t.dataset.v }); });
// conversa por polling: 4 s com a aba aberta, 30 s fechada (só pra bolinha de mensagem nova)
let gTick = 0; setInterval(() => { if (!token || !S) return; gTick++; if (sheetKind === 'guild' && G && G.guild && !gBusy) loadGuild(false); else if (sheetKind !== 'guild' && gTick % 8 === 0) api('/api/farm/guild').then((r) => { if (r.ok) { G = r; markGuildSeen(); } }); }, 4000);

// ---------- toques no mapa ----------
function onTap(p, e) {
  if (mode === 'battle') return deployAt(p);
  if (place) { movePlace(p); confirmPlace(); return; } // estilo CoC: o clique normal já coloca ali
  if (mode === 'visit') { const hit = e && world.pickIcon(e.clientX, e.clientY); const b = hit ? visitFarm.buildings.find((x) => x.id === hit) : world.buildingAt(p); if (b && b.type === 'canteiro') return visitFarm.guild ? toast('É da sua guilda! Colega não se rouba 🤝') : trySteal(b); if (b) toast(BUILDINGS[b.type].name); return; }
  const s = local();
  // bolha em cima do prédio tem prioridade: colhe / coleta na hora
  const hit = e && world.pickIcon(e.clientX, e.clientY);
  if (hit) { const lb = s.buildings.find((x) => x.id === hit); if (lb && quick(lb)) return; }
  const b = world.buildingAt(p);
  if (!b) return closeSheet();
  const lb = s.buildings.find((x) => x.id === b.id);
  if (sel !== lb.id && quick(lb, true)) return;
  sel = lb.id; world.highlight(lb.id); openSheet('building');
}
// 1 toque: colher canteiro pronto, coletar produção, ou abrir o plantio no canteiro vazio
function quick(lb, viaBuilding = false) {
  const t = now(), d = BUILDINGS[lb.type];
  if (lb.busyUntil > t) return false;
  if (lb.type === 'canteiro' && lb.crop && t >= lb.readyAt) { act({ type: 'harvest', id: lb.id }, lb); return true; }
  if (d.makes && lb.store >= (viaBuilding ? 10 : 1)) { act({ type: 'collect', id: lb.id }, lb); return true; }
  if (!viaBuilding && lb.type === 'canteiro' && !lb.crop) { sel = lb.id; world.highlight(lb.id); openSheet('building'); return true; }
  return false;
}

// ---------- construir / mover ----------
function startPlace(type, existing = null) {
  closeSheet(); const s = local(); const n = BUILDINGS[type].size; let spot = null;
  if (existing) spot = { x: existing.x, y: existing.y };
  else for (let r = 0; r < GRID && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dy = -r; dy <= r && !spot; dy++) { const x = 15 - (n >> 1) + dx, y = 15 - (n >> 1) + dy; if (canPlace(s, type, x, y)) spot = { x, y }; }
  if (!spot) return toast('Não tem espaço livre. Mova alguma coisa.', 'bad');
  place = { type, x: spot.x, y: spot.y, id: existing ? existing.id : 0, busy: false }; mode = 'place';
  if (existing) world.hideBuilding(existing.id, true);
  world.setGhost(type, place.x, place.y, canPlace(s, type, place.x, place.y, place.id));
  banner(`${existing ? '↔️ Movendo' : '🏗️'} ${BUILDINGS[type].name}: clique/toque no lugar (verde = cabe) <button class="ghost" id="pl-no">✕ Cancelar</button>`);
  $('#pl-no').onclick = endPlace;
  $('#dock').classList.add('hidden');
}
// tile clicado → canto do prédio, sempre com o tile clicado dentro (sem arredondar pra fora)
function anchorFor(px, pz, n) { const off = (n - 1) >> 1; return { x: Math.floor(px) - off, y: Math.floor(pz) - off }; }
function movePlace(p) { if (place.busy) return; const n = BUILDINGS[place.type].size; const a = anchorFor(p.x, p.z, n); place.x = a.x; place.y = a.y; world.setGhost(place.type, place.x, place.y, canPlace(local(), place.type, place.x, place.y, place.id)); }
async function confirmPlace() {
  const p = place; if (!p || p.busy) return; if (!canPlace(local(), p.type, p.x, p.y, p.id)) return toast('Não cabe aí (vermelho)', 'bad');
  p.busy = true; const x = p.x, y = p.y; // trava a posição: o mouse pode andar enquanto o servidor responde
  const r = p.id ? await act({ type: 'move', id: p.id, x, y }) : await act({ type: 'build', building: p.type, x, y });
  p.busy = false; if (r.ok) { const n = BUILDINGS[p.type].size; world.puff(x + n / 2, y + n / 2, '#fff6d8', n * 0.7); world.burst(x + n / 2, y + n / 2, '#d8b77a', 10, 0.4); endPlace(); }
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && place) endPlace(); });
function endPlace() { if (place && place.id) world.hideBuilding(place.id, false); place = null; mode = 'home'; world.setGhost(null); banner(''); $('#dock').classList.remove('hidden'); refresh(); }
function banner(html) { $('#banner').innerHTML = html; $('#banner').classList.toggle('hidden', !html); }

// ---------- visita e roubo ----------
async function startVisit(who) {
  const r = await api('/api/farm/visit?who=' + encodeURIComponent(who)); if (!r.ok) return toast(r.error, 'bad');
  closeSheet(); mode = 'visit'; visitFarm = r.farm; offset = r.now - Date.now(); world.clear(); world.campVisible(false); world.sync(visitFarm.buildings, now()); visitIcons();
  world.docao.visible = false; if (r.farm.sign) world.setSign(r.farm.sign); else world.setSign(`Fazenda do ${r.farm.nick}`);
  $('#dock').classList.add('hidden'); world.focus(15, 15, innerWidth < 640 ? 1.2 : 0.9);
  banner(`${r.farm.guild ? '🤝' : '🏡'} Visitando <b>${esc(r.farm.nick)}</b> · ${r.farm.guild ? 'colega de guilda' : 'toque no canteiro com 🤚 pra roubar'} <button class="ghost" id="v-home">🏠 Voltar</button>`); $('#v-home').onclick = goHome;
}
function visitIcons() { const t = now(); for (const b of visitFarm.buildings) world.setIcon(b.id, !visitFarm.guild && b.type === 'canteiro' && b.crop && t >= b.readyAt && !b.mine && b.stolenPct + STEAL.pct <= STEAL.maxPct ? '🤚' : '', '#ffe08a'); }
async function trySteal(b) {
  const fb = visitFarm.buildings.find((x) => x.id === b.id); if (!fb.crop) return toast('Canteiro vazio');
  if (now() < fb.readyAt) return toast(`Ainda não está pronto (${fmtDur((fb.readyAt - now()) / 1000)})`);
  const r = await api('/api/farm/steal', { who: visitFarm.who, plot: b.id }); if (!r.ok) return toast(r.error, 'bad');
  absorb(r); fb.mine = true; if (!r.bitten) fb.stolenPct += STEAL.pct; toast(r.msg, r.bitten ? 'bad' : 'good'); float(r.bitten ? '🐶 AU!' : `+${r.amount} 🌾`, fb); visitIcons(); world.burst(fb.x + 1, fb.y + 1, r.bitten ? '#c0392b' : '#ffd23f', 10, 1);
}
function goHome() {
  mode = 'home'; visitFarm = null; battle = null; place = null; banner(''); world.setGhost(null); world.setNoDeploy(null); world.clear(); world.docao.visible = true; world.campVisible(true); world.setSign('Proibido roubar milho, Paulo');
  $('#battle-hud').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#dock').classList.remove('hidden'); world.focus(15, 15.5, innerWidth < 640 ? 1.45 : 1.3); refresh();
}

// ---------- batalha ----------
async function startAttack(kind) {
  const r = await api('/api/farm/attack/start', { kind }); if (!r.ok) return toast(r.error, 'bad');
  absorb(r); closeSheet(); const a = r.attack; if (a.target.fallback) toast('Ninguém disponível agora: caiu numa fazenda de bot', '');
  mode = 'battle'; world.clear(); world.campVisible(false); world.docao.visible = false; world.setSign(a.target.bot ? 'Cuidado: cachorro bravo' : `Chiqueiro do ${a.target.name}`);
  const bt = new Battle(a.base, a.army, a.seed); const fake = a.base.map((b) => ({ ...b, busyUntil: 0 }));
  battle = { a, bt, fake, dead: new Set(), cmds: [], pending: [], acc: 0, speed: 1, sel: UNIT_ORDER.find((u) => a.army[u] > 0), done: false, bars: new Map() };
  world.sync(fake, now()); world.setNoDeploy(a.base); world.focus(15, 15, innerWidth < 640 ? 1.2 : 1.15);
  $('#hud').classList.add('hidden'); $('#dock').classList.add('hidden'); $('#battle-hud').classList.remove('hidden'); $('#b-hint').classList.remove('hidden');
  $('#b-name').textContent = (a.target.bot ? '🤖 ' : '🐷 ') + a.target.name; $('#b-sub').textContent = `Celeiro ${a.target.level} · saque até ${n0(a.loot.grains)}🌾 ${n0(a.loot.ration)}🥣 ${n0(a.loot.planks)}🪵`;
  $('#b-speed').textContent = '1×'; battleUnits(); battleHud();
}
function battleUnits() { const b = battle; $('#b-units').innerHTML = UNIT_ORDER.filter((u) => b.a.army[u] > 0).map((u) => `<button data-u="${u}" class="${b.sel === u ? 'sel' : ''}" ${b.bt.army[u] > 0 ? '' : 'disabled'}><i>${UNIT_EMO[u]}</i><b>×${b.bt.army[u] - b.pending.filter((p) => p.u === u).length}</b><small>${UNITS[u].name.split(' ')[0]}</small></button>`).join(''); }
$('#b-units').addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t || !battle) return; battle.sel = t.dataset.u; battleUnits(); });
$('#b-speed').onclick = () => { if (!battle) return; battle.speed = battle.speed === 1 ? 2 : battle.speed === 2 ? 4 : 1; $('#b-speed').textContent = battle.speed + '×'; };
$('#b-end').onclick = () => { if (battle && !battle.done) finishBattle(); };
function deployAt(p) {
  const b = battle; if (!b || b.done) return; const u = b.sel; const left = (b.bt.army[u] | 0) - b.pending.filter((x) => x.u === u).length;
  if (!u || left <= 0) { const nx = UNIT_ORDER.find((k) => (b.bt.army[k] | 0) - b.pending.filter((x) => x.u === k).length > 0); if (!nx) return toast('Acabou a tropa'); b.sel = nx; return deployAt(p); }
  const x = Math.round(p.x * 1000), y = Math.round(p.z * 1000);
  if (!deployOk(b.a.base, x, y)) { toast('Fora da área! Solte fora do vermelho', 'bad'); return; }
  if (b.cmds.length + b.pending.length >= ATTACK.maxCmds) return toast('Limite de comandos');
  b.pending.push({ u, x, y }); $('#b-hint').classList.add('hidden'); battleUnits();
}
function battleHud() {
  const b = battle, r = b.bt.result(); $('#b-pct').textContent = r.pct + '%'; $('#b-stars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  const left = Math.max(0, ATTACK.maxTicks - b.bt.tick) / 10; $('#b-time').textContent = `⏱ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; $('#b-time').classList.toggle('low', left < 30); $('#b-bar').style.width = r.pct + '%';
}
world.onFrame = (dt) => {
  const b = battle; if (!b || b.done) return; b.acc += dt * b.speed; let steps = 0;
  while (b.acc >= 0.1 && steps < 8) {
    b.acc -= 0.1; steps++; const cmds = b.pending.map((p) => ({ t: b.bt.tick, ...p })); b.pending = []; b.cmds.push(...cmds); b.bt.step(cmds); if (cmds.length) battleUnits();
    for (const ev of b.bt.events) battleFx(ev);
    if (b.bt.over || (b.bt.deployed > 0 && b.bt.alive() === 0 && b.bt.left() === 0 && !b.pending.length)) { finishBattle(); break; }
  }
  world.syncUnits(b.bt.units, Math.min(1, b.acc / 0.1));
  for (const bl of b.bt.blds) { if (bl.dead || bl.hp === bl.maxHp) continue; let bar = b.bars.get(bl.id); const m = world.meshes.get(bl.id); if (!m) continue;
    if (!bar) { bar = hpBar(1.6); const n = BUILDINGS[bl.type].size; bar.position.set(n / 2, n + 0.6, n / 2); m.g.add(bar); b.bars.set(bl.id, bar); } setBar(bar, bl.hp / bl.maxHp, world.camera); }
  if (steps) battleHud();
};
function battleFx(ev) {
  const b = battle; const bl = (id) => b.bt.blds.find((x) => x.id === id), un = (id) => b.bt.units.find((x) => x.id === id);
  if (ev.k === 'shot') { const d = bl(ev.b), u = un(ev.id); if (d && u) { const m = world.meshes.get(d.id); if (m && m.g.userData.aim) m.g.userData.aim.rotation.y = Math.atan2(u.x / 1000 - d.cx / 1000, u.y / 1000 - d.cy / 1000);
    world.shoot(new world.camera.position.constructor(d.cx / 1000, d.type === 'torre' ? 2.2 : 0.8, d.cy / 1000), new world.camera.position.constructor(u.x / 1000, 0.4, u.y / 1000), d.type === 'torre' ? '#ffd23f' : '#d99a4e', d.type === 'torre' ? 0.22 : 0.15); } }
  else if (ev.k === 'atk') { const u = un(ev.id), d = bl(ev.b); if (u && d && u.u === 'atirador') world.shoot(new world.camera.position.constructor(u.x / 1000, 0.6, u.y / 1000), new world.camera.position.constructor(d.cx / 1000, 1, d.cy / 1000), '#3a2a1a', 0.1); else if (u && ev.crit) world.puff(u.x / 1000, u.y / 1000, '#fff3b0', 0.35); }
  else if (ev.k === 'boom') { const d = bl(ev.b); b.dead.add(ev.b); const bar = b.bars.get(ev.b); if (bar) { bar.parent && bar.parent.remove(bar); b.bars.delete(ev.b); } world.sync(b.fake, now(), { dead: b.dead }); if (d) world.puff(d.cx / 1000, d.cy / 1000, '#c9b8a0', 2.2); }
  else if (ev.k === 'blast') world.puff(ev.x / 1000, ev.y / 1000, '#ff8a3d', 2.6);
}
async function finishBattle() {
  const b = battle; if (!b || b.done) return; b.done = true; b.pending = [];
  const mine = b.bt.result(); $('#b-end').disabled = true;
  const r = await api('/api/farm/attack/finish', { id: b.a.id, cmds: b.cmds, end: b.bt.tick, hash: mine.hash }); $('#b-end').disabled = false;
  if (!r.ok) { modal(`<h2>Ops</h2><p>${esc(r.error)}</p><button data-close class="ok" id="res-ok">Voltar pra fazenda</button>`); $('#res-ok').onclick = goHome; return; }
  absorb(r); const x = r.result;
  modal(`<div class="result"><div class="stars">${'★'.repeat(x.stars)}${'☆'.repeat(3 - x.stars)}</div><div class="big">${x.pct}% destruído</div>
    <p>${x.stars ? 'Saqueou o chiqueiro! 🐷' : 'Os porcos voltaram de mãos vazias... 🐽'}</p>
    <div class="row" style="justify-content:center"><span class="tag">+${n0(x.loot.grains)} 🌾</span><span class="tag">+${n0(x.loot.ration)} 🥣</span><span class="tag">+${n0(x.loot.planks)} 🪵</span><span class="tag">${x.trophies > 0 ? '+' : ''}${x.trophies} 🏅</span></div>
    <p class="note">${x.match ? '✅ Servidor refez a batalha e bateu certinho' : '⚠️ O servidor refez a batalha e o resultado oficial é este'} (#${x.hash})</p><button class="ok" data-close id="res-ok">Voltar pra fazenda</button></div>`);
  $('#res-ok').onclick = goHome;
}

window.__fz = { get S() { return S; }, get battle() { return battle; }, world, goHome, startAttack, act };
boot();
