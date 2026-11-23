/*
  Lemon Garden — 3D game (Three.js), no build step, GitHub Pages compatible.
  All in-game text is in English.
*/
import * as THREE from 'three';

/* ====================================================================
   Utilitare
   ==================================================================== */
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const angleLerp = (a, b, t) => {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const wrapNear = (v, c, half) => {
  const span = half * 2;
  const d = ((v - c + half) % span + span) % span - half;
  return c + d;
};

/* ====================================================================
   Browser suportat: doar Safari și Chrome
   ==================================================================== */
function browserOK() {
  const ua = navigator.userAgent;
  const other = /Edg|EdgA|EdgiOS|OPR|OPiOS|Opera|SamsungBrowser|FxiOS|Firefox|Focus|YaBrowser|Vivaldi|UCBrowser|DuckDuckGo/i.test(ua);
  const chrome = /Chrome|CriOS/.test(ua) && !other;
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium|Android/.test(ua) && !other;
  return chrome || safari;
}

const isTouch = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);

/* ====================================================================
   Setări lume
   ==================================================================== */
const CHUNK = 20;          // latura unui sector de iarbă (unități)
const VIEW = 3;            // câte sectoare se văd în jurul jucătorului
const TUFTS = 170;         // fire de iarbă per sector
const STEMS = 16;          // tulpini cu floare per sector (un procent devine floare)
const LEAVES_PER = 9;      // frunze căzute per sector
const TREE_CHANCE = 0.28;  // șansa de a avea un lămâi per sector
const HOUSE = { x: -6, z: -2 };
const PLATE = { x: -3.1, z: 0.8 };
const SPAWN = { x: 0, z: 4 };
const PLAYER_SPEED = 3.4;
const FLOWER_COLORS = [0xffffff, 0xff8fb1, 0xffe14d, 0xc79bff, 0xff9d5c];
const LABELS = {
  food: 'Grab food',
  plate: 'Put food down',
  dog: 'Pet the dog',
  cat: 'Pet the cat',
  crow: 'Scare the crow',
  lemon: 'Pick up lemon',
};
const RANGE = { food: 2.6, plate: 1.9, dog: 2.1, cat: 2.1, crow: 3.2, lemon: 0.9, walk: 0.3 };

/* ====================================================================
   Stare joc
   ==================================================================== */
const state = { lemons: 0, pets: 0, fed: 0, carry: 0, plateFood: false, muted: false };
const picked = new Set();     // lămâi deja culese (chei)
const dirs = new Set();       // 'up' | 'down' | 'left' | 'right' (taste + săgeți pe ecran)
let goal = null;              // destinație de mers (atingere / click)
let camYaw = 0;
let camPitch = 0.42;
let camDist = 6.6;
let toastTimer = 0;

/* ====================================================================
   Renderer, scenă, cameră
   ==================================================================== */
const canvas = $('scene');
let renderer;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdeefc, 30, 92);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dummy = new THREE.Object3D();
const pickables = new Set();   // obiecte care pot fi atinse/click-uite

/* ====================================================================
   Audio (sintetizat cu Web Audio — nu sunt fișiere externe)
   ==================================================================== */
let actx = null;
let master = null;
let noiseBuf = null;
let windNode = null;

function ensureAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = state.muted ? 0 : 0.8;
  master.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startWind();
}

function startWind() {
  const s = actx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const g = actx.createGain();
  g.gain.value = 0.04;
  const lfo = actx.createOscillator();
  lfo.frequency.value = 0.09;
  const lg = actx.createGain();
  lg.gain.value = 0.025;
  lfo.connect(lg).connect(g.gain);
  s.connect(lp).connect(g).connect(master);
  s.start();
  lfo.start();
  windNode = s;
}

// Nod de ieșire cu panoramare stereo și volum în funcție de distanță
function sfxOut(sp) {
  const pn = actx.createStereoPanner();
  pn.pan.value = sp ? sp.pan : 0;
  const g = actx.createGain();
  g.gain.value = sp ? sp.v : 1;
  pn.connect(g).connect(master);
  return pn;
}

function spatial(x, z) {
  const rx = x - player.x;
  const rz = z - player.z;
  const d = Math.hypot(rx, rz);
  const v = clamp(1 - d / 34, 0, 1);
  const right = rx * Math.cos(camYaw) - rz * Math.sin(camYaw);
  const pan = clamp(right / Math.max(d, 0.5), -1, 1) * 0.85;
  return { v: v * v, pan };
}

function tone({ type = 'sine', f0, f1, dur = 0.2, vol = 0.3, at = 0, sp = null, filt = null }) {
  if (!actx) return;
  const t = actx.currentTime + at;
  const o = actx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filt) {
    const f = actx.createBiquadFilter();
    f.type = filt.type;
    f.frequency.value = filt.f;
    f.Q.value = filt.q || 1;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(sfxOut(sp));
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.1, vol = 0.3, at = 0, f = 1000, q = 1, type = 'bandpass', sp = null }) {
  if (!actx) return;
  const t = actx.currentTime + at;
  const s = actx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = actx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(sfxOut(sp));
  s.start(t, Math.random(), dur + 0.05);
  s.stop(t + dur + 0.06);
}

const SFX = {
  bark(sp) {
    for (let i = 0; i < 2; i++) {
      tone({ type: 'sawtooth', f0: 470, f1: 190, dur: 0.17, vol: 0.2, at: i * 0.26, sp, filt: { type: 'lowpass', f: 1100, q: 3 } });
      noise({ dur: 0.05, vol: 0.14, at: i * 0.26, f: 1200, q: 0.8, sp });
    }
  },
  meow(sp) {
    tone({ type: 'sawtooth', f0: 420, f1: 740, dur: 0.36, vol: 0.14, sp, filt: { type: 'bandpass', f: 1100, q: 2 } });
    tone({ type: 'sawtooth', f0: 740, f1: 430, dur: 0.4, vol: 0.12, at: 0.36, sp, filt: { type: 'bandpass', f: 1000, q: 2 } });
  },
  purr(sp, dur = 1.6) {
    if (!actx) return;
    const t = actx.currentTime;
    const s = actx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    const g = actx.createGain();
    g.gain.value = 0.18;
    const lfo = actx.createOscillator();
    lfo.frequency.value = 26;
    const lg = actx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(g.gain);
    s.connect(lp).connect(g).connect(sfxOut(sp));
    s.start(t);
    lfo.start(t);
    s.stop(t + dur);
    lfo.stop(t + dur);
  },
  caw(sp) {
    for (const at of [0, 0.23]) {
      tone({ type: 'sawtooth', f0: 580, f1: 300, dur: 0.18, vol: 0.2, at, sp, filt: { type: 'bandpass', f: 1200, q: 3 } });
      noise({ dur: 0.08, vol: 0.05, at, f: 2000, sp });
    }
  },
  chomp(sp) {
    noise({ dur: 0.05, vol: 0.3, f: 2400, q: 1.2, sp });
    noise({ dur: 0.05, vol: 0.2, at: 0.13, f: 2000, q: 1.2, sp });
  },
  pick(sp) {
    tone({ type: 'triangle', f0: 700, f1: 1400, dur: 0.12, vol: 0.22, sp });
  },
  place(sp) {
    tone({ type: 'sine', f0: 260, f1: 140, dur: 0.12, vol: 0.3, sp });
    noise({ dur: 0.02, vol: 0.2, f: 3000, sp });
  },
  ding(sp) {
    tone({ type: 'sine', f0: 1320, dur: 0.5, vol: 0.2, sp });
    tone({ type: 'sine', f0: 1980, dur: 0.5, vol: 0.1, at: 0.02, sp });
  },
  chime() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.28, vol: 0.16, at: i * 0.12 }));
  },
  step(sp) {
    noise({ dur: 0.07, vol: 0.06, f: 600, q: 0.7, sp });
  },
  chirp(sp) {
    const base = rnd(2600, 3800);
    for (let i = 0; i < 3; i++) {
      tone({ type: 'sine', f0: base + i * 180, f1: base + i * 180 + 480, dur: 0.08, vol: 0.07, at: i * 0.12, sp });
    }
  },
  flap(sp) {
    noise({ dur: 0.12, vol: 0.06, f: 900, q: 0.6, sp });
  },
};

