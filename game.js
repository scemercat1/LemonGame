/*
  Lemon Garden — 3D game (Three.js), no build step, GitHub Pages compatible.
  All in-game text is in English.
*/
// Direct URL import (no import map) so it also works on older Safari versions.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* ====================================================================
   Helpers
   ==================================================================== */
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
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
   Browser gate: only Safari and Chrome
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
   Settings
   ==================================================================== */
const CHUNK = 20;
const VIEW = 3;
const TUFTS = 190;
const STEMS = 16;
const LEAVES_PER = 10;
const TREE_CHANCE = 0.3;
const HOUSE = { x: -6, z: -2 };
const PLATE = { x: -3.1, z: 0.8 };
const SHED = { x: -12.5, z: -7.5 };
const TENT = { x: -11, z: 4.5 };
const SPAWN = { x: 0, z: 4 };
const WALK_SPEED = 3.4;
const SPRINT_SPEED = 6.4;
const DAY_SECONDS = 300;        // a full 24-hour cycle lasts 5 minutes
const HUNGER_RATE = 0.22;       // hunger points lost per second
const STAMINA_DRAIN = 24;
const STAMINA_REGEN = 16;
const LEMON_FILL = 20;
const MAX_STACK = 10;
const SLOTS = 5;
const FOLLOW_MIN = 20;          // friendship needed to follow you when called
const RANGE = { food: 2.6, shed: 2.6, bed: 2.0, plate: 1.9, dog: 2.1, cat: 2.1, crow: 3.2, lemon: 0.9, walk: 0.3 };
const LABELS = {
  food: 'Take dog food',
  shed: 'Capi Food',
  bed: 'Sleep',
  plate: 'Serve food',
  dog: 'Pet the dog',
  cat: 'Pet the cat',
  crow: 'Scare the crow',
  lemon: 'Pick up lemon',
};
const FOOD_REF = { x: HOUSE.x, z: HOUSE.z };
const PLATE_REF = { x: PLATE.x, z: PLATE.z };
const SHED_REF = { x: SHED.x, z: SHED.z };
const BED_REF = { x: TENT.x, z: TENT.z };
const FLOWER_COLORS = [0xffffff, 0xff8fb1, 0xffe14d, 0xc79bff, 0xff9d5c];

/* ====================================================================
   State
   ==================================================================== */
const state = {
  lemons: 0,
  pets: 0,
  fed: 0,
  muted: false,
  day: 1,
  tod: 8.0,              // time of day in hours
  rain: 0,               // 0..1 current rain intensity
  rainTarget: 0,
  rainTimer: 120,
  hunger: 100,
  stamina: 100,
  sprintKey: false,
  sprintBtn: false,
  sprintCD: 0,
  sleeping: false,
  call: false,
  plateFood: false,
  inv: Array.from({ length: SLOTS }, () => null),
  sel: 0,
};
const picked = new Set();
const dirs = new Set();
let goal = null;
let camYaw = 0;
let camPitch = 0.42;
let camDist = 6.6;
let toastTimer = 0;
let T = 0;

/* ====================================================================
   Renderer, scene, camera
   ==================================================================== */
const canvas = $('scene');
let renderer;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe3f5, 34, 105);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1100);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dummy = new THREE.Object3D();
const pickables = new Set();

/* ====================================================================
   Audio (synthesised with Web Audio, no files)
   ==================================================================== */
let actx = null;
let master = null;
let noiseBuf = null;
let rainGain = null;

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
  startRain();
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
}

function startRain() {
  const s = actx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const hp = actx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1400;
  rainGain = actx.createGain();
  rainGain.gain.value = 0;
  s.connect(hp).connect(rainGain).connect(master);
  s.start();
}

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
  pick(sp) { tone({ type: 'triangle', f0: 700, f1: 1400, dur: 0.12, vol: 0.22, sp }); },
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
  step(sp) { noise({ dur: 0.07, vol: 0.06, f: 600, q: 0.7, sp }); },
  chirp(sp) {
    const base = rnd(2600, 3800);
    for (let i = 0; i < 3; i++) {
      tone({ type: 'sine', f0: base + i * 180, f1: base + i * 180 + 480, dur: 0.08, vol: 0.07, at: i * 0.12, sp });
    }
  },
  click() { tone({ type: 'square', f0: 1500, f1: 900, dur: 0.05, vol: 0.06 }); },
  thunder() { noise({ dur: 2.2, vol: 0.35, f: 120, q: 0.7, type: 'lowpass' }); },
};

