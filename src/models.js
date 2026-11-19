// Modelos 100% procedurais (caixas, cilindros, cones low-poly com toon), no estilo do Docão do Shooter. Nada de glTF.
import * as THREE from 'three';
import { BUILDINGS, CROPS } from '../shared/rules.js';

const grad = (() => { const t = new THREE.DataTexture(new Uint8Array([110, 175, 235]), 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const matCache = new Map();
export function mat(color, extra) {
  const k = color + (extra ? JSON.stringify(extra) : ''); if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, ...(extra || {}) }); matCache.set(k, m); return m;
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14), cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 12), cone4: new THREE.ConeGeometry(0.5, 1, 4), sph: new THREE.SphereGeometry(0.5, 16, 12), ico: new THREE.IcosahedronGeometry(0.5, 0),
};
const prism = (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 0.5); s.lineTo(-0.5, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; })();
export function part(geo, color, sx, sy, sz, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(G[geo] || geo, typeof color === 'string' ? mat(color) : color); m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; if (parent) parent.add(m); return m;
}
function roof(g, w, d, h, y, color) { const r = new THREE.Mesh(prism, mat(color)); r.scale.set(w, h * 2, d); r.position.y = y; r.castShadow = true; g.add(r); return r; }

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
  part('sph', '#3a0806', 0.08, 0.11, 0.05, -0.08, -0.08, 0.58, head); part('sph', '#3a0806', 0.08, 0.11, 0.05, 0.08, -0.08, 0.58, head);
  part('sph', '#fffaf0', 0.2, 0.24, 0.12, -0.2, 0.14, 0.4, head); part('sph', '#fffaf0', 0.2, 0.24, 0.12, 0.2, 0.14, 0.4, head);
  part('sph', '#120604', 0.1, 0.13, 0.06, -0.2, 0.13, 0.46, head); part('sph', '#120604', 0.1, 0.13, 0.06, 0.2, 0.13, 0.46, head);
  part('box', '#2a1408', 0.2, 0.05, 0.05, -0.2, 0.32, 0.43, head).rotation.z = 0.2; part('box', '#2a1408', 0.2, 0.05, 0.05, 0.2, 0.32, 0.43, head).rotation.z = -0.2;
  part('sph', '#e2482a', 0.14, 0.08, 0.05, -0.36, -0.06, 0.36, head); part('sph', '#e2482a', 0.14, 0.08, 0.05, 0.36, -0.06, 0.36, head);
  part('box', '#2e0503', 0.18, 0.04, 0.04, 0, -0.3, 0.44, head);
  const earL = part('cone4', skin, 0.3, 0.38, 0.12, -0.36, 0.48, 0, head); earL.rotation.z = 0.5;
  const earR = part('cone4', skin, 0.3, 0.38, 0.12, 0.36, 0.48, 0, head); earR.rotation.z = -0.5;
  if (hat) { part('cyl', '#e9c46a', 1.35, 0.05, 1.35, 0, 0.44, 0, head); part('cyl', '#e9c46a', 0.62, 0.3, 0.62, 0, 0.6, 0, head); part('cyl', '#c0392b', 0.64, 0.08, 0.64, 0, 0.5, 0, head); }
  g.scale.setScalar(scale); g.userData = { body, head, earL, earR };
  return g;
}