/* ====================================================================
   Texturi și materiale
   ==================================================================== */
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function canvasFromImage(img, maxSide = 512) {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function texFromCanvas(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Fața decupată, cu margini estompate (ca să se lipească frumos pe cap)
function featherFace(img) {
  const c = canvasFromImage(img, 512);
  const g = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.52);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return texFromCanvas(c);
}

// Dungă tigrată peste blana pisicii, din poza decupată
function tabbyCanvas(img) {
  const c = canvasFromImage(img, 256);
  const g = c.getContext('2d');
  const r = mulberry32(7);
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const x0 = r() * c.width;
    g.strokeStyle = `rgba(120,62,22,${0.25 + r() * 0.35})`;
    g.lineWidth = 4 + r() * 7;
    g.beginPath();
    g.moveTo(x0, -10);
    for (let y = 0; y <= c.height + 10; y += 20) g.lineTo(x0 + Math.sin(y * 0.05 + i) * 8, y);
    g.stroke();
  }
  return c;
}

function radialCanvasTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return texFromCanvas(c);
}

const mats = {};
const geo = {};
let blobTex = null;

function buildMaterials(imgs) {
  const dogCoatTex = texFromCanvas(canvasFromImage(imgs.dogCoat, 256), true);
  const dogFaceTex = featherFace(imgs.dogFace);
  const catCoatTex = texFromCanvas(tabbyCanvas(imgs.catCoat), true);
  const catFaceTex = featherFace(imgs.catFace);

  mats.grass = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mats.flower = new THREE.MeshLambertMaterial();
  mats.leaf = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mats.fallLeaf = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mats.petal = new THREE.MeshLambertMaterial({ color: 0xffb8d6, side: THREE.DoubleSide });
  mats.ground = new THREE.MeshLambertMaterial({ color: 0x4f9d33 });
  mats.trunk = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  mats.foliage = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mats.lemon = new THREE.MeshStandardMaterial({ color: 0xffd53a, roughness: 0.4 });
  mats.lemonLeaf = new THREE.MeshStandardMaterial({ color: 0x3f9d2c, roughness: 0.6, side: THREE.DoubleSide });
  mats.wood = new THREE.MeshLambertMaterial({ color: 0xc08347 });
  mats.roof = new THREE.MeshLambertMaterial({ color: 0xb8432f });
  mats.bowl = new THREE.MeshStandardMaterial({ color: 0xd9352b, roughness: 0.4 });
  mats.kibble = new THREE.MeshStandardMaterial({ color: 0xa8632a, roughness: 0.7 });
  mats.plate = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  mats.plateRim = new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.3 });
  mats.crow = new THREE.MeshStandardMaterial({ color: 0x1c1e25, roughness: 0.6 });
  mats.beak = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5 });
  mats.tongue = new THREE.MeshStandardMaterial({ color: 0xff7f9f, roughness: 0.6 });
  mats.dogCoat = new THREE.MeshStandardMaterial({ map: dogCoatTex, color: 0xdfe3ea, roughness: 0.95 });
  mats.dogDark = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 1 });
  mats.dogTan = new THREE.MeshStandardMaterial({ color: 0xb88a57, roughness: 1 });
  mats.dogCream = new THREE.MeshStandardMaterial({ color: 0xefe9dc, roughness: 1 });
  mats.dogFace = new THREE.MeshStandardMaterial({ map: dogFaceTex, transparent: true, alphaTest: 0.03, roughness: 0.9, side: THREE.DoubleSide });
  mats.catCoat = new THREE.MeshStandardMaterial({ map: catCoatTex, roughness: 0.9 });
  mats.catLight = new THREE.MeshStandardMaterial({ color: 0xf0b77a, roughness: 0.9 });
  mats.catFace = new THREE.MeshStandardMaterial({ map: catFaceTex, transparent: true, alphaTest: 0.03, roughness: 0.9, side: THREE.DoubleSide });
  blobTex = radialCanvasTexture('rgba(20,40,10,0.5)', 'rgba(20,40,10,0)');
}

function lemonProfile() {
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    const r = 0.36 * Math.pow(Math.max(0, Math.cos(a)), 0.7);
    pts.push(new THREE.Vector2(r, 0.5 * Math.sin(a)));
  }
  return pts;
}

function tuftGeometry() {
  const pos = [];
  for (let k = 0; k < 3; k++) {
    const a = k * (TAU / 3) + 0.3;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const w = 0.035;
    const pts = [[-w, 0, 0], [w, 0, 0], [0, 1, 0.02]];
    for (const p of pts) pos.push(p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.08, 0.11, 0.2, 0);
  s.quadraticCurveTo(0.08, -0.11, 0, 0);
  return s;
}

function petalShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.06, 0.05, 0, 0.1);
  s.quadraticCurveTo(-0.06, 0.05, 0, 0);
  return s;
}

// Blană „pufoasă”: mică deformare a vârfurilor (consistentă între vertexuri duble)
function fluffGeo(g, amt) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const h = hash2(Math.round(x * 500) ^ 0x51ed, Math.round(y * 500) * 31 + Math.round(z * 500));
    const k = (h / 4294967296 - 0.5) * amt;
    p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function buildGeometry() {
  geo.tuft = tuftGeometry();
  geo.flower = new THREE.SphereGeometry(0.07, 8, 6);
  geo.leaf = new THREE.ShapeGeometry(leafShape());
  geo.petal = new THREE.ShapeGeometry(petalShape());
  geo.trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.9, 7);
  geo.foliage = new THREE.IcosahedronGeometry(1, 1);
  geo.lemon = new THREE.LatheGeometry(lemonProfile(), 22);
  geo.sphere = new THREE.SphereGeometry(1, 22, 16);
  geo.smallSphere = new THREE.SphereGeometry(1, 12, 10);
  geo.cone = new THREE.ConeGeometry(1, 1, 4);
  geo.wing = new THREE.BoxGeometry(0.26, 0.02, 0.12);
  geo.beakCone = new THREE.ConeGeometry(0.025, 0.1, 5);
  geo.plate = new THREE.CylinderGeometry(0.42, 0.4, 0.05, 22);
  geo.rim = new THREE.TorusGeometry(0.41, 0.02, 6, 26);
  geo.bowlCup = new THREE.CylinderGeometry(0.3, 0.22, 0.1, 16);
}

/* ====================================================================
   Cer, soare, nori, sol
   ==================================================================== */
let sky;
let sun;
const clouds = [];
let ground;

function buildSky() {
  const g = new THREE.SphereGeometry(320, 32, 16);
  const pos = g.attributes.position;
  const cols = [];
  const bottom = new THREE.Color(0xf1fbff);
  const mid = new THREE.Color(0xa9dcf7);
  const top = new THREE.Color(0x3d8fe0);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 320;
    if (y < 0) c.copy(bottom);
    else if (y < 0.35) c.copy(bottom).lerp(mid, y / 0.35);
    else c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.65));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);

  const sunTex = radialCanvasTexture('rgba(255,250,200,1)', 'rgba(255,240,150,0)');
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
  sun.scale.setScalar(90);
  scene.add(sun);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, fog: false });
  for (let k = 0; k < 9; k++) {
    const grp = new THREE.Group();
    const n = 4 + (k % 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(geo.smallSphere, cloudMat);
      s.position.set((j - n / 2) * 7 + rnd(-2, 2), rnd(-1.5, 1.5), rnd(-3, 3));
      s.scale.setScalar(rnd(6, 9));
      grp.add(s);
    }
    grp.userData.angle = k * (TAU / 9) + rnd(0, 0.3);
    grp.userData.h = rnd(70, 100);
    grp.userData.dir = k % 2 ? 1 : -1;
    scene.add(grp);
    clouds.push(grp);
  }
}