/* ====================================================================
   Textures and materials
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
function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4e4b4';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#5a3a1e';
  g.lineWidth = 10;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#3b2412';
  g.font = '800 74px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
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
  mats.bush = new THREE.MeshLambertMaterial();
  mats.ground = new THREE.MeshStandardMaterial({ color: 0x5aa23a, roughness: 1 });
  mats.trunk = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  mats.foliage = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mats.lemon = new THREE.MeshStandardMaterial({ color: 0xffd53a, roughness: 0.35 });
  mats.lemonLeaf = new THREE.MeshStandardMaterial({ color: 0x3f9d2c, roughness: 0.6, side: THREE.DoubleSide });
  mats.wood = new THREE.MeshStandardMaterial({ color: 0xc08347, roughness: 0.9 });
  mats.wood2 = new THREE.MeshStandardMaterial({ color: 0x9c6a3c, roughness: 0.9 });
  mats.roof = new THREE.MeshStandardMaterial({ color: 0xb8432f, roughness: 0.8 });
  mats.tent = new THREE.MeshStandardMaterial({ color: 0x6f7d3a, roughness: 0.9, side: THREE.DoubleSide });
  mats.mattress = new THREE.MeshStandardMaterial({ color: 0x8fb8e8, roughness: 0.9 });
  mats.blanket = new THREE.MeshStandardMaterial({ color: 0xc83b3b, roughness: 0.9 });
  mats.pillow = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.9 });
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
  mats.sign = new THREE.MeshStandardMaterial({ map: signTexture('Capi Food'), roughness: 0.8 });
  mats.ridge = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  mats.spruce = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  mats.monkWall = new THREE.MeshBasicMaterial({ color: 0xf1e7c8, fog: false });
  mats.monkDome = new THREE.MeshBasicMaterial({ color: 0x2c4fa6, fog: false });
  mats.monkRoof = new THREE.MeshBasicMaterial({ color: 0x8b3b2b, fog: false });
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
    for (const p of [[-w, 0, 0], [w, 0, 0], [0, 1, 0.02]]) pos.push(p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c);
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
function shadowAll(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

function buildGeometry() {
  geo.tuft = tuftGeometry();
  geo.flower = new THREE.SphereGeometry(0.07, 8, 6);
  geo.leaf = new THREE.ShapeGeometry(leafShape());
  geo.petal = new THREE.ShapeGeometry(petalShape());
  geo.trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.9, 7);
  geo.foliage = new THREE.IcosahedronGeometry(1, 1);
  geo.bush = new THREE.IcosahedronGeometry(0.7, 1);
  geo.lemon = new THREE.LatheGeometry(lemonProfile(), 22);
  geo.sphere = new THREE.SphereGeometry(1, 22, 16);
  geo.smallSphere = new THREE.SphereGeometry(1, 12, 10);
  geo.cone = new THREE.ConeGeometry(1, 1, 4);
  geo.wing = new THREE.BoxGeometry(0.26, 0.02, 0.12);
  geo.beakCone = new THREE.ConeGeometry(0.025, 0.1, 5);
  geo.plate = new THREE.CylinderGeometry(0.42, 0.4, 0.05, 22);
  geo.rim = new THREE.TorusGeometry(0.41, 0.02, 6, 26);
  geo.bowlCup = new THREE.CylinderGeometry(0.3, 0.22, 0.1, 16);
  geo.spruce = new THREE.ConeGeometry(1, 3, 6);
}

/* ====================================================================
   Sky, sun, moon, stars, clouds, backdrop (Bucovina)
   ==================================================================== */
let sky;
let skyMat;
let sunSprite;
let moonSprite;
let stars;
let starMat;
let ground;
let backdrop;
let sunLight;
let hemi;
const clouds = [];
const dayPal = { top: new THREE.Color(0x3d8fe0), mid: new THREE.Color(0xa9dcf7), bot: new THREE.Color(0xeaf7ff) };
const nightPal = { top: new THREE.Color(0x050a1c), mid: new THREE.Color(0x122044), bot: new THREE.Color(0x27365e) };
const duskPal = { top: new THREE.Color(0x2d3b7e), mid: new THREE.Color(0xf2956a), bot: new THREE.Color(0xffc89a) };
const rainPal = new THREE.Color(0x7d8792);
const warmSun = new THREE.Color(0xfff1cf);
const dustSun = new THREE.Color(0xffa35c);
const moonLight = new THREE.Color(0x8ea8ff);
const hemiNight = new THREE.Color(0x6f83b8);
const hemiDay = new THREE.Color(0xeaf8ff);
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const tmpC = new THREE.Color();
const sunDir = new THREE.Vector3();
const lightDir = new THREE.Vector3();

function buildSky() {
  skyMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color() },
      mid: { value: new THREE.Color() },
      bot: { value: new THREE.Color() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = mix(bot, mid, smoothstep(-0.05, 0.2, y));
        c = mix(c, top, smoothstep(0.2, 0.75, y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  const N = 900;
  const sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = rnd(0, TAU);
    const ph = Math.acos(rnd(0.15, 1));
    sp[i * 3] = 800 * Math.sin(ph) * Math.cos(th);
    sp[i * 3 + 1] = 800 * Math.cos(ph);
    sp[i * 3 + 2] = 800 * Math.sin(ph) * Math.sin(th);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  stars = new THREE.Points(sg, starMat);
  scene.add(stars);

  const sunTex = radialCanvasTexture('rgba(255,250,210,1)', 'rgba(255,236,150,0)');
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
  sunSprite.scale.setScalar(120);
  scene.add(sunSprite);
  const moonTex = radialCanvasTexture('rgba(230,240,255,1)', 'rgba(170,190,255,0)');
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
  moonSprite.scale.setScalar(60);
  scene.add(moonSprite);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, fog: false });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  for (let k = 0; k < 9; k++) {
    const grp = new THREE.Group();
    const n = 4 + (k % 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(cloudGeo, cloudMat);
      s.position.set((j - n / 2) * 7 + rnd(-2, 2), rnd(-1.5, 1.5), rnd(-3, 3));
      s.scale.setScalar(rnd(6, 9));
      grp.add(s);
    }
    grp.userData.angle = k * (TAU / 9) + rnd(0, 0.3);
    grp.userData.h = rnd(90, 130);
    grp.userData.dir = k % 2 ? 1 : -1;
    scene.add(grp);
    clouds.push(grp);
  }
}

