/*
  Lemon Garden — 3D game (Three.js), no build step, GitHub Pages compatible.
  All in-game text is in English.
*/
// Three.js r160 is vendored next to the game so it loads from the same site (no CDN needed).
import * as THREE from './vendor/three.module.min.js';
// Load myday.js with the same query as this file, so it is never older than the game
const MyDay = await import('./myday.js' + new URL(import.meta.url).search);

// Boot diagnostics live in index.html; these helpers are safe if they are missing.
const boot = window.__boot || { stage() {}, fail(e) { console.error(e); }, done() {} };
boot.stage('module + Three.js loaded');

/* ====================================================================
   Helpers
   ==================================================================== */
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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
const SHED = { x: -12.5, z: -7.5 };        // Capi Food
const CHEST_SHOP = { x: -8.2, z: -11.2 };  // next to Capi Food
const JUNE_SHOP = { x: 9.5, z: -6.5 };     // June Food
const TENT = { x: -11, z: 4.5 };
const CAPI_PLATE = { x: -3.1, z: 0.8 };
const JUNE_PLATE = { x: 5.4, z: 1.6 };
const SPAWN = { x: 0, z: 4 };
const WALK_SPEED = 3.4;
const SPRINT_SPEED = 6.4;
const DAY_SECONDS = 300;        // a full 24-hour cycle lasts 5 minutes
const HUNGER_RATE = 0.22;
const STAMINA_DRAIN = 24;
const STAMINA_REGEN = 16;
const LEMON_FILL = 20;
const MAX_STACK = 10;
const SLOTS = 5;
const FOLLOW_MIN = 20;
const VET_EVERY_DAYS = 3;
const SICK_CHANCE_PER_HOUR = 0.015;
const MAX_TORCHES = 40;
const TORCH_LIGHTS = 6;
const EAT_TIME = 1.4;
const NAMES = { dog: 'Capi', cat: 'June' };
const RANGE = {
  food: 2.6, shed: 2.6, juneshop: 2.6, chest: 2.3, bed: 2.0, plate: 1.9, dog: 2.1, cat: 2.1,
  crow: 3.2, lemon: 0.9, torch: 1.6, vet: 4.6, walk: 0.3, placeTorch: 0.8, waypoint: 1.5, ruin: 3.0,
};
const LABELS = {
  food: 'Take Capi food',
  shed: 'Capi Food',
  juneshop: 'June Food',
  chest: 'Open chest (torches)',
  bed: 'Sleep',
  plate: 'Serve food',
  dog: 'Pet Capi',
  cat: 'Pet June',
  crow: 'Scare the crow',
  lemon: 'Pick up lemon',
  torch: 'Pick up torch',
  vet: 'Vet clinic',
  ruin: 'Abandoned Chest Shop',
};
const FOOD_REF = { x: HOUSE.x, z: HOUSE.z };
const SHED_REF = { x: SHED.x, z: SHED.z };
const JUNE_SHOP_REF = { x: JUNE_SHOP.x, z: JUNE_SHOP.z };
const CHEST_REF = { x: CHEST_SHOP.x, z: CHEST_SHOP.z };
const BED_REF = { x: TENT.x, z: TENT.z };
const FLOWER_COLORS = [0xffffff, 0xff8fb1, 0xffe14d, 0xc79bff, 0xff9d5c];
const ITEMS = {
  food: { icon: '🥣', name: 'Capi food' },
  catfood: { icon: '🐟', name: 'June food' },
  lemon: { icon: '🍋', name: 'Lemon' },
  torch: { icon: '🔥', name: 'Torch' },
};

/* ====================================================================
   State
   ==================================================================== */
const state = {
  lemons: 0,
  pets: 0,
  fed: 0,
  muted: false,
  day: 1,
  tod: 8.0,
  lastHour: 8,
  rain: 0,
  rainTarget: 0,
  rainTimer: 120,
  hunger: 100,
  stamina: 100,
  sprintKey: false,
  sprintBtn: false,
  sprintCD: 0,
  sleeping: false,
  call: false,
  inv: Array.from({ length: SLOTS }, () => null),
  sel: 0,
  waypoint: null,
  eatT: 0,
  dayF: 1,
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
  startLoop(420, 'lowpass', 0.04, true);
  rainGain = startLoop(1400, 'highpass', 0, false);
}

function startLoop(freq, type, vol, lfoOn) {
  const s = actx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = actx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = actx.createGain();
  g.gain.value = vol;
  if (lfoOn) {
    const lfo = actx.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = actx.createGain();
    lg.gain.value = 0.025;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
  }
  s.connect(f).connect(g).connect(master);
  s.start();
  return g;
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
  hammer(sp) {
    tone({ type: 'square', f0: 1000, f1: 700, dur: 0.05, vol: 0.08, sp });
    noise({ dur: 0.04, vol: 0.12, f: 3500, q: 1.5, sp });
  },
  thunder() { noise({ dur: 2.2, vol: 0.35, f: 120, q: 0.7, type: 'lowpass' }); },
  fire(sp) {
    noise({ dur: 0.35, vol: 0.18, f: 900, q: 0.5, sp });
    tone({ type: 'triangle', f0: 180, f1: 320, dur: 0.25, vol: 0.1, sp });
  },
  chest(sp) {
    tone({ type: 'square', f0: 220, f1: 160, dur: 0.12, vol: 0.12, sp, filt: { type: 'lowpass', f: 900 } });
    noise({ dur: 0.15, vol: 0.12, at: 0.05, f: 700, sp });
  },
};

/* ====================================================================
   Textures and materials
   ==================================================================== */
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Could not load image ' + src));
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
function signTexture(text, bg = '#f4e4b4', fg = '#3b2412', border = '#5a3a1e') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = border;
  g.lineWidth = 10;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  let size = 70;
  do {
    g.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
    size -= 2;
  } while (g.measureText(text).width > 460 && size > 20);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return texFromCanvas(c);
}

const mats = {};
const geo = {};
let blobTex = null;
let glowTex = null;

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
}

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
  mats.ground = std(0x5aa23a, { roughness: 1 });
  mats.trunk = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  mats.foliage = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mats.lemon = std(0xffd53a, { roughness: 0.35 });
  mats.lemonLeaf = std(0x3f9d2c, { roughness: 0.6, side: THREE.DoubleSide });
  mats.wood = std(0xc08347, { roughness: 0.9 });
  mats.wood2 = std(0x9c6a3c, { roughness: 0.9 });
  mats.darkWood = std(0x5b3a1f, { roughness: 0.9 });
  mats.brass = std(0xd4a640, { roughness: 0.35, metalness: 0.6 });
  mats.roof = std(0xb8432f, { roughness: 0.8 });
  mats.juneWall = std(0xb79ad1, { roughness: 0.9 });
  mats.juneRoof = std(0x2e8b8b, { roughness: 0.8 });
  mats.awning = std(0xf08a24, { roughness: 0.8, side: THREE.DoubleSide });
  mats.door = std(0x2a1c10);
  mats.tent = std(0x6f7d3a, { roughness: 0.9, side: THREE.DoubleSide });
  mats.mattress = std(0x8fb8e8, { roughness: 0.9 });
  mats.blanket = std(0xc83b3b, { roughness: 0.9 });
  mats.pillow = std(0xf7f7f2, { roughness: 0.9 });
  mats.bowl = std(0xd9352b, { roughness: 0.4 });
  mats.kibble = std(0xa8632a, { roughness: 0.7 });
  mats.fish = std(0xf08f5a, { roughness: 0.6 });
  mats.can = std(0xc9d1d9, { roughness: 0.3, metalness: 0.7 });
  mats.plate = std(0xffffff, { roughness: 0.3 });
  mats.rimBlue = std(0x3a7bd5, { roughness: 0.3 });
  mats.rimPink = std(0xe85b9a, { roughness: 0.3 });
  mats.crow = std(0x1c1e25, { roughness: 0.6 });
  mats.beak = std(0x4a4a4a, { roughness: 0.5 });
  mats.tongue = std(0xff7f9f, { roughness: 0.6 });
  mats.white = std(0xf4f4f0, { roughness: 0.9 });
  mats.vetRoof = std(0x2d6cdf, { roughness: 0.7 });
  mats.sand = std(0xe8d49a, { roughness: 1 });
  mats.fence = std(0xf5f0e6, { roughness: 0.8 });
  mats.red = std(0xe53935, { roughness: 0.5 });
  mats.yellow = std(0xffc928, { roughness: 0.5 });
  mats.blue = std(0x1e88e5, { roughness: 0.5 });
  mats.flame = new THREE.MeshBasicMaterial({ color: 0xffa634 });
  mats.flameCore = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
  mats.dogCoat = std(0xdfe3ea, { map: dogCoatTex, roughness: 0.95 });
  mats.dogDark = std(0x2b2e35, { roughness: 1 });
  mats.dogTan = std(0xb88a57, { roughness: 1 });
  mats.dogCream = std(0xefe9dc, { roughness: 1 });
  mats.dogFace = std(0xffffff, { map: dogFaceTex, transparent: true, alphaTest: 0.03, roughness: 0.9, side: THREE.DoubleSide });
  mats.catCoat = std(0xffffff, { map: catCoatTex, roughness: 0.9 });
  mats.catLight = std(0xf0b77a, { roughness: 0.9 });
  mats.catFace = std(0xffffff, { map: catFaceTex, transparent: true, alphaTest: 0.03, roughness: 0.9, side: THREE.DoubleSide });
  mats.signCapi = std(0xffffff, { map: signTexture('Capi Food'), roughness: 0.8 });
  mats.signJune = std(0xffffff, { map: signTexture('June Food', '#f3e8ff', '#4b2a6b', '#6d3f99'), roughness: 0.8 });
  mats.signChest = std(0xffffff, { map: signTexture('Chest Shop', '#fff2d6', '#5a2d0c', '#a0521d'), roughness: 0.8 });
  mats.signVet = std(0xffffff, { map: signTexture('✚ VET', '#ffffff', '#d32f2f', '#d32f2f'), roughness: 0.8 });
  mats.signPark = std(0xffffff, { map: signTexture('PET PARK', '#e8ffe0', '#1f6b1f', '#2e8b2e'), roughness: 0.8 });
  mats.signAbandoned = std(0xffffff, { map: signTexture('ABANDONED', '#b8b0a0', '#4a4036', '#5e5245'), roughness: 1 });
  mats.signWip = std(0xffffff, { map: signTexture('WORK IN PROGRESS', '#ffcc00', '#111111', '#111111'), roughness: 0.7, side: THREE.DoubleSide });
  mats.ruinWood = std(0x6e5d4b, { roughness: 1 });
  mats.ruinCloth = std(0x8f6a52, { roughness: 1, side: THREE.DoubleSide });
  mats.steel = std(0x9aa3ad, { roughness: 0.4, metalness: 0.5 });
  mats.crane = std(0xf2b705, { roughness: 0.5 });
  mats.cone = std(0xff6a00, { roughness: 0.6 });
  mats.hardHat = std(0xff9800, { roughness: 0.4 });
  mats.vest = std(0xff6d00, { roughness: 0.7, side: THREE.DoubleSide });
  mats.ridge = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  mats.spruce = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  mats.monkWall = new THREE.MeshBasicMaterial({ color: 0xf1e7c8, fog: false });
  mats.monkDome = new THREE.MeshBasicMaterial({ color: 0x2c4fa6, fog: false });
  mats.monkRoof = new THREE.MeshBasicMaterial({ color: 0x8b3b2b, fog: false });
  mats.beacon = new THREE.MeshBasicMaterial({ color: 0xff5a36, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
  blobTex = radialCanvasTexture('rgba(20,40,10,0.5)', 'rgba(20,40,10,0)');
  glowTex = radialCanvasTexture('rgba(255,190,90,0.9)', 'rgba(255,120,30,0)');
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
function pickable(mesh, kind, ref, label) {
  mesh.userData.pick = { kind, ref, label };
  pickables.add(mesh);
  return mesh;
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
  geo.stick = new THREE.CylinderGeometry(0.035, 0.05, 1.1, 6);
  geo.torchCup = new THREE.CylinderGeometry(0.09, 0.06, 0.12, 8);
  geo.flame = new THREE.ConeGeometry(0.09, 0.28, 8);
  geo.flameCore = new THREE.ConeGeometry(0.045, 0.16, 6);
  geo.post = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6);
  geo.hat = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2);
  geo.brim = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 16);
  geo.pole = new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6);
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
  state.dayF = dayF;
  const dusk = Math.exp(-(sunDir.y * sunDir.y) / 0.01) * 0.85;
  const rain = state.rain;
  lightDir.copy(sunDir);
  if (sunDir.y < 0) lightDir.negate();
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
   Points of interest: shops, vets and pet parks (vets/parks are random)
   ==================================================================== */