function updateSky(dt, cam) {
  sky.position.copy(cam);
  sun.position.set(cam.x + 120, cam.y + 170, cam.z - 200);
  for (const c of clouds) {
    c.userData.angle += dt * 0.012 * c.userData.dir;
    const a = c.userData.angle;
    c.position.set(cam.x + Math.cos(a) * 230, c.userData.h, cam.z + Math.sin(a) * 230);
    c.rotation.y = -a;
  }
}

/* ====================================================================
   Lume infinită: sectoare create dinamic în jurul jucătorului
   ==================================================================== */
const chunks = new Map();
let obstacles = [{ x: HOUSE.x, z: HOUSE.z, r: 1.25, ck: 'static' }];
const flyers = [];
let petalMesh;
let leafMesh;
let chunkPX = null;
let chunkPZ = null;

function buildChunk(cx, cz, key) {
  const r = mulberry32(hash2(cx, cz) ^ 0x9e3779b9);
  const ox = cx * CHUNK;
  const oz = cz * CHUNK;
  const group = new THREE.Group();
  scene.add(group);
  const c = { cx, cz, key, group, meshes: [], pickups: [] };
  const add = (m) => { group.add(m); c.meshes.push(m); return m; };
  const col = new THREE.Color();

  // iarbă și tulpini
  const grass = add(new THREE.InstancedMesh(geo.tuft, mats.grass, TUFTS + STEMS));
  const heads = [];
  for (let i = 0; i < TUFTS + STEMS; i++) {
    const stem = i >= TUFTS;
    const x = ox + r() * CHUNK;
    const z = oz + r() * CHUNK;
    const sy = stem ? 0.8 + r() * 0.35 : 0.25 + r() * 0.5;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, r() * TAU, 0);
    dummy.scale.set(0.8 + r() * 0.6, sy, 0.8 + r() * 0.6);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    if (stem) {
      col.setHSL(0.27 + r() * 0.03, 0.5, 0.36);
      if (r() < 0.45) heads.push({ x, y: sy, z });
    } else if (r() < 0.2) {
      col.setHSL(0.19 + r() * 0.04, 0.7, 0.45); // verde-gălbui de primăvară
    } else {
      col.setHSL(0.27 + r() * 0.05, 0.55 + r() * 0.2, 0.28 + r() * 0.12);
    }
    grass.setColorAt(i, col);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;

  // flori
  if (heads.length) {
    const fl = add(new THREE.InstancedMesh(geo.flower, mats.flower, heads.length));
    heads.forEach((h, i) => {
      dummy.position.set(h.x, h.y, h.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.8 + r() * 0.5);
      dummy.updateMatrix();
      fl.setMatrixAt(i, dummy.matrix);
      fl.setColorAt(i, col.set(FLOWER_COLORS[(r() * FLOWER_COLORS.length) | 0]));
    });
    fl.instanceMatrix.needsUpdate = true;
    if (fl.instanceColor) fl.instanceColor.needsUpdate = true;
  }

  // frunze căzute
  const leaves = add(new THREE.InstancedMesh(geo.leaf, mats.leaf, LEAVES_PER));
  for (let i = 0; i < LEAVES_PER; i++) {
    dummy.position.set(ox + r() * CHUNK, 0.02, oz + r() * CHUNK);
    dummy.rotation.set(-Math.PI / 2 + 0.12 * r(), r() * TAU, 0, 'YXZ');
    dummy.scale.setScalar(0.7 + r() * 0.6);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    if (r() < 0.35) col.setHSL(0.14, 0.8, 0.6);
    else col.setHSL(0.24 + r() * 0.04, 0.6, 0.38);
    leaves.setColorAt(i, col);
  }
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

  // lămâi (copaci)
  const trees = [];
  if (r() < TREE_CHANCE) {
    const tx = ox + 2 + r() * (CHUNK - 4);
    const tz = oz + 2 + r() * (CHUNK - 4);
    const far = Math.hypot(tx, tz) > 11 && Math.hypot(tx - HOUSE.x, tz - HOUSE.z) > 7;
    if (far) trees.push({ x: tx, z: tz, s: 0.9 + r() * 0.5 });
  }
  if (trees.length) {
    const trunks = add(new THREE.InstancedMesh(geo.trunk, mats.trunk, trees.length));
    const folI = add(new THREE.InstancedMesh(geo.foliage, mats.foliage, trees.length * 3));
    const lemI = add(new THREE.InstancedMesh(geo.lemon, mats.lemon, trees.length * 7));
    let fi = 0;
    let li = 0;
    trees.forEach((t, i) => {
      dummy.position.set(t.x, 0.95 * t.s, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        const bx = t.x + (r() - 0.5) * 1.4 * t.s;
        const by = (2.3 + r() * 0.5) * t.s;
        const bz = t.z + (r() - 0.5) * 1.4 * t.s;
        const br = (0.95 + r() * 0.35) * t.s;
        dummy.position.set(bx, by, bz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(br);
        dummy.updateMatrix();
        folI.setMatrixAt(fi, dummy.matrix);
        folI.setColorAt(fi, col.setHSL(0.31 + r() * 0.04, 0.5, 0.26 + r() * 0.08));
        fi++;
      }
      for (let k = 0; k < 7; k++) {
        const a = r() * TAU;
        const up = r() * 1.2 - 0.3;
        const rr = (1.1 + r() * 0.5) * t.s;
        dummy.position.set(t.x + Math.cos(a) * rr, (2.5 + up) * t.s, t.z + Math.sin(a) * rr);
        dummy.rotation.set(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU));
        dummy.scale.set(0.27, 0.36, 0.27);
        dummy.updateMatrix();
        lemI.setMatrixAt(li, dummy.matrix);
        li++;
      }
      obstacles.push({ x: t.x, z: t.z, r: 0.45, ck: key });
    });
    trunks.instanceMatrix.needsUpdate = true;
    folI.instanceMatrix.needsUpdate = true;
    if (folI.instanceColor) folI.instanceColor.needsUpdate = true;
    lemI.instanceMatrix.needsUpdate = true;
  }

  // lămâi culese pe jos (se pot strânge)
  if (r() < 0.6) {
    const n = r() < 0.4 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const key2 = `${cx}:${cz}:${j}`;
      if (picked.has(key2)) continue;
      const x = ox + 1.5 + r() * (CHUNK - 3);
      const z = oz + 1.5 + r() * (CHUNK - 3);
      const m = new THREE.Mesh(geo.lemon, mats.lemon);
      m.scale.setScalar(0.55);
      m.rotation.set(0, r() * TAU, Math.PI / 2, 'YXZ');
      m.position.set(x, 0.22, z);
      group.add(m);
      const rec = { x, z, mesh: m, key: key2, done: false };
      m.userData.pick = { kind: 'lemon', ref: rec };
      pickables.add(m);
      c.pickups.push(rec);
    }
  }
  return c;
}

function disposeChunk(c) {
  for (const rec of c.pickups) pickables.delete(rec.mesh);
  for (const m of c.meshes) {
    c.group.remove(m);
    if (m.isInstancedMesh) m.dispose();
  }
  scene.remove(c.group);
  obstacles = obstacles.filter((o) => o.ck !== c.key);
}