// Bucovina-style backdrop: painted ridges, spruce forest, monastery on a hill.
function buildBackdrop() {
  backdrop = new THREE.Group();
  scene.add(backdrop);
  const r = mulberry32(2024);
  const layers = [
    { R: 300, H: 150, base: 60, amp: 70, low: 0x3b5e4a, high: 0x6f8fa0 },
    { R: 380, H: 170, base: 90, amp: 80, low: 0x4f7a58, high: 0x9ab5c4 },
    { R: 480, H: 200, base: 110, amp: 90, low: 0x7d9db1, high: 0xd7e8f2 },
  ];
  for (const L of layers) {
    const g = new THREE.CylinderGeometry(L.R, L.R, L.H, 120, 1, true);
    const p = g.attributes.position;
    const cLow = new THREE.Color(L.low);
    const cHigh = new THREE.Color(L.high);
    const cols = [];
    const ph = [r() * TAU, r() * TAU, r() * TAU];
    for (let i = 0; i < p.count; i++) {
      const th = Math.atan2(p.getX(i), p.getZ(i));
      if (p.getY(i) > 0) {
        const h = L.base + L.amp * (0.45 + 0.3 * Math.sin(3 * th + ph[0]) + 0.18 * Math.sin(7 * th + ph[1]) + 0.12 * Math.sin(13 * th + ph[2]));
        p.setY(i, h - L.H / 2);
      }
      const t = clamp((p.getY(i) + L.H / 2) / (L.base + L.amp), 0, 1);
      const c = new THREE.Color().copy(cLow).lerp(cHigh, t);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mats.ridge);
    mesh.position.y = -10;
    backdrop.add(mesh);
  }

  const N = 1600;
  const spruces = new THREE.InstancedMesh(geo.spruce, mats.spruce, N);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = r() * TAU;
    const R = 232 + r() * 40;
    const h = 9 + r() * 12;
    dummy.position.set(Math.sin(a) * R, h * 0.5 - 2, Math.cos(a) * R);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(h * 0.36, h / 3, h * 0.36);
    dummy.updateMatrix();
    spruces.setMatrixAt(i, dummy.matrix);
    spruces.setColorAt(i, col.setHSL(0.36 + r() * 0.05, 0.45, 0.14 + r() * 0.1));
  }
  spruces.instanceMatrix.needsUpdate = true;
  backdrop.add(spruces);

  const mon = new THREE.Group();
  const a = 1.1;
  mon.position.set(Math.sin(a) * 255, 4, Math.cos(a) * 255);
  mon.rotation.y = a + Math.PI;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 11, 9), mats.monkWall);
  wall.position.y = 5.5;
  mon.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(12, 6, 4), mats.monkRoof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 14;
  mon.add(roof);
  for (const x of [-7, 7]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 15, 12), mats.monkWall);
    tower.position.set(x, 7.5, -5);
    mon.add(tower);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10, 0, TAU, 0, Math.PI / 2), mats.monkDome);
    dome.position.set(x, 15, -5);
    mon.add(dome);
  }
  backdrop.add(mon);
}

function updateSky(dt, cam, dayF, dusk, rain) {
  tmpA.copy(nightPal.top).lerp(dayPal.top, dayF).lerp(duskPal.top, dusk).lerp(rainPal, rain * 0.55);
  tmpB.copy(nightPal.mid).lerp(dayPal.mid, dayF).lerp(duskPal.mid, dusk).lerp(rainPal, rain * 0.5);
  tmpC.copy(nightPal.bot).lerp(dayPal.bot, dayF).lerp(duskPal.bot, dusk).lerp(rainPal, rain * 0.45);
  skyMat.uniforms.top.value.copy(tmpA);
  skyMat.uniforms.mid.value.copy(tmpB);
  skyMat.uniforms.bot.value.copy(tmpC);
  scene.fog.color.copy(tmpC);

  sky.position.copy(cam);
  stars.position.copy(cam);
  starMat.opacity = (1 - dayF) * 0.9 * (1 - rain * 0.8);
  sunSprite.position.copy(cam).addScaledVector(sunDir, 800);
  sunSprite.material.opacity = smoothstep(-0.05, 0.1, sunDir.y) * (1 - rain * 0.6);
  moonSprite.position.copy(cam).addScaledVector(sunDir, -800);
  moonSprite.material.opacity = (1 - dayF) * (1 - rain * 0.6);

  backdrop.position.set(cam.x, 0, cam.z);
  for (const c of clouds) {
    c.userData.angle += dt * 0.012 * c.userData.dir;
    const a = c.userData.angle;
    c.position.set(cam.x + Math.cos(a) * 260, c.userData.h, cam.z + Math.sin(a) * 260);
    c.rotation.y = -a;
  }
}

/* ====================================================================
   Day/night, light and weather
   ==================================================================== */
function sunDirFor(tod) {
  const th = ((tod - 6) / 24) * TAU;
  return sunDir.set(Math.cos(th), Math.sin(th), 0.35).normalize();
}
function isNight() {
  return state.tod >= 20 || state.tod < 5;
}
function updateEnvironment(dt) {
  sunDirFor(state.tod);
  const dayF = smoothstep(-0.1, 0.2, sunDir.y);
  const dusk = Math.exp(-(sunDir.y * sunDir.y) / 0.01) * 0.85;
  const rain = state.rain;

  lightDir.copy(sunDir.y >= 0 ? sunDir : sunDir.clone().negate());
  sunLight.position.set(player.x + lightDir.x * 60, lightDir.y * 60, player.z + lightDir.z * 60);
  sunLight.target.position.set(player.x, 0, player.z);
  sunLight.target.updateMatrixWorld();
  sunLight.color.copy(sunDir.y >= 0 ? tmpB.copy(warmSun).lerp(dustSun, dusk * 0.7) : moonLight);
  const intensity = sunDir.y >= 0 ? 1.35 * smoothstep(-0.02, 0.15, sunDir.y) : 0.25;
  sunLight.intensity = intensity * (1 - rain * 0.5);
  hemi.intensity = lerp(0.3, 1.2, dayF) * (1 - rain * 0.35);
  hemi.color.copy(hemiNight).lerp(hemiDay, dayF);

  updateSky(dt, camera.position, dayF, dusk, rain);
}

function updateClock(dt) {
  state.tod += (dt * 24) / DAY_SECONDS;
  if (state.tod >= 24) {
    state.tod -= 24;
    state.day++;
  }
}

function updateWeather(dt) {
  state.rainTimer -= dt;
  if (state.rainTimer <= 0) {
    state.rainTarget = state.rainTarget ? 0 : 1;
    state.rainTimer = state.rainTarget ? rnd(55, 110) : rnd(90, 200);
  }
  state.rain += (state.rainTarget - state.rain) * Math.min(1, dt * 0.4);
  if (Math.abs(state.rain - state.rainTarget) < 0.002) state.rain = state.rainTarget;
}