const pois = [];      // everything that appears on the map
const vets = [];
const parks = [];

function addPoi(p) {
  pois.push(p);
  return p;
}

function generateRandomPois() {
  const taken = pois.map((p) => ({ x: p.x, z: p.z }));
  const spot = (min, max) => {
    for (let tries = 0; tries < 40; tries++) {
      const a = rnd(0, TAU);
      const d = rnd(min, max);
      const p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      if (taken.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 30)) {
        taken.push(p);
        return p;
      }
    }
    const a = rnd(0, TAU);
    return { x: Math.cos(a) * max, z: Math.sin(a) * max };
  };
  [[38, 65], [80, 140], [160, 260], [300, 460]].forEach(([a, b], i) => {
    const p = spot(a, b);
    vets.push(addPoi({ type: 'vet', x: p.x, z: p.z, icon: '🏥', label: `VET ${i + 1}`, clear: 12 }));
  });
  [[30, 55], [90, 170], [200, 360]].forEach(([a, b], i) => {
    const p = spot(a, b);
    parks.push(addPoi({ type: 'park', x: p.x, z: p.z, r: 8, icon: '🎾', label: `PARK ${i + 1}`, clear: 14, active: -10 }));
  });
}

/* ====================================================================
   Infinite world: chunks of grass, trees, bushes and lemons
   ==================================================================== */
const chunks = new Map();
let obstacles = [
  { x: HOUSE.x, z: HOUSE.z, r: 1.25, ck: 'static' },
  { x: SHED.x, z: SHED.z, r: 1.9, ck: 'static' },
  { x: CHEST_SHOP.x, z: CHEST_SHOP.z, r: 1.3, ck: 'static' },
  { x: JUNE_SHOP.x, z: JUNE_SHOP.z, r: 1.9, ck: 'static' },
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
  for (const p of pois) if (Math.hypot(x - p.x, z - p.z) < (p.clear || 7)) return true;
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
    // no grass on the sand of the pet parks
    if (parks.some((pk) => Math.hypot(x - pk.x, z - pk.z) < pk.r + 0.3)) dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    if (stem) {
      col.setHSL(0.27 + r() * 0.03, 0.5, 0.36);
      if (r() < 0.45 && dummy.scale.y > 0) heads.push({ x, y: sy, z });
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
      if (picked.has(key2) || nearStatic(x, z)) continue;
      const m = new THREE.Mesh(geo.lemon, mats.lemon);
      m.scale.setScalar(0.55);
      m.rotation.set(0, r() * TAU, Math.PI / 2, 'YXZ');
      m.position.set(x, 0.22, z);
      group.add(m);
      const rec = { x, z, mesh: m, key: key2, done: false };
      pickable(m, 'lemon', rec);
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
   Static structures
   ==================================================================== */
const plates = [];

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
  g.add(pickable(bowl, 'food', FOOD_REF));
  const rr = mulberry32(99);
  for (let i = 0; i < 16; i++) {
    const k = new THREE.Mesh(geo.smallSphere, mats.kibble);
    const a = rr() * TAU;
    const d = rr() * 0.2;
    k.scale.setScalar(0.045);
    k.position.set(Math.cos(a) * d, 0.24 + rr() * 0.02, 0.2 + Math.sin(a) * d);
    g.add(pickable(k, 'food', FOOD_REF));
  }
  shadowAll(g);
  addPoi({ type: 'home', x: HOUSE.x, z: HOUSE.z, icon: '🏠', label: "Capi's house", clear: 7 });
}

function buildPlate(pos, who, rimMat, kibMat) {
  const p = { x: pos.x, z: pos.z, who, food: false, kib: [] };
  const label = `Serve ${NAMES[who]}'s food`;
  const g = new THREE.Group();
  g.position.set(pos.x, 0.03, pos.z);
  scene.add(g);
  const disc = new THREE.Mesh(geo.plate, mats.plate);
  g.add(pickable(disc, 'plate', p, label));
  const rim = new THREE.Mesh(geo.rim, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.03;
  g.add(rim);
  const rr = mulberry32(42 + plates.length);
  for (let i = 0; i < 12; i++) {
    const k = new THREE.Mesh(geo.smallSphere, kibMat);
    const a = rr() * TAU;
    const d = rr() * 0.28;
    k.scale.setScalar(0.05);
    k.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d);
    k.visible = false;
    g.add(pickable(k, 'plate', p, label));
    p.kib.push(k);
  }
  plates.push(p);
  addPoi({ type: 'plate', x: pos.x, z: pos.z, icon: '🍽️', label: `${NAMES[who]}'s plate`, clear: 4 });
  return p;
}
function setPlateFood(p, on) {
  p.food = on;
  for (const k of p.kib) k.visible = on;
}

function buildShop({ pos, rot, wall, roof, sign, kind, ref, icon, label }) {
  const g = new THREE.Group();
  g.position.set(pos.x, 0, pos.z);
  g.rotation.y = rot;
  scene.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.7, 2.2), wall);
  body.position.y = 0.85;
  g.add(pickable(body, kind, ref));
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 2.5), roof);
    slab.position.set(s * 0.75, 2.0, 0);
    slab.rotation.z = -s * 0.5;
    g.add(slab);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.05), mats.door);
  door.position.set(0, 0.6, 1.13);
  g.add(door);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), sign);
  sg.position.set(0, 1.42, 1.14);
  g.add(pickable(sg, kind, ref));
  shadowAll(g);
  addPoi({ type: 'shop', x: pos.x, z: pos.z, icon, label, clear: 7 });
}

/* ====================================================================
   Chest Shop: abandoned at first; renovate it with 7 lemons
   ==================================================================== */
const RENOVATE_COST = 7;
const BUILD_TIME = 35;
const RENOVATE_RANGE = 4.5;
const SHOP_ROT = 0.2;
const chestShop = {
  status: 'abandoned', // 'abandoned' | 'building' | 'open'
  left: 0,
  normal: null,
  ruin: null,
  site: null,
  jib: null,
  cable: null,
  hook: null,
  workers: [],
  poi: null,
  near: false,
  dismissed: false,
  hammerT: 0,
  chipText: '',
};
let chestLid = null;
let chestOpenT = 0;

// A point around the shop, given in the shop's own coordinates.
function shopPoint(lx, lz) {
  const c = Math.cos(SHOP_ROT);
  const s = Math.sin(SHOP_ROT);
  return { x: CHEST_SHOP.x + lx * c + lz * s, z: CHEST_SHOP.z - lx * s + lz * c };
}

function buildChestShop() {
  const g = new THREE.Group();
  g.position.set(CHEST_SHOP.x, 0, CHEST_SHOP.z);
  g.rotation.y = SHOP_ROT;
  scene.add(g);
  const box = (parent, w, h, d, m, x, y, z) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mm.position.set(x, y, z);
    parent.add(mm);
    return mm;
  };

  // the renovated stall (grows from the ground while it is being built)
  const normal = new THREE.Group();
  box(normal, 2.3, 0.9, 0.9, mats.wood, 0, 0.45, 0);
  for (const x of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), mats.darkWood);
    post.position.set(x, 1.1, -0.35);
    normal.add(post);
  }
  const awning = box(normal, 2.7, 0.08, 1.5, mats.awning, 0, 2.2, 0.15);
  awning.rotation.x = 0.25;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.47), mats.signChest);
  sign.position.set(0, 1.85, -0.32);
  normal.add(sign);
  const chest = new THREE.Group();
  chest.position.set(0.2, 0.9, 0.05);
  const base = box(chest, 0.8, 0.42, 0.5, mats.darkWood, 0, 0.21, 0);
  const lid = box(chest, 0.82, 0.16, 0.52, mats.wood2, 0, 0.5, 0);
  const band = box(chest, 0.1, 0.6, 0.53, mats.brass, 0, 0.3, 0);
  const lock = box(chest, 0.12, 0.12, 0.04, mats.brass, 0, 0.38, 0.27);
  for (const m of [base, lid, band, lock]) pickable(m, 'chest', CHEST_REF);
  normal.add(chest);
  chestLid = lid;
  for (const x of [-0.8, -0.55]) {
    const t = buildTorchMesh(false);
    t.position.set(x, 0.9, 0.1);
    t.rotation.z = 0.15;
    t.scale.setScalar(0.8);
    normal.add(t);
  }
  g.add(normal);
  chestShop.normal = normal;

  // the abandoned ruin
  const ruin = new THREE.Group();
  const parts = [];
  const rc = box(ruin, 2.3, 0.75, 0.9, mats.ruinWood, 0.05, 0.36, 0);
  rc.rotation.z = 0.07;
  parts.push(rc);
  const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), mats.darkWood);
  post1.position.set(-1.1, 0.75, -0.35);
  post1.rotation.z = 0.12;
  const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), mats.darkWood);
  post2.position.set(1.5, 0.1, -0.1);
  post2.rotation.set(0, 0.3, Math.PI / 2 - 0.15);
  ruin.add(post1, post2);
  parts.push(post1, post2);
  const cloth = box(ruin, 2.7, 0.06, 1.5, mats.ruinCloth, 0.3, 0.2, 1.05);
  cloth.rotation.set(0.3, 0, -0.18);
  const plank1 = box(ruin, 1.5, 0.07, 0.22, mats.ruinWood, -1.3, 0.04, 0.9);
  plank1.rotation.y = 0.7;
  const plank2 = box(ruin, 1.1, 0.07, 0.22, mats.ruinWood, 1.0, 0.04, 1.6);
  plank2.rotation.y = -0.4;
  const oldChest = box(ruin, 0.8, 0.42, 0.5, mats.ruinWood, -0.6, 0.21, 1.0);
  oldChest.rotation.y = 0.4;
  const oldLid = box(ruin, 0.82, 0.12, 0.52, mats.ruinWood, -0.15, 0.06, 1.55);
  oldLid.rotation.set(0.2, 0.9, 0);
  const rSign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.47), mats.signAbandoned);
  rSign.position.set(0.05, 0.45, 0.47);
  rSign.rotation.z = -0.08;
  ruin.add(rSign);
  parts.push(cloth, plank1, plank2, oldChest, oldLid, rSign);
  for (const m of parts) pickable(m, 'ruin', CHEST_REF);
  g.add(ruin);
  chestShop.ruin = ruin;

  // the building site: scaffolding, a mini crane and a work in progress sign
  const site = new THREE.Group();
  for (const x of [-1.5, 0, 1.5]) {
    for (const z of [-0.95, 0.95]) {
      const p = new THREE.Mesh(geo.pole, mats.steel);
      p.position.set(x, 1.4, z);
      site.add(p);
    }
  }
  for (const y of [1.25, 2.5]) {
    for (const z of [-0.95, 0.95]) box(site, 3.1, 0.05, 0.05, mats.steel, 0, y, z);
    for (const x of [-1.5, 1.5]) box(site, 0.05, 0.05, 1.95, mats.steel, x, y, 0);
  }
  for (const z of [-0.95, 0.95]) box(site, 3.1, 0.06, 0.4, mats.wood, 0, 1.28, z);

  const crane = new THREE.Group();
  crane.position.set(2.9, 0, -1.4);
  box(crane, 0.9, 0.3, 0.9, mats.crane, 0, 0.15, 0);
  box(crane, 0.2, 4.2, 0.2, mats.crane, 0, 2.4, 0);
  const jib = new THREE.Group();
  jib.position.y = 4.5;
  box(jib, 3.4, 0.16, 0.16, mats.crane, -1.2, 0, 0);
  box(jib, 0.5, 0.4, 0.4, mats.steel, 0.65, -0.1, 0);
  box(jib, 0.35, 0.35, 0.35, mats.steel, 0, -0.25, 0.25);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), mats.steel);
  cable.position.x = -2.6;
  const hook = box(jib, 0.18, 0.14, 0.18, mats.steel, -2.6, -1.2, 0);
  jib.add(cable);
  crane.add(jib);
  site.add(crane);
  chestShop.jib = jib;
  chestShop.cable = cable;
  chestShop.hook = hook;

  const wip = new THREE.Group();
  wip.position.set(-0.4, 0, 2.1);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), mats.signWip);
  board.position.y = 1.1;
  wip.add(board);
  for (const x of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), mats.steel);
    leg.position.set(x, 0.55, -0.02);
    wip.add(leg);
  }
  site.add(wip);
  for (const [x, z] of [[0.9, 2.0], [-1.6, 1.9], [1.9, 1.2]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 10), mats.cone);
    cone.position.set(x, 0.2, z);
    site.add(cone);
  }
  g.add(site);
  chestShop.site = site;

  shadowAll(g);
  chestShop.poi = addPoi({ type: 'shop', x: CHEST_SHOP.x, z: CHEST_SHOP.z, icon: '🏚', label: 'Abandoned shop', clear: 6 });
  setChestShopStatus('abandoned', 0);
}