function updateChunks(force = false) {
  const pcx = Math.floor(player.x / CHUNK);
  const pcz = Math.floor(player.z / CHUNK);
  if (!force && pcx === chunkPX && pcz === chunkPZ) return;
  chunkPX = pcx;
  chunkPZ = pcz;
  for (let dx = -VIEW; dx <= VIEW; dx++) {
    for (let dz = -VIEW; dz <= VIEW; dz++) {
      const cx = pcx + dx;
      const cz = pcz + dz;
      const key = cx + ',' + cz;
      if (!chunks.has(key)) chunks.set(key, buildChunk(cx, cz, key));
    }
  }
  for (const [key, c] of chunks) {
    if (Math.abs(c.cx - pcx) > VIEW + 1 || Math.abs(c.cz - pcz) > VIEW + 1) {
      disposeChunk(c);
      chunks.delete(key);
    }
  }
}

function updatePickups(dt) {
  for (const c of chunks.values()) {
    for (const rec of c.pickups) {
      if (rec.done) continue;
      rec.mesh.rotation.y += dt * 1.2;
      rec.mesh.position.y = 0.22 + Math.sin(T * 2 + rec.x) * 0.03;
      if (Math.hypot(rec.x - player.x, rec.z - player.z) < 0.75) collectLemon(rec);
    }
  }
}

/* ====================================================================
   Cușca cu mâncare și farfuria
   ==================================================================== */
const FOOD_REF = { x: HOUSE.x, z: HOUSE.z };
const PLATE_REF = { x: PLATE.x, z: PLATE.z };
const plate = { kib: [] };

function buildHouse() {
  const g = new THREE.Group();
  g.position.set(HOUSE.x, 0, HOUSE.z);
  scene.add(g);
  const box = (w, h, d, m, x, y, z) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mm.position.set(x, y, z);
    g.add(mm);
    return mm;
  };
  box(1.8, 0.1, 1.6, mats.wood, 0, 0.05, 0);       // podea
  box(1.8, 1.2, 0.1, mats.wood, 0, 0.7, -0.75);    // peretele din spate
  box(0.1, 1.2, 1.6, mats.wood, -0.9, 0.7, 0);     // lateral stânga
  box(0.1, 1.2, 1.6, mats.wood, 0.9, 0.7, 0);      // lateral dreapta
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.8, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 1.78, 0);
  g.add(roof);

  // castronul cu mâncare (se poate atinge)
  const bowl = new THREE.Mesh(geo.bowlCup, mats.bowl);
  bowl.position.set(0, 0.16, 0.2);
  bowl.userData.pick = { kind: 'food', ref: FOOD_REF };
  g.add(bowl);
  pickables.add(bowl);
  const rr = mulberry32(99);
  for (let i = 0; i < 16; i++) {
    const k = new THREE.Mesh(geo.smallSphere, mats.kibble);
    const a = rr() * TAU;
    const d = rr() * 0.2;
    k.scale.setScalar(0.045);
    k.position.set(Math.cos(a) * d, 0.24 + rr() * 0.02, 0.2 + Math.sin(a) * d);
    k.userData.pick = { kind: 'food', ref: FOOD_REF };
    g.add(k);
    pickables.add(k);
  }
}

function buildPlate() {
  const g = new THREE.Group();
  g.position.set(PLATE.x, 0.03, PLATE.z);
  scene.add(g);
  const disc = new THREE.Mesh(geo.plate, mats.plate);
  disc.userData.pick = { kind: 'plate', ref: PLATE_REF };
  g.add(disc);
  pickables.add(disc);
  const rim = new THREE.Mesh(geo.rim, mats.plateRim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.03;
  g.add(rim);
  const rr = mulberry32(42);
  for (let i = 0; i < 12; i++) {
    const k = new THREE.Mesh(geo.smallSphere, mats.kibble);
    const a = rr() * TAU;
    const d = rr() * 0.28;
    k.scale.setScalar(0.05);
    k.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d);
    k.visible = false;
    k.userData.pick = { kind: 'plate', ref: PLATE_REF };
    g.add(k);
    plate.kib.push(k);
    pickables.add(k);
  }
}

function setPlateFood(on) {
  for (const k of plate.kib) k.visible = on;
}

/* ====================================================================
   Câini și pisici (construiți din primitive + poze decupate)
   ==================================================================== */
const animals = {};

function makeBlob(size) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  scene.add(m);
  return m;
}

function buildQuadruped(cfg) {
  const root = new THREE.Group();
  scene.add(root);
  const holder = new THREE.Group();
  holder.scale.setScalar(cfg.scale);
  root.add(holder);
  const L = 0.42;
  const bodyY = L + 0.2;
  const mesh = (g, m) => new THREE.Mesh(g, m);

  const body = mesh(fluffGeo(geo.sphere.clone(), 0.09), cfg.coat);
  body.scale.set(0.34, 0.28, 0.52);
  body.position.y = bodyY;
  holder.add(body);
  if (cfg.chest) {
    const chest = mesh(geo.smallSphere, mats.dogCream);
    chest.scale.set(0.19, 0.2, 0.22);
    chest.position.set(0, bodyY - 0.06, 0.27);
    holder.add(chest);
  }

  const legs = [];
  for (const [x, z] of [[-0.16, 0.3], [0.16, 0.3], [-0.16, -0.3], [0.16, -0.3]]) {
    const pv = new THREE.Group();
    pv.position.set(x, L, z);
    const up = mesh(new THREE.CylinderGeometry(0.07, 0.055, L, 8), cfg.coat);
    up.position.y = -L / 2;
    pv.add(up);
    const paw = mesh(geo.smallSphere, cfg.paw);
    paw.scale.set(0.075, 0.05, 0.1);
    paw.position.set(0, -L + 0.03, 0.02);
    pv.add(paw);
    holder.add(pv);
    legs.push(pv);
  }

  const tail = new THREE.Group();
  tail.position.set(0, bodyY + 0.06, -0.48);
  holder.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3(cfg.tailPts.map((p) => new THREE.Vector3(...p)));
  tail.add(mesh(new THREE.TubeGeometry(tailCurve, 14, cfg.tailR, 8, false), cfg.coat));

  const neck = new THREE.Group();
  neck.position.set(0, bodyY + 0.1, 0.4);
  holder.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.1);
  neck.add(head);
  const skull = mesh(fluffGeo(geo.sphere.clone(), 0.06), cfg.coat);
  skull.scale.set(0.23, 0.22, 0.24);
  head.add(skull);
  const face = mesh(new THREE.PlaneGeometry(cfg.faceW * 0.36, 0.4), cfg.face);
  face.position.set(0, 0, 0.245);
  head.add(face);
  for (const side of [-1, 1]) {
    let ear;
    if (cfg.pointy) {
      ear = mesh(geo.cone, cfg.ear);
      ear.scale.set(0.065, 0.13, 0.05);
      ear.position.set(side * 0.13, 0.25, 0.0);
      ear.rotation.z = -side * 0.22;
    } else if (side < 0) {
      ear = mesh(geo.smallSphere, cfg.ear);
      ear.scale.set(0.07, 0.13, 0.035);
      ear.position.set(-0.16, 0.17, -0.02);
      ear.rotation.z = 0.35;
    } else {
      ear = mesh(geo.smallSphere, cfg.ear);
      ear.scale.set(0.07, 0.1, 0.035);
      ear.position.set(0.16, 0.14, -0.04);
      ear.rotation.z = -0.9;
    }
    head.add(ear);
  }
  const tongue = mesh(geo.smallSphere, mats.tongue);
  tongue.scale.set(0.06, 0.025, 0.08);
  tongue.position.set(0, -0.14, 0.27);
  tongue.visible = false;
  head.add(tongue);

  const shadow = makeBlob(cfg.shadow);
  const a = {
    kind: cfg.kind,
    cfg,
    root,
    holder,
    body,
    head,
    neck,
    tail,
    legs,
    tongue,
    shadow,
    x: cfg.home.x,
    z: cfg.home.z,
    yaw: 0,
    home: cfg.home,
    speed: cfg.walk,
    state: 'idle',
    timer: rnd(1, 3),
    target: null,
    gait: 0,
    moving: false,
    happy: 0,
    eatTick: 0,
    neckX: 0,
    petCD: 0,
  };
  body.userData.pick = { kind: cfg.kind, ref: a };
  skull.userData.pick = { kind: cfg.kind, ref: a };
  pickables.add(body);
  pickables.add(skull);
  return a;
}