function toggleRain() {
  state.rainTarget = state.rainTarget ? 0 : 1;
  state.rainTimer = state.rainTarget ? rnd(55, 110) : rnd(90, 200);
  toast(state.rainTarget ? 'It starts to rain.' : 'The rain stops.');
}

/* ====================================================================
   Infinite world: chunks of grass, trees, bushes and lemons
   ==================================================================== */
const chunks = new Map();
let obstacles = [
  { x: HOUSE.x, z: HOUSE.z, r: 1.25, ck: 'static' },
  { x: SHED.x, z: SHED.z, r: 1.9, ck: 'static' },
  { x: TENT.x, z: TENT.z, r: 1.2, ck: 'static' },
];
const flyers = [];
let petalMesh;
let leafMesh;
let rainMesh;
const RAIN_N = isTouch ? 500 : 1100;
const rainDrops = [];
let chunkPX = null;
let chunkPZ = null;

function nearStatic(x, z) {
  if (Math.hypot(x, z) < 11) return true;
  for (const s of [HOUSE, SHED, TENT]) if (Math.hypot(x - s.x, z - s.z) < 7) return true;
  return false;
}

function buildChunk(cx, cz, key) {
  const r = mulberry32(hash2(cx, cz) ^ 0x9e3779b9);
  const ox = cx * CHUNK;
  const oz = cz * CHUNK;
  const group = new THREE.Group();
  scene.add(group);
  const c = { cx, cz, key, group, meshes: [], pickups: [] };
  const add = (m) => { group.add(m); c.meshes.push(m); return m; };
  const col = new THREE.Color();

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
      col.setHSL(0.19 + r() * 0.04, 0.7, 0.45);
    } else {
      col.setHSL(0.27 + r() * 0.05, 0.55 + r() * 0.2, 0.28 + r() * 0.12);
    }
    grass.setColorAt(i, col);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;

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

  if (r() < 0.55) {
    const n = 2 + ((r() * 3) | 0);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = ox + 1 + r() * (CHUNK - 2);
      const z = oz + 1 + r() * (CHUNK - 2);
      if (!nearStatic(x, z)) pts.push({ x, z });
    }
    if (pts.length) {
      const bushes = add(new THREE.InstancedMesh(geo.bush, mats.bush, pts.length));
      pts.forEach((p, i) => {
        const s = 0.6 + r() * 0.5;
        dummy.position.set(p.x, 0.35 * s, p.z);
        dummy.rotation.set(0, r() * TAU, 0);
        dummy.scale.set(s * 1.2, s * 0.8, s * 1.2);
        dummy.updateMatrix();
        bushes.setMatrixAt(i, dummy.matrix);
        bushes.setColorAt(i, col.setHSL(0.28 + r() * 0.06, 0.55, 0.26 + r() * 0.1));
      });
      bushes.instanceMatrix.needsUpdate = true;
      if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
      bushes.castShadow = true;
    }
  }

  const trees = [];
  if (r() < TREE_CHANCE) {
    const tx = ox + 2 + r() * (CHUNK - 4);
    const tz = oz + 2 + r() * (CHUNK - 4);
    if (!nearStatic(tx, tz)) trees.push({ x: tx, z: tz, s: 0.9 + r() * 0.5 });
  }
  if (trees.length) {
    const trunks = add(new THREE.InstancedMesh(geo.trunk, mats.trunk, trees.length));
    const folI = add(new THREE.InstancedMesh(geo.foliage, mats.foliage, trees.length * 3));
    const lemI = add(new THREE.InstancedMesh(geo.lemon, mats.lemon, trees.length * 7));
    trunks.castShadow = true;
    folI.castShadow = true;
    lemI.castShadow = true;
    let fi = 0;
    let li = 0;
    trees.forEach((t, i) => {
      dummy.position.set(t.x, 0.95 * t.s, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        dummy.position.set(t.x + (r() - 0.5) * 1.4 * t.s, (2.3 + r() * 0.5) * t.s, t.z + (r() - 0.5) * 1.4 * t.s);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar((0.95 + r() * 0.35) * t.s);
        dummy.updateMatrix();
        folI.setMatrixAt(fi, dummy.matrix);
        folI.setColorAt(fi, col.setHSL(0.31 + r() * 0.04, 0.5, 0.26 + r() * 0.08));
        fi++;
      }
      for (let k = 0; k < 7; k++) {
        const a = r() * TAU;
        const rr = (1.1 + r() * 0.5) * t.s;
        dummy.position.set(t.x + Math.cos(a) * rr, (2.5 + r() * 1.2 - 0.3) * t.s, t.z + Math.sin(a) * rr);
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

  if (r() < 0.6) {
    const n = r() < 0.4 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const key2 = `${cx}:${cz}:${j}`;
      const x = ox + 1.5 + r() * (CHUNK - 3);
      const z = oz + 1.5 + r() * (CHUNK - 3);
      if (picked.has(key2)) continue;
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
   Static structures: dog house, plate, shed, tent with bed
   ==================================================================== */
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
  box(1.8, 0.1, 1.6, mats.wood, 0, 0.05, 0);
  box(1.8, 1.2, 0.1, mats.wood, 0, 0.7, -0.75);
  box(0.1, 1.2, 1.6, mats.wood, -0.9, 0.7, 0);
  box(0.1, 1.2, 1.6, mats.wood, 0.9, 0.7, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.8, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 1.78, 0);
  g.add(roof);
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
  shadowAll(g);
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

function buildShed() {
  const g = new THREE.Group();
  g.position.set(SHED.x, 0, SHED.z);
  g.rotation.y = 0.35;
  scene.add(g);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.7, 2.2), mats.wood2);
  wall.position.y = 0.85;
  wall.userData.pick = { kind: 'shed', ref: SHED_REF };
  g.add(wall);
  pickables.add(wall);
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 2.5), mats.roof);
    slab.position.set(s * 0.75, 2.0, 0);
    slab.rotation.z = -s * 0.5;
    g.add(slab);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  door.position.set(0, 0.6, 1.13);
  g.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), mats.sign);
  sign.position.set(0, 1.42, 1.14);
  sign.userData.pick = { kind: 'shed', ref: SHED_REF };
  g.add(sign);
  pickables.add(sign);
  shadowAll(g);
}

