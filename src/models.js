// Modelos 100% procedurais (caixas, cilindros, cones low-poly com toon), no estilo do Docão do Shooter. Nada de glTF.
import * as THREE from 'three';
import { BUILDINGS, CROPS } from '../shared/rules.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

export const GRAD = (() => { const t = new THREE.DataTexture(new Uint8Array([110, 175, 235]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const matCache = new Map();
export function mat(color, extra) {
  const k = color + (extra ? JSON.stringify(extra) : ''); if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...(extra || {}) }); matCache.set(k, m); return m;
}
const G = {
  tor: new THREE.TorusGeometry(0.5, 0.18, 4, 8, Math.PI * 1.6), spm: new THREE.SphereGeometry(0.5, 8, 6), rbox: new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1).rotateY(Math.PI / 4).scale(1.414, 1, 1.414), dode: new THREE.DodecahedronGeometry(0.5, 0),
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14), cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 12), cone4: new THREE.ConeGeometry(0.5, 1, 4), sph: new THREE.SphereGeometry(0.5, 12, 8), sps: new THREE.SphereGeometry(0.5, 6, 4), ico: new THREE.IcosahedronGeometry(0.5, 0),
};
const prism = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 0.5); s.lineTo(-0.5, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; })();
export function part(geo, color, sx, sy, sz, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(G[geo] || geo, typeof color === 'string' ? mat(color) : color); m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
function roof(g, w, d, h, y, color) { const r = new THREE.Mesh(prism, mat(color)); r.scale.set(w, h * 2, d); r.position.y = y; r.castShadow = true; g.add(r); return r; }

// ---------- "assar" malhas: junta tudo que é estático num único mesh com cor por vértice (1 draw call) ----------
const bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
export function bakeGeo(meshes, inv) {
  const parts = [];
  for (const o of meshes) {
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const had = o.material.vertexColors && geo.attributes.color;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && !(had && k === 'color')) geo.deleteAttribute(k); geo.clearGroups();
    if (!had) { const c = o.material.color, n = geo.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    parts.push(geo);
  }
  return parts.length ? mergeGeometries(parts) : null;
}
// junta os filhos estáticos de root (menos os que estão em keep, que continuam animáveis)
export function bake(root, keep = []) {
  root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(), ks = new Set(keep.filter((k) => k && k.isObject3D)); const cast = [], flat = [];
  root.traverse((o) => { if (!o.isMesh || !o.material || !o.material.isMeshToonMaterial || o.material.vertexColors || o.material.transparent || o.material.map) return; for (let p = o; p && p !== root; p = p.parent) if (ks.has(p)) return; (o.castShadow ? cast : flat).push(o); });
  if (cast.length + flat.length < 3) return root;
  for (const [list, sh] of [[cast, true], [flat, false]]) { const geo = bakeGeo(list, inv); if (!geo) continue; for (const o of list) o.parent.remove(o); const m = new THREE.Mesh(geo, bakedMat); m.castShadow = sh; m.receiveShadow = true; root.add(m); }
  return root;
}
const sparkTex = (() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,150,.9)'); g.addColorStop(1, 'rgba(255,220,80,0)'); x.fillStyle = g; x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 9 : 31; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
export const sparkMat = sparkTex ? new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }) : null;
export function makeSparkles(n, y = 1) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(sparkMat); s.position.set((i - 1) * n * 0.28, y + (i % 2) * 0.3, ((i * 7) % 3 - 1) * n * 0.22); s.userData.ph = i * 2.1; g.add(s); } return g; }

// ---------- texto em canvas (placas, balões) ----------
export function textTexture(text, { w = 256, h = 128, bg = '#f5deb3', fg = '#3a2210', font = 'bold 30px sans-serif', border = '#6b4423' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = border; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  const words = String(text).split(' '), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (x.measureText(t).width > w - 24 && cur) { lines.push(cur); cur = wd; } else cur = t; } if (cur) lines.push(cur);
  const lh = parseInt(font.match(/(\d+)px/)[1]) * 1.15; lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const bubbleCache = new Map();
export function bubble(emoji, color = '#ffffff') {
  const k = emoji + color; if (!bubbleCache.has(k)) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = color; x.strokeStyle = '#3a2210'; x.lineWidth = 7; x.beginPath(); x.arc(64, 58, 46, 0, Math.PI * 2); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(50, 100); x.lineTo(64, 124); x.lineTo(78, 100); x.fill();
    x.font = '56px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 64, 62);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; bubbleCache.set(k, new THREE.SpriteMaterial({ map: t, depthTest: false }));
  }
  const s = new THREE.Sprite(bubbleCache.get(k)); s.scale.set(1.1, 1.1, 1); s.renderOrder = 10; return s;
}