function setChestShopStatus(status, left = 0) {
  chestShop.status = status;
  chestShop.left = left;
  chestShop.ruin.visible = status === 'abandoned';
  chestShop.normal.visible = status !== 'abandoned';
  chestShop.normal.scale.y = status === 'building' ? 0.1 + 0.9 * (1 - left / BUILD_TIME) : 1;
  chestShop.site.visible = status === 'building';
  const poi = chestShop.poi;
  if (status === 'abandoned') {
    poi.icon = '🏚';
    poi.label = 'Abandoned shop';
  } else if (status === 'building') {
    poi.icon = '🚧';
    poi.label = 'Renovating…';
  } else {
    poi.icon = '🧰';
    poi.label = 'Chest Shop';
  }
  hideRenovatePopup();
  updateBuildChip();
}

function countItem(type) {
  return state.inv.reduce((n, s) => n + (s && s.type === type ? s.n : 0), 0);
}

function takeItems(type, n) {
  for (let i = 0; i < SLOTS && n > 0; i++) {
    const s = state.inv[i];
    if (s && s.type === type) {
      const k = Math.min(n, s.n);
      s.n -= k;
      n -= k;
      if (s.n <= 0) state.inv[i] = null;
    }
  }
  renderInv();
}

function showRenovatePopup() {
  $('rnHave').textContent = `(you have ${countItem('lemon')})`;
  $('renovatePop').classList.remove('hidden');
}
function hideRenovatePopup() {
  $('renovatePop').classList.add('hidden');
}

function lemonHint() {
  const have = countItem('lemon');
  toast(`This Chest Shop is abandoned. Bring ${RENOVATE_COST} lemons to renovate it (you have ${have}).`);
}

function startRenovation() {
  if (chestShop.status !== 'abandoned') return;
  if (countItem('lemon') < RENOVATE_COST) {
    hideRenovatePopup();
    lemonHint();
    return;
  }
  takeItems('lemon', RENOVATE_COST);
  setChestShopStatus('building', BUILD_TIME);
  spawnWorkers(false);
  setJuneWork(true);
  SFX.chime();
  toast('Renovation started! June and the lemon builders are on their way 🔨');
}

function finishRenovation() {
  setChestShopStatus('open', 0);
  for (const w of chestShop.workers) w.mode = 'out';
  setJuneWork(false);
  SFX.chime();
  bubble('✨ Done!', CHEST_SHOP.x, 3, CHEST_SHOP.z, { life: 2 });
  toast('The Chest Shop is renovated! Open the chest to get torches 🔥');
}

