// Cena three.js: câmera isométrica ortográfica, arrastar/zoom/pinça, prédios, Docão passeando e tropas na batalha.
// Só desenha: a lógica (economia e batalha) vive em /shared e não conhece a cena.
import * as THREE from 'three';
import { GRID, BUILDINGS, CROPS, UNITS } from '../shared/rules.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { makeBuilding, makeScaffold, makeRubble, makeCrops, makeDocao, makeUnit, makeTree, makeSign, makeRock, makeBush, makeFlowers, makeHay, makeSparkles, bubble, part, mat, bake, bakeGeo, GRAD } from './models.js';

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7ec4ef'); g.addColorStop(0.55, '#bfe3f2'); g.addColorStop(1, '#fde9c4'); x.fillStyle = g; x.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class World {
  constructor(el, onTap) {
    this.el = el; this.onTap = onTap;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;  el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = skyTexture(); this.scene.fog = new THREE.Fog('#cfe6c0', 62, 118);
    this.view = 20; this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200); this.target = new THREE.Vector3(GRID / 2, 0, GRID / 2); this.camera.zoom = 1;
    this.scene.add(new THREE.HemisphereLight('#fff0d0', '#5f8a34', 1.5));
    const sun = new THREE.DirectionalLight('#ffe6bf', 2.3); sun.position.set(GRID / 2 - 14, 30, GRID / 2 + 8); sun.target.position.set(GRID / 2, 0, GRID / 2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
    if (window.innerWidth < 640) sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun, sun.target);
    this.buildGround();
    this.layer = new THREE.Group(); this.scene.add(this.layer); this.meshes = new Map();
    this.fx = new THREE.Group(); this.scene.add(this.fx); this.unitMeshes = new Map(); this.projectiles = [];
    this.docao = makeDocao(0.8); this.scene.add(this.docao); this.docao.position.set(GRID / 2 - 1, 0, GRID / 2 + 3.2); this.docaoGoal = null; this.docaoWait = 0;
    this.camp = new THREE.Group(); this.scene.add(this.camp); this.campKey = ''; this.campUnits = []; this.hidden = new Set();
    this.ghost = null; this.zoneMesh = null; this.clock = new THREE.Clock(); this.t = 0;
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.setupInput(); this.resize(); window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }
  buildGround() {
    let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // grama da fazenda: xadrez bem suave + manchas de cor + tufinhos (tudo numa textura só)
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), T = N / GRID;
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) { x.fillStyle = (i + j) % 2 ? '#8fcf6c' : '#88c966'; x.fillRect(i * T, j * T, T + 1, T + 1); }
    for (let k = 0; k < 260; k++) { const px = r() * N, py = r() * N, rad = 10 + r() * 40; const gr = x.createRadialGradient(px, py, 0, px, py, rad); const col = r() < 0.5 ? '120,190,80' : r() < 0.6 ? '160,210,95' : '100,170,70'; gr.addColorStop(0, `rgba(${col},.35)`); gr.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gr; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
    for (let k = 0; k < 2600; k++) { const px = r() * N, py = r() * N; x.strokeStyle = r() < 0.5 ? 'rgba(70,140,50,.45)' : 'rgba(190,230,120,.5)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 4, py - 3 - r() * 4); x.stroke(); }
    for (let k = 0; k < 90; k++) { x.fillStyle = ['#fff', '#ffe066', '#ff9ab0'][k % 3]; x.beginPath(); x.arc(r() * N, r() * N, 1.6, 0, 7); x.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshToonMaterial({ map: tex, gradientMap: GRAD })); g.rotation.x = -Math.PI / 2; g.position.set(GRID / 2, 0, GRID / 2); g.receiveShadow = true; this.scene.add(g);
    // campo de fora: grama mais escura com ruído + estrada de terra saindo da porteira
    const c2 = document.createElement('canvas'); c2.width = c2.height = 256; const y = c2.getContext('2d'); y.fillStyle = '#72ad55'; y.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 120; k++) { const px = r() * 256, py = r() * 256, rad = 6 + r() * 22; const gr = y.createRadialGradient(px, py, 0, px, py, rad); const col = r() < 0.5 ? '96,160,70' : '130,190,90'; gr.addColorStop(0, `rgba(${col},.5)`); gr.addColorStop(1, `rgba(${col},0)`); y.fillStyle = gr; for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) y.fillRect(px - rad + ox, py - rad + oy, rad * 2, rad * 2); }
    for (let k = 0; k < 900; k++) { y.fillStyle = r() < 0.5 ? 'rgba(60,120,40,.5)' : 'rgba(170,215,110,.5)'; y.fillRect(r() * 256, r() * 256, 1.5, 3); }
    const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(26, 26);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshToonMaterial({ map: t2, gradientMap: GRAD })); out.rotation.x = -Math.PI / 2; out.position.set(GRID / 2, -0.02, GRID / 2); out.receiveShadow = true; this.scene.add(out);
    // tudo que é estático em volta vira 1-2 malhas
    const deco = new THREE.Group(), GATE = [13.5, 16.5];
    for (let i = 0; i <= GRID; i += 1.5) for (const [px, pz, side] of [[i, -0.3, 0], [i, GRID + 0.3, 1], [-0.3, i, 2], [GRID + 0.3, i, 3]]) { if (side === 1 && px > GATE[0] && px < GATE[1]) continue; part('box', '#9a6a38', 0.14, 0.75, 0.14, px, 0.37, pz, deco); part('cone4', '#9a6a38', 0.2, 0.12, 0.2, px, 0.8, pz, deco, false); }
    for (const [px, pz, w, d] of [[GRID / 2, -0.3, GRID, 0.07], [-0.3, GRID / 2, 0.07, GRID], [GRID + 0.3, GRID / 2, 0.07, GRID]]) for (const h of [0.55, 0.28]) part('box', '#c08850', w, 0.09, d, px, h, pz, deco);
    for (const [a0, a1] of [[0, GATE[0]], [GATE[1], GRID]]) for (const h of [0.55, 0.28]) part('box', '#c08850', a1 - a0, 0.09, 0.07, (a0 + a1) / 2, h, GRID + 0.3, deco);
    for (const k of [0, 1]) { part('box', '#7a4a20', 0.22, 1.5, 0.22, GATE[k], 0.75, GRID + 0.3, deco); } part('box', '#7a4a20', GATE[1] - GATE[0] + 0.3, 0.2, 0.2, GRID / 2, 1.45, GRID + 0.3, deco); // porteira
    const path = (x0, z0, x1, z1, w) => { const L = Math.hypot(x1 - x0, z1 - z0), m = part('box', '#c9a46a', w, 0.02, L, (x0 + x1) / 2, 0.005, (z0 + z1) / 2, deco, false); m.rotation.y = Math.atan2(x1 - x0, z1 - z0); for (let k = 0; k < L / 1.2; k++) part('ico', '#b08a52', 0.25, 0.06, 0.2, (x0 + x1) / 2 + (r() - 0.5) * w * 0.8 + (x1 - x0) * (k / (L / 1.2) - 0.5), 0.02, (z0 + z1) / 2 + (z1 - z0) * (k / (L / 1.2) - 0.5), deco, false); };
    path(GRID / 2, GRID + 0.2, GRID / 2, GRID + 9, 2.2); path(GRID / 2, GRID + 9, GRID / 2 + 14, GRID + 16, 2.0); path(GRID / 2, GRID + 9, GRID / 2 - 16, GRID + 13, 2.0);
    const free = (px, pz) => !(px > -2 && px < GRID + 2 && pz > -2 && pz < GRID + 2) && !(Math.abs(px - GRID / 2) < 2.5 && pz > GRID && pz < GRID + 11) && Math.hypot(px - (GRID + 7), pz - (GRID / 2 - 4)) > 5.5;
    for (let i = 0, k = 0; i < 56 && k < 400; k++) { const a = r() * Math.PI * 2, d = GRID / 2 + 3.5 + r() * 18; const px = GRID / 2 + Math.cos(a) * d, pz = GRID / 2 + Math.sin(a) * d; if (!free(px, pz)) continue; i++; const t = makeTree(0.8 + r() * 0.7, r() < 0.35 ? 1 : r() < 0.2 ? 2 : 0); t.position.set(px, 0, pz); t.rotation.y = r() * 6; t.userData.tree = 1; deco.add(t); }
    for (let i = 0, k = 0; i < 48 && k < 400; k++) { const a = r() * Math.PI * 2, d = GRID / 2 + 2.2 + r() * 16; const px = GRID / 2 + Math.cos(a) * d, pz = GRID / 2 + Math.sin(a) * d; if (!free(px, pz)) continue; i++; const kind = i % 4, o = kind === 0 ? makeRock(0.6 + r() * 0.8) : kind === 1 ? makeBush(0.7 + r() * 0.5) : kind === 2 ? makeFlowers(i) : makeHay(); o.position.set(px, 0, pz); o.rotation.y = r() * 6; deco.add(o); }
    // laguinho com pedras, juncos e um patinho
    const P = { x: GRID + 7, z: GRID / 2 - 4 };
    part('cyl', '#b8925a', 7.4, 0.04, 5.4, P.x, 0.0, P.z, deco, false); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; part('dode', k % 2 ? '#9a9489' : '#b3ada2', 0.55, 0.32, 0.5, P.x + Math.cos(a) * 3.45, 0.1, P.z + Math.sin(a) * 2.5, deco); }
    for (let k = 0; k < 7; k++) { const a = 0.4 + k * 0.18; part('cyl6', '#5a8a3a', 0.05, 0.9, 0.05, P.x + Math.cos(a) * 3.0, 0.45, P.z + Math.sin(a) * 2.1, deco, false); part('cyl6', '#7a4a20', 0.09, 0.22, 0.09, P.x + Math.cos(a) * 3.0, 0.85, P.z + Math.sin(a) * 2.1, deco, false); }
    this.sign = makeSign('Proibido roubar milho, Paulo'); this.sign.position.set(GRID / 2 + 2.6, 0, GRID + 1.5); this.scene.add(this.sign);
    for (const ch of deco.children) if (!ch.userData.tree) ch.traverse((o) => { o.castShadow = false; });
    bake(deco); this.scene.add(deco);
    this.water = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshToonMaterial({ color: '#5ab8e0', gradientMap: GRAD, transparent: true, opacity: 0.92 })); this.water.rotation.x = -Math.PI / 2; this.water.scale.set(3.2, 2.3, 1); this.water.position.set(P.x, 0.06, P.z); this.water.receiveShadow = true; this.scene.add(this.water);
    this.duck = new THREE.Group(); part('sph', '#fff', 0.4, 0.3, 0.55, 0, 0.12, 0, this.duck); part('sph', '#fff', 0.26, 0.26, 0.26, 0, 0.36, 0.2, this.duck); part('cone', '#ff9a2e', 0.1, 0.18, 0.1, 0, 0.34, 0.38, this.duck).rotation.x = Math.PI / 2; bake(this.duck); this.duck.position.set(P.x, 0.06, P.z); this.pond = P; this.scene.add(this.duck);
    // grade do mapa: só aparece colocando prédio
    const pts = []; for (let i = 0; i <= GRID; i++) pts.push(i, 0.03, 0, i, 0.03, GRID, 0, 0.03, i, GRID, 0.03, i);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridLines = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false })); this.gridLines.visible = false; this.scene.add(this.gridLines);
    this.ground = g;
  }
  setSign(text) { this.scene.remove(this.sign); this.sign = makeSign(text); this.sign.position.set(GRID / 2 + 2.6, 0, GRID + 1.5); this.scene.add(this.sign); }
  resize() {
    const w = this.el.clientWidth || window.innerWidth, h = this.el.clientHeight || window.innerHeight; this.renderer.setSize(w, h, false);
    const a = w / h, v = a < 1 ? Math.max(this.view, 19 / a) : this.view; this.camera.left = -v * a / 2; this.camera.right = v * a / 2; this.camera.top = v / 2; this.camera.bottom = -v / 2; this.camera.updateProjectionMatrix();
  }
  placeCamera() { this.camera.position.copy(this.target).add(new THREE.Vector3(30, 30, 30)); this.camera.lookAt(this.target); }
  worldAt(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect(); const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.camera.updateMatrixWorld(); this.ray.setFromCamera(v, this.camera); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.plane, p) ? p : null;
  }
  setupInput() {
    const el = this.renderer.domElement; el.style.touchAction = 'none'; const ptrs = new Map(); let grab = null, pinch = null, down = null;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { grab = this.worldAt(e.clientX, e.clientY); down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.camera.zoom }; grab = null; if (down) down.moved = 99; } });
    el.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) { if (this.onHover) { const p = this.worldAt(e.clientX, e.clientY); if (p) this.onHover(p); } return; }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down) down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; this.setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); return; }
      if (grab && down && down.moved > 6 && !this.dragLock) { const p = this.worldAt(e.clientX, e.clientY); if (p) { this.target.x += grab.x - p.x; this.target.z += grab.z - p.z; this.clampTarget(); this.placeCamera(); } } });
    const up = (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { if (down && down.moved < 8 && performance.now() - down.t < 600) { const p = this.worldAt(e.clientX, e.clientY); if (p && this.onTap) this.onTap(p, e); } grab = null; pinch = null; down = null; } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.camera.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
    this.placeCamera();
  }
  clampTarget() { this.target.x = Math.max(-2, Math.min(GRID + 2, this.target.x)); this.target.z = Math.max(-2, Math.min(GRID + 2, this.target.z)); }
  setZoom(z) { this.camera.zoom = Math.max(0.55, Math.min(2.6, z)); this.camera.updateProjectionMatrix(); }
  focus(x, z, zoom) { this.target.set(x, 0, z); this.clampTarget(); if (zoom) this.setZoom(zoom); this.placeCamera(); }

  // ---------- fazenda ----------
  clear() { for (const m of this.meshes.values()) this.layer.remove(m.g); this.meshes.clear(); this.clearUnits(); }
  sync(buildings, now, opts = {}) {
    const seen = new Set();
    for (const b of buildings) {
      seen.add(b.id); const busy = b.busyUntil && b.busyUntil > now; const stage = b.crop ? Math.min(1, (now - b.plantedAt) / Math.max(1, b.readyAt - b.plantedAt)) : -1;
      const st = Math.floor(stage * 3) / 3;
      const key = [b.type, b.lvl, b.x, b.y, busy ? 1 : 0, b.crop || '', stage >= 1 ? 1 : st, opts.dead && opts.dead.has(b.id) ? 'x' : ''].join('|');
      let m = this.meshes.get(b.id);
      if (!m || m.key !== key) {
        if (m) this.layer.remove(m.g);
        const g = new THREE.Group(); const n = BUILDINGS[b.type].size;
        if (opts.dead && opts.dead.has(b.id)) g.add(makeRubble(n));
        else { const mdl = b.lvl >= 1 || !busy ? makeBuilding(b.type, Math.max(1, b.lvl)) : makeBuilding(b.type, 1); if (b.lvl < 1) mdl.scale.y = 0.35; g.add(mdl); g.userData = mdl.userData;
          if (busy) { const sc = makeScaffold(n); g.add(sc); g.userData = { ...mdl.userData, hammer: sc.userData.hammer }; }
          if (b.type === 'canteiro' && b.crop && mdl.userData.crops) { const cr = makeCrops(b.crop, stage >= 1 ? 1 : st); mdl.userData.crops.add(cr); g.userData = { ...g.userData, rows: cr.userData.rows };
            if (stage >= 1 && !opts.dead) { const sp = makeSparkles(n, 1.2); sp.position.set(n / 2, 0, n / 2); g.add(sp); g.userData.sparkles = sp; } } }
        g.position.set(b.x, 0, b.y); this.layer.add(g); m = { g, key, b, icon: null }; this.meshes.set(b.id, m);
      }
      m.b = b; m.g.visible = !this.hidden.has(b.id);
    }
    for (const [id, m] of this.meshes) if (!seen.has(id)) { this.layer.remove(m.g); this.meshes.delete(id); }
  }
  setIcon(id, emoji, color) {
    const m = this.meshes.get(id); if (!m) return; const k = emoji ? emoji + color : '';
    if (m.iconKey === k) return; if (m.icon) { m.g.remove(m.icon); m.icon = null; } m.iconKey = k;
    if (emoji) { const n = BUILDINGS[m.b.type].size; m.icon = bubble(emoji, color); m.icon.position.set(n / 2, n === 2 ? 1.9 : 3.6, n / 2); m.g.add(m.icon); }
  }
  hideBuilding(id, on) { if (on) this.hidden.add(id); else this.hidden.delete(id); const m = this.meshes.get(id); if (m) m.g.visible = !on; }
  // bolha mais perto do clique (em pixels, área generosa) → id do prédio. Tem prioridade sobre o prédio embaixo.
  pickIcon(cx, cy, radius = 46) {
    let best = 0, bd = radius; const v = new THREE.Vector3();
    for (const [id, m] of this.meshes) { if (!m.icon || !m.g.visible) continue; m.icon.getWorldPosition(v); const p = this.toScreen(v.x, v.y, v.z); const d = Math.hypot(p.x - cx, p.y - cy - 4); if (d < bd) { bd = d; best = id; } }
    return best;
  }
  // ---------- tropas paradas no Acampamento de Lama (igual CoC) ----------
  campVisible(on) { this.camp.visible = on; }
  setCampTroops(army, buildings) {
    const camps = buildings.filter((b) => b.type === 'acampamento' && b.lvl >= 1);
    const key = JSON.stringify(army) + camps.map((c) => `${c.id}:${c.x},${c.y}`).join('|'); if (key === this.campKey) return; this.campKey = key;
    for (const u of this.campUnits) this.camp.remove(u.m); this.campUnits = []; if (!camps.length) return;
    // até 40 bonecos; se o exército for maior, cada tipo aparece na proporção
    const total = Object.values(army).reduce((a, b) => a + (b | 0), 0), cap = 40, list = [];
    for (const u of Object.keys(army)) { const n = total > cap ? Math.round((army[u] | 0) * cap / total) : (army[u] | 0); for (let i = 0; i < n; i++) list.push(u); }
    list.slice(0, cap).forEach((u, i) => {
      const c = camps[i % camps.length], n = BUILDINGS.acampamento.size, m = new THREE.Mesh(unitGeo(u), unitMat); m.castShadow = true; m.scale.setScalar(1.25);
      const home = { x0: c.x + 0.5, z0: c.y + 0.5, x1: c.x + n - 0.5, z1: c.y + n - 0.5 };
      const r = (k) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
      m.position.set(home.x0 + r(1) * (home.x1 - home.x0), 0, home.z0 + r(2) * (home.z1 - home.z0)); m.rotation.y = r(3) * 6.28;
      this.camp.add(m); this.campUnits.push({ m, home, goal: null, wait: r(4) * 3, ph: r(5) * 10, sp: UNITS[u].speed / 220 });
    });
  }
  walkCamp(dt) {
    if (!this.camp.visible) return;
    for (const c of this.campUnits) {
      if (!c.goal) { c.wait -= dt; c.m.position.y = 0; if (c.wait <= 0) { c.goal = new THREE.Vector3(c.home.x0 + Math.random() * (c.home.x1 - c.home.x0), 0, c.home.z0 + Math.random() * (c.home.z1 - c.home.z0)); } continue; }
      const v = c.goal.clone().sub(c.m.position); v.y = 0; const d = v.length();
      if (d < 0.05) { c.goal = null; c.wait = 1 + Math.random() * 4; continue; }
      v.normalize(); const st = Math.min(d, dt * 0.9 * c.sp); c.m.position.x += v.x * st; c.m.position.z += v.z * st; c.m.rotation.y = Math.atan2(v.x, v.z);
      c.m.position.y = Math.abs(Math.sin(this.t * 12 + c.ph)) * 0.08;
    }
  }
  buildingAt(p) { const tx = Math.floor(p.x), ty = Math.floor(p.z); for (const m of this.meshes.values()) { const b = m.b, n = BUILDINGS[b.type].size; if (tx >= b.x && tx < b.x + n && ty >= b.y && ty < b.y + n) return b; } return null; }
  highlight(id) { for (const [bid, m] of this.meshes) m.g.position.y = bid === id ? 0.12 : 0; this.sel = id; }
  setGhost(type, x, y, okFn) {
    this.gridLines.visible = !!type;
    if (!type) { if (this.ghost) this.scene.remove(this.ghost); this.ghost = null; return; }
    if (!this.ghost || this.ghost.userData.type !== type) { if (this.ghost) this.scene.remove(this.ghost); this.ghost = makeBuilding(type, 1); this.ghost.userData.type = type;
      const n = BUILDINGS[type].size; this.ghost.add(this.ghostPad = new THREE.Mesh(new THREE.PlaneGeometry(n + 0.6, n + 0.6), new THREE.MeshBasicMaterial({ color: '#2ecc71', transparent: true, opacity: 0.6, depthWrite: false })));
      this.ghostPad.rotation.x = -Math.PI / 2; this.ghostPad.position.set(n / 2, 0.04, n / 2); this.scene.add(this.ghost); }
    this.ghost.position.set(x, 0.05, y); this.ghostPad.material.color.set(okFn ? '#2ecc71' : '#e74c3c');
  }
  // área proibida pra soltar tropa (vermelho) na batalha
  setNoDeploy(base) {
    if (this.zoneMesh) { this.scene.remove(this.zoneMesh); this.zoneMesh = null; } if (!base) return;
    const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: '#d62b1f', transparent: true, opacity: 0.28, depthWrite: false });
    for (const b of base) { const n = BUILDINGS[b.type].size; const q = new THREE.Mesh(new THREE.PlaneGeometry(n + 2, n + 2), m); q.rotation.x = -Math.PI / 2; q.position.set(b.x + n / 2, 0.02, b.y + n / 2); g.add(q); }
    this.zoneMesh = g; this.scene.add(g);
  }

  // ---------- batalha ----------
  clearUnits() { for (const m of this.unitMeshes.values()) this.fx.remove(m.g); this.unitMeshes.clear(); for (const p of this.projectiles) this.fx.remove(p.m); this.projectiles = []; }
  syncUnits(units, alpha) {
    for (const u of units) {
      let m = this.unitMeshes.get(u.id);
      if (!m) { const g = makeUnit(u.u); g.scale.setScalar(1.5); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.position.set(u.x / 1000, 0, u.y / 1000); this.fx.add(g); const bar = hpBar(UNITS[u.u].space >= 5 ? 1.2 : 0.8); bar.position.y = UNITS[u.u].space >= 5 ? 1.1 : 0.75; bar.scale.setScalar(1 / 1.5); g.add(bar);
        m = { g, bar, px: u.x, py: u.y, cx: u.x, cy: u.y, dead: false, hp: u.hp, hitT: -9 }; this.unitMeshes.set(u.id, m); this.puff(u.x / 1000, u.y / 1000, '#fff6d8', 0.5); }
      if (u.hp < m.hp) { m.hitT = this.t; m.hp = u.hp; }
      if (m.cx !== u.x || m.cy !== u.y) { m.px = m.cx; m.py = m.cy; m.cx = u.x; m.cy = u.y; }
      const x = (m.px + (m.cx - m.px) * alpha) / 1000, z = (m.py + (m.cy - m.py) * alpha) / 1000;
      const dx = m.cx - m.px, dz = m.cy - m.py; if (dx || dz) m.g.rotation.y = Math.atan2(dx, dz);
      m.g.position.x = x; m.g.position.z = z; const walk = !!(dx || dz) && !u.dead, ud = m.g.userData; ud.body.position.y = walk ? Math.abs(Math.sin(this.t * 14 + u.id)) * 0.12 : 0; const sw = walk ? Math.sin(this.t * 14 + u.id) * 0.5 : 0; if (ud.legsA) { ud.legsA.rotation.x = sw; ud.legsB.rotation.x = -sw; }
      const hk = Math.max(0, 1 - (this.t - m.hitT) / 0.18); if (!m.dead) m.g.scale.set(1.5 * (1 + hk * 0.18), 1.5 * (1 - hk * 0.22), 1.5 * (1 + hk * 0.18)); if (ud.fire) ud.fire.scale.setScalar(0.1 * (0.8 + Math.random() * 0.4));
      setBar(m.bar, u.hp / u.maxHp, this.camera);
      if (u.dead && !m.dead) { m.dead = true; m.g.rotation.z = Math.PI / 2; m.g.position.y = 0.05; m.bar.visible = false; m.fade = 1; this.puff(x, z, '#ffffff', 0.9); this.burst(x, z, '#f7aec0', 7, 0.5); }
    }
  }
  shoot(from, to, color = '#ffd23f', size = 0.22) {
    const m = part('sph', color, size, size, size, from.x, from.y, from.z, this.fx, false); this.projectiles.push({ m, from: from.clone(), to: to.clone(), t: 0, dur: 0.18 });
  }
  // estouro de partículas (coletar, colher, morrer) — bolinhas com gravidade, curtinhas
  burst(x, z, color = '#ffd23f', n = 10, y = 1) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.random(), sp = 1.5 + Math.random() * 2; const m = part('sph', color, 0.16, 0.16, 0.16, x, y, z, this.fx, false); this.projectiles.push({ m, burst: true, v: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp), t: 0, dur: 0.8 }); } }
  puff(x, z, color = '#fff', s = 0.6) { const m = part('sph', color, s, s, s, x, 0.5, z, this.fx, false); m.material = m.material.clone(); m.material.transparent = true; this.projectiles.push({ m, puff: true, t: 0, dur: 0.45, s }); }
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
    if (this.onFrame) this.onFrame(dt);
    const T = this.t;
    for (const m of this.meshes.values()) { const u = m.g.userData; if (!m.g.visible) continue; if (u.spin) u.spin.rotation.y += dt * 6; if (u.flag) u.flag.rotation.y = Math.sin(T * 3 + m.b.id) * 0.3;
      if (u.smokes) for (const s of u.smokes) { const k = (T * 0.45 + s.userData.ph) % 1; s.position.y = 2.4 + k * 1.6; s.position.x = -0.9 + Math.sin(k * 3) * 0.15 * k; s.scale.setScalar(0.25 + k * 0.6); s.visible = k < 0.92; }
      if (u.blades) u.blades.rotation.z += dt * 1.6; if (u.wheel) u.wheel.rotation.x -= dt * 1.2; if (u.vane) u.vane.rotation.y = Math.sin(T * 0.4 + m.b.id) * 1.2;
      if (u.hammer) u.hammer.rotation.x = -Math.abs(Math.sin(T * 7)) * 1.1; if (u.fire) { const f = 0.85 + Math.sin(T * 17 + m.b.id) * 0.1 + Math.sin(T * 29) * 0.06; u.fire.scale.set(0.25 * f, 0.4 * (2 - f), 0.25 * f); }
      if (u.rows) u.rows.forEach((r, i) => { r.rotation.z = Math.sin(T * 1.8 + i * 0.9 + m.b.id) * 0.06; r.rotation.x = Math.sin(T * 1.3 + i) * 0.03; });
      if (u.sparkles) u.sparkles.children.forEach((s) => { const k = (Math.sin(T * 3 + s.userData.ph) + 1) / 2; s.scale.setScalar(0.15 + k * 0.4); s.material.opacity = 1; s.position.y = 1.0 + ((T * 0.3 + s.userData.ph) % 1) * 0.6; });
      if (u.dog) u.dog.rotation.y = Math.sin(this.t * 2) * 0.5; if (m.icon) m.icon.position.y += Math.sin(this.t * 4) * 0.004; }
    for (let i = this.projectiles.length - 1; i >= 0; i--) { const p = this.projectiles[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
      if (p.burst) { p.v.y -= 12 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.08) { p.m.position.y = 0.08; p.v.multiplyScalar(0.5); p.v.y = Math.abs(p.v.y) * 0.4; } p.m.scale.setScalar(0.16 * (1 - k * k)); }
      else if (p.puff) { p.m.scale.setScalar(p.s * (1 + k * 1.5)); p.m.material.opacity = 1 - k; } else { p.m.position.lerpVectors(p.from, p.to, k); p.m.position.y += Math.sin(k * Math.PI) * 0.8; }
      if (k >= 1) { this.fx.remove(p.m); this.projectiles.splice(i, 1); } }
    for (const [id, m] of this.unitMeshes) if (m.dead) { m.fade -= dt * 0.8; if (m.fade <= 0) { this.fx.remove(m.g); this.unitMeshes.delete(id); } }
    this.walkDocao(dt); this.walkCamp(dt);
    if (this.water) { this.water.material.color.setHSL(0.54, 0.62, 0.6 + Math.sin(T * 1.5) * 0.02); const a = T * 0.25; this.duck.position.set(this.pond.x + Math.cos(a) * 1.6, 0.06 + Math.sin(T * 3) * 0.02, this.pond.z + Math.sin(a) * 1.1); this.duck.rotation.y = -a; }
    this.renderer.render(this.scene, this.camera);
  }
  walkDocao(dt) {
    const d = this.docao, u = d.userData; if (!d.visible) return;
    u.body.position.y = Math.abs(Math.sin(this.t * (this.docaoGoal ? 9 : 2))) * (this.docaoGoal ? 0.12 : 0.03); u.earL.rotation.z = 0.5 + Math.sin(this.t * 5) * 0.12; u.earR.rotation.z = -0.5 - Math.sin(this.t * 5 + 1) * 0.12;
    if (!this.docaoGoal) { this.docaoWait -= dt; if (this.docaoWait <= 0) { const free = []; for (let k = 0; k < 20; k++) { const x = 2 + Math.random() * (GRID - 4), z = 2 + Math.random() * (GRID - 4); if (!this.buildingAt({ x, z })) { free.push([x, z]); break; } } if (free.length) this.docaoGoal = new THREE.Vector3(free[0][0], 0, free[0][1]); this.docaoWait = 2 + Math.random() * 3; } return; }
    const v = this.docaoGoal.clone().sub(d.position); const dist = v.length(); if (dist < 0.1) { this.docaoGoal = null; return; }
    v.normalize(); const step = Math.min(dist, dt * 1.6); const nx = d.position.x + v.x * step, nz = d.position.z + v.z * step;
    if (this.buildingAt({ x: nx, z: nz })) { this.docaoGoal = null; return; }
    d.position.x = nx; d.position.z = nz; d.rotation.y = Math.atan2(v.x, v.z);
  }
  // posição na tela de um ponto do mundo (textos flutuantes em HTML)
  toScreen(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); const r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }
}
// cada tropa vira 1 malha só (cores por vértice) → 1 draw call por porquinho
const unitGeoCache = new Map(); const unitMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
function unitGeo(u) {
  if (unitGeoCache.has(u)) return unitGeoCache.get(u);
  const g = makeUnit(u); g.updateMatrixWorld(true); const list = []; g.traverse((o) => { if (o.isMesh) list.push(o); });
  const merged = bakeGeo(list, new THREE.Matrix4()); unitGeoCache.set(u, merged); return merged;
}
function hpBar(w) {
  const g = new THREE.Group(); const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.13), new THREE.MeshBasicMaterial({ color: '#2b1206', depthTest: false })); const fg = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.08), new THREE.MeshBasicMaterial({ color: '#4cd964', depthTest: false }));
  fg.position.z = 0.001; bg.renderOrder = 11; fg.renderOrder = 12; g.add(bg, fg); g.userData = { fg, w }; return g;
}
function setBar(bar, k, cam) { const { fg, w } = bar.userData; k = Math.max(0, Math.min(1, k)); fg.scale.x = Math.max(0.001, k); fg.position.x = -(w - 0.04) * (1 - k) / 2; fg.material.color.set(k > 0.5 ? '#4cd964' : k > 0.25 ? '#ffcc00' : '#ff3b30'); bar.visible = k < 1; bar.quaternion.copy(cam.quaternion); if (bar.parent) bar.quaternion.premultiply(bar.parent.quaternion.clone().invert()); }
export { hpBar, setBar };