// ---------- tropas ----------
export function makeUnit(u) {
  const g = new THREE.Group(), b = new THREE.Group(); g.add(b);
  const pig = (color, s, snoutC = '#e2848c') => {
    part('sph', color, 0.8 * s, 0.62 * s, 1.0 * s, 0, 0.42 * s, 0, b);
    part('sph', color, 0.6 * s, 0.56 * s, 0.56 * s, 0, 0.62 * s, 0.46 * s, b);
    part('cyl', snoutC, 0.26 * s, 0.14 * s, 0.26 * s, 0, 0.58 * s, 0.76 * s, b).rotation.x = Math.PI / 2;
    part('sph', '#111', 0.08 * s, 0.08 * s, 0.05 * s, -0.13 * s, 0.74 * s, 0.7 * s, b); part('sph', '#111', 0.08 * s, 0.08 * s, 0.05 * s, 0.13 * s, 0.74 * s, 0.7 * s, b);
    part('cone4', color, 0.16 * s, 0.22 * s, 0.08 * s, -0.2 * s, 0.92 * s, 0.4 * s, b).rotation.z = 0.5; part('cone4', color, 0.16 * s, 0.22 * s, 0.08 * s, 0.2 * s, 0.92 * s, 0.4 * s, b).rotation.z = -0.5;
    for (const [x, z] of [[-0.22, 0.25], [0.22, 0.25], [-0.22, -0.25], [0.22, -0.25]]) part('cyl', '#5a3020', 0.14 * s, 0.22 * s, 0.14 * s, x * s, 0.1 * s, z * s, b);
  };
  if (u === 'leitao') pig('#f4a3b4', 0.6);
  else if (u === 'atirador') { pig('#9c6b3f', 0.62, '#c98d6b'); for (let i = 0; i < 7; i++) { const c = part('cone', '#3a2a1a', 0.07, 0.32, 0.07, (i % 3 - 1) * 0.14, 0.62, -0.1 + (i / 7 - 0.5) * 0.5, b); c.rotation.x = -0.6; } }
  else if (u === 'javali') { pig('#5a3a24', 1.0, '#8a5a3c'); part('cone', '#fffaf0', 0.07, 0.25, 0.07, -0.17, 0.5, 0.95, b).rotation.x = -0.9; part('cone', '#fffaf0', 0.07, 0.25, 0.07, 0.17, 0.5, 0.95, b).rotation.x = -0.9; part('box', '#2a1a10', 0.12, 0.2, 0.7, 0, 0.98, 0.05, b); }
  else if (u === 'bomba') { pig('#f4a3b4', 0.62); part('sph', '#222', 0.42, 0.42, 0.42, 0, 0.78, -0.1, b); const f = part('cyl', '#c9a36b', 0.04, 0.22, 0.04, 0, 1.05, -0.1, b); f.rotation.z = 0.4; part('sph', '#ffb020', 0.1, 0.1, 0.1, 0.06, 1.16, -0.1, b, false); }
  g.userData.body = b; return g;
}

// ---------- plantas ----------
export function makeCrops(crop, stage) { // stage 0..1 (1 = pronto)
  const g = new THREE.Group(); const c = CROPS[crop]; if (!c) return g;
  const s = 0.35 + 0.65 * Math.min(1, stage);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = -0.6 + i * 0.6, z = -0.6 + j * 0.6, p = new THREE.Group(); p.position.set(x, 0.12, z); g.add(p);
    if (crop === 'milho') { part('cyl', '#5f9e3a', 0.08, 0.9 * s, 0.08, 0, 0.45 * s, 0, p); part('cone', '#6fbf44', 0.3 * s, 0.5 * s, 0.1, 0, 0.6 * s, 0, p).rotation.z = 0.5; if (stage >= 1) part('cyl', c.color, 0.16, 0.34, 0.16, 0.08, 0.62, 0, p); }
    else if (crop === 'mandioca') { part('ico', '#4e9a3a', 0.5 * s, 0.45 * s, 0.5 * s, 0, 0.22 * s, 0, p); if (stage >= 1) part('cone', c.color, 0.12, 0.35, 0.12, 0.15, 0.05, 0.1, p).rotation.z = 1.4; }
    else if (crop === 'abobora') { part('ico', '#5fa040', 0.38 * s, 0.2 * s, 0.38 * s, 0, 0.1, 0, p); if (stage >= 0.5) part('sph', c.color, 0.42 * s, 0.32 * s, 0.42 * s, 0, 0.16 * s, 0, p); }
    else if (crop === 'cana') { for (let k = 0; k < 3; k++) part('cyl', k % 2 ? c.color : '#6aa84f', 0.06, 1.3 * s, 0.06, (k - 1) * 0.1, 0.65 * s, (k % 2) * 0.08, p); }
  }
  return g;
}