function updateBuildChip() {
  const chip = $('buildChip');
  if (chestShop.status !== 'building') {
    chip.classList.add('hidden');
    chestShop.chipText = '';
    return;
  }
  const s = Math.max(0, Math.ceil(chestShop.left));
  const text = `🚧 Renovating the Chest Shop · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (text !== chestShop.chipText) {
    chip.textContent = text;
    chestShop.chipText = text;
  }
  chip.classList.remove('hidden');
}

function updateChestShop(dt) {
  if (chestShop.status === 'abandoned') {
    const near = Math.hypot(player.x - CHEST_SHOP.x, player.z - CHEST_SHOP.z) < RENOVATE_RANGE;
    const enough = countItem('lemon') >= RENOVATE_COST;
    if (near && !chestShop.near && !enough) lemonHint();
    if (!near) chestShop.dismissed = false;
    if (near && enough && !chestShop.dismissed) {
      if ($('renovatePop').classList.contains('hidden')) showRenovatePopup();
    } else if (!$('renovatePop').classList.contains('hidden')) {
      hideRenovatePopup();
    }
    chestShop.near = near;
  } else if (chestShop.status === 'building') {
    chestShop.left = Math.max(0, chestShop.left - dt);
    chestShop.normal.scale.y = 0.1 + 0.9 * (1 - chestShop.left / BUILD_TIME);
    chestShop.jib.rotation.y = Math.sin(T * 0.35) * 1.1;
    const L = 1.2 + Math.sin(T * 0.8) * 0.6;
    chestShop.cable.scale.y = L;
    chestShop.cable.position.y = -L / 2;
    chestShop.hook.position.y = -L - 0.07;
    chestShop.hammerT -= dt;
    if (chestShop.hammerT <= 0 && chestShop.workers.some((w) => w.mode === 'work')) {
      chestShop.hammerT = rnd(0.3, 0.7);
      SFX.hammer(spatial(CHEST_SHOP.x, CHEST_SHOP.z));
    }
    updateBuildChip();
    if (chestShop.left <= 0) finishRenovation();
  }
  updateWorkers(dt);
}

/* ---------- lemon builders ---------- */
function buildWorker() {
  const g = new THREE.Group();
  scene.add(g);
  const body = new THREE.Mesh(geo.lemon, mats.lemon);
  body.scale.setScalar(0.7);
  body.position.y = 0.36;
  g.add(body);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(geo.smallSphere, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    w.scale.setScalar(0.055);
    w.position.set(sx * 0.09, 0.43, 0.21);
    const p = new THREE.Mesh(geo.smallSphere, new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    p.scale.setScalar(0.028);
    p.position.set(sx * 0.09, 0.43, 0.26);
    g.add(w, p);
  }
  const hat = new THREE.Mesh(geo.hat, mats.hardHat);
  hat.scale.set(0.2, 0.15, 0.2);
  hat.position.y = 0.66;
  const brim = new THREE.Mesh(geo.brim, mats.hardHat);
  brim.position.y = 0.66;
  g.add(hat, brim);
  const arm = new THREE.Group();
  arm.position.set(0.26, 0.4, 0.05);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), mats.darkWood);
  handle.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.07), mats.steel);
  head.position.y = 0.27;
  arm.add(handle, head);
  g.add(arm);
  shadowAll(g);
  return { group: g, arm, blob: makeBlob(0.7), x: 0, z: 0, yaw: 0, moving: false, mode: 'in', spot: null, exit: null, ph: rnd(0, TAU) };
}

function clearWorkers() {
  for (const w of chestShop.workers) {
    scene.remove(w.group);
    scene.remove(w.blob);
  }
  chestShop.workers.length = 0;
}

function spawnWorkers(atSpot) {
  clearWorkers();
  [-1, 1].forEach((side) => {
    const w = buildWorker();
    const spot = shopPoint(side * 1.3, 1.5);
    const exit = shopPoint(side * 9, 9);
    w.spot = spot;
    w.exit = exit;
    w.x = atSpot ? spot.x : exit.x;
    w.z = atSpot ? spot.z : exit.z;
    w.mode = atSpot ? 'work' : 'in';
    chestShop.workers.push(w);
  });
}

function updateWorkers(dt) {
  const c = shopPoint(0, 0);
  const ws = chestShop.workers;
  for (let i = ws.length - 1; i >= 0; i--) {
    const w = ws[i];
    w.moving = false;
    if (w.mode === 'in' || w.mode === 'out') {
      const t = w.mode === 'in' ? w.spot : w.exit;
      if (stepTo(w, t.x, t.z, 2.4, dt, 0.1)) {
        if (w.mode === 'in') {
          w.mode = 'work';
        } else {
          scene.remove(w.group);
          scene.remove(w.blob);
          ws.splice(i, 1);
          continue;
        }
      }
    }
    let y = 0;
    if (w.mode === 'work') {
      w.yaw = angleLerp(w.yaw, Math.atan2(c.x - w.x, c.z - w.z), Math.min(1, dt * 5));
      const swing = Math.abs(Math.sin(T * 7 + w.ph));
      w.arm.rotation.x = -swing * 1.4;
      y = swing * 0.03;
    } else {
      w.arm.rotation.x = 0;
      if (w.moving) y = Math.abs(Math.sin(T * 11 + w.ph)) * 0.06;
    }
    w.group.position.set(w.x, y, w.z);
    w.group.rotation.y = w.yaw;
    w.blob.position.set(w.x, 0.01, w.z);
  }
}

/* ---------- June in her work outfit ---------- */
function setJuneCostume(on) {
  const cat = animals.cat;
  if (!cat.costume && on) {
    const hat = new THREE.Mesh(geo.hat, mats.hardHat);
    hat.scale.set(0.2, 0.16, 0.2);
    hat.position.set(0, 0.19, 0);
    const brim = new THREE.Mesh(geo.brim, mats.hardHat);
    brim.scale.set(0.9, 1, 0.9);
    brim.position.set(0, 0.19, 0);
    cat.head.add(hat, brim);
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 18, 1, true), mats.vest);
    vest.rotation.x = Math.PI / 2;
    vest.scale.set(1, 1, 0.82);
    vest.position.set(0, cat.body.position.y, 0.12);
    cat.holder.add(vest);
    cat.costume = [hat, brim, vest];
    shadowAll(cat.root);
  }
  if (cat.costume) for (const m of cat.costume) m.visible = on;
}

function setJuneWork(on) {
  const cat = animals.cat;
  setJuneCostume(on);
  if (on) {
    cat.state = 'work';
    cat.park = null;
    cat.target = null;
  } else if (cat.state === 'work') {
    cat.state = cat.plate && cat.plate.food ? 'plate' : 'idle';
    cat.timer = 1;
    cat.home = { x: cat.x, z: cat.z, r: 3 };
  }
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
  g.add(pickable(frame, 'bed', BED_REF));
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.72), mats.mattress);
  mattress.position.set(0, 0.33, 0);
  g.add(pickable(mattress, 'bed', BED_REF));
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.5), mats.pillow);
  pillow.position.set(-0.5, 0.45, 0);
  g.add(pillow);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.74), mats.blanket);
  blanket.position.set(0.2, 0.41, 0);
  g.add(blanket);
  shadowAll(g);
  addPoi({ type: 'tent', x: TENT.x, z: TENT.z, icon: '⛺', label: 'Tent', clear: 6 });
}

function buildVet(v) {
  const g = new THREE.Group();
  g.position.set(v.x, 0, v.z);
  g.rotation.y = Math.atan2(-v.x, -v.z);   // the door faces home
  scene.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), mats.white);
  body.position.y = 1.6;
  g.add(pickable(body, 'vet', v));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 4), mats.vetRoof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 4.1;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 0.06), mats.vetRoof);
  door.position.set(0, 1.05, 2.53);
  g.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), mats.signVet);
  sign.position.set(0, 2.65, 2.54);
  g.add(pickable(sign, 'vet', v));
  const cross = new THREE.Group();
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.3), mats.red);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.3), mats.red);
  cross.add(c1, c2);
  cross.position.set(0, 5.6, 0);
  g.add(cross);
  v.cross = cross;
  v.group = g;
  shadowAll(g);
  v.obstacle = { x: v.x, z: v.z, r: 3.6, ck: 'static' };
  obstacles.push(v.obstacle);
}

// Moves a vet or a park (used when a save is loaded, so the map stays the same).
function movePoi(p, x, z) {
  p.x = x;
  p.z = z;
  if (p.group) {
    p.group.position.set(x, 0, z);
    p.group.rotation.y = Math.atan2(-x, -z);
  }
  if (p.obstacle) {
    p.obstacle.x = x;
    p.obstacle.z = z;
  }
}

function buildPark(pk) {
  const g = new THREE.Group();
  g.position.set(pk.x, 0, pk.z);
  g.rotation.y = Math.atan2(-pk.x, -pk.z);
  scene.add(g);
  pk.group = g;
  const sand = new THREE.Mesh(new THREE.CircleGeometry(pk.r, 40), mats.sand);
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.015;
  sand.receiveShadow = true;
  g.add(sand);
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    if (Math.abs(((a - Math.PI / 2 + TAU) % TAU) - Math.PI) > Math.PI - 0.35) continue; // gap = entrance
    const post = new THREE.Mesh(geo.post, mats.fence);
    post.position.set(Math.cos(a) * (pk.r + 0.4), 0.5, Math.sin(a) * (pk.r + 0.4));
    g.add(post);
  }
  for (const y of [0.45, 0.85]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(pk.r + 0.4, 0.035, 4, 64, TAU - 0.7), mats.fence);
    rail.rotation.x = Math.PI / 2;
    rail.rotation.z = Math.PI / 2 + 0.35;
    rail.position.y = y;
    g.add(rail);
  }
  // slide
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.15), mats.blue);
  ladder.position.set(-3, 0.8, -3);
  g.add(ladder);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), mats.blue);
  top.position.set(-3, 1.6, -2.6);
  g.add(top);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 2.6), mats.red);
  slide.position.set(-3, 0.85, -1.1);
  slide.rotation.x = 0.62;
  g.add(slide);
  // seesaw
  const pivot = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.45, 4), mats.yellow);
  pivot.position.set(3, 0.22, 1);
  g.add(pivot);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.35), mats.red);
  plank.position.set(3, 0.47, 1);
  g.add(plank);
  pk.plank = plank;
  // balls
  pk.balls = [];
  const ballMats = [mats.red, mats.blue, mats.yellow];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(geo.smallSphere, ballMats[i]);
    b.scale.setScalar(0.25);
    b.position.set(rnd(-4, 4), 0.25, rnd(-4, 4));
    g.add(b);
    pk.balls.push({ mesh: b, ph: rnd(0, TAU) });
  }
  // sign at the entrance
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), mats.signPark);
  sign.position.set(0, 1.6, pk.r + 0.6);
  g.add(sign);
  for (const x of [-1.15, 1.15]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 6), mats.fence);
    post.position.set(x, 0.95, pk.r + 0.58);
    g.add(post);
  }
  shadowAll(g);
}

function updateParks(dt) {
  for (const pk of parks) {
    const active = T - pk.active < 1;
    pk.plank.rotation.z = active ? Math.sin(T * 2.2) * 0.25 : pk.plank.rotation.z * 0.95;
    for (const b of pk.balls) {
      b.mesh.position.y = 0.25 + (active ? Math.abs(Math.sin(T * 3 + b.ph)) * 0.6 : 0);
    }
  }
}

/* ====================================================================
   Torches (from the chest; place them on the ground, they give light)
   ==================================================================== */
const torches = [];
const torchLights = [];

function buildTorchMesh(lit) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(geo.stick, mats.darkWood);
  stick.position.y = 0.55;
  g.add(stick);
  const cup = new THREE.Mesh(geo.torchCup, mats.brass);
  cup.position.y = 1.12;
  g.add(cup);
  const flame = new THREE.Mesh(geo.flame, mats.flame);
  flame.position.y = 1.3;
  const core = new THREE.Mesh(geo.flameCore, mats.flameCore);
  core.position.y = 1.27;
  g.add(flame, core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = 1.3;
  glow.scale.setScalar(1.1);
  g.add(glow);
  g.userData.flame = flame;
  g.userData.glow = glow;
  g.userData.parts = [stick, cup, flame, core];
  flame.visible = lit;
  core.visible = lit;
  glow.visible = lit;
  return g;
}

function buildTorchLights() {
  for (let i = 0; i < TORCH_LIGHTS; i++) {
    const l = new THREE.PointLight(0xff9a3c, 0, 15, 1.6);
    l.position.set(0, -50, 0);
    scene.add(l);
    torchLights.push(l);
  }
}

function placeTorch(x, z) {
  const slot = state.inv.findIndex((s) => s && s.type === 'torch');
  if (slot < 0) {
    toast('You have no torches. Get some from the Chest Shop.');
    return;
  }
  if (torches.length >= MAX_TORCHES) {
    toast(`You can place up to ${MAX_TORCHES} torches.`);
    return;
  }
  removeOne(slot);
  spawnTorch(x, z);
  SFX.fire(spatial(x, z));
  toast('Torch placed 🔥');
}

function spawnTorch(x, z) {
  const g = buildTorchMesh(true);
  g.position.set(x, 0, z);
  scene.add(g);
  shadowAll(g);
  const rec = { x, z, group: g, ph: rnd(0, TAU) };
  for (const m of g.userData.parts) pickable(m, 'torch', rec);
  torches.push(rec);
  return rec;
}

function removeTorch(rec) {
  for (const m of rec.group.userData.parts) pickables.delete(m);
  scene.remove(rec.group);
  torches.splice(torches.indexOf(rec), 1);
}

function pickupTorch(rec) {
  if (!addItem('torch', 1)) {
    toast('Your inventory is full.');
    return;
  }
  removeTorch(rec);
  SFX.pick(spatial(rec.x, rec.z));
  toast('Torch picked up.');
}

const lightSources = [];
function updateTorches(dt) {
  for (const t of torches) {
    const f = 1 + Math.sin(T * 13 + t.ph) * 0.08 + Math.sin(T * 7.3 + t.ph * 2) * 0.06;
    t.group.userData.flame.scale.set(1, f, 1);
    t.group.userData.glow.scale.setScalar(1.1 * f);
    t.flicker = f;
  }
  // hand torch
  const holding = selectedType() === 'torch';
  const hf = 1 + Math.sin(T * 12) * 0.08;
  if (holding) player.hand.torch.userData.flame.scale.set(1, hf, 1);

  lightSources.length = 0;
  for (const t of torches) lightSources.push({ x: t.x, y: 1.35, z: t.z, f: t.flicker || 1, d: Math.hypot(t.x - player.x, t.z - player.z) });
  if (holding && !state.sleeping) {
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);
    lightSources.push({ x: player.x + s * 0.2 + c * 0.3, y: 1.0, z: player.z + c * 0.2 - s * 0.3, f: hf, d: 0 });
  }
  lightSources.sort((a, b) => a.d - b.d);
  const base = lerp(14, 3, state.dayF);
  for (let i = 0; i < TORCH_LIGHTS; i++) {
    const l = torchLights[i];
    const src = lightSources[i];
    if (src && src.d < 45) {
      l.position.set(src.x, src.y, src.z);
      l.intensity = base * src.f;
    } else {
      l.intensity = 0;
      l.position.set(0, -50, 0);
    }
  }
}

/* ====================================================================
   Quadruped animals: Capi (dog) and June (cat)
   ==================================================================== */
const animals = {};
const animalList = [];

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
    name: NAMES[cfg.kind],
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
    plate: null,
    park: null,
    sick: false,
    lastVet: 1,
    dueNotified: false,
    sadT: rnd(4, 9),
  };
  pickable(body, cfg.kind, a);
  pickable(skull, cfg.kind, a);
  animalList.push(a);
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
  for (const a of animalList) pickWander(a);
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

function needsVet(a) {
  return a.sick || state.day - a.lastVet >= VET_EVERY_DAYS;
}

function updateAnimal(a, dt, t) {
  a.moving = false;
  a.happy = Math.max(0, a.happy - dt);
  a.petCD = Math.max(0, a.petCD - dt);
  a.gainCD = Math.max(0, a.gainCD - dt);
  const slow = needsVet(a) ? 0.65 : 1;
  const following = state.call && a.friend >= FOLLOW_MIN && !state.sleeping;

  if (a.state === 'work') {
    // June helps renovate the Chest Shop
    const spot = shopPoint(0.4, 1.9);
    const c = shopPoint(0, 0);
    if (stepTo(a, spot.x, spot.z, 2.8, dt, 0.15)) {
      a.yaw = angleLerp(a.yaw, Math.atan2(c.x - a.x, c.z - a.z), Math.min(1, dt * 5));
      if (Math.random() < dt * 0.4) a.happy = 0.8;
    }
  } else if (a.state === 'plate') {
    const p = a.plate;
    if (!p || !p.food) {
      a.state = 'idle';
      a.timer = 2;
    } else if (stepTo(a, p.x, p.z, a.speed * 1.6 * slow, dt, a.kind === 'dog' ? 0.9 : 0.6)) {
      setPlateFood(p, false);
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
      a.friend = Math.min(100, a.friend + 10);
      if (a.kind === 'dog') SFX.bark(spatial(a.x, a.z));
      else SFX.meow(spatial(a.x, a.z));
      bubble('Yum yum!', a.x, a.cfg.height + 0.25, a.z, { life: 1.3 });
      toast(`${a.name} ate! Friendship up ${a.kind === 'dog' ? '🐶' : '🐱'}`);
      if (a.plate && a.plate.food) a.state = 'plate';
    }
  } else if (a.state === 'play') {
    const pk = a.park;
    const leave = state.call && a.friend >= FOLLOW_MIN && Math.hypot(player.x - pk.x, player.z - pk.z) > pk.r + 6;
    if (leave) {
      a.park = null;
      a.state = 'follow';
    } else {
      if (!a.target || stepTo(a, a.target.x, a.target.z, 2.6 * slow, dt, 0.25)) {
        const ang = rnd(0, TAU);
        const d = Math.sqrt(Math.random()) * pk.r * 0.8;
        a.target = { x: pk.x + Math.cos(ang) * d, z: pk.z + Math.sin(ang) * d };
        if (Math.random() < 0.3) a.happy = 1.2;
      }
      a.friend = Math.min(100, a.friend + dt * 0.35);
      pk.active = T;
    }
  } else if (following) {
    const park = parks.find((pk) => Math.hypot(a.x - pk.x, a.z - pk.z) < pk.r && Math.hypot(player.x - pk.x, player.z - pk.z) < pk.r + 2);
    if (park) {
      a.state = 'play';
      a.park = park;
      a.home = { x: park.x, z: park.z, r: park.r * 0.8 };
      a.target = null;
      toast(`${a.name} is playing in the park! 🎾`);
    } else {
      a.state = 'follow';
      const fx = Math.sin(player.yaw);
      const fz = Math.cos(player.yaw);
      const isDog = a.kind === 'dog';
      const back = isDog ? 2.0 : 2.6;
      const side = isDog ? -0.9 : 0.9;
      const tx = player.x - fx * back + fz * side;
      const tz = player.z - fz * back - fx * side;
      const pd = Math.hypot(player.x - a.x, player.z - a.z);
      stepTo(a, tx, tz, (pd > 5 ? SPRINT_SPEED * 0.95 : a.speed * 1.8) * (pd > 5 ? 1 : slow), dt, 0.6);
      if (pd < 3) a.yaw = angleLerp(a.yaw, Math.atan2(player.x - a.x, player.z - a.z), Math.min(1, dt * 4));
      a.friend = Math.min(100, a.friend + dt * 0.3);
    }
  } else if (a.state === 'follow') {
    a.state = 'idle';
    a.timer = 1;
    a.home = { x: a.x, z: a.z, r: 3 };
  } else if (a.state === 'idle') {
    a.timer -= dt;
    const pd = Math.hypot(player.x - a.x, player.z - a.z);
    if (pd < 4) a.yaw = angleLerp(a.yaw, Math.atan2(player.x - a.x, player.z - a.z), Math.min(1, dt * 4));
    if (a.timer <= 0) pickWander(a);
  } else if (a.state === 'walk') {
    if (stepTo(a, a.target.x, a.target.z, a.speed * slow, dt, 0.1)) {
      a.state = 'idle';
      a.timer = rnd(2, 5);
    }
  }

  // feeling sick: occasional sad bubble
  if (needsVet(a)) {
    a.sadT -= dt;
    if (a.sadT <= 0) {
      a.sadT = rnd(7, 14);
      bubble(a.sick ? '🤒' : '🩺?', a.x, a.cfg.height + 0.3, a.z, { size: 52, bg: false, life: 1.4 });
    }
  }

  a.root.position.set(a.x, 0, a.z);
  a.root.rotation.y = a.yaw;
  a.shadow.position.set(a.x, 0.01, a.z);
  a.gait += dt * a.speed * (a.state === 'play' ? 11 : 7);
  const s = Math.sin(a.gait) * 0.55 * (a.moving ? 1 : 0);
  a.legs[0].rotation.x = s;
  a.legs[1].rotation.x = -s;
  a.legs[2].rotation.x = -s;
  a.legs[3].rotation.x = s;
  a.holder.position.y = a.moving ? Math.abs(Math.sin(a.gait)) * 0.03 : 0;
  const hop = (a.kind === 'dog' && a.happy > 0) || (a.state === 'play' && a.happy > 0);
  a.root.position.y = hop ? Math.abs(Math.sin(t * 9)) * 0.14 * a.cfg.scale : 0;
  const wantNeck = a.state === 'eat' ? 0.95 : (a.sick ? 0.3 : 0) + Math.sin(t * 2 + a.x) * 0.04;
  a.neckX = lerp(a.neckX, wantNeck, Math.min(1, dt * 6));
  a.neck.rotation.x = a.neckX;
  a.tongue.visible = a.happy > 0 || a.state === 'eat';
  if (a.kind === 'dog') {
    const excited = a.happy > 0 || a.state === 'follow' || a.state === 'play';
    a.tail.rotation.y = Math.sin(t * (excited ? 18 : 6)) * (excited ? 0.7 : 0.3);
  } else {
    a.tail.rotation.x = Math.sin(t * 2) * 0.12 - (a.happy > 0 || a.state === 'play' ? 0.2 : 0);
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
    toast('Capi barked happily! 🐶');
  } else {
    SFX.meow(spatial(a.x, a.z));
    SFX.purr(spatial(a.x, a.z));
    bubble('Purr…', a.x, a.cfg.height + 0.3, a.z, { life: 1.2 });
    toast('June is purring 🐱');
  }
}

/* ====================================================================
   Health: vet check-ups every 3 days and random sickness
   ==================================================================== */
function updateHealth() {
  const hour = Math.floor(state.tod);
  if (hour !== state.lastHour) {
    state.lastHour = hour;
    for (const a of animalList) {
      if (!a.sick && Math.random() < SICK_CHANCE_PER_HOUR) {
        a.sick = true;
        toast(`${a.name} feels sick! 🤒 Take ${a.kind === 'dog' ? 'him' : 'her'} to a vet (open the map 🗺).`);
      }
      if (needsVet(a)) {
        a.friend = Math.max(0, a.friend - 0.3);
        if (!a.sick && !a.dueNotified) {
          a.dueNotified = true;
          toast(`${a.name} needs a vet check-up (every ${VET_EVERY_DAYS} days) 🏥`);
        }
      }
    }
  }
  // treat animals that are at a vet together with you
  for (const v of vets) {
    v.cross.rotation.y += 0.02;
    if (Math.hypot(player.x - v.x, player.z - v.z) > 7) continue;
    for (const a of animalList) {
      if (needsVet(a) && Math.hypot(a.x - v.x, a.z - v.z) < 9) treatAnimal(a);
    }
  }
}

function treatAnimal(a) {
  a.sick = false;
  a.lastVet = state.day;
  a.dueNotified = false;
  a.friend = Math.min(100, a.friend + 5);
  a.happy = 1.5;
  SFX.chime();
  bubble('✚ Healthy!', a.x, a.cfg.height + 0.4, a.z, { life: 1.6, color: '#d32f2f' });
  toast(`The vet checked ${a.name}. Healthy! Next check-up on day ${state.day + VET_EVERY_DAYS}.`);
}

function visitVet(v) {
  const due = animalList.filter(needsVet);
  if (!due.length) {
    const next = Math.min(...animalList.map((a) => a.lastVet + VET_EVERY_DAYS));
    toast(`Your pets are healthy. Next check-up: day ${next}.`);
    return;
  }
  const away = due.filter((a) => Math.hypot(a.x - v.x, a.z - v.z) >= 9);
  if (away.length) {
    toast(`Bring ${away.map((a) => a.name).join(' and ')} here: press Call 🐾 so they follow you.`);
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
    idle: rnd(0, 3), plateBound: null, cawT: rnd(4, 10), flap: 0,
  };
  pickable(body, 'crow', c);
  pickable(head, 'crow', c);
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
  const full = plates.filter((p) => p.food);
  if (full.length && Math.random() < 0.5) {
    const p = full[(Math.random() * full.length) | 0];
    c.target = { x: p.x + rnd(-0.5, 0.5), z: p.z + rnd(-0.5, 0.5) };
    c.plateBound = p;
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
  c.plateBound = null;
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
        const p = c.plateBound;
        c.target = null;
        c.plateBound = null;
        if (p && p.food && pd >= 4 && Math.hypot(c.x - p.x, c.z - p.z) < 1.4) {
          setPlateFood(p, false);
          toast(`A crow stole ${NAMES[p.who]}'s food!`);
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
  for (let i = 0; i < RAIN_N; i++) rainDrops.push({ x: rnd(-16, 16), y: rnd(0, 18), z: rnd(-16, 16), sp: rnd(14, 20) });
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
const player = { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI, group: null, body: null, hand: {}, eatLemon: null, walkT: 0, stepT: 0, blob: null };
const HAND_POS = new THREE.Vector3(0.3, 0.3, 0.2);
const MOUTH_POS = new THREE.Vector3(0, 0.46, 0.34);

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

  // items held in the hand (one is visible, depending on the selected slot)
  const food = new THREE.Group();
  const cup = new THREE.Mesh(geo.bowlCup, mats.bowl);
  cup.scale.setScalar(0.35);
  food.add(cup);
  for (let i = 0; i < 5; i++) {
    const k = new THREE.Mesh(geo.smallSphere, mats.kibble);
    k.scale.setScalar(0.04);
    k.position.set(Math.cos(i) * 0.05, 0.05, Math.sin(i) * 0.05);
    food.add(k);
  }
  const catfood = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12), mats.can);
  const fish = new THREE.Mesh(geo.smallSphere, mats.fish);
  fish.scale.set(0.07, 0.03, 0.04);
  fish.position.y = 0.06;
  catfood.add(can, fish);
  const lemonHand = new THREE.Mesh(geo.lemon, mats.lemon);
  lemonHand.scale.setScalar(0.25);
  lemonHand.rotation.z = Math.PI / 2;
  const torch = buildTorchMesh(true);
  torch.scale.setScalar(0.5);
  torch.position.y = -0.25;
  const torchHolder = new THREE.Group();
  torchHolder.add(torch);
  torchHolder.userData.flame = torch.userData.flame;
  for (const [k, m] of Object.entries({ food, catfood, lemon: lemonHand, torch: torchHolder })) {
    m.position.copy(HAND_POS);
    if (k === 'torch') m.position.y += 0.05;
    m.visible = false;
    g.add(m);
    player.hand[k] = m;
  }
  const eatLemon = new THREE.Mesh(geo.lemon, mats.lemon);
  eatLemon.scale.setScalar(0.25);
  eatLemon.rotation.z = Math.PI / 2;
  eatLemon.visible = false;
  g.add(eatLemon);
  player.eatLemon = eatLemon;

  shadowAll(g);
  player.group = g;
  player.body = body;
  player.blob = makeBlob(0.9);
}