function buildTent() {
  const g = new THREE.Group();
  g.position.set(TENT.x, 0, TENT.z);
  scene.add(g);
  for (const [x, z] of [[-1.2, -1.1], [1.2, -1.1], [-1.2, 1.1], [1.2, 1.1]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), mats.wood);
    post.position.set(x, 0.95, z);
    g.add(post);
  }
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 4), mats.tent);
  canopy.rotation.y = Math.PI / 4;
  canopy.position.y = 2.25;
  g.add(canopy);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.8), mats.wood);
  frame.position.set(0, 0.15, 0);
  frame.userData.pick = { kind: 'bed', ref: BED_REF };
  g.add(frame);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.72), mats.mattress);
  mattress.position.set(0, 0.33, 0);
  mattress.userData.pick = { kind: 'bed', ref: BED_REF };
  g.add(mattress);
  pickables.add(frame);
  pickables.add(mattress);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.5), mats.pillow);
  pillow.position.set(-0.5, 0.45, 0);
  g.add(pillow);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.74), mats.blanket);
  blanket.position.set(0.2, 0.41, 0);
  g.add(blanket);
  shadowAll(g);
}

/* ====================================================================
   Quadruped animals (dog and cat built from primitives + photo textures)
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
  shadowAll(root);

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
    shadow: makeBlob(cfg.shadow),
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
    gainCD: 0,
    friend: cfg.friend,
  };
  body.userData.pick = { kind: cfg.kind, ref: a };
  skull.userData.pick = { kind: cfg.kind, ref: a };
  pickables.add(body);
  pickables.add(skull);
  return a;
}

function buildAnimals() {
  animals.dog = buildQuadruped({
    kind: 'dog', scale: 1, friend: 35,
    home: { x: -3.6, z: 0.4, r: 3.2 },
    walk: 1.5,
    coat: mats.dogCoat, paw: mats.dogTan, ear: mats.dogDark, face: mats.dogFace,
    faceW: 1.0, chest: true, pointy: false, tailR: 0.05,
    tailPts: [[0, 0, 0], [0, 0.12, -0.14], [0, 0.24, -0.26], [0, 0.3, -0.34]],
    shadow: 1.7, height: 1.25,
  });
  animals.cat = buildQuadruped({
    kind: 'cat', scale: 0.6, friend: 12,
    home: { x: 3.4, z: -1.2, r: 4.2 },
    walk: 1.1,
    coat: mats.catCoat, paw: mats.catLight, ear: mats.catCoat, face: mats.catFace,
    faceW: 1.0, chest: false, pointy: true, tailR: 0.035,
    tailPts: [[0, 0, 0], [0, 0.18, -0.1], [0, 0.4, -0.12], [0, 0.52, -0.04]],
    shadow: 1.1, height: 0.8,
  });
  for (const a of [animals.dog, animals.cat]) pickWander(a);
  animals.dog.x = -3.6;
  animals.dog.z = 0.4;
  animals.cat.x = 3.4;
  animals.cat.z = -1.2;
}

function pickWander(a) {
  const ang = rnd(0, TAU);
  const d = Math.sqrt(Math.random()) * a.home.r;
  a.target = { x: a.home.x + Math.cos(ang) * d, z: a.home.z + Math.sin(ang) * d };
  a.state = 'walk';
}

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

function friendLabel(f) {
  if (f < 20) return 'Stranger';
  if (f < 45) return 'Acquaintance';
  if (f < 70) return 'Friend';
  return 'Best friend';
}

function updateAnimal(a, dt, t) {
  a.moving = false;
  a.happy = Math.max(0, a.happy - dt);
  a.petCD = Math.max(0, a.petCD - dt);
  a.gainCD = Math.max(0, a.gainCD - dt);
  const following = state.call && a.friend >= FOLLOW_MIN && !state.sleeping;

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
      if (a.kind === 'dog') a.friend = Math.min(100, a.friend + 10);
      SFX.bark(spatial(a.x, a.z));
      bubble('Yum yum!', a.x, a.cfg.height + 0.25, a.z, { life: 1.3 });
      toast('The dog ate! Friendship up 🐶');
      if (state.plateFood) a.state = 'plate';
    }
  } else if (following) {
    a.state = 'follow';
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    const rx = fz;
    const rz = -fx;
    const isDog = a.kind === 'dog';
    const back = isDog ? 2.0 : 2.6;
    const side = isDog ? -0.9 : 0.9;
    const tx = player.x - fx * back + rx * side;
    const tz = player.z - fz * back + rz * side;
    const pd = Math.hypot(player.x - a.x, player.z - a.z);
    stepTo(a, tx, tz, pd > 5 ? SPRINT_SPEED * 0.95 : a.speed * 1.8, dt, 0.6);
    if (pd > 4) a.moving = true;
    if (pd < 3) a.yaw = angleLerp(a.yaw, Math.atan2(player.x - a.x, player.z - a.z), Math.min(1, dt * 4));
    a.friend = Math.min(100, a.friend + dt * 0.3);
  } else if (a.state === 'follow') {
    a.state = 'idle';
    a.timer = 1;
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

  a.root.position.set(a.x, 0, a.z);
  a.root.rotation.y = a.yaw;
  a.shadow.position.set(a.x, 0.01, a.z);

  a.gait += dt * a.speed * 7;
  const s = Math.sin(a.gait) * 0.55 * (a.moving ? 1 : 0);
  a.legs[0].rotation.x = s;
  a.legs[1].rotation.x = -s;
  a.legs[2].rotation.x = -s;
  a.legs[3].rotation.x = s;
  a.holder.position.y = a.moving ? Math.abs(Math.sin(a.gait)) * 0.03 : 0;
  a.root.position.y = a.kind === 'dog' && a.happy > 0 ? Math.abs(Math.sin(t * 9)) * 0.14 : 0;

  const wantNeck = a.state === 'eat' ? 0.95 : Math.sin(t * 2 + a.x) * 0.04;
  a.neckX = lerp(a.neckX, wantNeck, Math.min(1, dt * 6));
  a.neck.rotation.x = a.neckX;
  a.tongue.visible = a.happy > 0 || a.state === 'eat';

  if (a.kind === 'dog') {
    const excited = a.happy > 0 || a.state === 'follow';
    a.tail.rotation.y = Math.sin(t * (excited ? 18 : 6)) * (excited ? 0.7 : 0.3);
  } else {
    a.tail.rotation.x = Math.sin(t * 2) * 0.12 - (a.happy > 0 ? 0.2 : 0);
  }
}

function petAnimal(a) {
  if (a.petCD > 0) return;
  a.petCD = 0.45;
  a.happy = 1.8;
  state.pets++;
  if (a.gainCD <= 0) {
    a.friend = Math.min(100, a.friend + 4);
    a.gainCD = 2;
  }
  for (let i = 0; i < 4; i++) {
    bubble('♥', a.x + rnd(-0.45, 0.45), a.cfg.height + rnd(0, 0.5), a.z + rnd(-0.4, 0.4), {
      size: 72, color: '#ff4d88', bg: false, life: 1.2, vy: 0.6,
    });
  }
  if (a.kind === 'dog') {
    SFX.bark(spatial(a.x, a.z));
    bubble('Woof! Woof!', a.x, a.cfg.height + 0.4, a.z, { life: 1.2 });
    toast('The dog barked happily! 🐶');
  } else {
    SFX.meow(spatial(a.x, a.z));
    SFX.purr(spatial(a.x, a.z));
    bubble('Purr…', a.x, a.cfg.height + 0.3, a.z, { life: 1.2 });
    toast('The cat is purring 🐱');
  }
}

/* ====================================================================
   Crows
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
          state.plateFood = false;
          setPlateFood(false);
          toast('The crow stole the food from the plate!');
          takeoff(c, true);
        } else {
          c.idle = rnd(1, 3.5);
        }
      }
    }
  } else {
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
        const rr = rnd(9, 16);
        c.target = { x: player.x + Math.cos(a) * rr, y: 0, z: player.z + Math.sin(a) * rr };
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
   Falling petals, leaves and rain
   ==================================================================== */