function buildAnimals() {
  animals.dog = buildQuadruped({
    kind: 'dog',
    scale: 1,
    home: { x: -3.6, z: 0.4, r: 3.2 },
    walk: 1.5,
    coat: mats.dogCoat,
    paw: mats.dogTan,
    ear: mats.dogDark,
    face: mats.dogFace,
    faceW: 1.0,
    chest: true,
    pointy: false,
    tailR: 0.05,
    tailPts: [[0, 0, 0], [0, 0.12, -0.14], [0, 0.24, -0.26], [0, 0.3, -0.34]],
    shadow: 1.7,
    height: 1.25,
  });
  animals.cat = buildQuadruped({
    kind: 'cat',
    scale: 0.6,
    home: { x: 3.4, z: -1.2, r: 4.2 },
    walk: 1.1,
    coat: mats.catCoat,
    paw: mats.catLight,
    ear: mats.catCoat,
    face: mats.catFace,
    faceW: 1.0,
    chest: false,
    pointy: true,
    tailR: 0.035,
    tailPts: [[0, 0, 0], [0, 0.18, -0.1], [0, 0.4, -0.12], [0, 0.52, -0.04]],
    shadow: 1.1,
    height: 0.8,
  });
  for (const a of [animals.dog, animals.cat]) pickWander(a);
  animals.cat.x = 3.4;
  animals.cat.z = -1.2;
  animals.dog.x = -3.6;
  animals.dog.z = 0.4;
}

function pickWander(a) {
  const ang = rnd(0, TAU);
  const d = Math.sqrt(Math.random()) * a.home.r;
  a.target = { x: a.home.x + Math.cos(ang) * d, z: a.home.z + Math.sin(ang) * d };
  a.state = 'walk';
}

// Mișcare spre (tx,tz); întoarce true când a ajuns (în raza arrive)
function stepTo(a, tx, tz, spd, dt, arrive = 0.1) {
  const dx = tx - a.x;
  const dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d <= arrive) return true;
  const st = Math.min(d, spd * dt);
  a.x += (dx / d) * st;
  a.z += (dz / d) * st;
  a.yaw = angleLerp(a.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
  a.moving = true;
  return false;
}

function updateAnimal(a, dt, t) {
  a.moving = false;
  a.happy = Math.max(0, a.happy - dt);
  a.petCD = Math.max(0, a.petCD - dt);

  if (a.state === 'plate') {
    if (!state.plateFood) {
      a.state = 'idle';
      a.timer = 2;
    } else if (stepTo(a, PLATE.x, PLATE.z, a.speed * 1.6, dt, 0.9)) {
      state.plateFood = false;
      setPlateFood(false);
      a.state = 'eat';
      a.timer = 3.2;
      a.eatTick = 0;
      refreshHud();
    }
  } else if (a.state === 'eat') {
    a.timer -= dt;
    a.eatTick -= dt;
    if (a.eatTick <= 0) {
      a.eatTick = 0.45;
      SFX.chomp(spatial(a.x, a.z));
    }
    if (a.timer <= 0) {
      a.state = 'idle';
      a.timer = rnd(2, 4);
      a.happy = 1.6;
      state.fed++;
      refreshHud();
      SFX.bark(spatial(a.x, a.z));
      bubble('Yum yum!', a.x, a.cfg.height + 0.25, a.z, { life: 1.3 });
      toast('The dog ate! 🐶');
      if (state.plateFood) a.state = 'plate';
    }
  } else if (a.state === 'idle') {
    a.timer -= dt;
    const pd = Math.hypot(player.x - a.x, player.z - a.z);
    if (pd < 4) a.yaw = angleLerp(a.yaw, Math.atan2(player.x - a.x, player.z - a.z), Math.min(1, dt * 4));
    if (a.timer <= 0) pickWander(a);
  } else if (a.state === 'walk') {
    if (stepTo(a, a.target.x, a.target.z, a.speed, dt, 0.1)) {
      a.state = 'idle';
      a.timer = rnd(2, 5);
    }
  }

  // poziție și rotație
  a.root.position.set(a.x, 0, a.z);
  a.root.rotation.y = a.yaw;
  a.shadow.position.set(a.x, 0.01, a.z);

  // picioare (mers în diagonală)
  a.gait += dt * a.speed * 7;
  const s = Math.sin(a.gait) * 0.55 * (a.moving ? 1 : 0);
  a.legs[0].rotation.x = s;
  a.legs[1].rotation.x = -s;
  a.legs[2].rotation.x = -s;
  a.legs[3].rotation.x = s;
  a.holder.position.y = a.moving ? Math.abs(Math.sin(a.gait)) * 0.03 : 0;
  a.root.position.y = a.kind === 'dog' && a.happy > 0 ? Math.abs(Math.sin(t * 9)) * 0.14 : 0;

  // gât: coboară când mănâncă, respiră când stă
  const wantNeck = a.state === 'eat' ? 0.95 : Math.sin(t * 2 + a.x) * 0.04;
  a.neckX = lerp(a.neckX, wantNeck, Math.min(1, dt * 6));
  a.neck.rotation.x = a.neckX;
  a.tongue.visible = a.happy > 0 || a.state === 'eat';

  // coadă
  if (a.kind === 'dog') {
    const amp = a.happy > 0 ? 0.7 : 0.3;
    a.tail.rotation.y = Math.sin(t * (a.happy > 0 ? 18 : 6)) * amp;
  } else {
    a.tail.rotation.x = Math.sin(t * 2) * 0.12 - (a.happy > 0 ? 0.2 : 0);
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

function petAnimal(a) {
  if (a.petCD > 0) return;
  a.petCD = 0.45;
  a.happy = 1.8;
  state.pets++;
  refreshHud();
  for (let i = 0; i < 4; i++) {
    bubble('♥', a.x + rnd(-0.45, 0.45), a.cfg.height + rnd(0, 0.5), a.z + rnd(-0.4, 0.4), {
      size: 72, color: '#ff4d88', bg: false, life: 1.2, vy: 0.6,
    });
  }
  if (a.kind === 'dog') {
    SFX.bark(spatial(a.x, a.z));
    bubble('Hau! Hau!', a.x, a.cfg.height + 0.4, a.z, { life: 1.2 });
    toast('The dog barked happily! 🐶');
  } else {
    SFX.meow(spatial(a.x, a.z));
    SFX.purr(spatial(a.x, a.z));
    bubble('Purr…', a.x, a.cfg.height + 0.3, a.z, { life: 1.2 });
    toast('The cat is purring 🐱');
  }
}

/* ====================================================================
   Corbi
   ==================================================================== */
const crows = [];
const PLAYER_SCARE = 4.2;

function buildCrow(x, z) {
  const root = new THREE.Group();
  scene.add(root);
  const holder = new THREE.Group();
  holder.scale.setScalar(1.35);
  root.add(holder);
  const body = new THREE.Mesh(geo.sphere, mats.crow);
  body.scale.set(0.13, 0.11, 0.24);
  body.position.y = 0.22;
  holder.add(body);
  const head = new THREE.Mesh(geo.smallSphere, mats.crow);
  head.scale.setScalar(0.09);
  head.position.set(0, 0.3, 0.2);
  holder.add(head);
  const beak = new THREE.Mesh(geo.beakCone, mats.beak);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.3, 0.3);
  holder.add(beak);
  const wingL = new THREE.Group();
  wingL.position.set(0.08, 0.24, 0);
  const wl = new THREE.Mesh(geo.wing, mats.crow);
  wl.position.x = 0.13;
  wingL.add(wl);
  holder.add(wingL);
  const wingR = new THREE.Group();
  wingR.position.set(-0.08, 0.24, 0);
  const wr = new THREE.Mesh(geo.wing, mats.crow);
  wr.position.x = -0.13;
  wingR.add(wr);
  holder.add(wingR);
  for (const lx of [-0.03, 0.03]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 4), mats.beak);
    leg.position.set(lx, 0.05, 0);
    holder.add(leg);
  }
  const c = {
    root, holder, body, head, wingL, wingR,
    x, y: 0, z, yaw: rnd(0, TAU),
    home: { x, z },
    mode: 'walk', stage: '', target: null,
    idle: rnd(0, 3), plateBound: false, cawT: rnd(4, 10), flap: 0,
  };
  body.userData.pick = { kind: 'crow', ref: c };
  head.userData.pick = { kind: 'crow', ref: c };
  pickables.add(body);
  pickables.add(head);
  return c;
}