function selectedType() {
  const s = state.inv[state.sel];
  return s ? s.type : null;
}

function startEat() {
  if (state.eatT > 0) return;
  const idx = state.inv[state.sel] && state.inv[state.sel].type === 'lemon' ? state.sel : state.inv.findIndex((s) => s && s.type === 'lemon');
  if (idx < 0) {
    toast('You have no lemons. Pick some up in the grass.');
    return;
  }
  if (state.hunger >= 100) {
    toast('You are not hungry right now.');
    return;
  }
  removeOne(idx);
  state.eatT = EAT_TIME;
  player.eatBites = 0;
}

function updateEating(dt) {
  const el = player.eatLemon;
  if (state.eatT <= 0) {
    el.visible = false;
    return;
  }
  state.eatT = Math.max(0, state.eatT - dt);
  const p = 1 - state.eatT / EAT_TIME;          // 0 -> 1
  el.visible = true;
  const toMouth = smoothstep(0, 0.25, p);
  el.position.lerpVectors(HAND_POS, MOUTH_POS, toMouth);
  el.position.y += toMouth * Math.abs(Math.sin(p * 18)) * 0.03;
  el.scale.setScalar(0.25 * (1 - 0.8 * smoothstep(0.25, 1, p)));
  player.body.scale.y = 0.8 * (1 + Math.sin(p * 40) * 0.04 * toMouth);
  const bites = Math.floor(p * 4);
  if (bites > player.eatBites && p > 0.25) {
    player.eatBites = bites;
    SFX.chomp(spatial(player.x, player.z));
  }
  if (state.eatT === 0) {
    el.visible = false;
    state.hunger = Math.min(100, state.hunger + LEMON_FILL);
    SFX.ding(spatial(player.x, player.z));
    bubble('Yum!', player.x, 1.3, player.z, { size: 44, life: 1 });
    toast('Tasty lemon! Hunger restored 🍋');
  }
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
  if (state.eatT <= 0) player.body.scale.set(0.8, 0.8 + (moving ? Math.sin(player.walkT * 2) * 0.03 : 0), 0.8);
  player.blob.position.set(player.x, 0.01, player.z);
  const sel = selectedType();
  for (const [k, m] of Object.entries(player.hand)) m.visible = k === sel && !(k === 'lemon' && state.eatT > 0);
  player.group.visible = !state.sleeping;
  updateEating(dt);
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
   Inventory (5 slots) and actions
   ==================================================================== */
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
  const s = state.inv[state.sel];
  $('selLbl').textContent = s ? ITEMS[s.type].name : '';
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
  const t = selectedType();
  if (!t) {
    toast('This slot is empty.');
  } else if (t === 'lemon') {
    startEat();
  } else if (t === 'torch') {
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);
    placeTorch(player.x + s * 1.2, player.z + c * 1.2);
  } else if (t === 'food') {
    toast("Tap Capi's plate to serve the food.");
  } else {
    toast("Tap June's plate to serve the food.");
  }
}