function buildFlyers() {
  const N_PETAL = 110;
  const N_LEAF = 70;
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

  rainMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.02, 0.7, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.5, fog: false, depthWrite: false }),
    RAIN_N
  );
  rainMesh.frustumCulled = false;
  rainMesh.count = 0;
  for (let i = 0; i < RAIN_N; i++) {
    rainDrops.push({ x: rnd(-16, 16), y: rnd(0, 18), z: rnd(-16, 16), sp: rnd(14, 20) });
  }
  scene.add(rainMesh);
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

function updateRain(dt) {
  const n = Math.round(RAIN_N * state.rain);
  rainMesh.count = n;
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    const d = rainDrops[i];
    d.y -= d.sp * dt;
    if (d.y < 0) d.y += 18;
    d.x = wrapNear(d.x, player.x, 16);
    d.z = wrapNear(d.z, player.z, 16);
    dummy.position.set(d.x, d.y, d.z);
    dummy.rotation.set(0.08, 0, 0.12);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rainMesh.setMatrixAt(i, dummy.matrix);
  }
  rainMesh.instanceMatrix.needsUpdate = true;
}

/* ====================================================================
   Bubbles and hearts
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
   Player: a lemon with a face
   ==================================================================== */
const player = { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI, group: null, body: null, carry: null, walkT: 0, stepT: 0, blob: null, speed: 0 };

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
  shadowAll(g);
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

  if (state.sleeping) {
    goal = null;
  } else if (fwd || side) {
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

  const moving = (mx !== 0 || mz !== 0) && !state.sleeping;
  let sprinting = false;
  if (moving) {
    sprinting = (state.sprintKey || state.sprintBtn) && state.stamina > 4 && state.hunger > 0;
    let speed = WALK_SPEED;
    if (sprinting) {
      speed = SPRINT_SPEED;
      state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN * dt);
      state.sprintCD = 0.8;
    }
    if (state.hunger <= 0) speed *= 0.7;
    player.speed = speed;
    player.x += mx * speed * dt;
    player.z += mz * speed * dt;
    player.yaw = angleLerp(player.yaw, Math.atan2(mx, mz), Math.min(1, dt * 10));
    player.walkT += dt * (sprinting ? 17 : 11);
    player.stepT -= dt;
    if (player.stepT <= 0 && actx) {
      player.stepT = sprinting ? 0.3 : 0.42;
      SFX.step(spatial(player.x, player.z));
    }
  }
  if (!sprinting) {
    state.sprintCD = Math.max(0, state.sprintCD - dt);
    if (state.sprintCD <= 0) state.stamina = Math.min(100, state.stamina + STAMINA_REGEN * dt);
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
  const holdingFood = state.inv[state.sel] && state.inv[state.sel].type === 'food';
  player.carry.visible = !!holdingFood;
  player.group.visible = !state.sleeping;
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
   Inventory (5 slots), hunger and actions
   ==================================================================== */
const ITEMS = {
  food: { icon: '🥣', name: 'Dog food' },
  lemon: { icon: '🍋', name: 'Lemon' },
};

function addItem(type, n = 1) {
  let left = n;
  for (const s of state.inv) {
    if (s && s.type === type && s.n < MAX_STACK) {
      const k = Math.min(left, MAX_STACK - s.n);
      s.n += k;
      left -= k;
      if (!left) break;
    }
  }
  for (let i = 0; i < SLOTS && left > 0; i++) {
    if (!state.inv[i]) {
      const k = Math.min(left, MAX_STACK);
      state.inv[i] = { type, n: k };
      left -= k;
    }
  }
  renderInv();
  return n - left;
}

function removeOne(i) {
  const s = state.inv[i];
  if (!s) return;
  s.n--;
  if (s.n <= 0) state.inv[i] = null;
  renderInv();
}

function renderInv() {
  document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
    const s = state.inv[i];
    el.classList.toggle('sel', i === state.sel);
    el.querySelector('.icon').textContent = s ? ITEMS[s.type].icon : '';
    el.querySelector('.count').textContent = s && s.n > 1 ? s.n : '';
    el.title = s ? ITEMS[s.type].name : 'Empty';
  });
}

