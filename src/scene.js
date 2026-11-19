// Cena three.js: câmera isométrica ortográfica, arrastar/zoom/pinça, prédios, Docão passeando e tropas na batalha.
// Só desenha: a lógica (economia e batalha) vive em /shared e não conhece a cena.
import * as THREE from 'three';
import { GRID, BUILDINGS, CROPS, UNITS } from '../shared/rules.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { makeBuilding, makeScaffold, makeRubble, makeCrops, makeDocao, makeUnit, makeTree, makeSign, bubble, part, mat } from './models.js';

export class World {
  constructor(el, onTap) {
    this.el = el; this.onTap = onTap;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#9bd3f0'); this.scene.fog = new THREE.Fog('#9bd3f0', 60, 110);
    this.view = 20; this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200); this.target = new THREE.Vector3(GRID / 2, 0, GRID / 2); this.camera.zoom = 1;
    this.scene.add(new THREE.HemisphereLight('#fff7e0', '#5c7a3a', 1.6));
    const sun = new THREE.DirectionalLight('#fff2d0', 2.2); sun.position.set(GRID / 2 - 14, 30, GRID / 2 + 8); sun.target.position.set(GRID / 2, 0, GRID / 2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 }); sun.shadow.bias = -0.0008;
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
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) { x.fillStyle = (i + j) % 2 ? '#86c96a' : '#7fc263'; x.fillRect(i * 512 / GRID, j * 512 / GRID, 512 / GRID + 1, 512 / GRID + 1); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(GRID, GRID), new THREE.MeshToonMaterial({ map: tex })); g.rotation.x = -Math.PI / 2; g.position.set(GRID / 2, 0, GRID / 2); g.receiveShadow = true; this.scene.add(g);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), mat('#6aa84f')); out.rotation.x = -Math.PI / 2; out.position.set(GRID / 2, -0.02, GRID / 2); out.receiveShadow = true; this.scene.add(out);
    // cerca em volta + árvores + placa
    const fence = new THREE.Group(); this.scene.add(fence);
    for (let i = 0; i <= GRID; i += 1.5) for (const [px, pz] of [[i, -0.3], [i, GRID + 0.3], [-0.3, i], [GRID + 0.3, i]]) part('box', '#a0703c', 0.12, 0.7, 0.12, px, 0.35, pz, fence, false);
    for (const [px, pz, w, d] of [[GRID / 2, -0.3, GRID, 0.06], [GRID / 2, GRID + 0.3, GRID, 0.06], [-0.3, GRID / 2, 0.06, GRID], [GRID + 0.3, GRID / 2, 0.06, GRID]]) { part('box', '#c08850', w, 0.08, d, px, 0.5, pz, fence, false); part('box', '#c08850', w, 0.08, d, px, 0.25, pz, fence, false); }
    let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, d = GRID / 2 + 3 + r() * 14, t = makeTree(0.8 + r() * 0.7); t.position.set(GRID / 2 + Math.cos(a) * d, 0, GRID / 2 + Math.sin(a) * d); this.scene.add(t); }
    this.sign = makeSign('Proibido roubar milho, Paulo'); this.sign.position.set(GRID - 2.5, 0, GRID + 1.2); this.scene.add(this.sign);
    this.ground = g;
  }
  setSign(text) { this.scene.remove(this.sign); this.sign = makeSign(text); this.sign.position.set(GRID - 2.5, 0, GRID + 1.2); this.scene.add(this.sign); }
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
          if (busy) g.add(makeScaffold(n));
          if (b.type === 'canteiro' && b.crop && mdl.userData.crops) mdl.userData.crops.add(makeCrops(b.crop, stage >= 1 ? 1 : st)); }
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
      if (!m) { const g = makeUnit(u.u); g.scale.setScalar(1.5); g.position.set(u.x / 1000, 0, u.y / 1000); this.fx.add(g); const bar = hpBar(UNITS[u.u].space >= 5 ? 1.2 : 0.8); bar.position.y = UNITS[u.u].space >= 5 ? 1.1 : 0.75; bar.scale.setScalar(1 / 1.5); g.add(bar);
        m = { g, bar, px: u.x, py: u.y, cx: u.x, cy: u.y, dead: false }; this.unitMeshes.set(u.id, m); }
      if (m.cx !== u.x || m.cy !== u.y) { m.px = m.cx; m.py = m.cy; m.cx = u.x; m.cy = u.y; }
      const x = (m.px + (m.cx - m.px) * alpha) / 1000, z = (m.py + (m.cy - m.py) * alpha) / 1000;
      const dx = m.cx - m.px, dz = m.cy - m.py; if (dx || dz) m.g.rotation.y = Math.atan2(dx, dz);
      m.g.position.x = x; m.g.position.z = z; m.g.userData.body.position.y = (dx || dz) ? Math.abs(Math.sin(this.t * 14 + u.id)) * 0.15 : 0;
      setBar(m.bar, u.hp / u.maxHp, this.camera);
      if (u.dead && !m.dead) { m.dead = true; m.g.rotation.z = Math.PI / 2; m.g.position.y = 0.05; m.bar.visible = false; m.fade = 1; }
    }
  }
  shoot(from, to, color = '#ffd23f', size = 0.22) {
    const m = part('sph', color, size, size, size, from.x, from.y, from.z, this.fx, false); this.projectiles.push({ m, from: from.clone(), to: to.clone(), t: 0, dur: 0.18 });
  }
  puff(x, z, color = '#fff', s = 0.6) { const m = part('sph', color, s, s, s, x, 0.5, z, this.fx, false); m.material = m.material.clone(); m.material.transparent = true; this.projectiles.push({ m, puff: true, t: 0, dur: 0.45, s }); }
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta()); this.t += dt;
    if (this.onFrame) this.onFrame(dt);
    for (const m of this.meshes.values()) { const u = m.g.userData; if (u.spin) u.spin.rotation.y += dt * 6; if (u.flag) u.flag.rotation.y = Math.sin(this.t * 3) * 0.3; if (u.smoke) { const k = (this.t * 0.6) % 1; u.smoke.position.y = 2.4 + k * 1.2; u.smoke.scale.setScalar(0.3 + k * 0.5); }
      if (u.dog) u.dog.rotation.y = Math.sin(this.t * 2) * 0.5; if (m.icon) m.icon.position.y += Math.sin(this.t * 4) * 0.004; }
    for (let i = this.projectiles.length - 1; i >= 0; i--) { const p = this.projectiles[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
      if (p.puff) { p.m.scale.setScalar(p.s * (1 + k * 1.5)); p.m.material.opacity = 1 - k; } else { p.m.position.lerpVectors(p.from, p.to, k); p.m.position.y += Math.sin(k * Math.PI) * 0.8; }
      if (k >= 1) { this.fx.remove(p.m); this.projectiles.splice(i, 1); } }
    for (const [id, m] of this.unitMeshes) if (m.dead) { m.fade -= dt * 0.8; if (m.fade <= 0) { this.fx.remove(m.g); this.unitMeshes.delete(id); } }
    this.walkDocao(dt); this.walkCamp(dt);
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
const unitGeoCache = new Map(); const unitMat = new THREE.MeshToonMaterial({ vertexColors: true });
function unitGeo(u) {
  if (unitGeoCache.has(u)) return unitGeoCache.get(u);
  const g = makeUnit(u); g.updateMatrixWorld(true); const parts = [];
  g.traverse((o) => { if (!o.isMesh) return; let geo = o.geometry.clone(); if (geo.index) geo = geo.toNonIndexed(); geo.applyMatrix4(o.matrixWorld);
    const c = o.material.color, n = geo.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(geo); });
  const merged = mergeGeometries(parts); unitGeoCache.set(u, merged); return merged;
}
function hpBar(w) {
  const g = new THREE.Group(); const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.13), new THREE.MeshBasicMaterial({ color: '#2b1206', depthTest: false })); const fg = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.08), new THREE.MeshBasicMaterial({ color: '#4cd964', depthTest: false }));
  fg.position.z = 0.001; bg.renderOrder = 11; fg.renderOrder = 12; g.add(bg, fg); g.userData = { fg, w }; return g;
}
function setBar(bar, k, cam) { const { fg, w } = bar.userData; k = Math.max(0, Math.min(1, k)); fg.scale.x = Math.max(0.001, k); fg.position.x = -(w - 0.04) * (1 - k) / 2; fg.material.color.set(k > 0.5 ? '#4cd964' : k > 0.25 ? '#ffcc00' : '#ff3b30'); bar.visible = k < 1; bar.quaternion.copy(cam.quaternion); if (bar.parent) bar.quaternion.premultiply(bar.parent.quaternion.clone().invert()); }
export { hpBar, setBar };