function giveItems(type, n, label, x, z) {
  const got = addItem(type, n);
  if (!got) {
    toast('Your inventory is full.');
    return false;
  }
  bubble(`+${got} ${ITEMS[type].icon}`, x, 2.4, z, { size: 44, life: 1.2 });
  toast(label.replace('{n}', got));
  return true;
}

function grabFood() {
  if (giveItems('food', 1, 'You took {n} portion of Capi food.', player.x, player.z)) SFX.pick(spatial(HOUSE.x, HOUSE.z));
}
function takeFromShed() {
  if (giveItems('food', 3, 'Capi Food: you took {n} portions of Capi food.', SHED.x, SHED.z)) SFX.chime();
}
function takeFromJuneShop() {
  if (giveItems('catfood', 3, 'June Food: you took {n} portions of June food.', JUNE_SHOP.x, JUNE_SHOP.z)) SFX.chime();
}
function openChest() {
  if (giveItems('torch', 3, 'Chest Shop: you took {n} torches from the chest 🔥', CHEST_SHOP.x, CHEST_SHOP.z)) {
    SFX.chest(spatial(CHEST_SHOP.x, CHEST_SHOP.z));
    chestOpenT = 1.4;
  }
}

function placeFood(p) {
  if (p.food) {
    toast('The plate is already full.');
    return;
  }
  const type = p.who === 'dog' ? 'food' : 'catfood';
  let idx = selectedType() === type ? state.sel : -1;
  if (idx < 0) idx = state.inv.findIndex((s) => s && s.type === type);
  if (idx < 0) {
    toast(p.who === 'dog'
      ? 'You have no Capi food. Get some at Capi Food or the doghouse.'
      : 'You have no June food. Get some at June Food.');
    return;
  }
  removeOne(idx);
  setPlateFood(p, true);
  SFX.place(spatial(p.x, p.z));
  const a = p.who === 'dog' ? animals.dog : animals.cat;
  if (a.state === 'work') {
    a.plate = p;
    toast(`Food on the plate. ${a.name} will eat after the renovation.`);
    return;
  }
  toast(`Food on the plate. ${a.name} is coming!`);
  if (a.state !== 'eat') {
    a.state = 'plate';
    a.plate = p;
    a.park = null;
  }
}

function collectLemon(rec) {
  if (rec.done) return;
  if (!addItem('lemon', 1)) {
    if (Math.hypot(rec.x - player.x, rec.z - player.z) < 0.7 && !rec.fullWarned) {
      rec.fullWarned = true;
      toast('Your inventory is full.');
    }
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
      toast(`Day ${state.day}. You slept well. Good morning!`);
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
  const lonely = animalList.filter((a) => a.friend < FOLLOW_MIN).map((a) => a.name);
  if (lonely.length === animalList.length) toast('Nobody trusts you enough yet. Pet them more!');
  else if (lonely.length) toast(`Calling your friends! ${lonely.join(' and ')} does not trust you enough yet.`);
  else toast('Calling your friends! 🐾');
  SFX.click();
}

function executeGoal(g) {
  switch (g.kind) {
    case 'food': grabFood(); break;
    case 'shed': takeFromShed(); break;
    case 'juneshop': takeFromJuneShop(); break;
    case 'chest':
      if (chestShop.status === 'open') openChest();
      break;
    case 'ruin':
      if (countItem('lemon') >= RENOVATE_COST) {
        chestShop.dismissed = false;
        showRenovatePopup();
      } else {
        lemonHint();
      }
      break;
    case 'bed': tryBed(); break;
    case 'plate': placeFood(g.ref); break;
    case 'dog':
    case 'cat': petAnimal(g.ref); break;
    case 'crow': scareCrow(g.ref); break;
    case 'lemon': collectLemon(g.ref); break;
    case 'torch': pickupTorch(g.ref); break;
    case 'vet': visitVet(g.ref); break;
    case 'placeTorch': placeTorch(g.x, g.z); break;
    case 'waypoint':
      clearWaypoint();
      SFX.chime();
      toast('You reached the waypoint! 📍');
      break;
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ====================================================================
   Waypoint, minimap and big map
   ==================================================================== */
let beacon = null;
const mapView = { range: 140, open: false };
let miniT = 0;

function buildBeacon() {
  beacon = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 40, 10, 1, true), mats.beacon);
  beam.position.y = 20;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 30), mats.beacon);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  beacon.add(beam, ring);
  beacon.userData.ring = ring;
  beacon.visible = false;
  scene.add(beacon);
}

function setWaypoint(x, z, walk = true) {
  state.waypoint = { x, z };
  beacon.position.set(x, 0, z);
  beacon.visible = true;
  const d = Math.round(Math.hypot(x - player.x, z - player.z));
  if (walk) goal = { kind: 'waypoint', x, z, range: RANGE.waypoint };
  toast(`Waypoint set ${d} m away. ${walk ? 'Walking there… (hold SPRINT/Shift to run)' : ''}`);
}

function clearWaypoint() {
  state.waypoint = null;
  beacon.visible = false;
  if (goal && goal.kind === 'waypoint') goal = null;
}

function goToWaypoint() {
  if (!state.waypoint) return;
  goal = { kind: 'waypoint', x: state.waypoint.x, z: state.waypoint.z, range: RANGE.waypoint };
  toast('Walking to the waypoint…');
}

function drawMap(cv, range, big) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = player.x;
  const cz = player.z;
  const s = Math.min(W, H) / 2 / range;
  const toS = (x, z) => [W / 2 + (x - cx) * s, H / 2 + (z - cz) * s];

  const bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, '#6cb44a');
  bg.addColorStop(1, '#3f7f2e');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  if (big) {
    const step = range > 300 ? 100 : range > 120 ? 50 : 20;
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.floor((cx - range * 2) / step) * step; x < cx + range * 2; x += step) {
      const [sx] = toS(x, 0);
      g.moveTo(sx, 0);
      g.lineTo(sx, H);
    }
    for (let z = Math.floor((cz - range * 2) / step) * step; z < cz + range * 2; z += step) {
      const [, sy] = toS(0, z);
      g.moveTo(0, sy);
      g.lineTo(W, sy);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = '600 11px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(`grid: ${step} m · N ↑`, 8, H - 8);
  }

  // torches
  g.fillStyle = '#ffb347';
  for (const t of torches) {
    const [x, y] = toS(t.x, t.z);
    if (x > 0 && x < W && y > 0 && y < H) g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const p of pois) {
    if (!big && p.type === 'plate') continue;
    let [x, y] = toS(p.x, p.z);
    const pad = big ? 14 : 9;
    const inside = x >= pad && x <= W - pad && y >= pad && y <= H - pad;
    if (!inside) {
      if (p.type !== 'vet' && p.type !== 'park') continue;
      x = clamp(x, pad, W - pad);
      y = clamp(y, pad, H - pad);
      g.globalAlpha = 0.6;
    }
    g.font = `${big ? 20 : 12}px system-ui, sans-serif`;
    g.fillText(p.icon, x, y);
    const showLabel = p.type === 'vet' || p.type === 'park' || range <= 60;
    if (big && inside && p.label && showLabel) {
      g.font = '700 11px system-ui, sans-serif';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(p.label, x + 1, y + 17);
      g.fillStyle = '#fff';
      g.fillText(p.label, x, y + 16);
    }
    g.globalAlpha = 1;
  }

  for (const a of animalList) {
    const [x, y] = toS(a.x, a.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    g.beginPath();
    g.arc(x, y, big ? 6 : 4, 0, TAU);
    g.fillStyle = a.kind === 'dog' ? '#3b3f4a' : '#f0a050';
    g.fill();
    g.strokeStyle = needsVet(a) ? '#ff3b3b' : '#fff';
    g.lineWidth = 2;
    g.stroke();
    if (big) {
      g.fillStyle = '#fff';
      g.font = '700 11px system-ui, sans-serif';
      g.fillText(a.name, x, y - 13);
    }
  }

  if (state.waypoint) {
    let [x, y] = toS(state.waypoint.x, state.waypoint.z);
    x = clamp(x, 8, W - 8);
    y = clamp(y, 8, H - 8);
    g.font = `${big ? 24 : 15}px system-ui, sans-serif`;
    g.fillText('📍', x, y - (big ? 8 : 5));
  }

  // player arrow
  const fx = Math.sin(player.yaw);
  const fz = Math.cos(player.yaw);
  const L = big ? 11 : 8;
  g.beginPath();
  g.moveTo(W / 2 + fx * L, H / 2 + fz * L);
  g.lineTo(W / 2 - fx * L * 0.6 + fz * L * 0.6, H / 2 - fz * L * 0.6 - fx * L * 0.6);
  g.lineTo(W / 2 - fx * L * 0.6 - fz * L * 0.6, H / 2 - fz * L * 0.6 + fx * L * 0.6);
  g.closePath();
  g.fillStyle = '#ffd83a';
  g.fill();
  g.strokeStyle = '#2d2a14';
  g.lineWidth = 2;
  g.stroke();
}