function selectSlot(i) {
  if (i === state.sel) {
    useSelected();
    return;
  }
  state.sel = i;
  renderInv();
}

function useSelected() {
  const s = state.inv[state.sel];
  if (!s) {
    toast('This slot is empty.');
    return;
  }
  if (s.type === 'lemon') {
    if (state.hunger >= 100) {
      toast('You are not hungry right now.');
      return;
    }
    state.hunger = Math.min(100, state.hunger + LEMON_FILL);
    removeOne(state.sel);
    SFX.ding(spatial(player.x, player.z));
    bubble('Yum!', player.x, 1.3, player.z, { size: 44, life: 1 });
    toast('Tasty lemon! Hunger restored.');
  } else {
    toast('Tap the plate to serve the dog food.');
  }
}

function grabFood() {
  if (!addItem('food', 1)) {
    toast('Your inventory is full.');
    return;
  }
  SFX.pick(spatial(HOUSE.x, HOUSE.z));
  bubble('+1 🥣', player.x, 1.4, player.z, { size: 44, life: 1 });
  toast('You took a portion of dog food.');
}

function takeFromShed() {
  const got = addItem('food', 3);
  if (!got) {
    toast('Your inventory is full.');
    return;
  }
  SFX.chime();
  bubble('+3 🥣', SHED.x, 2.4, SHED.z, { size: 44, life: 1.2 });
  toast('Capi Food: you took 3 portions of dog food.');
}

function placeFood() {
  if (state.plateFood) {
    toast('The plate is already full.');
    return;
  }
  let idx = state.inv[state.sel] && state.inv[state.sel].type === 'food' ? state.sel : -1;
  if (idx < 0) idx = state.inv.findIndex((s) => s && s.type === 'food');
  if (idx < 0) {
    toast('You have no dog food. Take some from the doghouse or Capi Food.');
    return;
  }
  removeOne(idx);
  state.plateFood = true;
  setPlateFood(true);
  SFX.place(spatial(PLATE.x, PLATE.z));
  toast('Food on the plate. The dog is coming!');
  if (animals.dog.state !== 'eat') animals.dog.state = 'plate';
}

function collectLemon(rec) {
  if (rec.done) return;
  if (!addItem('lemon', 1)) {
    if (Math.hypot(rec.x - player.x, rec.z - player.z) < 0.7) toast('Your inventory is full.');
    return;
  }
  rec.done = true;
  picked.add(rec.key);
  if (rec.mesh.parent) rec.mesh.parent.remove(rec.mesh);
  pickables.delete(rec.mesh);
  state.lemons++;
  SFX.ding(spatial(rec.x, rec.z));
  bubble('+1 🍋', rec.x, 0.9, rec.z, { size: 44, life: 1 });
  toast('+1 lemon 🍋');
}

function tryBed() {
  if (state.sleeping) return;
  if (!isNight()) {
    toast('Too early to sleep. Come back at night.');
    return;
  }
  state.sleeping = true;
  toast('Good night…');
  $('fade').classList.add('on');
  setTimeout(() => {
    state.tod = 6.5;
    state.day++;
    state.stamina = 100;
    state.sprintCD = 0;
    $('fade').classList.remove('on');
    setTimeout(() => {
      state.sleeping = false;
      toast('You slept well. Good morning!');
    }, 900);
  }, 1200);
}

function toggleCall() {
  state.call = !state.call;
  $('callBtn').classList.toggle('on', state.call);
  if (!state.call) {
    toast('Your friends are staying put.');
    return;
  }
  if (animals.dog.friend < FOLLOW_MIN && animals.cat.friend < FOLLOW_MIN) {
    toast('Nobody trusts you enough yet. Pet them more!');
  } else if (animals.cat.friend < FOLLOW_MIN) {
    toast('Calling your friends! The cat does not trust you enough yet.');
  } else {
    toast('Calling your friends! 🐾');
  }
  SFX.click();
}

function executeGoal(g) {
  switch (g.kind) {
    case 'food': grabFood(); break;
    case 'shed': takeFromShed(); break;
    case 'bed': tryBed(); break;
    case 'plate': placeFood(); break;
    case 'dog':
    case 'cat': petAnimal(g.ref); break;
    case 'crow': scareCrow(g.ref); break;
    case 'lemon': collectLemon(g.ref); break;
    default: break;
  }
}