// ---------- prédios ----------
export function makeBuilding(type, lvl = 1) {
  const n = BUILDINGS[type].size, g = new THREE.Group(), c = n / 2; const inner = new THREE.Group(); inner.position.set(c, 0, c); g.add(inner);
  part('box', '#c9a56a', n - 0.1, 0.08, n - 0.1, 0, 0.04, 0, inner, false); // calçada
  const tint = Math.min(4, lvl - 1) * 0.06;
  switch (type) {
    case 'celeiro': {
      part('box', '#b3322b', 3.2, 2.0, 2.6, 0, 1.08, 0, inner); roof(inner, 3.5, 2.9, 0.9, 2.08, '#6b3a1e');
      part('box', '#f6efe1', 1.2, 1.3, 0.06, 0, 0.73, 1.31, inner); part('box', '#b3322b', 1.0, 1.1, 0.07, 0, 0.73, 1.32, inner);
      const x1 = part('box', '#f6efe1', 1.45, 0.08, 0.08, 0, 0.73, 1.37, inner); x1.rotation.z = 0.85; const x2 = part('box', '#f6efe1', 1.45, 0.08, 0.08, 0, 0.73, 1.37, inner); x2.rotation.z = -0.85;
      part('box', '#f6efe1', 0.6, 0.5, 0.06, 0, 1.75, 1.31, inner); part('box', '#3a2210', 0.45, 0.36, 0.07, 0, 1.75, 1.32, inner);
      part('cyl', '#ddd', 0.06, 1.2, 0.06, 1.4, 3.0, -1.0, inner); const fl = part('box', '#f2a0b0', 0.6, 0.38, 0.03, 1.72, 3.4, -1.0, inner);
      for (let i = 0; i < lvl; i++) part('sph', '#ffd23f', 0.18, 0.18, 0.18, -1.2 + i * 0.32, 2.2, 1.35, inner, false); // estrelinhas = nível
      g.userData.flag = fl; break;
    }
    case 'canteiro': {
      part('box', '#6b4423', 1.8, 0.2, 1.8, 0, 0.12, 0, inner);
      for (let i = 0; i < 3; i++) part('box', '#4e3018', 1.7, 0.05, 0.12, 0, 0.23, -0.6 + i * 0.6, inner, false);
      const crops = new THREE.Group(); inner.add(crops); g.userData.crops = crops; break;
    }
    case 'serraria': {
      part('box', new THREE.Color('#9b6a3c').offsetHSL(0, 0, tint).getStyle(), 2.2, 1.3, 1.8, -0.2, 0.7, -0.2, inner); roof(inner, 2.5, 2.1, 0.5, 1.35, '#5d3a1a');
      const saw = part('cyl', '#c9c9c9', 0.9, 0.05, 0.9, 1.0, 0.75, 0.6, inner); saw.rotation.x = Math.PI / 2; g.userData.spin = saw;
      for (let i = 0; i < 3; i++) part('cyl', '#8a5a2b', 0.32, 1.5, 0.32, -0.9 + i * 0.34, 0.25, 1.15, inner).rotation.z = Math.PI / 2;
      part('cyl', '#8a5a2b', 0.32, 1.5, 0.32, -0.73, 0.55, 1.15, inner).rotation.z = Math.PI / 2; break;
    }
    case 'racao': {
      part('box', '#7f9fb5', 2.0, 1.4, 1.6, -0.3, 0.75, 0, inner); roof(inner, 2.2, 1.8, 0.4, 1.45, '#4b6478');
      part('cyl', '#bfc7cc', 0.9, 2.2, 0.9, 0.9, 1.15, -0.5, inner); part('cone', '#8f9aa1', 1.0, 0.5, 1.0, 0.9, 2.5, -0.5, inner);
      part('cyl', '#555', 0.25, 0.8, 0.25, -0.9, 1.9, -0.4, inner); const smoke = part('sph', '#eeeeee', 0.35, 0.35, 0.35, -0.9, 2.5, -0.4, inner, false); g.userData.smoke = smoke;
      part('sph', '#e8d29a', 0.5, 0.5, 0.4, 0.8, 0.35, 0.9, inner); part('sph', '#e8d29a', 0.5, 0.5, 0.4, 0.3, 0.3, 1.0, inner); break;
    }
    case 'silo': {
      const h = 2.0 + lvl * 0.25; part('cyl', '#d8dde0', 1.9, h, 1.9, 0, h / 2 + 0.08, 0, inner); part('sph', '#b0b8bd', 1.95, 1.2, 1.95, 0, h + 0.08, 0, inner);
      for (let i = 1; i < 4; i++) part('cyl', '#9aa3a8', 1.94, 0.06, 1.94, 0, i * h / 4, 0, inner, false);
      part('box', '#c0392b', 0.5, 0.7, 0.06, 0, 0.45, 0.95, inner); break;
    }
    case 'quartel': {
      part('box', '#7a5233', 2.6, 0.06, 2.6, 0, 0.1, 0, inner, false); part('cyl', '#6b4a2a', 2.2, 0.05, 2.0, 0, 0.12, 0.2, inner, false);
      for (const [x, z, w, d] of [[0, -1.3, 2.8, 0.12], [0, 1.3, 2.8, 0.12], [-1.3, 0, 0.12, 2.8], [1.3, 0.5, 0.12, 1.6]]) part('box', '#f2a0b0', w, 0.6, d, x, 0.35, z, inner);
      part('box', '#d77b8c', 1.2, 0.9, 1.0, -0.6, 0.5, -0.6, inner); roof(inner, 1.4, 1.2, 0.35, 0.95, '#8a3b4a');
      part('cyl', '#ddd', 0.05, 1.6, 0.05, 1.1, 0.9, -1.1, inner); const fl = part('box', '#c0392b', 0.55, 0.35, 0.03, 1.38, 1.5, -1.1, inner); g.userData.flag = fl; break;
    }
    case 'acampamento': {
      part('cyl', '#6b4a2a', 3.4, 0.06, 3.2, 0, 0.1, 0, inner, false); part('cyl', '#5a3a20', 1.6, 0.07, 1.2, 0.4, 0.12, 0.4, inner, false);
      part('cone4', '#d9c27a', 1.2, 1.1, 1.2, -1.0, 0.6, -0.9, inner).rotation.y = Math.PI / 4; part('cone4', '#c9a85a', 1.0, 0.9, 1.0, 1.0, 0.5, -1.0, inner).rotation.y = Math.PI / 4;
      for (let i = 0; i < 3; i++) part('cyl', '#8a5a2b', 0.22, 0.9, 0.22, -1.2 + i * 0.25, 0.15, 1.2, inner).rotation.z = Math.PI / 2;
      part('box', '#f5deb3', 0.9, 0.45, 0.05, 1.3, 0.6, 1.4, inner); break;
    }
    case 'torre': {
      for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) part('box', '#8a5a2b', 0.16, 1.7, 0.16, x, 0.85, z, inner);
      part('box', '#a0703c', 1.6, 0.16, 1.6, 0, 1.72, 0, inner);
      const head = new THREE.Group(); head.position.set(0, 1.95, 0); inner.add(head);
      part('cyl', '#5d3a1a', 0.7, 0.3, 0.7, 0, 0, 0, head);
      const gun = part('cyl', '#f2c12e', 0.34, 1.1, 0.34, 0, 0.25, 0.35, head); gun.rotation.x = Math.PI / 2.4;
      part('cone', '#6fbf44', 0.45, 0.6, 0.45, 0, 0.1, -0.15, head).rotation.x = -0.8; g.userData.aim = head; break;
    }
    case 'casinha': {
      part('box', '#c0392b', 1.2, 0.9, 1.1, -0.1, 0.5, -0.2, inner); roof(inner, 1.4, 1.3, 0.4, 0.95, '#6b3a1e');
      part('box', '#2a1408', 0.45, 0.55, 0.05, -0.1, 0.35, 0.36, inner);
      const dog = new THREE.Group(); dog.position.set(0.45, 0, 0.6); inner.add(dog);
      part('box', '#d99a4e', 0.34, 0.3, 0.55, 0, 0.3, 0, dog); part('box', '#d99a4e', 0.3, 0.3, 0.3, 0, 0.5, 0.32, dog); part('box', '#7a4a20', 0.08, 0.16, 0.06, -0.12, 0.66, 0.3, dog); part('box', '#7a4a20', 0.08, 0.16, 0.06, 0.12, 0.66, 0.3, dog);
      part('box', '#222', 0.08, 0.06, 0.04, 0, 0.48, 0.48, dog); g.userData.dog = dog; break;
    }
  }
  return g;
}
export function makeScaffold(n) {
  const g = new THREE.Group(); const c = n / 2;
  for (const [x, z] of [[0.2, 0.2], [n - 0.2, 0.2], [0.2, n - 0.2], [n - 0.2, n - 0.2]]) part('box', '#d9a441', 0.1, 1.6, 0.1, x, 0.8, z, g);
  part('box', '#d9a441', n - 0.3, 0.08, 0.1, c, 1.5, 0.2, g); part('box', '#d9a441', n - 0.3, 0.08, 0.1, c, 1.5, n - 0.2, g);
  part('box', '#f5c242', 0.7, 0.5, 0.06, c, 1.2, n - 0.15, g);
  return g;
}
export function makeRubble(n) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) part('ico', i % 2 ? '#6d5b4b' : '#8a7560', 0.5 + (i % 3) * 0.2, 0.3, 0.5, 0.4 + ((i * 37) % 10) / 10 * (n - 0.8), 0.15, 0.4 + ((i * 53) % 10) / 10 * (n - 0.8), g);
  part('box', '#3d3229', n - 0.2, 0.05, n - 0.2, n / 2, 0.03, n / 2, g, false);
  return g;
}
export function makeTree(s = 1) {
  const g = new THREE.Group(); part('cyl', '#7a4a20', 0.25 * s, 0.9 * s, 0.25 * s, 0, 0.45 * s, 0, g); part('ico', '#3f8f3a', 1.2 * s, 1.1 * s, 1.2 * s, 0, 1.3 * s, 0, g); part('ico', '#4fa548', 0.8 * s, 0.7 * s, 0.8 * s, 0.2 * s, 1.85 * s, 0.1 * s, g); return g;
}
export function makeSign(text) {
  const g = new THREE.Group(); part('box', '#7a4a20', 0.1, 1.2, 0.1, 0, 0.6, 0, g);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(text, { font: 'bold 28px sans-serif' }), side: THREE.DoubleSide }));
  m.position.y = 1.35; g.add(m); return g;
}