function openMap() {
  mapView.open = true;
  $('mapOverlay').classList.remove('hidden');
  drawMap($('bigMap'), mapView.range, true);
}
function closeMap() {
  mapView.open = false;
  $('mapOverlay').classList.add('hidden');
}

function updateMaps(dt) {
  miniT -= dt;
  if (miniT <= 0) {
    miniT = 0.2;
    drawMap($('minimap'), 60, false);
  }
  if (mapView.open) drawMap($('bigMap'), mapView.range, true);
  if (beacon.visible) {
    beacon.userData.ring.scale.setScalar(1 + Math.sin(T * 3) * 0.15);
  }
}

/* ====================================================================
   Save data: what is stored in gameSaves/{uid}
   ==================================================================== */
const r2 = (v) => Math.round(v * 100) / 100;

function serializeGame() {
  return {
    v: 1,
    day: state.day,
    tod: Math.round(state.tod * 1000) / 1000,
    hunger: Math.round(state.hunger),
    stamina: Math.round(state.stamina),
    lemons: state.lemons,
    pets: state.pets,
    fed: state.fed,
    inv: state.inv.map((s) => (s ? { type: s.type, n: s.n } : null)),
    sel: state.sel,
    player: { x: r2(player.x), z: r2(player.z), yaw: r2(player.yaw) },
    animals: animalList.map((a) => ({ kind: a.kind, x: r2(a.x), z: r2(a.z), friend: r2(a.friend), lastVet: a.lastVet, sick: a.sick })),
    torches: torches.map((t) => [r2(t.x), r2(t.z)]),
    picked: [...picked].slice(-3000),
    vets: vets.map((v) => [r2(v.x), r2(v.z)]),
    parks: parks.map((p) => [r2(p.x), r2(p.z)]),
    chestShop: { status: chestShop.status, left: Math.round(chestShop.left * 10) / 10 },
  };
}

function applyGame(d) {
  if (!d || typeof d !== 'object') return;
  const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  const count = (v) => Math.max(0, Math.floor(num(v, 0)));

  state.day = Math.max(1, Math.floor(num(d.day, 1)));
  state.tod = clamp(num(d.tod, 8), 0, 23.99);
  state.lastHour = Math.floor(state.tod);
  state.hunger = clamp(num(d.hunger, 100), 0, 100);
  state.stamina = clamp(num(d.stamina, 100), 0, 100);
  state.lemons = count(d.lemons);
  state.pets = count(d.pets);
  state.fed = count(d.fed);
  state.inv = Array.from({ length: SLOTS }, (_, i) => {
    const s = Array.isArray(d.inv) ? d.inv[i] : null;
    return s && ITEMS[s.type] ? { type: s.type, n: clamp(Math.floor(num(s.n, 1)), 1, MAX_STACK) } : null;
  });
  state.sel = clamp(Math.floor(num(d.sel, 0)), 0, SLOTS - 1);
  state.eatT = 0;
  goal = null;
  clearWaypoint();

  if (d.player) {
    player.x = num(d.player.x, player.x);
    player.z = num(d.player.z, player.z);
    player.yaw = num(d.player.yaw, player.yaw);
  }
  const place = (list, saved) => {
    if (!Array.isArray(saved)) return;
    saved.forEach((p, i) => {
      if (list[i] && Array.isArray(p)) movePoi(list[i], num(p[0], list[i].x), num(p[1], list[i].z));
    });
  };
  place(vets, d.vets);
  place(parks, d.parks);

  for (const s of Array.isArray(d.animals) ? d.animals : []) {
    const a = animalList.find((x) => x.kind === s.kind);
    if (!a) continue;
    a.x = num(s.x, a.x);
    a.z = num(s.z, a.z);
    a.friend = clamp(num(s.friend, a.friend), 0, 100);
    a.lastVet = Math.max(1, Math.floor(num(s.lastVet, 1)));
    a.sick = !!s.sick;
    a.dueNotified = false;
    a.state = 'idle';
    a.timer = 1;
    a.park = null;
    a.plate = null;
    a.target = null;
    a.home = { x: a.x, z: a.z, r: 3 };
  }
  for (const p of plates) setPlateFood(p, false);

  while (torches.length) removeTorch(torches[0]);
  for (const t of Array.isArray(d.torches) ? d.torches : []) {
    if (Array.isArray(t) && torches.length < MAX_TORCHES) spawnTorch(num(t[0], 0), num(t[1], 0));
  }

  // Chest Shop: abandoned, being renovated (continue the timer) or open. Older saves start abandoned.
  clearWorkers();
  const cs = d.chestShop || {};
  const shopStatus = ['abandoned', 'building', 'open'].includes(cs.status) ? cs.status : 'abandoned';
  setChestShopStatus(shopStatus, shopStatus === 'building' ? clamp(num(cs.left, BUILD_TIME), 0, BUILD_TIME) : 0);
  if (shopStatus === 'building') {
    spawnWorkers(true);
    setJuneWork(true);
  } else {
    setJuneCostume(false);
  }

  picked.clear();
  for (const k of Array.isArray(d.picked) ? d.picked : []) if (typeof k === 'string') picked.add(k);
  for (const c of chunks.values()) disposeChunk(c);
  chunks.clear();
  updateChunks(true);

  camera.position.set(player.x, 4, player.z + 6);
  renderInv();
  refreshHud();
}

/* ====================================================================
   Badges (written to gameProfiles/{uid}; they need a My Day sign in)
   ==================================================================== */
const BADGES = [
  { id: 'lemon_1', icon: '🍋', name: 'If you have lemons, make lemonade!', rarity: 'Common', desc: 'Collect your first lemon.', test: () => state.lemons >= 1 },
  { id: 'lemon_2', icon: '🐾', name: 'Pet me', rarity: 'Rare', desc: 'Pet an animal in the game.', test: () => state.pets >= 1 },
  { id: 'lemon_secret', icon: '🌟', name: 'The Real Truth', rarity: 'Legendary', desc: 'After all...', secret: true, test: () => state.day >= 15 },
];

/* ====================================================================
   My Day account: sign in, load, save (manual + every 2 minutes), sign out
   ==================================================================== */
const AUTOSAVE_MS = 2 * 60 * 1000;
const account = {
  user: null,
  ready: false,        // true once the cloud save was loaded (or created)
  busy: false,
  lastSaved: null,
  badges: {},
  badgesDirty: false,
  badgeRetryAt: 0,
  status: '',
  error: '',
  timer: null,
};