function makeGoal(pk) {
  return { kind: pk.kind, ref: pk.ref, range: RANGE[pk.kind] ?? 1.5 };
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ====================================================================
   HUD
   ==================================================================== */
let hudT = 0;
function refreshHud() {
  $('sLemons').textContent = state.lemons;
  $('sPets').textContent = state.pets;
  $('sFed').textContent = state.fed;
  const h = Math.floor(state.tod);
  const m = Math.floor((state.tod - h) * 60);
  $('timeLbl').textContent = `Day ${state.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('weatherLbl').textContent = state.rain > 0.5 ? '🌧 Raining' : isNight() ? '🌙 Night' : '☀️ Clear';
  $('stamFill').style.width = `${state.stamina}%`;
  document.querySelectorAll('#hungerRow .lem').forEach((el, i) => {
    const f = clamp((state.hunger - i * 20) / 20, 0, 1);
    el.style.opacity = String(0.2 + 0.8 * f);
    el.style.filter = f < 0.5 ? 'grayscale(1)' : 'none';
  });
  for (const [k, a] of [['Dog', animals.dog], ['Cat', animals.cat]]) {
    $(`f${k}Lvl`).textContent = friendLabel(a.friend);
    $(`f${k}Bar`).style.width = `${a.friend}%`;
  }
  $('callBtn').classList.toggle('on', state.call);
}

/* ====================================================================
   Raycast, cursor, input
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

function placeCursor(x, y) {
  cursorEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
function setHover(x, y) {
  const obj = pickAt(x, y);
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
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
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

  const keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sprintKey = true;
    const k = keyMap[e.code];
    if (k) {
      if (e.code.startsWith('Arrow')) e.preventDefault();
      ensureAudio();
      dirs.add(k);
      goal = null;
    }
    const d = /^Digit([1-5])$/.exec(e.code);
    if (d) selectSlot(Number(d[1]) - 1);
    if (e.code === 'KeyE') useSelected();
    if (e.code === 'KeyF') toggleCall();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sprintKey = false;
    const k = keyMap[e.code];
    if (k) dirs.delete(k);
  });
  window.addEventListener('blur', () => { dirs.clear(); state.sprintKey = false; });

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

  const sprint = $('sprintBtn');
  sprint.addEventListener('pointerdown', (e) => { e.preventDefault(); ensureAudio(); state.sprintBtn = true; sprint.classList.add('on'); });
  const sprintOff = () => { state.sprintBtn = false; sprint.classList.remove('on'); };
  sprint.addEventListener('pointerup', sprintOff);
  sprint.addEventListener('pointercancel', sprintOff);
  sprint.addEventListener('pointerleave', sprintOff);

  document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
    el.addEventListener('click', () => { ensureAudio(); selectSlot(i); });
  });

  $('callBtn').addEventListener('click', () => { ensureAudio(); toggleCall(); });
  $('btnSound').addEventListener('click', () => {
    state.muted = !state.muted;
    ensureAudio();
    if (master) master.gain.value = state.muted ? 0 : 0.8;
    $('btnSound').textContent = state.muted ? '🔇' : '🔊';
  });
  $('btnRain').addEventListener('click', () => { ensureAudio(); toggleRain(); });
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
   Ambient sound
   ==================================================================== */
let birdT = 2;
function updateAmbient(dt) {
  if (!actx) return;
  if (rainGain) rainGain.gain.setTargetAtTime(0.22 * state.rain, actx.currentTime, 0.2);
  birdT -= dt;
  if (birdT <= 0 && state.rain < 0.3) {
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
   Main loop
   ==================================================================== */
let lastFrame = 0;
let thunderT = 20;

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  T += dt;

  updateClock(dt);
  updateWeather(dt);
  state.hunger = Math.max(0, state.hunger - HUNGER_RATE * dt);
  updatePlayer(dt);
  updateCamera(dt);
  ground.position.set(player.x, 0, player.z);
  updateEnvironment(dt);
  for (const a of [animals.dog, animals.cat]) updateAnimal(a, dt, T);
  for (const c of crows) updateCrow(c, dt, T);
  updateFlyers(dt, T);
  updateRain(dt);
  updateBubbles(dt);
  updatePickups(dt);
  updateAmbient(dt);

  if (state.rain > 0.6) {
    thunderT -= dt;
    if (thunderT <= 0) {
      thunderT = rnd(12, 30);
      SFX.thunder();
    }
  }

  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.12;
    refreshHud();
  }
  renderer.render(scene, camera);
}

/* ====================================================================
   Startup
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
  hemi = new THREE.HemisphereLight(0xeaf8ff, 0x5b9c3a, 1.2);
  scene.add(hemi);
  sunLight = new THREE.DirectionalLight(0xfff1cf, 1.35);
  sunLight.castShadow = true;
  const mapSize = isTouch ? 1024 : 2048;
  sunLight.shadow.mapSize.set(mapSize, mapSize);
  const sc = sunLight.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 1;
  sc.far = 160;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight);
  scene.add(sunLight.target);

  ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  buildSky();
  buildBackdrop();
  buildHouse();
  buildPlate();
  buildShed();
  buildTent();
  buildAnimals();
  buildCrows();
  buildPlayer();
  buildFlyers();
  updateChunks(true);
}

function startRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xbfe3f5, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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
  renderInv();
  refreshHud();
  renderer.setAnimationLoop((now) => frame(now));
  $('loading').classList.add('done');
  // hooks for testing; they do not change the game
  window.lemonDebug = {
    player, state, animals, crows, plate,
    get goal() { return goal; },
    setGoal(g) { goal = g; },
    get camDist() { return camDist; },
    set camDist(v) { camDist = v; },
    get camYaw() { return camYaw; },
    set camYaw(v) { camYaw = v; },
    setTod(v) { state.tod = v; },
    setRain(v) { state.rainTarget = v; state.rain = v; state.rainTimer = 999; },
    toggleCall,
    addItem,
    chunks: () => chunks.size,
  };
}

if (!browserOK()) {
  $('loading').classList.add('done');
  $('start').classList.add('hidden');
  $('unsupported').classList.remove('hidden');
} else {
  const showError = (e) => {
    console.error(e);
    const msg = (e && (e.message || e.toString())) || 'unknown error';
    $('loading').textContent = `The game could not load. Reload the page. (${String(msg).slice(0, 160)})`;
  };
  window.addEventListener('error', (ev) => showError(ev.error || new Error(ev.message)));
  window.addEventListener('unhandledrejection', (ev) => showError(ev.reason));
  init().catch(showError);
}