// ---------- Docão (mascote) ----------
export function makeDocao(scale = 1, hat = true) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = '#ee9c22', snout = '#ec5c0c';
  part('sph', '#2f5fa8', 0.9, 0.95, 0.75, 0, 0.75, 0, body);           // macacão jeans
  part('box', '#f4e1b5', 0.62, 0.32, 0.05, 0, 0.95, 0.36, body);        // peitilho
  part('cyl', '#2f5fa8', 0.26, 0.5, 0.26, -0.22, 0.22, 0, body); part('cyl', '#2f5fa8', 0.26, 0.5, 0.26, 0.22, 0.22, 0, body);
  part('cyl', '#5a3020', 0.3, 0.12, 0.34, -0.22, 0.03, 0.03, body); part('cyl', '#5a3020', 0.3, 0.12, 0.34, 0.22, 0.03, 0.03, body);
  part('sph', skin, 0.24, 0.6, 0.24, -0.5, 0.85, 0, body).rotation.z = 0.5; part('sph', skin, 0.24, 0.6, 0.24, 0.5, 0.85, 0, body).rotation.z = -0.5;
  const head = new THREE.Group(); head.position.y = 1.55; body.add(head);
  part('sph', skin, 1.05, 0.95, 0.95, 0, 0, 0, head);
  part('cyl', snout, 0.42, 0.22, 0.42, 0, -0.08, 0.46, head).rotation.x = Math.PI / 2;
  part('sps', '#3a0806', 0.08, 0.11, 0.05, -0.08, -0.08, 0.58, head); part('sps', '#3a0806', 0.08, 0.11, 0.05, 0.08, -0.08, 0.58, head);
  part('sph', '#fffaf0', 0.2, 0.24, 0.12, -0.2, 0.14, 0.4, head); part('sph', '#fffaf0', 0.2, 0.24, 0.12, 0.2, 0.14, 0.4, head);
  part('sph', '#120604', 0.1, 0.13, 0.06, -0.2, 0.13, 0.46, head); part('sph', '#120604', 0.1, 0.13, 0.06, 0.2, 0.13, 0.46, head);
  part('box', '#2a1408', 0.2, 0.05, 0.05, -0.2, 0.32, 0.43, head).rotation.z = 0.2; part('box', '#2a1408', 0.2, 0.05, 0.05, 0.2, 0.32, 0.43, head).rotation.z = -0.2;
  part('sps', '#e2482a', 0.14, 0.08, 0.05, -0.36, -0.06, 0.36, head); part('sps', '#e2482a', 0.14, 0.08, 0.05, 0.36, -0.06, 0.36, head);
  part('box', '#2e0503', 0.18, 0.04, 0.04, 0, -0.3, 0.44, head);
  const earL = part('cone4', skin, 0.3, 0.38, 0.12, -0.36, 0.48, 0, head); earL.rotation.z = 0.5;
  const earR = part('cone4', skin, 0.3, 0.38, 0.12, 0.36, 0.48, 0, head); earR.rotation.z = -0.5;
  if (hat) { part('cyl', '#e9c46a', 1.35, 0.05, 1.35, 0, 0.44, 0, head); part('cyl', '#e9c46a', 0.62, 0.3, 0.62, 0, 0.6, 0, head); part('cyl', '#c0392b', 0.64, 0.08, 0.64, 0, 0.5, 0, head); }
  const tail = part('tor', '#f0a8b8', 0.22, 0.22, 0.22, 0, 0.6, -0.4, body); tail.rotation.y = Math.PI / 2;
  g.scale.setScalar(scale); g.userData = { body, head, earL, earR };
  return g;
}

// ---------- tropas ----------
// porquinho fofo: cabeção, focinho com narinas, olho com brilho, orelha caída, bochecha, rabo enrolado; pernas animáveis
export function makeUnit(u) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b); const legsA = new THREE.Group(), legsB = new THREE.Group(); b.add(legsA, legsB);
  const pig = (color, s, snoutC = '#e98a9a', dark = '#5a3020') => {
    part('spm', color, 0.78 * s, 0.62 * s, 0.95 * s, 0, 0.46 * s, -0.04 * s, b);
    part('spm', color, 0.68 * s, 0.62 * s, 0.62 * s, 0, 0.7 * s, 0.42 * s, b);
    part('cyl6', snoutC, 0.3 * s, 0.16 * s, 0.3 * s, 0, 0.64 * s, 0.76 * s, b).rotation.x = Math.PI / 2;
    for (const k of [-1, 1]) {
      part('sps', '#7a3040', 0.06 * s, 0.08 * s, 0.03 * s, k * 0.06 * s, 0.64 * s, 0.85 * s, b);
      part('spm', '#fff', 0.15 * s, 0.17 * s, 0.08 * s, k * 0.15 * s, 0.82 * s, 0.68 * s, b); part('spm', '#1a0d08', 0.09 * s, 0.11 * s, 0.06 * s, k * 0.15 * s, 0.82 * s, 0.72 * s, b); part('sps', '#fff', 0.035 * s, 0.035 * s, 0.02 * s, k * 0.13 * s, 0.86 * s, 0.75 * s, b, false);
      part('sps', '#ff8fa6', 0.13 * s, 0.07 * s, 0.04 * s, k * 0.27 * s, 0.62 * s, 0.66 * s, b, false);
      const e = part('cone4', color, 0.2 * s, 0.26 * s, 0.07 * s, k * 0.22 * s, 1.0 * s, 0.36 * s, b); e.rotation.set(0.5, 0, -k * 0.6);
    }
    const t = part('tor', color, 0.18 * s, 0.18 * s, 0.18 * s, 0, 0.6 * s, -0.52 * s, b); t.rotation.y = Math.PI / 2;
    for (const [x, z, grp] of [[-0.22, 0.25, legsA], [0.22, -0.25, legsA], [0.22, 0.25, legsB], [-0.22, -0.25, legsB]]) { const l = part('cyl6', color, 0.15 * s, 0.26 * s, 0.15 * s, x * s, 0.13 * s, z * s, grp); part('cyl6', dark, 0.16 * s, 0.07 * s, 0.16 * s, x * s, 0.03 * s, z * s, grp); l.userData.leg = 1; }
  };
  if (u === 'leitao') { pig('#f7aec0', 0.6); part('cyl6', '#5fa040', 0.36, 0.05, 0.36, 0, 0.66, 0.24, b); part('cyl6', '#6fbf44', 0.2, 0.12, 0.2, 0, 0.72, 0.24, b); } // chapeuzinho de folha
  else if (u === 'atirador') { pig('#b07a4a', 0.62, '#d49c7c', '#3a2414'); for (let i = 0; i < 9; i++) { const c = part('cone', i % 2 ? '#3a2a1a' : '#e8d8b8', 0.07, 0.34, 0.07, (i % 3 - 1) * 0.14, 0.66, -0.2 + Math.floor(i / 3) * 0.16, b); c.rotation.x = -0.7; }
    const sl = part('box', '#7a4a20', 0.05, 0.3, 0.05, 0.32, 0.5, 0.35, b); sl.rotation.z = -0.3; part('tor', '#7a4a20', 0.14, 0.14, 0.14, 0.36, 0.68, 0.35, b); } // estilingue
  else if (u === 'javali') { pig('#5a3a24', 1.0, '#8a5a3c', '#2a1a10'); for (const k of [-1, 1]) part('cone', '#fffaf0', 0.08, 0.3, 0.08, k * 0.2, 0.56, 0.92, b).rotation.x = -1.1;
    for (let i = 0; i < 5; i++) part('cone4', '#1e120a', 0.14, 0.3, 0.08, 0, 1.12 - i * 0.04, 0.5 - i * 0.22, b).rotation.x = -0.3; // moicano
    part('box', '#c0392b', 0.82, 0.08, 0.3, 0, 0.88, 0.1, b); } // faixa de guerra
  else if (u === 'bomba') { pig('#f7aec0', 0.62); part('box', '#7a4a20', 0.6, 0.06, 0.1, 0, 0.7, -0.05, b); part('spm', '#2a2a30', 0.46, 0.46, 0.46, 0, 0.92, -0.12, b); part('sps', '#555', 0.12, 0.12, 0.12, 0.1, 1.04, 0.02, b, false);
    const f = part('cyl6', '#c9a36b', 0.04, 0.22, 0.04, 0.04, 1.2, -0.12, b); f.rotation.z = 0.4; const fire = part('spm', '#ffb020', 0.13, 0.13, 0.13, 0.09, 1.31, -0.12, b, false); fire.material = mat('#ffb020', { emissive: '#ff6a00', emissiveIntensity: 0.9 }); g.userData.fire = fire; }
  bake(b, [legsA, legsB, g.userData.fire]); bake(legsA); bake(legsB);
  g.userData.body = b; g.userData.legsA = legsA; g.userData.legsB = legsB; return g;
}