function renderAccount() {
  const signedIn = !!account.user;
  const btn = $('mydayBtn');
  if (signedIn) {
    let note = 'signed in';
    if (account.busy) note = 'syncing…';
    else if (account.lastSaved) note = `saved ${account.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    btn.textContent = `☁ ${account.user.username} · ${note}`;
  } else {
    btn.textContent = '☁ Save progress with My Day';
  }
  $('mdSignedOut').classList.toggle('hidden', signedIn);
  $('mdSignedIn').classList.toggle('hidden', !signedIn);
  if (signedIn) $('mdUser').textContent = account.user.username;
  $('mdStatus').textContent = account.status;
  $('mdError').textContent = account.error;
  $('mdSignIn').disabled = account.busy;
  $('mdSaveNow').disabled = account.busy || !account.ready;
  const canRetry = !account.busy && ((signedIn && !account.ready) || (!signedIn && MyDay.hasStoredSession()));
  $('mdRetry').classList.toggle('hidden', !canRetry);
  $('mdBadgeNote').classList.toggle('hidden', signedIn);
  renderBadges();
}

function renderBadges() {
  const list = $('mdBadges');
  list.textContent = '';
  for (const b of BADGES) {
    const unlocked = !!account.badges[b.id] && !!account.user;
    const hidden = b.secret && !unlocked;
    const li = document.createElement('li');
    li.className = `badge ${unlocked ? 'unlocked' : 'locked'} rarity-${b.rarity.toLowerCase()}`;
    const icon = document.createElement('span');
    icon.className = 'badge-icon';
    icon.textContent = hidden ? '❓' : b.icon;
    const text = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = hidden ? '???' : b.name;
    const meta = document.createElement('small');
    meta.textContent = hidden ? '???' : `${b.rarity} · ${b.desc}`;
    text.append(name, meta);
    const tag = document.createElement('span');
    tag.className = 'badge-tag';
    tag.textContent = unlocked ? 'Unlocked' : 'Locked';
    li.append(icon, text, tag);
    list.append(li);
  }
}

function openAccount() {
  account.error = '';
  renderAccount();
  $('mydayOverlay').classList.remove('hidden');
  if (!account.user) setTimeout(() => $('mdUsername').focus(), 50);
}
function closeAccount() {
  $('mydayOverlay').classList.add('hidden');
}

async function saveToCloud(quiet) {
  if (!account.user) return false;
  try {
    account.lastSaved = await MyDay.writeSave(serializeGame());
    account.status = `Saved at ${account.lastSaved.toLocaleTimeString()}.`;
    account.error = '';
    if (!quiet) toast('Progress saved to My Day ☁');
    return true;
  } catch (e) {
    account.error = e.message;
    if (e.expired) handleExpired();
    else if (!quiet) toast(e.message);
    return false;
  } finally {
    renderAccount();
  }
}

// Runs after a sign in or a restored session: load the cloud save, or create it from the current game.
async function connectAccount() {
  account.busy = true;
  account.ready = false;
  account.error = '';
  account.status = 'Loading your progress…';
  renderAccount();
  try {
    const save = await MyDay.loadSave();
    if (save) {
      applyGame(save);
      account.status = 'Progress loaded from My Day.';
      toast(`Welcome back, ${account.user.username}! Progress loaded ☁`);
    } else {
      account.lastSaved = await MyDay.writeSave(serializeGame());
      account.status = 'Your progress is now saved to My Day.';
      toast(`Signed in as ${account.user.username}. Progress saved ☁`);
    }
    account.badges = await MyDay.loadBadges();
    account.ready = true;
    startAutosave();
    await checkBadges();
  } catch (e) {
    account.status = '';
    account.error = `${e.message} Your game was not changed.`;
    if (e.expired) handleExpired();
  } finally {
    account.busy = false;
    renderAccount();
  }
}

function startAutosave() {
  clearInterval(account.timer);
  account.timer = setInterval(() => {
    if (account.user && account.ready && !account.busy) saveToCloud(true);
  }, AUTOSAVE_MS);
}

function handleExpired() {
  clearInterval(account.timer);
  account.user = null;
  account.ready = false;
  account.badges = {};
  account.error = 'Your My Day session has expired. Please sign in again.';
  renderAccount();
}

async function submitSignIn(e) {
  e.preventDefault();
  if (account.busy) return;
  const username = MyDay.normalizeUsername($('mdUsername').value);
  const password = $('mdPassword').value;
  const problem = MyDay.validate(username, password);
  if (problem) {
    account.error = problem;
    renderAccount();
    return;
  }
  account.busy = true;
  account.error = '';
  account.status = 'Signing in…';
  renderAccount();
  try {
    account.user = await MyDay.signIn(username, password);
    $('mdPassword').value = '';
  } catch (err) {
    account.busy = false;
    account.status = '';
    account.error = err.message;
    renderAccount();
    return;
  }
  account.busy = false;
  await connectAccount();
}

function signOutAccount() {
  MyDay.signOut();
  clearInterval(account.timer);
  account.user = null;
  account.ready = false;
  account.lastSaved = null;
  account.badges = {};
  account.badgesDirty = false;
  account.status = '';
  account.error = '';
  renderAccount();
  toast('Signed out of My Day. You can keep playing.');
}

// Awards badges while signed in and writes them to gameProfiles/{uid}.
async function checkBadges() {
  if (!account.user || !account.ready) return;
  const won = [];
  for (const b of BADGES) {
    if (!account.badges[b.id] && b.test()) {
      account.badges[b.id] = true;
      won.push(b);
    }
  }
  if (won.length) {
    account.badgesDirty = true;
    for (const b of won) {
      SFX.chime();
      toast(`🏅 Badge unlocked: ${b.name} (${b.rarity})`);
      bubble('🏅', player.x, 1.6, player.z, { size: 64, bg: false, life: 1.6 });
    }
    renderAccount();
  }
  if (account.badgesDirty && Date.now() >= account.badgeRetryAt) {
    account.badgesDirty = false;
    try {
      await MyDay.writeBadges(account.badges);
    } catch (e) {
      account.badgesDirty = true;
      account.badgeRetryAt = Date.now() + 30000;
      if (e.expired) handleExpired();
    }
  }
}

function setupAccount() {
  $('mydayBtn').addEventListener('click', () => { ensureAudio(); openAccount(); });
  $('mdClose').addEventListener('click', closeAccount);
  $('mdForm').addEventListener('submit', submitSignIn);
  $('mdCreate').addEventListener('click', () => window.open(MyDay.SIGNUP_URL, '_blank', 'noopener'));
  $('mdSaveNow').addEventListener('click', () => saveToCloud(false));
  $('mdSignOut').addEventListener('click', signOutAccount);
  $('mdRetry').addEventListener('click', () => (account.user ? connectAccount() : restoreAccount()));
  renderAccount();
  if (MyDay.hasStoredSession()) restoreAccount();
}

async function restoreAccount() {
  account.busy = true;
  account.status = 'Signing in to My Day…';
  renderAccount();
  try {
    account.user = await MyDay.restoreSession();
  } catch (e) {
    account.error = e.message;
  }
  account.busy = false;
  account.status = '';
  if (account.user) await connectAccount();
  else renderAccount();
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
  $('coordLbl').textContent = `X ${Math.round(player.x)} · Z ${Math.round(player.z)}`;
  $('stamFill').style.width = `${state.stamina}%`;
  document.querySelectorAll('#hungerRow .lem').forEach((el, i) => {
    const f = clamp((state.hunger - i * 20) / 20, 0, 1);
    el.style.opacity = String(0.2 + 0.8 * f);
    el.style.filter = f < 0.5 ? 'grayscale(1)' : 'none';
  });
  for (const [k, a] of [['Dog', animals.dog], ['Cat', animals.cat]]) {
    $(`f${k}Lvl`).textContent = friendLabel(a.friend);
    $(`f${k}Bar`).style.width = `${a.friend}%`;
    const hp = $(`f${k}Hp`);
    if (a.sick) {
      hp.textContent = '🤒 Sick – take to a vet';
      hp.className = 'hp bad';
    } else if (needsVet(a)) {
      hp.textContent = '🩺 Vet check-up due';
      hp.className = 'hp bad';
    } else {
      hp.textContent = `✚ Healthy · vet by day ${a.lastVet + VET_EVERY_DAYS}`;
      hp.className = 'hp';
    }
  }
  $('callBtn').classList.toggle('on', state.call);
  const wp = $('wpBtn');
  if (state.waypoint) {
    const d = Math.round(Math.hypot(state.waypoint.x - player.x, state.waypoint.z - player.z));
    wp.classList.remove('hidden');
    wp.textContent = `📍 ${d} m ${goal && goal.kind === 'waypoint' ? '· going' : '· tap to go'}`;
  } else {
    wp.classList.add('hidden');
  }
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
  for (const h of hits) if (isShown(h.object) && h.object.userData.pick) return h.object;
  return null;
}
// An object counts as visible only if it and all of its parents are visible.
function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function groundAt(x, y) {
  raycaster.setFromCamera(toNDC(x, y), camera);
  const h = raycaster.intersectObject(ground, false)[0];
  return h ? h.point : null;
}

const cursorEl = $('cursor');
const cursorLabel = $('cursorLabel');
function labelOf(pk) {
  return pk.label || LABELS[pk.kind] || '';
}
function placeCursor(x, y) {
  cursorEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
function setHover(x, y) {
  const obj = pickAt(x, y);
  if (obj) {
    cursorEl.classList.add('hot');
    cursorLabel.textContent = labelOf(obj.userData.pick);
  } else {
    cursorEl.classList.remove('hot');
    const t = selectedType();
    cursorLabel.textContent = t === 'lemon' ? 'Eat lemon' : t === 'torch' ? 'Place torch' : '';
    cursorEl.classList.toggle('hot', !!cursorLabel.textContent);
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
    ripple(x, y, labelOf(pk));
    return;
  }
  const t = selectedType();
  if (t === 'lemon') {
    ripple(x, y, 'Eat lemon');
    startEat();
    return;
  }
  const p = groundAt(x, y);
  if (!p) return;
  if (t === 'torch') {
    goal = { kind: 'placeTorch', x: p.x, z: p.z, range: RANGE.placeTorch };
    ripple(x, y, 'Place torch');
    return;
  }
  goal = { kind: 'walk', x: p.x, z: p.z, range: RANGE.walk };
  ripple(x, y, '');
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
  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !$('mydayOverlay').classList.contains('hidden')) {
      closeAccount();
      return;
    }
    if (typing(e)) return;
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
    if (e.code === 'KeyM') (mapView.open ? closeMap() : openMap());
    if (e.code === 'Escape' && mapView.open) closeMap();
  });
  window.addEventListener('keyup', (e) => {
    if (typing(e)) return;
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

  // map
  $('btnMap').addEventListener('click', () => { ensureAudio(); openMap(); });
  $('minimap').addEventListener('click', () => { ensureAudio(); openMap(); });
  $('mapClose').addEventListener('click', closeMap);
  $('mapZoomIn').addEventListener('click', () => { mapView.range = Math.max(40, mapView.range / 1.6); });
  $('mapZoomOut').addEventListener('click', () => { mapView.range = Math.min(900, mapView.range * 1.6); });
  $('mapClear').addEventListener('click', () => { clearWaypoint(); toast('Waypoint cleared.'); });
  $('bigMap').addEventListener('click', (e) => {
    const cv = $('bigMap');
    const r = cv.getBoundingClientRect();
    const s = Math.min(r.width, r.height) / 2 / mapView.range;
    const x = player.x + (e.clientX - r.left - r.width / 2) / s;
    const z = player.z + (e.clientY - r.top - r.height / 2) / s;
    closeMap();
    setWaypoint(x, z, true);
  });
  $('wpBtn').addEventListener('click', goToWaypoint);
  $('rnGo').addEventListener('click', () => { ensureAudio(); startRenovation(); });
  $('rnClose').addEventListener('click', () => { chestShop.dismissed = true; hideRenovatePopup(); });

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
  if (birdT <= 0 && state.rain < 0.3 && !isNight()) {
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
  for (const a of animalList) updateAnimal(a, dt, T);
  updateHealth();
  updateParks(dt);
  for (const c of crows) updateCrow(c, dt, T);
  updateChestShop(dt);
  updateTorches(dt);
  updateFlyers(dt, T);
  updateRain(dt);
  updateBubbles(dt);
  updatePickups(dt);
  updateAmbient(dt);
  updateMaps(dt);

  if (chestLid) {
    chestOpenT = Math.max(0, chestOpenT - dt);
    chestLid.rotation.x = -Math.min(1, chestOpenT * 2) * 1.0;
    chestLid.position.z = -Math.min(1, chestOpenT * 2) * 0.12;
  }
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
    checkBadges();
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
  buildTorchLights();

  ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  buildSky();
  buildBackdrop();
  buildHouse();
  buildPlate(CAPI_PLATE, 'dog', mats.rimBlue, mats.kibble);
  buildPlate(JUNE_PLATE, 'cat', mats.rimPink, mats.fish);
  buildShop({ pos: SHED, rot: 0.35, wall: mats.wood2, roof: mats.roof, sign: mats.signCapi, kind: 'shed', ref: SHED_REF, icon: '🥣', label: 'Capi Food' });
  buildShop({ pos: JUNE_SHOP, rot: -0.6, wall: mats.juneWall, roof: mats.juneRoof, sign: mats.signJune, kind: 'juneshop', ref: JUNE_SHOP_REF, icon: '🐟', label: 'June Food' });
  buildChestShop();
  buildTent();
  generateRandomPois();
  for (const v of vets) buildVet(v);
  for (const pk of parks) buildPark(pk);
  buildAnimals();
  buildCrows();
  buildPlayer();
  buildFlyers();
  buildBeacon();
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
  boot.stage('creating WebGL renderer');
  try {
    startRenderer();
  } catch (e) {
    boot.fail(new Error('WebGL renderer could not be created: ' + (e && e.message)));
    return;
  }
  boot.stage('loading textures');
  const imgs = await loadAssets();
  boot.stage('building materials');
  buildMaterials(imgs);
  buildGeometry();
  boot.stage('building world');
  buildWorld();
  boot.stage('setting up input');
  setupInput();
  setupAccount();
  lastFrame = performance.now();
  renderInv();
  refreshHud();
  boot.stage('rendering first frame');
  renderer.render(scene, camera);
  renderer.setAnimationLoop((now) => frame(now));
  boot.done();
  $('loading').classList.add('done');
  // hooks for testing; they do not change the game
  window.lemonDebug = {
    player, state, animals, animalList, crows, plates, vets, parks, pois, torches,
    get goal() { return goal; },
    setGoal(g) { goal = g; },
    get camDist() { return camDist; },
    set camDist(v) { camDist = v; },
    get camYaw() { return camYaw; },
    set camYaw(v) { camYaw = v; },
    setTod(v) { state.tod = v; },
    setRain(v) { state.rainTarget = v; state.rain = v; state.rainTimer = 999; },
    toggleCall, addItem, placeTorch, setWaypoint, startEat, openMap, closeMap, needsVet,
    chunks: () => chunks.size,
  };
}

if (!browserOK()) {
  $('loading').classList.add('done');
  $('start').classList.add('hidden');
  $('unsupported').classList.remove('hidden');
} else {
  init().catch((e) => boot.fail(e));
}