function buildCrows() {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd(0, 0.6);
    const d = rnd(12, 26);
    crows.push(buildCrow(Math.cos(a) * d - 2, Math.sin(a) * d + 3));
  }
}

function pickCrowTarget(c) {
  if (state.plateFood && Math.random() < 0.5) {
    c.target = { x: PLATE.x + rnd(-0.5, 0.5), z: PLATE.z + rnd(-0.5, 0.5) };
    c.plateBound = true;
  } else {
    const a = rnd(0, TAU);
    const d = rnd(1, 6);
    c.target = { x: c.home.x + Math.cos(a) * d, z: c.home.z + Math.sin(a) * d };
  }
}

function takeoff(c, caw) {
  c.mode = 'fly';
  c.stage = 'away';
  const dx = c.x - player.x;
  const dz = c.z - player.z;
  const L = Math.hypot(dx, dz) || 1;
  c.target = { x: c.x + (dx / L) * 34, y: 14 + rnd(0, 5), z: c.z + (dz / L) * 34 };
  c.plateBound = false;
  if (caw) SFX.caw(spatial(c.x, c.z));
}

function scareCrow(c) {
  if (c.mode !== 'walk') return;
  takeoff(c, true);
  toast('The crow flew away!');
}

function updateCrow(c, dt, t) {
  const pd = Math.hypot(c.x - player.x, c.z - player.z);
  if (c.mode === 'walk' && pd < PLAYER_SCARE) takeoff(c, true);

  c.cawT -= dt;
  if (c.cawT <= 0) {
    c.cawT = rnd(6, 12);
    SFX.caw(spatial(c.x, c.z));
  }

  if (c.mode === 'walk') {
    c.flap = 0;
    if (c.idle > 0) {
      c.idle -= dt;
    } else {
      if (!c.target) pickCrowTarget(c);
      const dx = c.target.x - c.x;
      const dz = c.target.z - c.z;
      const d = Math.hypot(dx, dz);
      const st = Math.min(d, 1.2 * dt);
      if (d > 0.05) {
        c.x += (dx / d) * st;
        c.z += (dz / d) * st;
        c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
      }
      if (d <= 0.15) {
        const wasPlate = c.plateBound;
        c.target = null;
        c.plateBound = false;
        if (wasPlate && state.plateFood && pd >= 4 && Math.hypot(c.x - PLATE.x, c.z - PLATE.z) < 1.4) {
          // corbul fură mâncarea de pe farfurie
          state.plateFood = false;
          setPlateFood(false);
          refreshHud();
          toast('The crow stole the food from the plate!');
          takeoff(c, true);
          return placeCrow(c, t, dt);
        }
        c.idle = rnd(1, 3.5);
      }
    }
  } else {
    // zbor
    c.flap += dt * 22;
    const tg = c.target;
    const dx = tg.x - c.x;
    const dy = tg.y - c.y;
    const dz = tg.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    const st = Math.min(d, 8 * dt);
    if (d > 0.01) {
      c.x += (dx / d) * st;
      c.y += (dy / d) * st;
      c.z += (dz / d) * st;
      c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 5));
    }
    if (d < 1.2) {
      if (c.stage === 'away') {
        c.stage = 'land';
        const a = rnd(0, TAU);
        const r = rnd(9, 16);
        c.target = { x: player.x + Math.cos(a) * r, y: 0, z: player.z + Math.sin(a) * r };
      } else {
        c.mode = 'walk';
        c.stage = '';
        c.y = 0;
        c.home = { x: c.x, z: c.z };
        c.target = null;
        c.idle = rnd(1, 3);
      }
    }
  }
  return placeCrow(c, t, dt);
}

function placeCrow(c, t, dt) {
  c.root.position.set(c.x, c.y, c.z);
  c.root.rotation.y = c.yaw;
  if (c.mode === 'fly') {
    const f = Math.sin(c.flap) * 0.9;
    c.wingL.rotation.z = f;
    c.wingR.rotation.z = -f;
    c.holder.position.y = 0;
  } else {
    c.wingL.rotation.z = 0.05;
    c.wingR.rotation.z = -0.05;
    c.holder.position.y = c.idle <= 0 ? Math.abs(Math.sin(t * 4 + c.x)) * 0.02 : 0;
  }
}

/* ====================================================================
   Frunze și petale care cad (primăvară)
   ==================================================================== */
function buildFlyers() {
  const N_PETAL = 110;
  const N_LEAF = 60;
  petalMesh = new THREE.InstancedMesh(geo.petal, mats.petal, N_PETAL);
  leafMesh = new THREE.InstancedMesh(geo.leaf, mats.fallLeaf, N_LEAF);
  const col = new THREE.Color();
  for (let i = 0; i < N_PETAL + N_LEAF; i++) {
    const leaf = i >= N_PETAL;
    flyers.push({
      i: leaf ? i - N_PETAL : i,
      leaf,
      x: rnd(-14, 14),
      y: rnd(0.5, 9),
      z: rnd(-14, 14),
      fall: rnd(0.35, 0.8),
      sw: rnd(0.6, 1.6),
      ph: rnd(0, TAU),
      spin: rnd(0.5, 2.5),
      s: rnd(0.8, 1.4),
    });
    if (leaf) leafMesh.setColorAt(i - N_PETAL, col.setHSL(rnd(0.12, 0.3), 0.6, rnd(0.4, 0.6)));
  }
  scene.add(petalMesh);
  scene.add(leafMesh);
}

function updateFlyers(dt, t) {
  for (const f of flyers) {
    f.y -= f.fall * dt;
    f.x += Math.sin(t * f.sw + f.ph) * 0.5 * dt;
    f.z += Math.cos(t * f.sw * 0.8 + f.ph) * 0.4 * dt;
    if (f.y < 0.05) f.y += 9;
    f.x = wrapNear(f.x, player.x, 16);
    f.z = wrapNear(f.z, player.z, 16);
    dummy.position.set(f.x, f.y, f.z);
    dummy.rotation.set(t * f.spin, f.ph, t * f.spin * 0.6);
    dummy.scale.setScalar(f.s);
    dummy.updateMatrix();
    (f.leaf ? leafMesh : petalMesh).setMatrixAt(f.i, dummy.matrix);
  }
  petalMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
}