// ---------- plantas (estágios: broto → muda → crescida → pronta) ----------
export function makeCrops(crop, stage) {
  const g = new THREE.Group(); const c = CROPS[crop]; if (!c) return g;
  const st = stage >= 1 ? 3 : stage >= 2 / 3 ? 2 : stage >= 1 / 3 ? 1 : 0, s = [0.3, 0.55, 0.8, 1][st];
  for (let i = 0; i < 3; i++) {
    const row = new THREE.Group(); row.position.set(-0.6 + i * 0.6, 0.12, 0); g.add(row);
    for (let j = 0; j < 3; j++) {
      const p = new THREE.Group(); p.position.set(((i + j) % 2) * 0.05, 0, -0.6 + j * 0.6); p.rotation.y = (i * 3 + j) * 1.3; row.add(p);
      if (st === 0) { for (const k of [-1, 1]) { const l = part('sph', '#7ccf4a', 0.14, 0.05, 0.22, k * 0.07, 0.08, 0, p); l.rotation.z = k * 0.5; } part('cyl', '#5f9e3a', 0.03, 0.1, 0.03, 0, 0.05, 0, p); continue; }
      if (crop === 'milho') { part('cyl', '#5f9e3a', 0.08, 1.0 * s, 0.08, 0, 0.5 * s, 0, p); for (const k of [-1, 1]) part('cone', k > 0 ? '#6fbf44' : '#7ccf4a', 0.3 * s, 0.55 * s, 0.08, k * 0.12 * s, 0.55 * s, 0, p).rotation.z = k * -0.6;
        if (st >= 2) part('cone', '#e8d07a', 0.12, 0.25 * s, 0.12, 0, 1.05 * s, 0, p); if (st === 3) { part('cyl', c.color, 0.17, 0.36, 0.17, 0.1, 0.62, 0, p); part('cone', '#9fd36a', 0.2, 0.3, 0.1, 0.13, 0.5, 0, p).rotation.z = 0.3; } }
      else if (crop === 'mandioca') { for (let k = 0; k < 5; k++) { const l = part('sph', k % 2 ? '#4e9a3a' : '#5fae44', 0.12 * s + 0.08, 0.05, 0.42 * s, 0, 0.3 * s, 0, p); l.rotation.set(-0.6, k * 1.25, 0); l.position.set(Math.sin(k * 1.25) * 0.15 * s, 0.32 * s, Math.cos(k * 1.25) * 0.15 * s); }
        part('cyl', '#7a5a2a', 0.06, 0.32 * s, 0.06, 0, 0.16 * s, 0, p); if (st === 3) for (const k of [-1, 1]) part('cone', c.color, 0.12, 0.35, 0.12, k * 0.16, 0.06, 0.08, p).rotation.z = k * 1.3; }
      else if (crop === 'abobora') { part('ico', '#5fa040', 0.42 * s, 0.18 * s, 0.42 * s, 0, 0.09, 0, p); const tw = part('tor', '#5f9e3a', 0.2 * s, 0.2 * s, 0.2 * s, 0.1, 0.12, 0.1, p); tw.rotation.x = Math.PI / 2;
        if (st >= 2) { const k = st === 3 ? 1 : 0.6; part('sph', st === 3 ? c.color : '#e8b060', 0.46 * k, 0.34 * k, 0.46 * k, 0, 0.17 * k, 0, p); part('cyl', '#5a7a2a', 0.05, 0.12, 0.05, 0, 0.36 * k, 0, p); } }
      else if (crop === 'cana') { for (let k = 0; k < 3; k++) { const h = (1.3 - k * 0.15) * s; part('cyl', st === 3 ? (k % 2 ? c.color : '#c9d86a') : '#7ab84f', 0.06, h, 0.06, (k - 1) * 0.1, h / 2, (k % 2) * 0.08, p); part('cone', '#6fbf44', 0.18, 0.4 * s, 0.05, (k - 1) * 0.1, h, (k % 2) * 0.08, p).rotation.z = (k - 1) * 0.6; } }
    }
    bake(row);
  }
  g.userData.rows = g.children.slice(); return g;
}