/* ====================================================================
   Baloane de text și inimioare
   ==================================================================== */
const bubbles = [];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function bubble(text, x, y, z, o = {}) {
  if (!scene) return;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  const size = o.size || 40;
  g.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (o.bg !== false) {
    g.fillStyle = 'rgba(255,255,245,0.95)';
    roundRect(g, 14, 14, 228, 68, 24);
    g.fill();
  }
  g.fillStyle = o.color || '#2d2a14';
  g.fillText(text, 128, 50);
  const tex = texFromCanvas(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.position.set(x, y, z);
  sp.scale.set(1.3, 0.49, 1);
  sp.renderOrder = 20;
  scene.add(sp);
  bubbles.push({ sp, tex, mat, life: o.life || 1.2, t: 0, vy: o.vy ?? 0.7 });
}

function updateBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.t += dt;
    b.sp.position.y += b.vy * dt;
    b.mat.opacity = clamp(1 - b.t / b.life, 0, 1);
    if (b.t >= b.life) {
      scene.remove(b.sp);
      b.tex.dispose();
      b.mat.dispose();
      bubbles.splice(i, 1);
    }
  }
}

/* ====================================================================
   Jucătorul: o lămâie cu ochi
   ==================================================================== */
const player = { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI, group: null, body: null, carry: null, walkT: 0, stepT: 0, blob: null };

function buildPlayer() {
  const g = new THREE.Group();
  g.position.set(SPAWN.x, 0, SPAWN.z);
  scene.add(g);
  const body = new THREE.Mesh(geo.lemon, mats.lemon);
  body.scale.setScalar(0.8);
  body.position.y = 0.42;
  g.add(body);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(geo.smallSphere, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    w.scale.setScalar(0.065);
    w.position.set(sx * 0.1, 0.5, 0.245);
    g.add(w);
    const p = new THREE.Mesh(geo.smallSphere, new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    p.scale.setScalar(0.034);
    p.position.set(sx * 0.1, 0.5, 0.3);
    g.add(p);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a2a00 }));
  smile.position.set(0, 0.45, 0.27);
  smile.rotation.z = Math.PI;
  g.add(smile);
  const leaf = new THREE.Mesh(geo.leaf, mats.lemonLeaf);
  leaf.scale.setScalar(1.4);
  leaf.position.set(0.04, 0.84, 0);
  leaf.rotation.z = -0.6;
  g.add(leaf);

  // castronul pe care îl ține în mână după ce a luat mâncare
  const carry = new THREE.Group();
  carry.position.set(0.3, 0.3, 0.2);
  const cup = new THREE.Mesh(geo.bowlCup, mats.bowl);
  cup.scale.setScalar(0.35);
  carry.add(cup);
  for (let i = 0; i < 5; i++) {
    const k = new THREE.Mesh(geo.smallSphere, mats.kibble);
    k.scale.setScalar(0.04);
    k.position.set(Math.cos(i) * 0.05, 0.05, Math.sin(i) * 0.05);
    carry.add(k);
  }
  carry.visible = false;
  g.add(carry);

  player.group = g;
  player.body = body;
  player.carry = carry;
  player.blob = makeBlob(0.9);
}

function updatePlayer(dt) {
  const fwd = (dirs.has('up') ? 1 : 0) - (dirs.has('down') ? 1 : 0);
  const side = (dirs.has('right') ? 1 : 0) - (dirs.has('left') ? 1 : 0);
  let mx = 0;
  let mz = 0;
  if (fwd || side) {
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    mx = fx * fwd + rx * side;
    mz = fz * fwd + rz * side;
    const L = Math.hypot(mx, mz) || 1;
    mx /= L;
    mz /= L;
    goal = null;
  } else if (goal) {
    if (goal.kind === 'crow' && goal.ref.mode === 'fly') goal = null;
    const p = goal ? (goal.ref || goal) : null;
    if (p) {
      const dx = p.x - player.x;
      const dz = p.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d <= goal.range) {
        const g = goal;
        goal = null;
        executeGoal(g);
      } else {
        mx = dx / d;
        mz = dz / d;
      }
    }
  }

  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    player.x += mx * PLAYER_SPEED * dt;
    player.z += mz * PLAYER_SPEED * dt;
    player.yaw = angleLerp(player.yaw, Math.atan2(mx, mz), Math.min(1, dt * 10));
    player.walkT += dt * 11;
    player.stepT -= dt;
    if (player.stepT <= 0 && actx) {
      player.stepT = 0.42;
      SFX.step(spatial(player.x, player.z));
    }
  }
  for (const o of obstacles) {
    const dx = player.x - o.x;
    const dz = player.z - o.z;
    const d = Math.hypot(dx, dz);
    const m = o.r + 0.3;
    if (d < m && d > 0.0001) {
      player.x = o.x + (dx / d) * m;
      player.z = o.z + (dz / d) * m;
    }
  }

  player.group.position.set(player.x, 0, player.z);
  player.group.rotation.y = player.yaw;
  player.body.position.y = 0.42 + (moving ? Math.abs(Math.sin(player.walkT)) * 0.05 : 0);
  player.body.scale.set(0.8, 0.8 + (moving ? Math.sin(player.walkT * 2) * 0.03 : 0), 0.8);
  player.blob.position.set(player.x, 0.01, player.z);
  player.carry.visible = state.carry > 0;
  player.carry.scale.setScalar(1 + Math.min(state.carry, 3) * 0.05);

  // lămâi culese automat când treci peste ele
  updateChunks();
}

function updateCamera(dt) {
  const tx = player.x;
  const ty = 0.9;
  const tz = player.z;
  const cosP = Math.cos(camPitch);
  const cx = tx + Math.sin(camYaw) * cosP * camDist;
  const cy = ty + Math.sin(camPitch) * camDist;
  const cz = tz + Math.cos(camYaw) * cosP * camDist;
  const k = 1 - Math.exp(-dt * 8);
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.y += (cy - camera.position.y) * k;
  camera.position.z += (cz - camera.position.z) * k;
  camera.lookAt(tx, ty, tz);
}

/* ====================================================================
   Obiective de atingere (click / tap) și acțiuni
   ==================================================================== */
function goalPos(g) {
  return g.ref || g;
}

function makeGoal(pk) {
  return { kind: pk.kind, ref: pk.ref, range: RANGE[pk.kind] ?? 1.5 };
}

function executeGoal(g) {
  switch (g.kind) {
    case 'food': grabFood(); break;
    case 'plate': placeFood(); break;
    case 'dog':
    case 'cat': petAnimal(g.ref); break;
    case 'crow': scareCrow(g.ref); break;
    case 'lemon': collectLemon(g.ref); break;
    default: break;
  }
}

function grabFood() {
  if (state.carry >= 3) {
    toast('You already have 3 portions in hand. Put them on the plate!');
    return;
  }
  state.carry++;
  SFX.pick(spatial(HOUSE.x, HOUSE.z));
  bubble('+1 🥣', player.x, 1.4, player.z, { size: 44, life: 1 });
  toast('You grabbed a portion of food. Put it on the plate!');
  refreshHud();
}

function placeFood() {
  if (state.carry <= 0) {
    toast('You have no food in hand. Grab some from the doghouse!');
    return;
  }
  if (state.plateFood) {
    toast('The plate is already full.');
    return;
  }
  state.carry--;
  state.plateFood = true;
  setPlateFood(true);
  SFX.place(spatial(PLATE.x, PLATE.z));
  toast('You put the food on the plate. The dog is coming!');
  if (animals.dog.state !== 'eat') animals.dog.state = 'plate';
  refreshHud();
}