// ---------- prédios ----------
const lighten = (c, k) => new THREE.Color(c).offsetHSL(0, 0, k).getStyle();
function trim(g, w, d, y, color = '#f6efe1') { part('box', color, w + 0.12, 0.08, 0.08, 0, y, d / 2 + 0.04, g); part('box', color, w + 0.12, 0.08, 0.08, 0, y, -d / 2 - 0.04, g); }
function windowAt(g, x, y, z, w = 0.4, h = 0.42, rotY = 0) { const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.y = rotY; g.add(o); part('box', '#f6efe1', w + 0.1, h + 0.1, 0.05, 0, 0, 0, o); part('box', '#ffe29a', w, h, 0.06, 0, 0, 0.005, o); part('box', '#f6efe1', w, 0.04, 0.07, 0, 0, 0.01, o); part('box', '#f6efe1', 0.04, h, 0.07, 0, 0, 0.01, o); part('box', '#8a5a2b', w + 0.16, 0.06, 0.12, 0, -h / 2 - 0.06, 0.04, o); }
function flowerBox(g, x, y, z, w = 0.5) { part('box', '#8a5a2b', w, 0.12, 0.14, x, y, z, g); for (let i = 0; i < 3; i++) part('sps', ['#ff6b8a', '#ffd23f', '#ffffff'][i], 0.1, 0.1, 0.1, x - w / 3 + i * w / 3, y + 0.1, z, g, false); }
function levelPlaque(g, lvl, x, z) { // plaquinha com estrelas douradas = nível
  part('box', '#7a4a20', 0.06, 0.5, 0.06, x, 0.25, z, g); part('box', '#c08850', 0.12 + lvl * 0.13, 0.2, 0.05, x, 0.5, z, g);
  for (let i = 0; i < lvl; i++) part('sps', '#ffd23f', 0.1, 0.1, 0.05, x - (lvl - 1) * 0.065 + i * 0.13, 0.5, z + 0.03, g, false);
}
export function makeBuilding(type, lvl = 1) {
  const n = BUILDINGS[type].size, g = new THREE.Group(), c = n / 2; const inner = new THREE.Group(); inner.position.set(c, 0, c); g.add(inner);
  // calçada de pedrinha com borda
  part('box', '#d8b77a', n - 0.08, 0.08, n - 0.08, 0, 0.04, 0, inner, false); part('box', '#b8925a', n - 0.3, 0.09, n - 0.3, 0, 0.045, 0, inner, false);
  const tint = Math.min(4, lvl - 1) * 0.05, L = Math.min(5, lvl);
  switch (type) {
    case 'celeiro': {
      const wall = lighten('#b3322b', tint * 0.5);
      part('box', wall, 3.2, 2.0, 2.6, 0, 1.08, 0, inner); roof(inner, 3.5, 2.9, 0.9, 2.08, L >= 5 ? '#c9962b' : '#6b3a1e');
      part('box', '#f6efe1', 3.3, 0.1, 2.7, 0, 2.06, 0, inner); trim(inner, 3.2, 2.6, 0.12); // beiral e rodapé
      for (const k of [-1, 1]) part('box', '#f6efe1', 0.1, 2.0, 0.1, k * 1.6, 1.08, 1.3, inner);
      part('box', '#f6efe1', 1.2, 1.3, 0.06, 0, 0.73, 1.31, inner); part('box', wall, 1.0, 1.1, 0.07, 0, 0.73, 1.32, inner);
      const x1 = part('box', '#f6efe1', 1.45, 0.08, 0.08, 0, 0.73, 1.37, inner); x1.rotation.z = 0.85; const x2 = part('box', '#f6efe1', 1.45, 0.08, 0.08, 0, 0.73, 1.37, inner); x2.rotation.z = -0.85;
      part('box', '#f6efe1', 0.6, 0.5, 0.06, 0, 1.75, 1.31, inner); part('box', '#3a2210', 0.45, 0.36, 0.07, 0, 1.75, 1.32, inner); part('cyl', '#e8c96a', 0.5, 0.12, 0.2, 0, 1.6, 1.38, inner).rotation.z = Math.PI / 2; // feno saindo
      windowAt(inner, -1.61, 1.2, 0.5, 0.4, 0.42, -Math.PI / 2); windowAt(inner, 1.61, 1.2, 0.5, 0.4, 0.42, Math.PI / 2);
      part('cyl', '#ddd', 0.06, 1.2, 0.06, 1.4, 3.0, -1.0, inner); const fl = part('box', '#f2a0b0', 0.6, 0.38, 0.03, 1.72, 3.4, -1.0, inner);
      // cata-vento no topo
      const vane = new THREE.Group(); vane.position.set(0, 3.05, 0); inner.add(vane); part('cyl', '#555', 0.04, 0.5, 0.04, 0, 0, 0, vane); part('cone4', '#c0392b', 0.12, 0.3, 0.05, 0.18, 0.2, 0, vane).rotation.z = -Math.PI / 2; part('box', '#333', 0.4, 0.03, 0.03, 0, 0.2, 0, vane); g.userData.vane = vane;
      if (L >= 2) { part('box', lighten(wall, -0.05), 1.0, 1.1, 1.6, -2.0 + 0.32, 0.6, -0.3, inner); roof(inner, 1.2, 1.8, 0.35, 1.15, '#6b3a1e'); } // puxadinho
      if (L >= 3) { part('box', '#f6efe1', 0.7, 0.6, 0.7, 0, 2.95, 0.6, inner); roof(inner, 0.9, 0.9, 0.3, 3.25, '#6b3a1e').position.z = 0.6; } // cúpula
      if (L >= 4) { const mill = new THREE.Group(); mill.position.set(1.35, 2.45, 1.0); inner.add(mill); part('cyl', '#7a4a20', 0.1, 0.4, 0.1, 0, -0.1, 0, mill).rotation.x = Math.PI / 2;
        const blades = new THREE.Group(); blades.position.z = 0.22; mill.add(blades); for (let i = 0; i < 4; i++) { const bl = part('box', '#f6efe1', 0.14, 0.9, 0.03, 0, 0.45, 0, new THREE.Group()); const arm = bl.parent; arm.rotation.z = i * Math.PI / 2; blades.add(arm); } g.userData.blades = blades; }
      flowerBox(inner, -0.9, 0.2, 1.38); flowerBox(inner, 0.9, 0.2, 1.38);
      levelPlaque(inner, L, -1.75, 1.75); g.userData.flag = fl; break;
    }
    case 'canteiro': {
      part('box', '#7a4a28', 1.86, 0.18, 1.86, 0, 0.1, 0, inner); part('box', '#5c3a1e', 1.7, 0.06, 1.7, 0, 0.2, 0, inner, false);
      for (let i = 0; i < 3; i++) part('box', '#4a2c14', 0.14, 0.06, 1.62, -0.6 + i * 0.6, 0.24, 0, inner, false);
      for (const k of [-1, 1]) { part('box', '#a0703c', 1.95, 0.12, 0.08, 0, 0.2, k * 0.95, inner); part('box', '#a0703c', 0.08, 0.12, 1.95, k * 0.95, 0.2, 0, inner); }
      const crops = new THREE.Group(); inner.add(crops); g.userData.crops = crops; break;
    }
    case 'serraria': {
      part('box', lighten('#9b6a3c', tint), 2.2, 1.3, 1.8, -0.2, 0.7, -0.2, inner); roof(inner, 2.5, 2.1, 0.5, 1.35, '#5d3a1a'); part('box', '#4a2c14', 2.6, 0.08, 2.2, -0.2, 1.36, -0.2, inner);
      for (let i = 0; i < 5; i++) part('box', '#7a4f2a', 0.05, 1.25, 0.04, -1.1 + i * 0.45, 0.7, 0.71, inner, false); // tábuas na parede
      windowAt(inner, -0.5, 0.85, 0.72, 0.36, 0.34);
      const saw = part('cyl', '#d0d4d8', 0.9, 0.05, 0.9, 1.0, 0.75, 0.6, inner); saw.rotation.x = Math.PI / 2; part('cyl', '#8a8f94', 0.2, 0.08, 0.2, 1.0, 0.75, 0.6, inner).rotation.x = Math.PI / 2;
      part('box', '#6b4423', 1.2, 0.5, 0.5, 1.0, 0.25, 0.6, inner); g.userData.spin = saw;
      for (let k = 0; k < Math.min(5, 2 + L); k++) part('cyl', k % 2 ? '#8a5a2b' : '#a06a35', 0.3, 1.5, 0.3, -0.9 + (k % 3) * 0.32, 0.25 + Math.floor(k / 3) * 0.28, 1.15, inner).rotation.z = Math.PI / 2;
      if (L >= 3) { const wheel = new THREE.Group(); wheel.position.set(-1.38, 0.75, -0.4); inner.add(wheel); part('cyl', '#7a4a20', 1.1, 0.12, 1.1, 0, 0, 0, wheel).rotation.z = Math.PI / 2; for (let i = 0; i < 6; i++) { const pd = part('box', '#a0703c', 0.16, 0.25, 0.08, 0, 0, 0, new THREE.Group()); pd.position.y = 0.55; pd.parent.rotation.x = i * Math.PI / 3; wheel.add(pd.parent); } g.userData.wheel = wheel; }
      levelPlaque(inner, L, 1.2, -1.2); break;
    }
    case 'racao': {
      part('box', lighten('#7f9fb5', tint), 2.0, 1.4, 1.6, -0.3, 0.75, 0, inner); roof(inner, 2.2, 1.8, 0.4, 1.45, '#4b6478'); trim(inner, 2.0, 1.6, 1.46, '#dfe7ec');
      windowAt(inner, -0.6, 0.85, 0.81, 0.36, 0.34); part('box', '#3a4a58', 0.5, 0.8, 0.05, 0.25, 0.48, 0.81, inner);
      part('cyl', '#bfc7cc', 0.9, 2.2, 0.9, 0.9, 1.15, -0.5, inner); part('cone', '#8f9aa1', 1.0, 0.5, 1.0, 0.9, 2.5, -0.5, inner); for (let i = 1; i < 4; i++) part('cyl', '#9aa3a8', 0.94, 0.05, 0.94, 0.9, i * 0.55, -0.5, inner, false);
      part('cyl', '#5a5a5a', 0.25, 0.8, 0.25, -0.9, 1.9, -0.4, inner); part('cyl', '#3a3a3a', 0.3, 0.08, 0.3, -0.9, 2.3, -0.4, inner);
      g.userData.smokes = [0, 1, 2].map((i) => { const m = part('sph', '#f4f4f4', 0.35, 0.35, 0.35, -0.9, 2.5, -0.4, inner, false); m.userData.ph = i / 3; return m; });
      part('sph', '#e8d29a', 0.5, 0.5, 0.4, 0.8, 0.35, 0.9, inner); part('sph', '#e8d29a', 0.5, 0.5, 0.4, 0.3, 0.3, 1.0, inner); if (L >= 3) part('sph', '#e8d29a', 0.45, 0.45, 0.4, 0.55, 0.7, 0.95, inner);
      levelPlaque(inner, L, -1.2, 1.2); break;
    }
    case 'silo': {
      const h = 2.0 + lvl * 0.25; part('cyl', '#dfe4e7', 1.9, h, 1.9, 0, h / 2 + 0.08, 0, inner); part('sph', L >= 4 ? '#d9a441' : '#b0b8bd', 1.95, 1.2, 1.95, 0, h + 0.08, 0, inner);
      for (let i = 1; i < 4; i++) part('cyl', '#9aa3a8', 1.94, 0.06, 1.94, 0, i * h / 4, 0, inner, false);
      for (let i = 0; i < Math.floor(h / 0.3); i++) part('box', '#7a7f84', 0.2, 0.03, 0.03, 0.5, 0.25 + i * 0.3, 0.92, inner, false); // escadinha
      part('box', '#7a7f84', 0.03, h, 0.03, 0.4, h / 2, 0.93, inner, false); part('box', '#7a7f84', 0.03, h, 0.03, 0.6, h / 2, 0.93, inner, false);
      part('box', '#c0392b', 0.5, 0.7, 0.06, -0.2, 0.45, 0.95, inner); part('cone', '#c0392b', 0.24, 0.3, 0.24, 0, h + 0.78, 0, inner); break;
    }
    case 'quartel': {
      part('box', '#7a5233', 2.6, 0.06, 2.6, 0, 0.1, 0, inner, false); part('cyl', '#6b4a2a', 2.2, 0.05, 2.0, 0, 0.12, 0.2, inner, false); part('cyl', '#5a3a20', 0.9, 0.06, 0.7, 0.5, 0.14, 0.5, inner, false); // poça de lama
      for (const [x, z, w, d] of [[0, -1.3, 2.8, 0.12], [0, 1.3, 2.8, 0.12], [-1.3, 0, 0.12, 2.8], [1.3, 0.5, 0.12, 1.6]]) part('box', '#f2a0b0', w, 0.6, d, x, 0.35, z, inner);
      for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) part('box', '#d77b8c', 0.2, 0.75, 0.2, x, 0.4, z, inner);
      part('box', '#d77b8c', 1.2, 0.9, 1.0, -0.6, 0.5, -0.6, inner); roof(inner, 1.4, 1.2, 0.35, 0.95, '#8a3b4a'); part('box', '#3a1a20', 0.4, 0.55, 0.05, -0.6, 0.32, -0.09, inner);
      for (let i = 0; i < L; i++) part('box', '#ffd23f', 0.1, 0.1, 0.1, -1.0 + i * 0.2, 0.73, 1.38, inner, false); // dummies de treino crescem com nível
      for (let i = 0; i < Math.min(3, L); i++) { const d = new THREE.Group(); d.position.set(0.5 + i * 0.35, 0, -0.5); inner.add(d); part('cyl', '#8a5a2b', 0.06, 0.6, 0.06, 0, 0.3, 0, d); part('sph', '#e8d29a', 0.3, 0.35, 0.25, 0, 0.6, 0, d); }
      part('cyl', '#ddd', 0.05, 1.6, 0.05, 1.1, 0.9, -1.1, inner); const fl = part('box', '#c0392b', 0.55, 0.35, 0.03, 1.38, 1.5, -1.1, inner); g.userData.flag = fl; break;
    }
    case 'acampamento': {
      part('cyl', '#6b4a2a', 3.4, 0.06, 3.2, 0, 0.1, 0, inner, false); part('cyl', '#5a3a20', 1.6, 0.07, 1.2, 0.4, 0.12, 0.4, inner, false); part('cyl', '#7a5a3a', 0.5, 0.075, 0.4, -0.5, 0.12, 0.7, inner, false);
      const tents = Math.min(4, 1 + L); const spots = [[-1.0, -0.9, '#d9c27a'], [1.0, -1.0, '#c9a85a'], [-1.25, 0.2, '#e0b070'], [1.25, 0.1, '#d9c27a']];
      for (let i = 0; i < tents; i++) { const [x, z, col] = spots[i]; const t = part('cone4', col, 1.1, 1.0, 1.1, x, 0.55, z, inner); t.rotation.y = Math.PI / 4; part('box', '#5a3a20', 0.25, 0.4, 0.05, x, 0.22, z + 0.42, inner, false); part('cyl', '#7a4a20', 0.04, 0.3, 0.04, x, 1.15, z, inner); }
      for (let i = 0; i < 3; i++) part('cyl', '#8a5a2b', 0.22, 0.9, 0.22, -1.2 + i * 0.25, 0.15, 1.2, inner).rotation.z = Math.PI / 2;
      // fogueira
      for (let i = 0; i < 6; i++) part('ico', '#8a8a8a', 0.16, 0.12, 0.16, 0.2 + Math.cos(i) * 0.25, 0.12, -0.1 + Math.sin(i) * 0.25, inner, false);
      const fire = part('cone', '#ff9a2e', 0.25, 0.4, 0.25, 0.2, 0.3, -0.1, inner, false); fire.material = mat('#ff9a2e', { emissive: '#ff5a00', emissiveIntensity: 0.7 }); g.userData.fire = fire;
      part('box', '#f5deb3', 0.9, 0.45, 0.05, 1.3, 0.6, 1.4, inner); part('box', '#7a4a20', 0.06, 0.5, 0.06, 1.3, 0.25, 1.38, inner); break;
    }
    case 'torre': {
      for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) part('box', '#8a5a2b', 0.16, 1.7, 0.16, x, 0.85, z, inner);
      for (const k of [-1, 1]) { const x1 = part('box', '#a0703c', 0.06, 1.6, 0.06, k * 0.6, 0.85, 0, inner); x1.rotation.x = 0.65; const z1 = part('box', '#a0703c', 0.06, 1.6, 0.06, 0, 0.85, k * 0.6, inner); z1.rotation.z = 0.65; }
      part('box', '#a0703c', 1.6, 0.16, 1.6, 0, 1.72, 0, inner); for (const k of [-1, 1]) { part('box', '#8a5a2b', 1.6, 0.25, 0.06, 0, 1.92, k * 0.78, inner); part('box', '#8a5a2b', 0.06, 0.25, 1.6, k * 0.78, 1.92, 0, inner); }
      const head = new THREE.Group(); head.position.set(0, 1.95, 0); inner.add(head);
      part('cyl', '#5d3a1a', 0.7, 0.3, 0.7, 0, 0, 0, head);
      const gun = part('cyl', L >= 3 ? '#e74c3c' : '#f2c12e', 0.34, 1.1, 0.34, 0, 0.25, 0.35, head); gun.rotation.x = Math.PI / 2.4;
      part('cone', '#6fbf44', 0.45, 0.6, 0.45, 0, 0.1, -0.15, head).rotation.x = -0.8; part('cyl', '#e8d07a', 0.3, 0.3, 0.3, 0, 0.22, -0.3, head);
      if (L >= 2) { const fl = part('box', '#c0392b', 0.4, 0.25, 0.03, 0.78, 2.6, -0.6, inner); part('cyl', '#ddd', 0.04, 0.9, 0.04, 0.58, 2.35, -0.6, inner); g.userData.flag = fl; }
      levelPlaque(inner, L, 0.95, 0.95); g.userData.aim = head; break;
    }
    case 'casinha': {
      part('box', '#c0392b', 1.2, 0.9, 1.1, -0.1, 0.5, -0.2, inner); roof(inner, 1.4, 1.3, 0.4, 0.95, '#6b3a1e'); part('box', '#f6efe1', 1.5, 0.07, 1.4, -0.1, 0.94, -0.2, inner);
      part('box', '#2a1408', 0.45, 0.55, 0.05, -0.1, 0.35, 0.36, inner); part('box', '#f5deb3', 0.5, 0.16, 0.04, -0.1, 0.78, 0.37, inner);
      part('cyl', '#9aa3a8', 0.3, 0.1, 0.3, 0.75, 0.1, -0.5, inner); part('box', '#f6efe1', 0.4, 0.06, 0.12, -0.6, 0.12, 0.65, inner); // pote e osso
      const dog = new THREE.Group(); dog.position.set(0.45, 0, 0.6); inner.add(dog);
      part('box', '#d99a4e', 0.34, 0.3, 0.55, 0, 0.3, 0, dog); part('box', '#d99a4e', 0.3, 0.3, 0.3, 0, 0.5, 0.32, dog); part('box', '#7a4a20', 0.08, 0.16, 0.06, -0.12, 0.66, 0.3, dog); part('box', '#7a4a20', 0.08, 0.16, 0.06, 0.12, 0.66, 0.3, dog);
      part('box', '#222', 0.08, 0.06, 0.04, 0, 0.48, 0.48, dog); part('box', '#c0392b', 0.32, 0.05, 0.1, 0, 0.36, 0.22, dog); for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) part('box', '#c98a3e', 0.08, 0.16, 0.08, x, 0.08, z, dog);
      const tail = part('box', '#d99a4e', 0.05, 0.05, 0.25, 0, 0.42, -0.36, dog); tail.rotation.x = -0.6; bake(dog); g.userData.dog = dog; break;
    }
  }
  bake(g, Object.values(g.userData).flat()); for (const k of ['blades', 'wheel', 'vane']) if (g.userData[k]) bake(g.userData[k]);
  return g;
}
export function makeScaffold(n) {
  const g = new THREE.Group(); const c = n / 2, Y = '#d9a441', D = '#b07d2a';
  for (const [x, z] of [[0.2, 0.2], [n - 0.2, 0.2], [0.2, n - 0.2], [n - 0.2, n - 0.2]]) part('box', Y, 0.1, 1.9, 0.1, x, 0.95, z, g);
  for (const y of [0.8, 1.7]) { part('box', D, n - 0.3, 0.08, 0.3, c, y, 0.2, g); part('box', D, n - 0.3, 0.08, 0.3, c, y, n - 0.2, g); part('box', Y, 0.08, 0.08, n - 0.3, 0.2, y, c, g); part('box', Y, 0.08, 0.08, n - 0.3, n - 0.2, y, c, g); }
  for (const z of [0.2, n - 0.2]) { const br = part('box', Y, Math.hypot(n - 0.4, 0.9), 0.06, 0.06, c, 1.25, z, g); br.rotation.z = Math.atan2(0.9, n - 0.4); }
  part('box', '#f5c242', 0.8, 0.5, 0.06, c, 1.25, n - 0.12, g); part('box', '#222', 0.8, 0.08, 0.07, c, 1.38, n - 0.11, g, false); part('box', '#222', 0.8, 0.08, 0.07, c, 1.12, n - 0.11, g, false);
  for (let i = 0; i < 3; i++) part('box', '#c08850', 0.9, 0.06, 0.2, 0.6 + i * 0.05, 0.12 + i * 0.07, n - 0.6, g); // pilha de tábuas
  part('cone', '#ff7a1a', 0.3, 0.45, 0.3, n - 0.45, 0.25, n - 0.5, g); part('cyl', '#fff', 0.24, 0.07, 0.24, n - 0.45, 0.25, n - 0.5, g, false); // cone de obra
  const hammer = new THREE.Group(); hammer.position.set(c, 1.8, n - 0.25); g.add(hammer); part('box', '#7a4a20', 0.06, 0.45, 0.06, 0, 0.2, 0, hammer); part('box', '#777', 0.25, 0.12, 0.12, 0, 0.42, 0, hammer);
  bake(g, [hammer]); bake(hammer); g.userData.hammer = hammer;
  return g;
}
export function makeRubble(n) {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) part(i % 3 ? 'ico' : 'dode', i % 2 ? '#6d5b4b' : '#8a7560', 0.5 + (i % 3) * 0.2, 0.3, 0.5, 0.4 + ((i * 37) % 10) / 10 * (n - 0.8), 0.15, 0.4 + ((i * 53) % 10) / 10 * (n - 0.8), g);
  for (let i = 0; i < 3; i++) { const p = part('box', '#7a4f2a', 0.8, 0.06, 0.12, 0.6 + i * 0.5, 0.2, n / 2 + (i - 1) * 0.4, g); p.rotation.y = i * 0.9; p.rotation.z = 0.2; }
  part('box', '#3d3229', n - 0.2, 0.05, n - 0.2, n / 2, 0.03, n / 2, g, false);
  return bake(g);
}
// ---------- decoração (tudo vai ser assado num mesh só) ----------
export function makeTree(s = 1, kind = 0) {
  const g = new THREE.Group();
  if (kind === 1) { part('cyl6', '#6b3e1c', 0.22 * s, 0.8 * s, 0.22 * s, 0, 0.4 * s, 0, g); for (let i = 0; i < 3; i++) part('cone', i % 2 ? '#2f7a3a' : '#3a8a44', (1.5 - i * 0.35) * s, 1.0 * s, (1.5 - i * 0.35) * s, 0, (1.0 + i * 0.55) * s, 0, g); }
  else if (kind === 2) { part('cyl6', '#7a4a20', 0.25 * s, 0.9 * s, 0.25 * s, 0, 0.45 * s, 0, g); part('sph', '#5aa83a', 1.4 * s, 1.2 * s, 1.4 * s, 0, 1.5 * s, 0, g); for (let i = 0; i < 5; i++) part('sps', '#e74c3c', 0.16 * s, 0.16 * s, 0.16 * s, Math.cos(i * 1.3) * 0.62 * s, (1.4 + (i % 2) * 0.3) * s, Math.sin(i * 1.3) * 0.62 * s, g, false); } // pé de maçã
  else { part('cyl6', '#7a4a20', 0.25 * s, 0.9 * s, 0.25 * s, 0, 0.45 * s, 0, g); part('ico', '#3f8f3a', 1.3 * s, 1.15 * s, 1.3 * s, 0, 1.35 * s, 0, g); part('ico', '#4fa548', 0.9 * s, 0.75 * s, 0.9 * s, 0.25 * s, 1.9 * s, 0.1 * s, g); part('ico', '#58b04e', 0.6 * s, 0.5 * s, 0.6 * s, -0.35 * s, 1.75 * s, -0.2 * s, g); }
  return g;
}
export function makeRock(s = 1) { const g = new THREE.Group(); part('dode', '#9a9489', 0.8 * s, 0.5 * s, 0.7 * s, 0, 0.18 * s, 0, g); part('dode', '#b3ada2', 0.45 * s, 0.35 * s, 0.4 * s, 0.4 * s, 0.12 * s, 0.15 * s, g); return g; }
export function makeBush(s = 1) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) part('ico', i % 2 ? '#4f9e3f' : '#5fb04a', 0.6 * s, 0.5 * s, 0.6 * s, (i - 1) * 0.35 * s, 0.25 * s, (i % 2) * 0.2 * s, g); return g; }
export function makeFlowers(seed) { const g = new THREE.Group(); const cs = ['#ff6b8a', '#ffd23f', '#ffffff', '#b38cff', '#ff9a3d']; for (let i = 0; i < 4; i++) { const a = i * 2.4 + seed, r = 0.2 + (i % 3) * 0.18; part('cyl6', '#4f9e3f', 0.03, 0.22, 0.03, Math.cos(a) * r, 0.11, Math.sin(a) * r, g, false); part('sps', cs[(i + seed) % cs.length], 0.13, 0.09, 0.13, Math.cos(a) * r, 0.24, Math.sin(a) * r, g, false); } return g; }
export function makeHay() { const g = new THREE.Group(); part('cyl', '#e8c96a', 0.9, 0.8, 0.9, 0, 0.45, 0, g).rotation.z = Math.PI / 2; part('cyl', '#d4b052', 0.92, 0.1, 0.92, 0, 0.45, 0, g, false).rotation.z = Math.PI / 2; return g; }
export function makeSign(text) {
  const g = new THREE.Group(); part('box', '#7a4a20', 0.1, 1.2, 0.1, -0.7, 0.6, 0, g); part('box', '#7a4a20', 0.1, 1.2, 0.1, 0.7, 0.6, 0, g);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(text, { font: 'bold 28px Nunito, sans-serif' }), side: THREE.DoubleSide }));
  m.position.y = 1.35; m.position.z = 0.06; g.add(m); part('box', '#6b4423', 1.95, 1.0, 0.08, 0, 1.35, 0, g); return g;
}