function collectLemon(rec) {
  if (rec.done) return;
  rec.done = true;
  picked.add(rec.key);
  if (rec.mesh.parent) rec.mesh.parent.remove(rec.mesh);
  pickables.delete(rec.mesh);
  state.lemons++;
  SFX.ding(spatial(rec.x, rec.z));
  bubble('+1 🍋', rec.x, 0.9, rec.z, { size: 44, life: 1 });
  toast('+1 lemon 🍋');
  refreshHud();
}

function refreshHud() {
  $('sLemons').textContent = state.lemons;
  $('sPets').textContent = state.pets;
  $('sCarry').textContent = state.carry;
  $('sFed').textContent = state.fed;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ====================================================================
   Raycast, cursor, atingere
   ==================================================================== */
function toNDC(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  return ndc;
}

function pickAt(x, y) {
  raycaster.setFromCamera(toNDC(x, y), camera);
  const hits = raycaster.intersectObjects([...pickables], false);
  for (const h of hits) if (h.object.visible && h.object.userData.pick) return h.object;
  return null;
}

function groundAt(x, y) {
  raycaster.setFromCamera(toNDC(x, y), camera);
  const h = raycaster.intersectObject(ground, false)[0];
  return h ? h.point : null;
}

const cursorEl = $('cursor');
const cursorLabel = $('cursorLabel');
let hoverObj = null;

function placeCursor(x, y) {
  cursorEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function setHover(x, y) {
  const obj = pickAt(x, y);
  hoverObj = obj;
  if (obj) {
    cursorEl.classList.add('hot');
    cursorLabel.textContent = LABELS[obj.userData.pick.kind] || '';
  } else {
    cursorEl.classList.remove('hot');
    cursorLabel.textContent = '';
  }
}

function ripple(x, y, label) {
  placeCursor(x, y);
  cursorLabel.textContent = label || '';
  cursorEl.classList.remove('ripple');
  void cursorEl.offsetWidth;
  cursorEl.classList.add('ripple');
}

function handleTap(x, y) {
  ensureAudio();
  const obj = pickAt(x, y);
  if (obj) {
    const pk = obj.userData.pick;
    goal = makeGoal(pk);
    ripple(x, y, LABELS[pk.kind]);
    return;
  }
  const p = groundAt(x, y);
  if (p) {
    goal = { kind: 'walk', x: p.x, z: p.z, range: RANGE.walk };
    ripple(x, y, '');
  }
}

let drag = null;

function setupInput() {
  canvas.addEventListener('pointerdown', (e) => {
    ensureAudio();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignorat */ }
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    if (e.pointerType !== 'mouse') placeCursor(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      placeCursor(e.clientX, e.clientY);
      if (!drag) setHover(e.clientX, e.clientY);
    }
    if (!drag) return;
    const dx = e.clientX - drag.lx;
    const dy = e.clientY - drag.ly;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
    if (drag.moved) {
      camYaw -= dx * 0.008;
      camPitch = clamp(camPitch + dy * 0.004, 0.12, 1.15);
    }
  });
  const end = (e) => {
    if (drag && !drag.moved) handleTap(e.clientX, e.clientY);
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { if (!drag) cursorEl.classList.remove('hot'); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camDist = clamp(camDist + e.deltaY * 0.006, 3.5, 13);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // taste
  const keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (!k) return;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    ensureAudio();
    dirs.add(k);
    goal = null;
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) dirs.delete(k);
  });
  window.addEventListener('blur', () => dirs.clear());

  // săgeți pe ecran (apar doar pe telefon)
  document.querySelectorAll('#dpad button').forEach((b) => {
    const d = b.dataset.dir;
    const on = (e) => {
      e.preventDefault();
      ensureAudio();
      dirs.add(d);
      b.classList.add('on');
      goal = null;
    };
    const off = () => {
      dirs.delete(d);
      b.classList.remove('on');
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('lostpointercapture', off);
  });

  // butoane
  $('btnSound').addEventListener('click', () => {
    state.muted = !state.muted;
    ensureAudio();
    if (master) master.gain.value = state.muted ? 0 : 0.8;
    $('btnSound').textContent = state.muted ? '🔇' : '🔊';
  });
  $('btnHelp').addEventListener('click', () => $('start').classList.remove('hidden'));
  $('btnStart').addEventListener('click', () => {
    ensureAudio();
    $('start').classList.add('hidden');
  });

  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ====================================================================
   Sunet ambiental: ciripit de păsări
   ==================================================================== */
let birdT = 2;

function updateAmbient(dt) {
  if (!actx) return;
  birdT -= dt;
  if (birdT <= 0) {
    birdT = rnd(1.8, 4.5);
    const a = rnd(0, TAU);
    const d = rnd(10, 26);
    const x = player.x + Math.cos(a) * d;
    const z = player.z + Math.sin(a) * d;
    SFX.chirp(spatial(x, z));
    if (Math.random() < 0.5) setTimeout(() => SFX.chirp(spatial(x + 1, z)), 220);
  }
}

/* ====================================================================
   Lămâi de pe jos și lămâi din copaci sunt deja în sectoare.
   Bucla principală
   ==================================================================== */
let T = 0;
let lastFrame = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  T += dt;

  updatePlayer(dt);
  updateCamera(dt);
  ground.position.set(player.x, 0, player.z);
  updateSky(dt, camera.position);
  for (const a of [animals.dog, animals.cat]) updateAnimal(a, dt, T);
  for (const c of crows) updateCrow(c, dt, T);
  updateFlyers(dt, T);
  updateBubbles(dt);
  updatePickups(dt);
  updateAmbient(dt);
  renderer.render(scene, camera);
}

/* ====================================================================
   Pornire
   ==================================================================== */
async function loadAssets() {
  const base = './assets/';
  const [dogCoat, dogFace, catCoat, catFace] = await Promise.all([
    loadImage(base + 'dog-coat.jpg'),
    loadImage(base + 'dog-face.jpg'),
    loadImage(base + 'cat-coat.jpg'),
    loadImage(base + 'cat-face.jpg'),
  ]);
  return { dogCoat, dogFace, catCoat, catFace };
}

function buildWorld() {
  scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x5b9c3a, 1.25));
  const sunLight = new THREE.DirectionalLight(0xfff1cf, 1.1);
  sunLight.position.set(20, 40, 10);
  scene.add(sunLight);

  ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  buildSky();
  buildHouse();
  buildPlate();
  buildAnimals();
  buildCrows();
  buildPlayer();
  buildFlyers();
  updateChunks(true);
}

function startRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xcdeefc, 1);
}

async function init() {
  try {
    startRenderer();
  } catch (e) {
    $('loading').textContent = 'This device does not support 3D graphics (WebGL).';
    console.error(e);
    return;
  }
  const imgs = await loadAssets();
  buildMaterials(imgs);
  buildGeometry();
  buildWorld();
  setupInput();
  lastFrame = performance.now();
  refreshHud();
  renderer.setAnimationLoop((now) => frame(now));
  $('loading').classList.add('done');
  // pentru testare (nu afectează jocul)
  window.lemonDebug = {
    player, state, animals, crows, plate,
    get goal() { return goal; },
    setGoal(g) { goal = g; },
    get camDist() { return camDist; },
    set camDist(v) { camDist = v; },
    get camYaw() { return camYaw; },
    set camYaw(v) { camYaw = v; },
    chunks: () => chunks.size,
  };
}

if (!browserOK()) {
  $('loading').classList.add('done');
  $('start').classList.add('hidden');
  $('unsupported').classList.remove('hidden');
} else {
  init().catch((e) => {
    console.error(e);
    $('loading').textContent = 'The game could not load. Reload the page.';
  });
}
