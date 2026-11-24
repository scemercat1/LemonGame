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
const SLOTS = 7;
const FOLLOW_MIN = 20;
const VET_EVERY_DAYS = 3;
const SICK_CHANCE_PER_HOUR = 0.015;
const MAX_TORCHES = 40;
const TORCH_LIGHTS = 6;
const EAT_TIME = 1.4;
const NAMES = { dog: 'Capi', cat: 'June' };
const RANGE = {
  stand: 2.4, market: 2.6, decor: 1.6,
  food: 2.6, shed: 2.6, juneshop: 2.6, chest: 2.3, bed: 2.0, plate: 1.9, dog: 2.1, cat: 2.1,
  cablebase: 2.6, cableport: 2.6, generator: 2.4, portcrate: 2.0,
  crow: 3.2, lemon: 0.9, torch: 1.6, vet: 4.6, walk: 0.3, placeTorch: 0.8, waypoint: 1.5, ruin: 3.0, berry: 1.4,
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
  berry: 'Pick blueberries',
  torch: 'Pick up torch',
  vet: 'Vet clinic',
  ruin: 'Abandoned Chest Shop',
  stand: 'Lemonade stand',
  market: 'Lemon Market',
  cablebase: 'Cable car',
  cableport: 'Cable car',
  generator: 'Generator',
  portcrate: 'Fish crate',
};
const FOOD_REF = { x: HOUSE.x, z: HOUSE.z };
const SHED_REF = { x: SHED.x, z: SHED.z };
const JUNE_SHOP_REF = { x: JUNE_SHOP.x, z: JUNE_SHOP.z };
const CHEST_REF = { x: CHEST_SHOP.x, z: CHEST_SHOP.z };
const BED_REF = { x: TENT.x, z: TENT.z };
const FLOWER_COLORS = [0xffffff, 0xff8fb1, 0xffe14d, 0xc79bff, 0xff9d5c];
const NAME_TAG_COST = 5;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _'.-]{0,13}$/u;
const BERRY_MAX = 6;          // at most 6 blueberries in the inventory
const BERRIES_PER_BUSH = 2;
const ITEM_MAX = { blueberry: BERRY_MAX, rod: 1 };
const ITEMS = {
  food: { icon: '🥣', name: 'Capi food' },
  catfood: { icon: '🐟', name: 'June food' },
  lemon: { icon: '🍋', name: 'Lemon' },
  torch: { icon: '🔥', name: 'Torch' },
  blueberry: { icon: '🫐', name: 'Blueberries' },
  rod: { icon: '🎣', name: 'Fishing rod' },
  fish: { icon: '🐠', name: 'Fish' },
  goldfish: { icon: '🐡', name: 'Golden fish' },
  flowerpot: { icon: '🌷', name: 'Flower pot' },
  lantern: { icon: '🏮', name: 'Lantern' },
  bench: { icon: '🪑', name: 'Bench' },
  fence: { icon: '🪵', name: 'Fence' },
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
  coins: 0,
  stand: { normal: 0, premium: 0 },
  missions: null,
  acc: { dog: { owned: {}, on: {} }, cat: { owned: {}, on: {} } },
  waypoint: null,
  eatT: 0,
  dayF: 1,
  camMode: 'third',     // 'third' or 'first' person
  fpPitch: 0,
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
let riverGain = null;

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
  riverGain = startLoop(650, 'bandpass', 0, false);
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
  clack(sp) {
    noise({ dur: 0.04, vol: 0.07, f: 900, q: 1.5, sp });
    noise({ dur: 0.04, vol: 0.06, at: 0.12, f: 780, q: 1.5, sp });
  },
  genStart() {
    tone({ type: 'sawtooth', f0: 28, f1: 47, dur: 1.0, vol: 0.07, filt: { type: 'lowpass', f: 300, q: 1 } });
  },
  genStop() {
    tone({ type: 'sawtooth', f0: 47, f1: 20, dur: 1.3, vol: 0.06, filt: { type: 'lowpass', f: 300, q: 1 } });
  },
  cableBell() {
    tone({ f0: 880, f1: 880, dur: 0.45, vol: 0.07 });
    tone({ f0: 660, f1: 660, dur: 0.6, vol: 0.06, at: 0.22 });
  },
  jump() {
    tone({ type: 'sine', f0: 320, f1: 620, dur: 0.16, vol: 0.12 });
  },
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
  croak(sp) {
    for (const at of [0, 0.18]) tone({ type: 'sawtooth', f0: 150, f1: 95, dur: 0.12, vol: 0.12, at, sp, filt: { type: 'lowpass', f: 700 } });
  },
  lap(sp) { noise({ dur: 0.06, vol: 0.1, f: 1600, q: 1, sp }); },
  splash(sp) { noise({ dur: 0.12, vol: 0.1, f: 1200, q: 0.8, sp }); },
  coin(sp) {
    tone({ type: 'square', f0: 1320, dur: 0.07, vol: 0.08, sp });
    tone({ type: 'square', f0: 1760, dur: 0.12, vol: 0.08, at: 0.07, sp });
  },
  pour(sp) { noise({ dur: 0.5, vol: 0.12, f: 900, q: 0.6, sp }); },
  skate(sp) { noise({ dur: 0.18, vol: 0.06, f: 3200, q: 0.5, sp }); },
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

/* ---------- wind: grass and flowers sway, grass is darker at the root ---------- */
const windU = { uTime: { value: 0 }, uWind: { value: 1 } };
function windMaterial(mat, shade) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windU.uTime;
    sh.uniforms.uWind = windU.uWind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nvarying float vH;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vH = clamp(transformed.y, 0.0, 1.0);
      float hh = max(mvPosition.y, 0.0);
      float gust = sin(uTime * 0.7 + mvPosition.x * 0.05) * 0.5 + 0.5;
      float wv = sin(uTime * 1.9 + mvPosition.x * 0.35 + mvPosition.z * 0.27) * (0.6 + gust * 0.6)
               + sin(uTime * 3.7 + mvPosition.x * 1.3 - mvPosition.z * 0.9) * 0.2;
      mvPosition.x += wv * 0.11 * hh * hh * uWind;
      mvPosition.z += wv * 0.05 * hh * hh * uWind;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`
    );
    sh.fragmentShader = 'varying float vH;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      shade ? '#include <color_fragment>\n diffuseColor.rgb *= mix(0.5, 1.15, vH);' : '#include <color_fragment>'
    );
  };
  mat.customProgramCacheKey = () => (shade ? 'wind-shade' : 'wind');
  return mat;
}

// soft, mottled ground: patches of lighter and darker grass, a few bare spots and specks
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = mulberry32(42);
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, 512, 512);
  const blob = (x, y, rad, col) => {
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 40; i++) blob(r() * 512, r() * 512, 40 + r() * 90, `rgba(${r() < 0.5 ? '255,255,235' : '150,160,120'},${0.18 + r() * 0.2})`);
  for (let i = 0; i < 6; i++) blob(r() * 512, r() * 512, 20 + r() * 30, 'rgba(190,160,110,0.35)');
  for (let i = 0; i < 2600; i++) {
    const v = r() < 0.5 ? 255 : 120;
    g.fillStyle = `rgba(${v},${v},${v - 20},${0.08 + r() * 0.12})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 3);
  }
  const t = texFromCanvas(c, true);
  t.anisotropy = 8;
  t.repeat.set(1200 / GROUND_TILE, 1200 / GROUND_TILE);
  return t;
}
const GROUND_TILE = 14;

/* ---------- pollen and seeds floating in the sunlight ---------- */
const POLLEN_N = 90;
const pollenData = [];
let pollen = null;
function buildPollen() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POLLEN_N * 3), 3));
  for (let i = 0; i < POLLEN_N; i++) {
    pollenData.push({ x: rnd(-16, 16), z: rnd(-16, 16), y: rnd(0.3, 3.5), ph: rnd(0, TAU), sp: rnd(0.2, 0.6) });
  }
  const m = new THREE.PointsMaterial({
    size: 0.09, map: glowTex, color: 0xfff6d0, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  pollen = new THREE.Points(g, m);
  pollen.frustumCulled = false;
  scene.add(pollen);
}
function updatePollen(dt) {
  const day = state.dayF * (1 - state.rain) * (isWinter() ? 0 : 1);
  pollen.visible = day > 0.05;
  if (!pollen.visible) return;
  pollen.material.opacity = day * 0.8;
  const p = pollen.geometry.attributes.position;
  for (let i = 0; i < POLLEN_N; i++) {
    const d = pollenData[i];
    d.ph += dt * d.sp;
    d.x = wrapNear(d.x + (0.35 + Math.sin(d.ph * 1.3) * 0.25) * dt, player.x, 16);
    d.z = wrapNear(d.z + Math.cos(d.ph * 0.9) * 0.2 * dt, player.z, 16);
    p.setXYZ(i, d.x, d.y + Math.sin(d.ph * 2) * 0.3, d.z);
  }
  p.needsUpdate = true;
}

function buildMaterials(imgs) {
  const dogCoatTex = texFromCanvas(canvasFromImage(imgs.dogCoat, 256), true);
  const dogFaceTex = featherFace(imgs.dogFace);
  const catCoatTex = texFromCanvas(tabbyCanvas(imgs.catCoat), true);
  const catFaceTex = featherFace(imgs.catFace);

  mats.grass = windMaterial(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), true);
  mats.flower = windMaterial(new THREE.MeshLambertMaterial(), false);
  mats.leaf = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mats.fallLeaf = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mats.petal = new THREE.MeshLambertMaterial({ color: 0xffb8d6, side: THREE.DoubleSide });
  mats.bush = new THREE.MeshLambertMaterial();
  mats.berryBush = new THREE.MeshLambertMaterial({ color: 0x2f6b2f });
  mats.berry = std(0x3b4fd6, { roughness: 0.35 });
  mats.pine = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mats.xmasTree = std(0x1f5e2e, { roughness: 0.9 });
  mats.xmasStar = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  mats.pumpkin = std(0xf07f1a, { roughness: 0.6 });
  mats.umbrella = std(0xffd54f, { roughness: 0.7, side: THREE.DoubleSide });
  mats.glassLemonade = std(0xffe066, { roughness: 0.1, transparent: true, opacity: 0.75 });
  mats.cup = std(0xfff176, { roughness: 0.4 });
  mats.cupPremium = std(0xb39ddb, { roughness: 0.4 });
  mats.signLemonade = std(0xffffff, { map: signTexture('LEMONADE', '#fff59d', '#e65100', '#ff8f00'), roughness: 0.8 });
  mats.signMarket = std(0xffffff, { map: signTexture('Lemon Market', '#e3f2fd', '#0d47a1', '#1565c0'), roughness: 0.8 });
  mats.marketWall = std(0xf2f2ee, { roughness: 0.9 });
  mats.marketRoof = std(0x2e7dd1, { roughness: 0.7 });
  mats.collar = std(0xd32f2f, { roughness: 0.5 });
  mats.scarf = std(0x1e88e5, { roughness: 0.9 });
  mats.partyHat = std(0xff5bb0, { roughness: 0.6 });
  mats.terracotta = std(0xc1663b, { roughness: 0.9 });
  mats.lanternGlow = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
  mats.slate = std(0x2f3b33, { roughness: 0.9 });
  mats.menuBoard = std(0xffffff, { map: signTexture('🥤 5 · 💜 9', '#2f3b33', '#ffffff', '#8b6b3e'), roughness: 0.9 });
  mats.ground = std(0x5aa23a, { roughness: 1, map: groundTexture() });
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
  mats.water = std(0x3f97d6, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
  mats.mud = std(0x5f5234, { roughness: 1 });
  mats.pathDirt = std(0x9a8566, { roughness: 1, side: THREE.DoubleSide });
  mats.stone = std(0xffffff, { roughness: 0.9 });
  mats.reed = new THREE.MeshLambertMaterial({ color: 0x5f8f3a });
  mats.cattail = std(0x5a3a1e, { roughness: 0.9 });
  mats.rock = std(0xffffff, { roughness: 0.95 });
  mats.lily = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide });
  mats.bridge = std(0xa8a395, { roughness: 0.95 });
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
  geo.reed = new THREE.CylinderGeometry(0.015, 0.03, 1, 4).translate(0, 0.5, 0);
  geo.cattail = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 6);
  geo.rock = new THREE.DodecahedronGeometry(0.3, 0);
  geo.lily = new THREE.CircleGeometry(0.35, 10).rotateX(-Math.PI / 2);
  geo.cobble = new THREE.DodecahedronGeometry(1, 0);
  geo.streak = new THREE.BoxGeometry(0.15, 0.15, 14);
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
   River (endless, along z), its banks, the bridge and the stone path
   ==================================================================== */
const RIVER_W = 7;
const RIVER_SEG = 160;
const RIVER_LEN = 320;
const BRIDGE_Z = 3;
const PATH_W = 1.7;

function riverX(z) {
  return 24 + 7 * Math.sin(z * 0.025) + 3 * Math.sin(z * 0.061 + 1.3);
}
// Distance from the water's edge: negative inside the river.
function riverDist(x, z) {
  return Math.abs(x - riverX(z)) - RIVER_W / 2;
}
function inRiver(x, z, pad = 0) {
  return riverDist(x, z) < pad;
}
function onBridge(x, z) {
  return Math.abs(z - BRIDGE_Z) < 1.05 && Math.abs(x - riverX(BRIDGE_Z)) < RIVER_W / 2 + 1.3;
}

// Stone path: from the tent past Capi's house and the plates, over the bridge,
// with branches to Capi Food / Chest Shop and to June Food.
const PATH_LINES = [
  [[-11, 2.4], [-7.5, 1.2], [-6, 0.4], [-1.5, 2.2], [3, 2.8], [9, 3.2], [17, 3.1],
    [riverX(BRIDGE_Z) - RIVER_W / 2 - 1.3, BRIDGE_Z], [riverX(BRIDGE_Z) + RIVER_W / 2 + 1.3, BRIDGE_Z],
    [riverX(BRIDGE_Z) + 12, 2.2], [52, -1]],
  [[-7.5, 1.2], [-9.5, -3], [-11.6, -5.6], [-9.6, -8.8]],
  [[6, 3], [8.4, -0.6], [8.5, -4.4]],
];
const PATH_SEGS = [];
for (const line of PATH_LINES) {
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    PATH_SEGS.push({
      ax, az, bx, bz,
      minX: Math.min(ax, bx) - 3, maxX: Math.max(ax, bx) + 3,
      minZ: Math.min(az, bz) - 3, maxZ: Math.max(az, bz) + 3,
    });
  }
}
function pathDist(x, z) {
  let best = Infinity;
  for (const sg of PATH_SEGS) {
    if (x < sg.minX || x > sg.maxX || z < sg.minZ || z > sg.maxZ) continue;
    const dx = sg.bx - sg.ax;
    const dz = sg.bz - sg.az;
    const t = clamp(((x - sg.ax) * dx + (z - sg.az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = Math.hypot(x - (sg.ax + dx * t), z - (sg.az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
function onPath(x, z, pad = 0) {
  return pathDist(x, z) < PATH_W / 2 + pad;
}

const river = { water: null, bank: null, lastZ: null, tex: null };

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d8fc9';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(5);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const w = 3 + r() * 10;
    const h = 20 + r() * 60;
    g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.13})`;
    for (const oy of [-256, 0, 256]) {
      g.beginPath();
      g.ellipse(x, y + oy, w, h, 0, 0, TAU);
      g.fill();
    }
  }
  return texFromCanvas(c, true);
}

function stripGeometry() {
  const n = RIVER_SEG + 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4), 2));
  const nor = new Float32Array(n * 6);
  for (let i = 0; i < n * 2; i++) nor[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const idx = [];
  for (let i = 0; i < RIVER_SEG; i++) {
    const a = 2 * i;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setIndex(idx);
  return g;
}

function fillStrip(mesh, halfW, y) {
  const p = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  for (let i = 0; i <= RIVER_SEG; i++) {
    const z = river.lastZ + (i * RIVER_LEN) / RIVER_SEG;
    const cx = riverX(z);
    p.setXYZ(2 * i, cx - halfW, y, z);
    p.setXYZ(2 * i + 1, cx + halfW, y, z);
    uv.setXY(2 * i, 0, z / 6);
    uv.setXY(2 * i + 1, 1, z / 6);
  }
  p.needsUpdate = true;
  uv.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

function updateRiverGeometry(force) {
  const z0 = Math.round(player.z / 10) * 10 - RIVER_LEN / 2;
  if (!force && z0 === river.lastZ) return;
  river.lastZ = z0;
  fillStrip(river.water, RIVER_W / 2, 0.035);
  fillStrip(river.bank, RIVER_W / 2 + 1.4, 0.014);
}

function buildRiver() {
  river.tex = waterTexture();
  mats.water.map = river.tex;
  mats.water.needsUpdate = true;
  river.water = new THREE.Mesh(stripGeometry(), mats.water);
  river.bank = new THREE.Mesh(stripGeometry(), mats.mud);
  for (const m of [river.water, river.bank]) {
    m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
  }
  updateRiverGeometry(true);
}

function updateRiver(dt) {
  updateRiverGeometry(false);
  river.tex.offset.y -= dt * 0.12;
}

function buildPath() {
  // packed dirt under the stones
  for (const line of PATH_LINES) {
    const pos = [];
    const nor = [];
    const idx = [];
    line.forEach((pt, i) => {
      const prev = line[Math.max(0, i - 1)];
      const next = line[Math.min(line.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      const w = PATH_W / 2 + 0.15;
      pos.push(pt[0] - dz * w, 0.012, pt[1] + dx * w, pt[0] + dz * w, 0.012, pt[1] - dx * w);
      nor.push(0, 1, 0, 0, 1, 0);
      if (i < line.length - 1) {
        const a = 2 * i;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mats.pathDirt);
    m.receiveShadow = true;
    scene.add(m);
  }
  // cobblestones
  const r = mulberry32(77);
  const stones = [];
  for (const sg of PATH_SEGS) {
    const dx = sg.bx - sg.ax;
    const dz = sg.bz - sg.az;
    const L = Math.hypot(dx, dz);
    const ux = dx / L;
    const uz = dz / L;
    for (let t = 0; t < L; t += 0.42) {
      for (const off of [-0.52, 0, 0.52]) {
        const o = off + (r() - 0.5) * 0.14;
        const x = sg.ax + ux * t - uz * o;
        const z = sg.az + uz * t + ux * o;
        if (inRiver(x, z, 0.8)) continue;
        stones.push({ x, z, s: 0.18 + r() * 0.08, rot: r() * TAU, l: 0.38 + r() * 0.2 });
      }
    }
  }
  const mesh = new THREE.InstancedMesh(geo.cobble, mats.stone, stones.length);
  const col = new THREE.Color();
  stones.forEach((st, i) => {
    dummy.position.set(st.x, 0.03, st.z);
    dummy.rotation.set(0, st.rot, 0);
    dummy.scale.set(st.s, 0.05, st.s * 0.85);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, col.setHSL(0.1, 0.06, st.l));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildBridge() {
  const len = RIVER_W + 2.6;
  const g = new THREE.Group();
  g.position.set(riverX(BRIDGE_Z), 0, BRIDGE_Z);
  scene.add(g);
  const box = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.bridge);
    m.position.set(x, y, z);
    g.add(m);
  };
  box(len, 0.14, 2.1, 0, 0.2, 0);
  for (const z of [-1.0, 1.0]) box(len, 0.4, 0.16, 0, 0.45, z);
  for (const x of [-len / 2, len / 2]) for (const z of [-1.0, 1.0]) box(0.32, 0.7, 0.32, x, 0.35, z);
  for (const x of [-1.6, 1.6]) {
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8), mats.bridge);
    pier.position.set(x, -0.05, 0);
    g.add(pier);
  }
  shadowAll(g);
}

// Reeds, cattails, rocks and lily pads for chunks that touch the river.
function addRiverDecor(add, r, ox, oz) {
  const xs = [riverX(oz), riverX(oz + CHUNK / 2), riverX(oz + CHUNK)];
  const lo = Math.min(...xs) - RIVER_W / 2 - 2;
  const hi = Math.max(...xs) + RIVER_W / 2 + 2;
  if (hi < ox || lo > ox + CHUNK) return;
  const inChunk = (x) => x >= ox && x < ox + CHUNK;
  const col = new THREE.Color();
  const reeds = [];
  const tops = [];
  for (let i = 0; i < 70; i++) {
    const z = oz + r() * CHUNK;
    const side = r() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (RIVER_W / 2 + (r() - 0.35) * 1.2);
    if (!inChunk(x) || onBridge(x, z) || onPath(x, z, 0.6)) continue;
    const h = 0.7 + r() * 0.8;
    reeds.push({ x, z, h, lean: (r() - 0.5) * 0.25, rot: r() * TAU });
    if (r() < 0.35) tops.push({ x, z, h });
  }
  if (reeds.length) {
    const m = add(new THREE.InstancedMesh(geo.reed, mats.reed, reeds.length));
    reeds.forEach((d, i) => {
      dummy.position.set(d.x, 0, d.z);
      dummy.rotation.set(d.lean, d.rot, d.lean * 0.5);
      dummy.scale.set(1, d.h, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }
  if (tops.length) {
    const m = add(new THREE.InstancedMesh(geo.cattail, mats.cattail, tops.length));
    tops.forEach((d, i) => {
      dummy.position.set(d.x, d.h - 0.06, d.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }
  const rocks = [];
  for (let i = 0; i < 14; i++) {
    const z = oz + r() * CHUNK;
    const side = r() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (RIVER_W / 2 + (r() - 0.6) * 2);
    if (inChunk(x) && !onBridge(x, z)) rocks.push({ x, z, s: 0.4 + r() * 0.7, l: 0.35 + r() * 0.25, rot: r() * TAU });
  }
  if (rocks.length) {
    const m = add(new THREE.InstancedMesh(geo.rock, mats.rock, rocks.length));
    rocks.forEach((d, i) => {
      dummy.position.set(d.x, 0.05, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.set(d.s, d.s * 0.6, d.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.setHSL(0.08, 0.05, d.l));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = true;
  }
  const pads = [];
  for (let i = 0; i < 10; i++) {
    const z = oz + r() * CHUNK;
    const x = riverX(z) + (r() - 0.5) * (RIVER_W - 1.5);
    if (inChunk(x) && !onBridge(x, z)) pads.push({ x, z, s: 0.7 + r() * 0.6, rot: r() * TAU, flower: r() < 0.3 });
  }
  if (pads.length) {
    const m = add(new THREE.InstancedMesh(geo.lily, mats.lily, pads.length));
    pads.forEach((d, i) => {
      dummy.position.set(d.x, 0.045, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.set(d.s, 1, d.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    const flowers = pads.filter((d) => d.flower);
    if (flowers.length) {
      const f = add(new THREE.InstancedMesh(geo.flower, mats.flower, flowers.length));
      flowers.forEach((d, i) => {
        dummy.position.set(d.x, 0.09, d.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1.2);
        dummy.updateMatrix();
        f.setMatrixAt(i, dummy.matrix);
        f.setColorAt(i, col.set(0xff8fc8));
      });
      f.instanceMatrix.needsUpdate = true;
      if (f.instanceColor) f.instanceColor.needsUpdate = true;
    }
  }
}

/* ---------- fireflies (night) ---------- */
const FF_N = 70;
const ffData = [];
let fireflies = null;

function buildFireflies() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FF_N * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FF_N * 3), 3));
  for (let i = 0; i < FF_N; i++) {
    ffData.push({ x: rnd(-14, 14), z: rnd(-14, 14), y: rnd(0.4, 2.2), ph: rnd(0, TAU), sp: rnd(0.3, 0.8) });
  }
  const m = new THREE.PointsMaterial({
    size: 0.3, map: glowTex, vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  fireflies = new THREE.Points(g, m);
  fireflies.frustumCulled = false;
  scene.add(fireflies);
}

function updateFireflies(dt) {
  const night = (1 - state.dayF) * (1 - state.rain * 0.8) * (isWinter() ? 0 : 1);
  fireflies.visible = night > 0.05;
  if (!fireflies.visible) return;
  fireflies.material.opacity = night;
  const p = fireflies.geometry.attributes.position;
  const c = fireflies.geometry.attributes.color;
  for (let i = 0; i < FF_N; i++) {
    const d = ffData[i];
    d.ph += dt * d.sp;
    d.x = wrapNear(d.x + Math.sin(d.ph * 1.7) * dt * 0.6, player.x, 14);
    d.z = wrapNear(d.z + Math.cos(d.ph * 1.3) * dt * 0.6, player.z, 14);
    p.setXYZ(i, d.x, d.y + Math.sin(d.ph * 2.3) * 0.25, d.z);
    const b = 0.35 + 0.65 * Math.max(0, Math.sin(T * 3 + d.ph * 5));
    c.setXYZ(i, 0.85 * b, b, 0.4 * b);
  }
  p.needsUpdate = true;
  c.needsUpdate = true;
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
      if (riverDist(p.x, p.z) > 16 && pathDist(p.x, p.z) > 10 && cableCorridorDist(p.x, p.z) > 20 && !nearCable(p.x, p.z) && taken.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 30)) {
        taken.push(p);
        return p;
      }
    }
    const a = rnd(0, TAU);
    return { x: Math.cos(a) * max, z: Math.sin(a) * max };
  };
  // Vets are rare: only beyond the river, and each one farther away than the last.
  const eastSpot = (min, max) => {
    for (let tries = 0; tries < 60; tries++) {
      const d = rnd(min, max);
      const z = rnd(-1, 1) * (25 + d * 0.5);
      const p = { x: riverX(z) + RIVER_W / 2 + d, z };
      if (riverDist(p.x, p.z) > 16 && pathDist(p.x, p.z) > 10 && cableCorridorDist(p.x, p.z) > 20 && !nearCable(p.x, p.z) && taken.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 30)) {
        taken.push(p);
        return p;
      }
    }
    const z = rnd(-20, 20);
    return { x: riverX(z) + RIVER_W / 2 + max, z };
  };
  [[22, 45], [110, 160], [260, 360]].forEach(([a, b], i) => {
    const p = eastSpot(a, b);
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
  if (nearCable(x, z)) return true;
  if (inRiver(x, z, 2) || onPath(x, z, 1)) return true;
  for (const p of pois) if (Math.hypot(x - p.x, z - p.z) < (p.clear || 7)) return true;
  return false;
}

function buildChunk(cx, cz, key) {
  const r = mulberry32(hash2(cx, cz) ^ 0x9e3779b9);
  const ox = cx * CHUNK;
  const oz = cz * CHUNK;
  const group = new THREE.Group();
  scene.add(group);
  const c = { cx, cz, key, group, meshes: [], pickups: [], berries: [], forest: null };
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
    if (parks.some((pk) => Math.hypot(x - pk.x, z - pk.z) < pk.r + 0.3) || inRiver(x, z, 0.4) || onPath(x, z, 0.1) || onCableGround(x, z)) dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    if (stem) {
      col.setHSL(0.27 + r() * 0.03, 0.5, 0.36);
      if (r() < 0.45 && dummy.scale.y > 0 && season().flowers) heads.push({ x, y: sy, z });
    } else if (r() < 0.2) {
      col.setHSL(0.19 + r() * 0.04, 0.7, 0.45);
    } else {
      col.setHSL(0.27 + r() * 0.05, 0.55 + r() * 0.2, 0.28 + r() * 0.12);
    }
    grass.setColorAt(i, seasonTint(col, 'grass'));
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

  addRiverDecor(add, r, ox, oz);
  addForest(c, add, r, ox, oz);

  const leaves = add(new THREE.InstancedMesh(geo.leaf, mats.leaf, LEAVES_PER));
  for (let i = 0; i < LEAVES_PER; i++) {
    dummy.position.set(ox + r() * CHUNK, 0.02, oz + r() * CHUNK);
    dummy.rotation.set(-Math.PI / 2 + 0.12 * r(), r() * TAU, 0, 'YXZ');
    dummy.scale.setScalar(0.7 + r() * 0.6);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    if (r() < 0.35) col.setHSL(0.14, 0.8, 0.6);
    else col.setHSL(0.24 + r() * 0.04, 0.6, 0.38);
    leaves.setColorAt(i, seasonTint(col, 'leaf'));
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
        bushes.setColorAt(i, seasonTint(col.setHSL(0.28 + r() * 0.06, 0.55, 0.26 + r() * 0.1), 'bush'));
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
        folI.setColorAt(fi, seasonTint(col.setHSL(0.31 + r() * 0.04, 0.5, 0.26 + r() * 0.08), 'foliage'));
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
  for (const rec of c.berries) pickables.delete(rec.mesh);
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
    for (const rec of c.berries) {
      if (rec.done) continue;
      const d = Math.hypot(rec.x - player.x, rec.z - player.z);
      if (d < 1.1) collectBerries(rec);
      else if (d > 2.5) rec.warned = false;
    }
  }
}

/* ---------- forests with blueberry bushes ---------- */
const FOREST_CHANCE = 0.13;
const BERRY_DOTS = 8;

function addForest(c, add, r, ox, oz) {
  const fx = ox + CHUNK / 2;
  const fz = oz + CHUNK / 2;
  if (r() >= FOREST_CHANCE || Math.hypot(fx, fz) < 30 || riverDist(fx, fz) < 14 || nearStatic(fx, fz)) return;
  c.forest = { x: fx, z: fz };
  const col = new THREE.Color();
  const trees = [];
  for (let i = 0; i < 40 && trees.length < 20; i++) {
    const x = ox + 1 + r() * (CHUNK - 2);
    const z = oz + 1 + r() * (CHUNK - 2);
    if (nearStatic(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.3)) continue;
    trees.push({ x, z, s: 0.9 + r() * 0.8, pine: r() < 0.7 });
  }
  if (trees.length) {
    const trunks = add(new THREE.InstancedMesh(geo.trunk, mats.trunk, trees.length));
    trees.forEach((t, i) => {
      dummy.position.set(t.x, 0.95 * t.s, t.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      obstacles.push({ x: t.x, z: t.z, r: 0.45, ck: c.key });
    });
    trunks.instanceMatrix.needsUpdate = true;
    trunks.castShadow = true;
    const pines = trees.filter((t) => t.pine);
    if (pines.length) {
      const cones = add(new THREE.InstancedMesh(geo.spruce, mats.pine, pines.length * 2));
      pines.forEach((t, i) => {
        for (let k = 0; k < 2; k++) {
          const w = (1.25 - k * 0.35) * t.s;
          dummy.position.set(t.x, (2.2 + k * 1.1) * t.s, t.z);
          dummy.rotation.set(0, r() * TAU, 0);
          dummy.scale.set(w, 0.75 * t.s, w);
          dummy.updateMatrix();
          cones.setMatrixAt(i * 2 + k, dummy.matrix);
          cones.setColorAt(i * 2 + k, seasonTint(col.setHSL(0.36 + r() * 0.04, 0.45, 0.18 + r() * 0.08), 'pine'));
        }
      });
      cones.instanceMatrix.needsUpdate = true;
      if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
      cones.castShadow = true;
    }
    const rounds = trees.filter((t) => !t.pine);
    if (rounds.length) {
      const crowns = add(new THREE.InstancedMesh(geo.foliage, mats.foliage, rounds.length));
      rounds.forEach((t, i) => {
        dummy.position.set(t.x, 2.5 * t.s, t.z);
        dummy.rotation.set(0, r() * TAU, 0);
        dummy.scale.setScalar(1.3 * t.s);
        dummy.updateMatrix();
        crowns.setMatrixAt(i, dummy.matrix);
        crowns.setColorAt(i, seasonTint(col.setHSL(0.27 + r() * 0.05, 0.5, 0.24 + r() * 0.08), 'foliage'));
      });
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      crowns.castShadow = true;
    }
  }

  const spots = [];
  const n = 3 + ((r() * 4) | 0);
  for (let j = 0; j < n * 4 && spots.length < n; j++) {
    const x = ox + 1.5 + r() * (CHUNK - 3);
    const z = oz + 1.5 + r() * (CHUNK - 3);
    if (nearStatic(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.4)) continue;
    spots.push({ x, z });
  }
  if (!spots.length) return;
  const berryMesh = add(new THREE.InstancedMesh(geo.smallSphere, mats.berry, spots.length * BERRY_DOTS));
  spots.forEach((b, j) => {
    const key = `${c.cx}:${c.cz}:b${j}`;
    const done = picked.has(key);
    const bush = add(new THREE.Mesh(geo.bush, mats.berryBush));
    bush.position.set(b.x, 0.3, b.z);
    bush.scale.set(0.9, 0.65, 0.9);
    bush.castShadow = true;
    const rec = { x: b.x, z: b.z, key, done, mesh: bush, berryMesh, from: j * BERRY_DOTS, warned: false };
    for (let k = 0; k < BERRY_DOTS; k++) {
      const a = r() * TAU;
      dummy.position.set(b.x + Math.cos(a) * 0.52, 0.3 + r() * 0.35, b.z + Math.sin(a) * 0.52);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(done ? 0 : 0.065);
      dummy.updateMatrix();
      berryMesh.setMatrixAt(rec.from + k, dummy.matrix);
    }
    if (!done) pickable(bush, 'berry', rec);
    c.berries.push(rec);
  });
  berryMesh.instanceMatrix.needsUpdate = true;
}

function collectBerries(rec) {
  if (rec.done) return;
  const warn = (msg) => {
    if (!rec.warned) {
      rec.warned = true;
      toast(msg);
    }
  };
  if (countItem('blueberry') >= BERRY_MAX) {
    warn(`You can carry at most ${BERRY_MAX} blueberries.`);
    return;
  }
  const got = addItem('blueberry', BERRIES_PER_BUSH);
  if (!got) {
    warn('Your inventory is full.');
    return;
  }
  rec.done = true;
  picked.add(rec.key);
  pickables.delete(rec.mesh);
  dummy.position.set(0, -10, 0);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(0);
  dummy.updateMatrix();
  for (let k = 0; k < BERRY_DOTS; k++) rec.berryMesh.setMatrixAt(rec.from + k, dummy.matrix);
  rec.berryMesh.instanceMatrix.needsUpdate = true;
  SFX.pick(spatial(rec.x, rec.z));
  bubble(`+${got} 🫐`, rec.x, 1.2, rec.z, { size: 44, life: 1 });
  toast(`+${got} blueberries 🫐 (${countItem('blueberry')}/${BERRY_MAX})`);
  missionEvent('berry', got);
}

/* ====================================================================
   Static structures
   ==================================================================== */
const plates = [];
let housePoi = null;

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
  housePoi = addPoi({ type: 'home', x: HOUSE.x, z: HOUSE.z, icon: '🏠', label: "Capi's house", clear: 7 });
}

function buildPlate(pos, who, rimMat, kibMat) {
  const p = { x: pos.x, z: pos.z, who, food: false, foodType: null, kib: [], berries: [], poi: null };
  const label = undefined; // the label follows the pet's current name (see labelOf)
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
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(geo.smallSphere, mats.berry);
    const a = rr() * TAU;
    const d = rr() * 0.26;
    b.scale.setScalar(0.055);
    b.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d);
    b.visible = false;
    g.add(pickable(b, 'plate', p, label));
    p.berries.push(b);
  }
  plates.push(p);
  p.poi = addPoi({ type: 'plate', x: pos.x, z: pos.z, icon: '🍽️', label: `${NAMES[who]}'s plate`, clear: 4 });
  return p;
}
// type: 'normal' (pet food) or 'blueberry'
function setPlateFood(p, on, type = 'normal') {
  p.food = on;
  p.foodType = on ? type : null;
  for (const k of p.kib) k.visible = on && type === 'normal';
  for (const b of p.berries) b.visible = on && type === 'blueberry';
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
   Renovations: buildings that start abandoned (Chest Shop, lemonade stand)
   ==================================================================== */
const BUILD_TIME = 35;
const RENOVATE_RANGE = 4.5;
const SHOP_ROT = 0.2;
const RENOVATE_COST = 7;        // lemons for the Chest Shop
const STAND_REPAIR_COST = 10;   // coins for the lemonade stand
const STATUSES = ['abandoned', 'building', 'open'];

function makeSite(o) {
  return {
    ...o,
    buildTime: o.buildTime || BUILD_TIME, // seconds
    stages: o.stages || null,             // [{ at: 0..1, name }]
    parts: [],                            // pieces that appear one by one: { mesh, at, baseY }
    stageIdx: -1,
    status: 'abandoned', // 'abandoned' | 'building' | 'open'
    left: 0,
    normal: null,
    ruin: null,
    scaffold: null,
    jib: null,
    cable: null,
    hook: null,
    poi: null,
    near: false,
    dismissed: false,
    hammerT: 0,
  };
}

const chestShop = makeSite({
  key: 'chest',
  title: 'Chest Shop',
  x: CHEST_SHOP.x,
  z: CHEST_SHOP.z,
  rot: SHOP_ROT,
  cost: { type: 'lemon', n: RENOVATE_COST },
  unlockText: 'Renovate it to unlock the torch chest.',
  doneText: 'The Chest Shop is renovated! Open the chest to get torches 🔥',
  icons: ['🏚', '🚧', '🧰'],
  labels: ['Abandoned shop', 'Renovating…', 'Chest Shop'],
});
let standSite = null;            // created in buildStand
const sites = [];
let renovating = null;           // the site June is working on (one at a time)
let popupSite = null;            // the site shown in the Renovate popup
const renoWorkers = [];
let chestLid = null;
let chestOpenT = 0;
let chipText = '';

// A point around a site, given in the site's own coordinates.
function sitePoint(site, lx, lz) {
  const c = Math.cos(site.rot);
  const s = Math.sin(site.rot);
  return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c };
}
// Used by June while she works: a point around the site being renovated.
function shopPoint(lx, lz) {
  const site = renovating || chestShop;
  const k = site.ws || 1;
  return sitePoint(site, lx * k, lz * k);
}

// Scaffolding, a mini crane and a work in progress sign, shown while a site is built.
function buildScaffold(site, g, box) {
  const sc = new THREE.Group();
  for (const x of [-1.5, 0, 1.5]) {
    for (const z of [-0.95, 0.95]) {
      const p = new THREE.Mesh(geo.pole, mats.steel);
      p.position.set(x, 1.4, z);
      sc.add(p);
    }
  }
  for (const y of [1.25, 2.5]) {
    for (const z of [-0.95, 0.95]) box(sc, 3.1, 0.05, 0.05, mats.steel, 0, y, z);
    for (const x of [-1.5, 1.5]) box(sc, 0.05, 0.05, 1.95, mats.steel, x, y, 0);
  }
  for (const z of [-0.95, 0.95]) box(sc, 3.1, 0.06, 0.4, mats.wood, 0, 1.28, z);

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
  sc.add(crane);

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
  sc.add(wip);
  for (const [x, z] of [[0.9, 2.0], [-1.6, 1.9], [1.9, 1.2]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 10), mats.cone);
    cone.position.set(x, 0.2, z);
    sc.add(cone);
  }
  // material pile: planks and sacks
  for (let i = 0; i < 5; i++) {
    const plank = box(sc, 1.2, 0.06, 0.2, mats.wood, -2.7, 0.04 + i * 0.065, 0.45 + (i % 2) * 0.22);
    plank.rotation.y = 0.15 * (i % 3);
  }
  for (const [x, z] of [[-2.4, 1.15], [-3.0, 1.1]]) {
    const sack = new THREE.Mesh(geo.smallSphere, mats.ruinCloth);
    sack.scale.set(0.24, 0.18, 0.2);
    sack.position.set(x, 0.17, z);
    sc.add(sack);
  }
  g.add(sc);
  site.scaffold = sc;
  site.jib = jib;
  site.cable = cable;
  site.hook = hook;
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
  for (const m of parts) pickable(m, 'ruin', chestShop);
  g.add(ruin);
  chestShop.ruin = ruin;

  buildScaffold(chestShop, g, box);
  shadowAll(g);
  chestShop.poi = addPoi({ type: 'shop', x: CHEST_SHOP.x, z: CHEST_SHOP.z, icon: '🏚', label: 'Abandoned shop', clear: 6 });
  sites.push(chestShop);
  setSiteStatus(chestShop, 'abandoned', 0);
}

function setSiteStatus(site, status, left = 0) {
  site.status = status;
  site.left = left;
  site.normal.visible = status !== 'abandoned';
  site.scaffold.visible = status === 'building';
  applyBuildVisuals(site);
  if (site.onStatus) site.onStatus(status);
  const i = STATUSES.indexOf(status);
  site.poi.icon = site.icons[i];
  site.poi.label = site.labels[i];
  if (popupSite === site) hideRenovatePopup();
  updateBuildChip();
}

function siteProgress(site) {
  return clamp(1 - site.left / site.buildTime, 0, 1);
}

// Shows how far the building is: pieces appear one by one, or the whole building grows.
function applyBuildVisuals(site) {
  const building = site.status === 'building';
  const p = building ? siteProgress(site) : 1;
  if (site.parts.length) {
    site.normal.scale.y = 1;
    for (const part of site.parts) {
      const t = building ? clamp((p - part.at) / 0.06, 0, 1) : 1;
      part.mesh.visible = t > 0;
      part.mesh.scale.y = part.baseY * Math.max(0.05, t);
    }
    // the old stand is cleared away during the first stage
    const clear = site.stages ? site.stages[1].at : 0.2;
    site.ruin.visible = site.status === 'abandoned' || (building && p < clear);
    site.ruin.scale.y = building ? Math.max(0.05, 1 - p / clear) : 1;
  } else {
    site.normal.scale.y = building ? 0.1 + 0.9 * p : 1;
    site.ruin.visible = site.status === 'abandoned';
  }
}

function stageIndex(site) {
  if (!site.stages) return -1;
  const p = siteProgress(site);
  let idx = 0;
  site.stages.forEach((st, i) => {
    if (p >= st.at) idx = i;
  });
  return idx;
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

function costText(site) {
  return site.cost.type === 'coin' ? `🪙 × ${site.cost.n}` : `🍋 × ${site.cost.n}`;
}
function haveFor(site) {
  return site.cost.type === 'coin' ? state.coins : countItem('lemon');
}
function canAfford(site) {
  return haveFor(site) >= site.cost.n;
}
function payFor(site) {
  if (site.cost.type === 'coin') state.coins -= site.cost.n;
  else takeItems('lemon', site.cost.n);
}

function showRenovatePopup(site) {
  popupSite = site;
  $('rnTitle').textContent = site.popTitle || `🏚 Abandoned ${site.title}`;
  $('rnGo').textContent = site.goText || 'Renovate';
  $('rnText').textContent = site.unlockText;
  $('rnCost').textContent = `Cost: ${costText(site)}`;
  $('rnHave').textContent = `(you have ${haveFor(site)})`;
  $('renovatePop').classList.remove('hidden');
}
function hideRenovatePopup() {
  $('renovatePop').classList.add('hidden');
  popupSite = null;
}

function renovateHint(site) {
  if (site.hintText) toast(`${site.hintText} You have ${haveFor(site)}.`);
  else toast(`This ${site.title} is abandoned. Bring ${costText(site)} to renovate it (you have ${haveFor(site)}).`);
}

// Clicking a ruin: show the popup, or say what is missing.
function tryRuin(site) {
  if (!site || site.status !== 'abandoned') return;
  if (renovating) {
    toast(`${animals.cat.name} is busy renovating the ${renovating.title}. Come back when it is done.`);
  } else if (canAfford(site)) {
    site.dismissed = false;
    showRenovatePopup(site);
  } else {
    renovateHint(site);
  }
}

function startRenovation(site = popupSite) {
  if (!site || site.status !== 'abandoned') return;
  if (renovating) {
    hideRenovatePopup();
    toast(`${animals.cat.name} is busy renovating the ${renovating.title}. Come back when it is done.`);
    return;
  }
  if (!canAfford(site)) {
    hideRenovatePopup();
    renovateHint(site);
    return;
  }
  payFor(site);
  renovating = site;
  site.stageIdx = -1;
  setSiteStatus(site, 'building', site.buildTime);
  spawnWorkers(false);
  setJuneWork(true);
  SFX.chime();
  toast(site.startText || `Renovation started! ${animals.cat.name} and the lemon builders are on their way 🔨`);
}

function finishRenovation(site) {
  renovating = null;
  setSiteStatus(site, 'open', 0);
  for (const w of renoWorkers) w.mode = 'out';
  setJuneWork(false);
  SFX.chime();
  bubble('✨ Done!', site.x, 3, site.z, { life: 2 });
  toast(site.doneText);
}

function updateBuildChip() {
  const chip = $('buildChip');
  if (!renovating) {
    const t = cableChipText();
    if (t) {
      if (t !== chipText) chip.textContent = chipText = t;
      chip.classList.remove('hidden');
      return;
    }
    chip.classList.add('hidden');
    chipText = '';
    return;
  }
  const s = Math.max(0, Math.ceil(renovating.left));
  const idx = stageIndex(renovating);
  const stage = idx >= 0 ? ` · ${renovating.stages[idx].name}` : '';
  const text = `🚧 ${renovating.title}${stage} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (text !== chipText) {
    chip.textContent = text;
    chipText = text;
  }
  chip.classList.remove('hidden');
}

function updateRenovations(dt) {
  for (const site of sites) {
    if (site.status !== 'abandoned') {
      site.near = false;
      continue;
    }
    const near = Math.hypot(player.x - site.x, player.z - site.z) < RENOVATE_RANGE;
    const enough = canAfford(site);
    if (near && !site.near && !enough && !renovating) renovateHint(site);
    if (!near) site.dismissed = false;
    if (near && enough && !site.dismissed && !renovating) {
      if (popupSite !== site) showRenovatePopup(site);
    } else if (popupSite === site) {
      hideRenovatePopup();
    }
    site.near = near;
  }
  const site = renovating;
  if (site) {
    site.left = Math.max(0, site.left - dt);
    applyBuildVisuals(site);
    const idx = stageIndex(site);
    if (idx !== site.stageIdx) {
      if (idx > 0 && site.stageIdx >= 0 && Math.hypot(player.x - site.x, player.z - site.z) < 40) {
        toast(`🔨 ${site.title}: ${site.stages[idx].name}`);
      }
      site.stageIdx = idx;
    }
    site.jib.rotation.y = Math.sin(T * 0.35) * 1.1;
    const L = (1.2 + Math.sin(T * 0.8) * 0.6) * (site.hookK || 1);
    site.cable.scale.y = L;
    site.cable.position.y = -L / 2;
    site.hook.position.y = -L - 0.07;
    site.hammerT -= dt;
    const hammerer = renoWorkers.find((w) => w.mode === 'work' && w.role === 'hammer');
    if (site.hammerT <= 0 && hammerer) {
      site.hammerT = rnd(0.3, 0.7);
      SFX.hammer(spatial(site.x, site.z));
      if (Math.random() < 0.6) spawnDust(hammerer.spot.x + rnd(-0.6, 0.6), hammerer.spot.z - 0.6);
    }
    updateBuildChip();
    if (site.left <= 0) finishRenovation(site);
  }
  updateWorkers(dt);
  updateDust(dt);
}

/* ---------- menu and screen options ---------- */
const UI_KEY = 'lemonGarden.ui';
const UI_OPTS = [
  ['optMinimap', 'hide-minimap'],
  ['optStats', 'hide-stats'],
  ['optNeeds', 'hide-needs'],
  ['optActions', 'hide-actions'],
];
function loadUiPrefs() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}
function saveUiPrefs() {
  const prefs = { compact: document.body.classList.contains('hud-compact') };
  for (const [id, cls] of UI_OPTS) prefs[cls] = document.body.classList.contains(cls);
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(prefs));
  } catch (_) { /* storage unavailable: options last until reload */ }
}
function closeUiMenu() {
  $('uiMenu').classList.add('hidden');
  $('btnMenu').setAttribute('aria-expanded', 'false');
}
function setupUiMenu() {
  const prefs = loadUiPrefs();
  document.body.classList.toggle('hud-compact', !!prefs.compact);
  for (const [id, cls] of UI_OPTS) {
    const hide = !!prefs[cls];
    document.body.classList.toggle(cls, hide);
    $(id).checked = !hide;
    $(id).addEventListener('change', () => {
      document.body.classList.toggle(cls, !$(id).checked);
      saveUiPrefs();
    });
  }
  $('btnMenu').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('uiMenu').classList.toggle('hidden') === false;
    $('btnMenu').setAttribute('aria-expanded', String(open));
  });
  $('uiMenu').addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('pointerdown', (e) => {
    if (!$('uiMenu').contains(e.target) && e.target !== $('btnMenu')) closeUiMenu();
  });
  document.querySelector('#hud .title').addEventListener('click', () => {
    document.body.classList.toggle('hud-compact');
    saveUiPrefs();
  });
}

/* ---------- dust from the building site ---------- */
const dustPuffs = [];
let dustTex = null;
function spawnDust(x, z) {
  if (!dustTex) dustTex = radialCanvasTexture('rgba(205,195,175,0.75)', 'rgba(205,195,175,0)');
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false }));
  sp.position.set(x, 0.3, z);
  sp.scale.setScalar(0.5);
  scene.add(sp);
  dustPuffs.push({ sp, t: 0, life: rnd(1, 1.6), vx: rnd(-0.3, 0.3), vz: rnd(-0.3, 0.3) });
}
function updateDust(dt) {
  for (let i = dustPuffs.length - 1; i >= 0; i--) {
    const d = dustPuffs[i];
    d.t += dt;
    d.sp.position.x += d.vx * dt;
    d.sp.position.z += d.vz * dt;
    d.sp.position.y += 0.5 * dt;
    d.sp.scale.setScalar(0.5 + d.t * 0.9);
    d.sp.material.opacity = clamp(1 - d.t / d.life, 0, 1) * 0.8;
    if (d.t >= d.life) {
      scene.remove(d.sp);
      d.sp.material.dispose();
      dustPuffs.splice(i, 1);
    }
  }
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
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.16), mats.wood);
  plank.position.set(0, 0.92, 0);
  plank.visible = false;
  g.add(plank);
  shadowAll(g);
  return { group: g, arm, plank, blob: makeBlob(0.7), x: 0, z: 0, yaw: 0, moving: false, mode: 'in', role: 'hammer', leg: 'toPile', t: 0, spot: null, exit: null, pile: null, ph: rnd(0, TAU) };
}

function clearWorkers() {
  for (const w of renoWorkers) {
    scene.remove(w.group);
    scene.remove(w.blob);
  }
  renoWorkers.length = 0;
}

function spawnWorkers(atSpot) {
  clearWorkers();
  if (!renovating) return;
  [-1, 1].forEach((side) => {
    const w = buildWorker();
    const k = renovating.ws || 1;
    const spot = sitePoint(renovating, side * 1.3 * k, 1.5 * k);
    const exit = sitePoint(renovating, side * 9 * k, 9 * k);
    w.spot = spot;
    w.exit = exit;
    w.role = side < 0 ? 'hammer' : 'carry';
    w.pile = sitePoint(renovating, -2.7 * k, 0.7 * k);
    w.leg = 'toPile';
    w.arm.visible = w.role === 'hammer';
    w.x = atSpot ? spot.x : exit.x;
    w.z = atSpot ? spot.z : exit.z;
    w.mode = atSpot ? 'work' : 'in';
    renoWorkers.push(w);
  });
}

function updateWorkers(dt) {
  const c = renovating ? sitePoint(renovating, 0, 0) : null;
  for (let i = renoWorkers.length - 1; i >= 0; i--) {
    const w = renoWorkers[i];
    w.moving = false;
    if (w.mode === 'in' || w.mode === 'out') {
      const t = w.mode === 'in' ? w.spot : w.exit;
      if (stepTo(w, t.x, t.z, 2.4, dt, 0.1)) {
        if (w.mode === 'in') {
          w.mode = 'work';
        } else {
          scene.remove(w.group);
          scene.remove(w.blob);
          renoWorkers.splice(i, 1);
          continue;
        }
      }
    }
    let y = 0;
    if (w.mode === 'work' && c && w.role === 'carry') {
      // walk to the material pile, pick up a plank, bring it to the site, put it down
      if (w.leg === 'toPile') {
        if (stepTo(w, w.pile.x, w.pile.z, 2.0, dt, 0.2)) {
          w.leg = 'pick';
          w.t = 0.6;
        }
      } else if (w.leg === 'pick') {
        w.t -= dt;
        if (w.t <= 0) {
          w.plank.visible = true;
          w.leg = 'toSite';
        }
      } else if (w.leg === 'toSite') {
        if (stepTo(w, w.spot.x, w.spot.z, 2.0, dt, 0.2)) {
          w.leg = 'drop';
          w.t = 0.9;
          w.plank.visible = false;
          SFX.place(spatial(w.x, w.z));
        }
      } else {
        w.yaw = angleLerp(w.yaw, Math.atan2(c.x - w.x, c.z - w.z), Math.min(1, dt * 5));
        w.t -= dt;
        if (w.t <= 0) w.leg = 'toPile';
      }
      if (w.moving) y = Math.abs(Math.sin(T * 11 + w.ph)) * 0.06;
    } else if (w.mode === 'work' && c) {
      w.yaw = angleLerp(w.yaw, Math.atan2(c.x - w.x, c.z - w.z), Math.min(1, dt * 5));
      const swing = Math.abs(Math.sin(T * 7 + w.ph));
      w.arm.rotation.x = -swing * 1.4;
      y = swing * 0.03;
    } else {
      w.arm.rotation.x = 0;
      if (w.mode === 'out') w.plank.visible = false;
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
  for (const d of decorItems) {
    if (d.type === 'lantern') lightSources.push({ x: d.x, y: 1.5, z: d.z, f: 0.9, d: Math.hypot(d.x - player.x, d.z - player.z) });
  }
  if (isWinter()) lightSources.push({ x: XMAS.x, y: 1.6, z: XMAS.z, f: 0.7, d: Math.hypot(XMAS.x - player.x, XMAS.z - player.z) });
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

// Walk to the nearest river bank and drink for a few seconds.
function goDrink(a) {
  let z = a.z + rnd(-3, 3);
  if (Math.abs(z - BRIDGE_Z) < 3) z += 5;
  const side = Math.sign(a.x - riverX(z)) || -1;
  a.drink = { x: riverX(z) + side * (RIVER_W / 2 - 0.25), z, side, t: 4.5, lap: 0, said: false, at: false };
  a.state = 'drink';
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
      a.eating = p.foodType;
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
      const berries = a.eating === 'blueberry';
      a.friend = Math.min(100, a.friend + (berries ? 5 : 10));
      if (a.kind === 'dog') SFX.bark(spatial(a.x, a.z));
      else SFX.meow(spatial(a.x, a.z));
      bubble(berries ? 'Yum! 🫐' : 'Yum yum!', a.x, a.cfg.height + 0.25, a.z, { life: 1.3 });
      if (berries) {
        // blueberries move the next vet check-up one day later
        a.lastVet = Math.min(state.day, a.lastVet + 1);
        a.dueNotified = false;
        toast(`${a.name} ate blueberries! 🫐 Next vet check-up: day ${a.lastVet + VET_EVERY_DAYS}.`);
      } else {
        toast(`${a.name} ate! Friendship up ${a.kind === 'dog' ? '🐶' : '🐱'}`);
      }
      missionEvent('feed');
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
      missionEvent('park');
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
  } else if (a.state === 'drink') {
    const dk = a.drink;
    if (stepTo(a, dk.x, dk.z, a.speed * 1.3 * slow, dt, 0.2)) {
      a.yaw = angleLerp(a.yaw, Math.atan2(-dk.side, 0), Math.min(1, dt * 5));
      dk.at = true;
      dk.t -= dt;
      dk.lap -= dt;
      if (dk.lap <= 0) {
        dk.lap = 0.5;
        SFX.lap(spatial(a.x, a.z));
      }
      if (!dk.said) {
        dk.said = true;
        bubble('💧', a.x, a.cfg.height + 0.2, a.z, { size: 56, bg: false, life: 1.3 });
      }
      if (dk.t <= 0) {
        a.state = 'idle';
        a.timer = rnd(2, 4);
        a.happy = 0.8;
      }
    }
  } else if (a.state === 'idle') {
    a.timer -= dt;
    const pd = Math.hypot(player.x - a.x, player.z - a.z);
    if (pd < 4) a.yaw = angleLerp(a.yaw, Math.atan2(player.x - a.x, player.z - a.z), Math.min(1, dt * 4));
    if (a.timer <= 0) {
      if (Math.random() < 0.3 && Math.abs(riverDist(a.x, a.z)) < 60 && !isWinter()) goDrink(a);
      else pickWander(a);
    }
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
  if (onBridge(a.x, a.z)) a.root.position.y += 0.27;
  else if (inRiver(a.x, a.z, -0.4) && !isWinter()) a.root.position.y -= 0.12 * a.cfg.scale;
  const wantNeck = a.state === 'eat' || (a.state === 'drink' && a.drink.at) ? 0.95 : (a.sick ? 0.3 : 0) + Math.sin(t * 2 + a.x) * 0.04;
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
  missionEvent('pet');
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
    toast(`${a.name} barked happily! 🐶`);
  } else {
    SFX.meow(spatial(a.x, a.z));
    SFX.purr(spatial(a.x, a.z));
    bubble('Purr…', a.x, a.cfg.height + 0.3, a.z, { life: 1.2 });
    toast(`${a.name} is purring 🐱`);
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
          toast(`A crow stole ${petName(p.who)}'s food!`);
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
  const snow = isWinter();
  for (let i = 0; i < n; i++) {
    const d = rainDrops[i];
    d.y -= d.sp * dt * (snow ? 0.12 : 1);
    if (snow) d.x += Math.sin(T * 1.3 + i) * dt * 0.6;
    if (d.y < 0) d.y += 18;
    d.x = wrapNear(d.x, player.x, 16);
    d.z = wrapNear(d.z, player.z, 16);
    dummy.position.set(d.x, d.y, d.z);
    dummy.rotation.set(0.08, 0, 0.12);
    if (snow) dummy.scale.set(3.5, 0.1, 3.5);
    else dummy.scale.set(1, 1, 1);
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
const player = { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI, group: null, body: null, hand: {}, eatLemon: null, walkT: 0, stepT: 0, blob: null, vx: 0, vz: 0, jy: 0, jv: 0, jumpQ: 0 };
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

const JUMP_SPEED = 5.2;
const GRAVITY = 16;
function jump() {
  ensureAudio();
  player.jumpQ = 0.15; // a press just before landing still counts
}

function updatePlayer(dt) {
  if (ride.cab) {
    const c = ride.cab;
    goal = null;
    player.x = c.x;
    player.z = c.z;
    player.vx = player.vz = player.jy = player.jv = 0;
    player.group.position.set(c.x, c.floorY, c.z);
    player.group.rotation.y = c.yaw;
    player.body.position.y = 0.42;
    player.blob.visible = false;
    player.group.visible = state.camMode === 'third';
    updateChunks();
    return;
  }
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
  const inWater = inRiver(player.x, player.z) && !onBridge(player.x, player.z);
  const onIce = inWater && isWinter();
  let speed = 0;
  if (moving) {
    sprinting = (state.sprintKey || state.sprintBtn) && state.stamina > 4 && state.hunger > 0;
    speed = WALK_SPEED;
    if (sprinting) {
      speed = SPRINT_SPEED;
      state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN * dt);
      state.sprintCD = 0.8;
    }
    if (state.hunger <= 0) speed *= 0.7;
    if (inWater) speed *= onIce ? 1.3 : 0.55;
    player.yaw = angleLerp(player.yaw, Math.atan2(mx, mz), Math.min(1, dt * 10));
    player.walkT += dt * (sprinting ? 17 : 11);
    player.stepT -= dt;
    if (player.stepT <= 0 && actx) {
      player.stepT = sprinting ? 0.3 : 0.42;
      const sound = onIce ? SFX.skate : inWater ? SFX.splash : SFX.step;
      sound(spatial(player.x, player.z));
    }
  }
  // on ice the lemon keeps sliding for a moment
  const k = onIce ? Math.min(1, dt * 1.6) : 1;
  player.vx += (mx * speed - player.vx) * k;
  player.vz += (mz * speed - player.vz) * k;
  player.x += player.vx * dt;
  player.z += player.vz * dt;
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

  // jumping: a short hop with gravity, a squash on take off and on landing
  player.jumpQ = Math.max(0, player.jumpQ - dt);
  const grounded = player.jy <= 0 && player.jv <= 0;
  if (player.jumpQ > 0 && grounded && !state.sleeping && state.eatT <= 0) {
    player.jumpQ = 0;
    player.jv = JUMP_SPEED;
    state.stamina = Math.max(0, state.stamina - 3);
    SFX.jump();
  }
  if (!grounded) {
    player.jv -= GRAVITY * dt;
    player.jy += player.jv * dt;
    if (player.jy <= 0) {
      player.jy = 0;
      player.jv = 0;
      player.landT = 0.18;
      SFX.step(spatial(player.x, player.z));
      if (!inWater) for (let i = 0; i < 3; i++) spawnDust(player.x + rnd(-0.3, 0.3), player.z + rnd(-0.3, 0.3));
    }
  }
  player.landT = Math.max(0, (player.landT || 0) - dt);

  const lift = onBridge(player.x, player.z) ? 0.27 : inRiver(player.x, player.z, -0.4) ? (isWinter() ? 0.04 : -0.14) : 0;
  player.group.position.set(player.x, lift + player.jy, player.z);
  player.group.rotation.y = player.yaw;
  player.body.position.y = 0.42 + (moving ? Math.abs(Math.sin(player.walkT)) * 0.05 : 0);
  if (state.eatT <= 0) {
    let sy = 0.8 + (moving ? Math.sin(player.walkT * 2) * 0.03 : 0);
    if (player.jy > 0) sy = 0.8 + clamp(player.jv * 0.025, -0.06, 0.1); // stretch in the air
    if (player.landT > 0) sy = 0.8 - player.landT * 0.6;                // squash on landing
    const sx = 0.8 + (0.8 - sy) * 0.5;
    player.body.scale.set(sx, sy, sx);
  }
  player.blob.position.set(player.x, 0.01, player.z);
  player.blob.scale.setScalar(Math.max(0.5, 1 - player.jy * 0.35));
  const sel = selectedType();
  for (const [k, m] of Object.entries(player.hand)) m.visible = k === sel && !(k === 'lemon' && state.eatT > 0);
  player.group.visible = !state.sleeping && state.camMode === 'third';
  player.blob.visible = state.camMode === 'third';
  updateEating(dt);
  updateChunks();
}

function updateCamera(dt) {
  if (state.camMode === 'first') {
    // first person: eyes of the lemon, looking where it walks
    const moving = dirs.size > 0 || !!goal;
    const bob = moving ? Math.sin(player.walkT * 2) * 0.035 : 0;
    const ex = player.x;
    const ey = 0.74 + bob + player.group.position.y;
    const ez = player.z;
    const cp = Math.cos(state.fpPitch);
    camera.position.set(ex, ey, ez);
    camera.lookAt(ex - Math.sin(camYaw) * cp, ey + Math.sin(state.fpPitch), ez - Math.cos(camYaw) * cp);
    return;
  }
  const tx = player.x;
  const ty = 0.9 + Math.max(0, player.group.position.y);
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
  if (ITEM_MAX[type] !== undefined) n = Math.min(n, Math.max(0, ITEM_MAX[type] - countItem(type)));
  if (n <= 0) return 0;
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
    toast(`Tap ${animals.dog.name}'s plate to serve the food.`);
  } else if (t === 'rod') {
    if (Math.abs(riverDist(player.x, player.z)) < 3) goFish(player.x, player.z);
    else toast('Go to the river and tap the water to fish.');
  } else if (DECOR[t]) {
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);
    placeDecor(t, player.x + s * 1.3, player.z + c * 1.3);
  } else if (t === 'fish') {
    toast('Serve fish on a plate, or sell it at the Lemon Market.');
  } else if (t === 'goldfish') {
    toast('Sell the golden fish at the Lemon Market for 20 🪙.');
  } else if (t === 'blueberry') {
    toast('Put blueberries on a plate: the next vet check-up moves one day later.');
  } else {
    toast(`Tap ${animals.cat.name}'s plate to serve the food.`);
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
  // Pet food or blueberries: the selected slot wins, then pet food, then blueberries.
  const type = p.who === 'dog' ? 'food' : 'catfood';
  const sel = selectedType();
  let item = sel === type || sel === 'fish' || sel === 'blueberry' ? sel : null;
  let idx = item ? state.sel : state.inv.findIndex((s) => s && s.type === type);
  if (idx >= 0 && !item) item = type;
  if (idx < 0) {
    idx = state.inv.findIndex((s) => s && s.type === 'fish');
    if (idx >= 0) item = 'fish';
  }
  if (idx < 0) {
    idx = state.inv.findIndex((s) => s && s.type === 'blueberry');
    if (idx >= 0) item = 'blueberry';
  }
  if (idx < 0) {
    toast(p.who === 'dog'
      ? 'You have no Capi food or blueberries. Get food at Capi Food or the doghouse.'
      : 'You have no June food or blueberries. Get food at June Food.');
    return;
  }
  removeOne(idx);
  const berries = item === 'blueberry';
  setPlateFood(p, true, berries ? 'blueberry' : 'normal');
  SFX.place(spatial(p.x, p.z));
  const a = p.who === 'dog' ? animals.dog : animals.cat;
  const what = berries ? 'Blueberries' : 'Food';
  if (a.state === 'work') {
    a.plate = p;
    toast(`${what} on the plate. ${a.name} will eat after the renovation.`);
    return;
  }
  toast(`${what} on the plate. ${a.name} is coming!`);
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
  missionEvent('lemon');
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

function toggleCamera() {
  const first = state.camMode !== 'first';
  state.camMode = first ? 'first' : 'third';
  if (first) {
    state.fpPitch = 0;
  } else {
    // start the third person camera right behind the lemon
    camera.position.set(
      player.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      0.9 + Math.sin(camPitch) * camDist,
      player.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist
    );
  }
  $('btnCam').textContent = first ? '🎥 Third person' : '🎥 First person';
  $('btnCam').setAttribute('aria-label', first ? 'Switch to third person' : 'Switch to first person');
  SFX.click();
  toast(first ? 'First person view 👁 (drag to look around)' : 'Third person view 🎥');
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

/* ---------- Chest Shop window: torches and name tags ---------- */
let shopPet = 'dog';

function openShop() {
  $('shopMsg').textContent = '';
  $('tagName').value = '';
  renderShop();
  $('shopOverlay').classList.remove('hidden');
}
function closeShop() {
  $('shopOverlay').classList.add('hidden');
}
function renderShop() {
  $('shopLemons').textContent = countItem('lemon');
  $('tagDogName').textContent = animals.dog.name;
  $('tagCatName').textContent = animals.cat.name;
  $('tagDog').classList.toggle('sel', shopPet === 'dog');
  $('tagCat').classList.toggle('sel', shopPet === 'cat');
}

// Keeps every place that shows a pet's name in sync after a rename.
function updatePetLabels() {
  for (const p of plates) if (p.poi) p.poi.label = `${petName(p.who)}'s plate`;
  if (housePoi) housePoi.label = `${animals.dog.name}'s house`;
}

function buyNameTag() {
  const name = String($('tagName').value || '').trim().replace(/\s+/g, ' ');
  const msg = $('shopMsg');
  if (!NAME_RE.test(name)) {
    msg.textContent = 'Name: 1–14 letters or numbers (spaces, _ - . and \' are ok).';
    return;
  }
  const have = countItem('lemon');
  if (have < NAME_TAG_COST) {
    msg.textContent = `A name tag costs ${NAME_TAG_COST} lemons. You have ${have}.`;
    return;
  }
  const a = animals[shopPet];
  const old = a.name;
  takeItems('lemon', NAME_TAG_COST);
  a.name = name;
  updatePetLabels();
  renderShop();
  refreshHud();
  msg.textContent = '';
  $('tagName').value = '';
  SFX.chime();
  bubble(`🏷️ ${name}`, a.x, a.cfg.height + 0.4, a.z, { life: 2 });
  toast(`${old} is now called ${name}! 🏷️`);
}

function executeGoal(g) {
  switch (g.kind) {
    case 'food': grabFood(); break;
    case 'shed': takeFromShed(); break;
    case 'juneshop': takeFromJuneShop(); break;
    case 'chest':
      if (chestShop.status === 'open') openShop();
      break;
    case 'berry': collectBerries(g.ref); break;
    case 'ruin': tryRuin(g.ref); break;
    case 'bed': tryBed(); break;
    case 'plate': placeFood(g.ref); break;
    case 'dog':
    case 'cat': petAnimal(g.ref); break;
    case 'crow': scareCrow(g.ref); break;
    case 'lemon': collectLemon(g.ref); break;
    case 'torch': pickupTorch(g.ref); break;
    case 'vet': visitVet(g.ref); break;
    case 'placeTorch': placeTorch(g.x, g.z); break;
    case 'stand':
      if (standSite.status === 'open') openStand();
      break;
    case 'market': openMarket(); break;
    case 'cablebase':
      if (cableBase.status === 'open') openCable('base');
      break;
    case 'cableport':
      if (cable.south === 'open') openCable('port');
      else toast('The South Port station is still being built.');
      break;
    case 'generator':
      if (cableBase.status !== 'open') toast(`Build the cable car base first (${CABLE_COST} 🪙).`);
      else if (!cable.gen) openCable('base');
      else toggleGenerator();
      break;
    case 'portcrate': collectPortFish(); break;
    case 'cableBoard': startWaiting(g.at); break;
    case 'decor': pickupDecor(g.ref); break;
    case 'placeDecor': placeDecor(g.type, g.x, g.z); break;
    case 'fish': castLine(g.cast.x, g.cast.z); break;
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

  // river and stone path
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#3f8fd0';
  g.lineWidth = Math.max(3, RIVER_W * s);
  g.beginPath();
  const zStep = Math.max(2, range / 40);
  for (let z = cz - range * 1.5, first = true; z <= cz + range * 1.5; z += zStep, first = false) {
    const [x, y] = toS(riverX(z), z);
    if (first) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.strokeStyle = '#c9b996';
  g.lineWidth = Math.max(2, PATH_W * s);
  for (const line of PATH_LINES) {
    g.beginPath();
    line.forEach(([px, pz], i) => {
      const [x, y] = toS(px, pz);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }

  drawCableOnMap(g, toS, s);

  // forests around you
  for (const c of chunks.values()) {
    if (!c.forest) continue;
    const [x, y] = toS(c.forest.x, c.forest.z);
    g.beginPath();
    g.arc(x, y, Math.max(4, CHUNK * 0.45 * s), 0, TAU);
    g.fillStyle = 'rgba(20, 70, 25, 0.55)';
    g.fill();
    if (big) {
      g.font = '16px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🌲', x, y);
    }
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
      if (p.type !== 'vet' && p.type !== 'park' && p.type !== 'port' && p.type !== 'cable') continue;
      x = clamp(x, pad, W - pad);
      y = clamp(y, pad, H - pad);
      g.globalAlpha = 0.6;
    }
    g.font = `${big ? 20 : 12}px system-ui, sans-serif`;
    g.fillText(p.icon, x, y);
    const showLabel = p.type === 'vet' || p.type === 'park' || p.type === 'port' || p.type === 'cable' || range <= 60;
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
   Seasons: spring, summer, autumn and winter (4 days each)
   ==================================================================== */
const DAYS_PER_SEASON = 4;
const SEASONS = [
  { id: 'spring', name: 'Spring', icon: '🌸', ground: 0x5aa23a, petal: 0xffb8d6, flowers: true },
  { id: 'summer', name: 'Summer', icon: '☀️', ground: 0x66a836, petal: 0xfff3b0, flowers: true },
  { id: 'autumn', name: 'Autumn', icon: '🍂', ground: 0x8c8a3a, petal: 0xf08a24, flowers: false },
  { id: 'winter', name: 'Winter', icon: '❄️', ground: 0xdde8ee, petal: 0xffffff, flowers: false },
];
const XMAS = { x: -3.6, z: -4.8 };
const seasonProps = { spring: null, summer: null, autumn: null, winter: null };
const xmasLights = [];
const shootingStars = [];
let seasonNow = -1;
let starShowerT = 3;
let starToastDay = 0;

function seasonIndex() {
  return Math.floor((state.day - 1) / DAYS_PER_SEASON) % 4;
}
function season() {
  return SEASONS[seasonNow < 0 ? seasonIndex() : seasonNow];
}
function isWinter() {
  return season().id === 'winter';
}

// Turns a spring colour into the colour for the current season.
const tintHSL = {};
function seasonTint(col, kind) {
  const id = season().id;
  if (id === 'spring') return col;
  col.getHSL(tintHSL);
  let { h, s, l } = tintHSL;
  if (id === 'summer') {
    if (kind !== 'pine') {
      h -= 0.015;
      l += 0.03;
    }
  } else if (id === 'autumn') {
    const v = (l * 37) % 1;
    if (kind === 'grass') {
      h = 0.1 + v * 0.06;
      s = 0.5;
      l = Math.min(0.55, l + 0.08);
    } else if (kind === 'pine') {
      l -= 0.02;
    } else {
      h = 0.02 + v * 0.1;
      s = 0.75;
      l = 0.38 + v * 0.12;
    }
  } else if (kind === 'pine') {
    s *= 0.6;
    l = Math.min(0.5, l + 0.1);
  } else if (kind === 'grass') {
    s *= 0.15;
    l = 0.75 + (l - 0.3) * 0.4;
  } else {
    s *= 0.2;
    l = 0.8;
  }
  return col.setHSL(h, clamp(s, 0, 1), clamp(l, 0, 1));
}

function seasonLeafColor(col) {
  const id = season().id;
  if (id === 'autumn') return col.setHSL(rnd(0, 0.12), 0.8, rnd(0.4, 0.55));
  if (id === 'winter') return col.setHSL(0.6, 0.15, rnd(0.88, 0.97));
  return col.setHSL(rnd(0.12, 0.3), 0.6, rnd(0.4, 0.6));
}

// Applies the season for the current day. Returns true when it changed.
function applySeason(rebuild = true) {
  const i = seasonIndex();
  if (i === seasonNow) return false;
  const first = seasonNow < 0;
  seasonNow = i;
  const S = SEASONS[i];
  const winter = S.id === 'winter';
  mats.ground.color.setHex(S.ground);
  mats.petal.color.setHex(S.petal);
  const col = new THREE.Color();
  for (let k = 0; k < leafMesh.count; k++) leafMesh.setColorAt(k, seasonLeafColor(col));
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  // the river freezes in winter
  mats.water.color.setHex(winter ? 0xd8eef8 : 0x3f97d6);
  mats.water.opacity = winter ? 0.97 : 0.9;
  mats.water.roughness = winter ? 0.05 : 0.15;
  mats.water.map = winter ? null : river.tex;
  mats.water.needsUpdate = true;
  rainMesh.material.color.setHex(winter ? 0xffffff : 0xcfe6ff);
  rainMesh.material.opacity = winter ? 0.9 : 0.5;
  for (const [id, g] of Object.entries(seasonProps)) if (g) g.visible = id === S.id;
  if (winter && fishing.active) stopFishing();
  if (!first) {
    if (rebuild) {
      for (const c of chunks.values()) disposeChunk(c);
      chunks.clear();
      updateChunks(true);
    }
    SFX.chime();
    const extra = {
      spring: ' Flowers are back.',
      summer: ' Watch the stars at night.',
      autumn: ' Autumn fair: lemonade sells for more!',
      winter: ' The river is frozen: time to skate!',
    }[S.id];
    toast(`${S.icon} ${S.name} has arrived!${extra}`);
  }
  return true;
}

function buildSeasonProps() {
  // winter: a Christmas tree with lights and presents next to Capi's house
  const w = new THREE.Group();
  w.position.set(XMAS.x, 0, XMAS.z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), mats.trunk);
  trunk.position.y = 0.25;
  w.add(trunk);
  for (let k = 0; k < 3; k++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1 - k * 0.3, 1.1, 10), mats.xmasTree);
    cone.position.y = 0.9 + k * 0.65;
    w.add(cone);
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), mats.xmasStar);
  star.position.y = 2.75;
  w.add(star);
  const bulbColors = [0xff3b3b, 0xffd23b, 0x3b8bff, 0x4cff6a, 0xff5bd6];
  for (let i = 0; i < 22; i++) {
    const h = rnd(0.5, 2.4);
    const radius = (1 - (h - 0.4) / 2.3) * 1.0 + 0.05;
    const a = rnd(0, TAU);
    const bulb = new THREE.Mesh(geo.smallSphere, new THREE.MeshBasicMaterial({ color: bulbColors[i % bulbColors.length] }));
    bulb.scale.setScalar(0.05);
    bulb.position.set(Math.cos(a) * radius, h, Math.sin(a) * radius);
    w.add(bulb);
    xmasLights.push({ mesh: bulb, ph: rnd(0, TAU) });
  }
  const giftMats = [mats.red, mats.blue, mats.yellow];
  [[0.8, 0.5], [-0.7, 0.7], [0.2, 0.95]].forEach(([x, z], i) => {
    const gift = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), giftMats[i]);
    gift.position.set(x, 0.15, z);
    gift.rotation.y = rnd(0, 1);
    w.add(gift);
  });
  shadowAll(w);
  w.visible = false;
  scene.add(w);
  seasonProps.winter = w;

  // autumn: fair with pumpkins and bunting by the lemonade stand
  const a = new THREE.Group();
  for (const [x, z] of [[STAND.x - 1.6, STAND.z + 1.4], [STAND.x + 2.1, STAND.z + 0.6], [-4.4, 0.9], [-7.2, -0.6], [STAND.x + 1.2, STAND.z + 2.4], [XMAS.x + 0.6, XMAS.z + 0.4]]) {
    const p = new THREE.Mesh(geo.smallSphere, mats.pumpkin);
    p.scale.set(0.36, 0.27, 0.36);
    p.position.set(x, 0.25, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6), mats.lemonLeaf);
    stem.position.set(x, 0.55, z);
    a.add(p, stem);
  }
  for (const x of [-2.4, 2.4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), mats.darkWood);
    pole.position.set(STAND.x + x, 1.3, STAND.z + 0.9);
    a.add(pole);
  }
  const flagMats = [mats.red, mats.yellow, mats.blue, mats.pumpkin];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 3), flagMats[i % flagMats.length]);
    flag.rotation.x = Math.PI;
    flag.position.set(STAND.x - 2.3 + t * 4.6, 2.4 - Math.sin(t * Math.PI) * 0.35, STAND.z + 0.9);
    a.add(flag);
  }
  shadowAll(a);
  a.visible = false;
  scene.add(a);
  seasonProps.autumn = a;
}

function spawnShootingStar() {
  const m = new THREE.Mesh(geo.streak, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, fog: false, depthWrite: false }));
  const a = rnd(0, TAU);
  const start = new THREE.Vector3(camera.position.x + Math.cos(a) * 320, rnd(170, 260), camera.position.z + Math.sin(a) * 320);
  const v = new THREE.Vector3(rnd(-1, 1), -0.35, rnd(-1, 1)).normalize().multiplyScalar(rnd(140, 220));
  m.position.copy(start);
  m.lookAt(start.clone().add(v));
  m.renderOrder = -5;
  scene.add(m);
  shootingStars.push({ mesh: m, v, t: 0, life: rnd(0.6, 1.1) });
}

function updateSeasonal(dt) {
  const id = season().id;
  if (id === 'winter') {
    for (const b of xmasLights) b.mesh.visible = Math.sin(T * 3 + b.ph) > -0.3;
  }
  const night = 1 - state.dayF;
  if (id === 'summer' && night > 0.6 && state.rain < 0.3) {
    if (starToastDay !== state.day) {
      starToastDay = state.day;
      toast('🌠 Star shower tonight! Look up.');
    }
    starShowerT -= dt;
    if (starShowerT <= 0) {
      starShowerT = rnd(1.2, 3.5);
      spawnShootingStar();
    }
  }
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.t += dt;
    s.mesh.position.addScaledVector(s.v, dt);
    s.mesh.material.opacity = clamp(1 - s.t / s.life, 0, 1);
    if (s.t >= s.life) {
      scene.remove(s.mesh);
      s.mesh.material.dispose();
      shootingStars.splice(i, 1);
    }
  }
}

/* ====================================================================
   Economy: coins, lemonade stand with visitors, Lemon Market, missions
   ==================================================================== */
const STAND = { x: 1.5, z: -6 };
const MARKET = { x: 3.5, z: -11.5 };
const STAND_REF = { x: STAND.x, z: STAND.z };
const MARKET_REF = { x: MARKET.x, z: MARKET.z };
const STAND_MAX = 10;
const LEMONADE_PRICE = 5;
const PREMIUM_PRICE = 9;
const FAIR_BONUS = 2;
const ROD_PRICE = 15;
const SELL_PRICES = { fish: 4, goldfish: 20 };
const ACCESSORIES = [
  { id: 'collar', icon: '📿', name: 'Collar', price: 10 },
  { id: 'hat', icon: '🎉', name: 'Party hat', price: 15 },
  { id: 'scarf', icon: '🧣', name: 'Scarf', price: 12 },
];
const DECOR = {
  flowerpot: { price: 6, desc: 'Colourful flowers in a pot.' },
  lantern: { price: 10, desc: 'Glows warmly at night.' },
  bench: { price: 14, desc: 'A wooden bench to sit on.' },
  fence: { price: 4, desc: 'A piece of garden fence.' },
};
const stand = { cups: [], visitors: [], spawnT: 8 };

function lemonadePrice(premium) {
  return (premium ? PREMIUM_PRICE : LEMONADE_PRICE) + (season().id === 'autumn' ? FAIR_BONUS : 0);
}
function standStock() {
  return state.stand.normal + state.stand.premium;
}

function buildStand() {
  standSite = makeSite({
    key: 'stand',
    title: 'Lemonade stand',
    x: STAND.x,
    z: STAND.z,
    rot: 0,
    cost: { type: 'coin', n: STAND_REPAIR_COST },
    unlockText: 'Repair it to make lemonade and sell it to visitors. It takes about 2:30.',
    buildTime: 150,
    stages: [
      { at: 0, name: 'Clearing the old stand' },
      { at: 0.2, name: 'Building the frame' },
      { at: 0.45, name: 'Putting up the umbrella' },
      { at: 0.68, name: 'Painting the sign' },
      { at: 0.86, name: 'Final touches' },
    ],
    doneText: 'The lemonade stand is repaired! Make lemonade and visitors will come 🥤',
    icons: ['🏚', '🚧', '🥤'],
    labels: ['Abandoned stand', 'Repairing…', 'Lemonade stand'],
  });
  const g = new THREE.Group();
  g.position.set(STAND.x, 0, STAND.z);
  scene.add(g);
  const box = (parent, w, h, d, m, x, y, z) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mm.position.set(x, y, z);
    parent.add(mm);
    return mm;
  };

  // the working stand, built piece by piece while it is being repaired
  const normal = new THREE.Group();
  const part = (m, at) => {
    standSite.parts.push({ mesh: m, at, baseY: m.scale.y });
    return m;
  };
  // frame: legs, side panels and the counter top
  for (const [x, z] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) {
    part(box(normal, 0.08, 0.82, 0.08, mats.darkWood, x, 0.41, z), 0.2);
  }
  part(box(normal, 1.8, 0.62, 0.05, mats.wood, 0, 0.45, 0.38), 0.28);
  part(box(normal, 1.8, 0.62, 0.05, mats.wood, 0, 0.45, -0.38), 0.32);
  const top = part(box(normal, 1.95, 0.08, 0.85, mats.wood2, 0, 0.86, 0), 0.38);
  pickable(top, 'stand', STAND_REF);
  // umbrella
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), mats.darkWood);
  pole.position.set(0, 1.2, -0.2);
  normal.add(part(pole, 0.45));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.55, 12), mats.umbrella);
  canopy.position.set(0, 2.45, -0.2);
  normal.add(part(canopy, 0.55));
  // painted sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), mats.signLemonade);
  sign.position.set(0, 0.5, 0.41);
  normal.add(part(pickable(sign, 'stand', STAND_REF), 0.68));
  // final touches: jug, lemon crate, cash box, menu board and stools
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 12), mats.glassLemonade);
  jug.position.set(-0.6, 1.06, 0);
  normal.add(part(jug, 0.86));
  part(box(normal, 0.42, 0.2, 0.3, mats.wood, 0.62, 1.0, 0.18), 0.88);
  for (let i = 0; i < 5; i++) {
    const lemon = new THREE.Mesh(geo.lemon, mats.lemon);
    lemon.scale.setScalar(0.15);
    lemon.rotation.z = Math.PI / 2;
    lemon.position.set(0.5 + (i % 3) * 0.12, 1.14, 0.12 + Math.floor(i / 3) * 0.12);
    normal.add(part(lemon, 0.9));
  }
  part(box(normal, 0.26, 0.12, 0.18, mats.steel, 0.7, 0.96, -0.26), 0.9);
  const board = new THREE.Group();
  board.position.set(-1.35, 0, 0.95);
  board.rotation.y = 0.35;
  for (const sgn of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.03), mats.slate);
    slab.position.set(0, 0.35, sgn * 0.09);
    slab.rotation.x = sgn * 0.25;
    board.add(slab);
  }
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.6), mats.menuBoard);
  menu.position.set(0, 0.36, 0.115);
  menu.rotation.x = 0.25;
  board.add(menu);
  normal.add(part(board, 0.92));
  for (const x of [-1.3, 1.3]) {
    const stool = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), mats.wood2);
    seat.position.y = 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 8), mats.darkWood);
    leg.position.y = 0.25;
    stool.add(seat, leg);
    stool.position.set(x, 0, 0.5);
    normal.add(part(stool, 0.95));
  }
  for (let i = 0; i < 6; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.14, 10), mats.cup);
    cup.position.set(-0.25 + (i % 3) * 0.28, 0.97, -0.12 + Math.floor(i / 3) * 0.24);
    cup.visible = false;
    normal.add(cup);
    stand.cups.push(cup);
  }
  g.add(normal);
  standSite.normal = normal;

  // the abandoned stand
  const ruin = new THREE.Group();
  const parts = [];
  const oldTable = box(ruin, 1.8, 0.6, 0.8, mats.ruinWood, 0.1, 0.28, 0);
  oldTable.rotation.z = 0.12;
  const oldPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), mats.darkWood);
  oldPole.position.set(1.2, 0.08, 0.6);
  oldPole.rotation.set(0, 0.5, Math.PI / 2 - 0.1);
  const oldCanopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 12), mats.ruinCloth);
  oldCanopy.position.set(2.1, 0.35, 1.2);
  oldCanopy.rotation.set(0.4, 0, 1.2);
  const oldJug = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 12), mats.ruinWood);
  oldJug.position.set(-1.1, 0.12, 0.7);
  oldJug.rotation.z = Math.PI / 2;
  ruin.add(oldPole, oldCanopy, oldJug);
  const rSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), mats.signAbandoned);
  rSign.position.set(0.1, 0.32, 0.41);
  rSign.rotation.z = -0.1;
  ruin.add(rSign);
  for (const [x, z] of [[-0.7, 1.1], [0.5, 1.4]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.14, 10), mats.ruinWood);
    cup.position.set(x, 0.05, z);
    cup.rotation.x = Math.PI / 2;
    ruin.add(cup);
  }
  parts.push(oldTable, oldPole, oldCanopy, oldJug, rSign);
  for (const m of parts) pickable(m, 'ruin', standSite);
  g.add(ruin);
  standSite.ruin = ruin;

  buildScaffold(standSite, g, box);
  shadowAll(g);
  obstacles.push({ x: STAND.x, z: STAND.z, r: 1.1, ck: 'static' });
  standSite.poi = addPoi({ type: 'shop', x: STAND.x, z: STAND.z, icon: '🏚', label: 'Abandoned stand', clear: 6 });
  sites.push(standSite);
  setSiteStatus(standSite, 'abandoned', 0);
}

function renderStandCups() {
  stand.cups.forEach((c, i) => {
    c.visible = i < Math.min(stand.cups.length, standStock());
    c.material = i < state.stand.premium ? mats.cupPremium : mats.cup;
  });
}

function openStand() {
  $('standMsg').textContent = '';
  renderStand();
  $('standOverlay').classList.remove('hidden');
}
function renderStand() {
  $('standStock').textContent = `In stock: 🥤 ${state.stand.normal} · 💜 ${state.stand.premium} (max ${STAND_MAX}) · You have 🍋 ${countItem('lemon')} · 🫐 ${countItem('blueberry')}`;
  $('priceNormal').textContent = lemonadePrice(false);
  $('pricePremium').textContent = lemonadePrice(true);
  $('fairNote').classList.toggle('hidden', season().id !== 'autumn');
}

function makeLemonade(premium) {
  const msg = $('standMsg');
  if (standStock() >= STAND_MAX) {
    msg.textContent = `The stand is full (${STAND_MAX} drinks).`;
    return;
  }
  if (countItem('lemon') < 2) {
    msg.textContent = 'You need 2 lemons.';
    return;
  }
  if (premium && countItem('blueberry') < 1) {
    msg.textContent = 'You need 1 blueberry too.';
    return;
  }
  takeItems('lemon', 2);
  if (premium) {
    takeItems('blueberry', 1);
    state.stand.premium++;
  } else {
    state.stand.normal++;
  }
  msg.textContent = '';
  SFX.pour(spatial(STAND.x, STAND.z));
  renderStand();
  renderStandCups();
  toast(premium ? 'Blueberry lemonade ready! 💜' : 'Lemonade ready! 🥤 Visitors will come to buy it.');
}

/* ---------- visitors who buy lemonade ---------- */
function buildVisitor() {
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
  const hatMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rnd(0, 1), 0.6, 0.5), roughness: 0.7 });
  const hat = Math.random() < 0.5
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12), hatMat)
    : new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 12), hatMat);
  hat.position.y = 0.78;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), hatMat);
  brim.position.y = 0.7;
  g.add(hat, brim);
  shadowAll(g);
  return { group: g, blob: makeBlob(0.7), x: 0, z: 0, yaw: 0, moving: false, mode: 'in', wait: 0, ph: rnd(0, TAU) };
}

function spawnVisitor() {
  const v = buildVisitor();
  const idx = stand.visitors.length;
  v.spot = { x: STAND.x + (idx ? 0.75 : -0.65), z: STAND.z + 1.5 };
  v.exit = { x: STAND.x + rnd(-20, 20), z: STAND.z + rnd(14, 22) };
  v.x = v.exit.x;
  v.z = v.exit.z;
  stand.visitors.push(v);
}

function sellTo(v) {
  if (!standStock()) {
    bubble('😢', v.x, 1.2, v.z, { size: 56, bg: false, life: 1.2 });
    return;
  }
  const premium = state.stand.premium > 0 && (state.stand.normal === 0 || Math.random() < 0.5);
  if (premium) state.stand.premium--;
  else state.stand.normal--;
  const price = lemonadePrice(premium);
  state.coins += price;
  SFX.coin(spatial(v.x, v.z));
  bubble(`+${price} 🪙`, v.x, 1.3, v.z, { size: 44, life: 1.3 });
  missionEvent('sell');
  renderStandCups();
  if (!$('standOverlay').classList.contains('hidden')) renderStand();
}

function updateVisitors(dt) {
  const daytime = state.tod >= 7 && state.tod < 20;
  stand.spawnT -= dt;
  if (stand.spawnT <= 0) {
    stand.spawnT = rnd(18, 35) * (state.rain > 0.5 ? 1.6 : 1);
    if (daytime && standSite.status === 'open' && standStock() > 0 && stand.visitors.length < 2 && !state.sleeping) spawnVisitor();
  }
  for (let i = stand.visitors.length - 1; i >= 0; i--) {
    const v = stand.visitors[i];
    v.moving = false;
    if (v.mode === 'in') {
      if (stepTo(v, v.spot.x, v.spot.z, 2.2, dt, 0.1)) {
        v.mode = 'wait';
        v.wait = 2;
      }
    } else if (v.mode === 'wait') {
      v.yaw = angleLerp(v.yaw, Math.atan2(STAND.x - v.x, STAND.z - v.z), Math.min(1, dt * 5));
      v.wait -= dt;
      if (v.wait <= 0) {
        sellTo(v);
        v.mode = 'out';
      }
    } else if (stepTo(v, v.exit.x, v.exit.z, 2.2, dt, 0.2)) {
      scene.remove(v.group);
      scene.remove(v.blob);
      stand.visitors.splice(i, 1);
      continue;
    }
    v.group.position.set(v.x, v.moving ? Math.abs(Math.sin(T * 11 + v.ph)) * 0.06 : 0, v.z);
    v.group.rotation.y = v.yaw;
    v.blob.position.set(v.x, 0.01, v.z);
  }
}

/* ---------- Lemon Market ---------- */
let marketTab = 'pets';
let marketPet = 'dog';

function buildMarket() {
  buildShop({ pos: MARKET, rot: 0, wall: mats.marketWall, roof: mats.marketRoof, sign: mats.signMarket, kind: 'market', ref: MARKET_REF, icon: '🏪', label: 'Lemon Market' });
  obstacles.push({ x: MARKET.x, z: MARKET.z, r: 1.9, ck: 'static' });
}

function openMarket() {
  $('mkMsg').textContent = '';
  renderMarket();
  $('marketOverlay').classList.remove('hidden');
}

function marketRow(icon, title, sub, btnText, onClick, disabled = false) {
  const row = document.createElement('div');
  row.className = 'shop-item';
  const text = document.createElement('div');
  text.className = 'shop-text';
  const b = document.createElement('b');
  b.textContent = `${icon} ${title}`;
  const small = document.createElement('small');
  small.textContent = sub;
  text.append(b, small);
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.type = 'button';
  btn.textContent = btnText;
  btn.disabled = disabled;
  btn.addEventListener('click', onClick);
  row.append(text, btn);
  return row;
}

function renderMarket() {
  $('mkCoins').textContent = state.coins;
  document.querySelectorAll('#marketOverlay .tabs button').forEach((b) => b.classList.toggle('sel', b.dataset.tab === marketTab));
  const body = $('mkBody');
  body.textContent = '';
  if (marketTab === 'pets') {
    const pets = document.createElement('div');
    pets.className = 'shop-pets';
    for (const kind of ['dog', 'cat']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `secondary${marketPet === kind ? ' sel' : ''}`;
      b.textContent = `${kind === 'dog' ? '🐶' : '🐱'} ${animals[kind].name}`;
      b.addEventListener('click', () => {
        marketPet = kind;
        renderMarket();
      });
      pets.append(b);
    }
    body.append(pets);
    const acc = state.acc[marketPet];
    for (const item of ACCESSORIES) {
      if (!acc.owned[item.id]) {
        body.append(marketRow(item.icon, item.name, `${item.price} 🪙`, 'Buy', () => buyAccessory(item)));
      } else {
        const on = !!acc.on[item.id];
        body.append(marketRow(item.icon, item.name, on ? 'Wearing it' : 'Owned', on ? 'Take off' : 'Wear', () => toggleAccessory(item.id)));
      }
    }
  } else if (marketTab === 'garden') {
    for (const [type, d] of Object.entries(DECOR)) {
      body.append(marketRow(ITEMS[type].icon, ITEMS[type].name, `${d.desc} ${d.price} 🪙`, 'Buy', () => buyDecor(type)));
    }
    const note = document.createElement('p');
    note.className = 'md-note';
    note.textContent = 'Select it in your inventory and tap the ground to place it. Tap it again to pick it up.';
    body.append(note);
  } else if (marketTab === 'tools') {
    const has = countItem('rod') > 0;
    body.append(marketRow('🎣', 'Fishing rod', has ? 'You have one.' : `Fish in the river. ${ROD_PRICE} 🪙`, has ? 'Owned' : 'Buy', buyRod, has));
  } else {
    for (const type of ['fish', 'goldfish']) {
      const n = countItem(type);
      body.append(marketRow(ITEMS[type].icon, ITEMS[type].name, `You have ${n}. ${SELL_PRICES[type]} 🪙 each.`, 'Sell all', () => sellAll(type), n === 0));
    }
  }
}

function spend(price) {
  if (state.coins < price) {
    $('mkMsg').textContent = `You need ${price} 🪙. You have ${state.coins}.`;
    return false;
  }
  state.coins -= price;
  $('mkMsg').textContent = '';
  SFX.coin();
  return true;
}

function buyAccessory(item) {
  if (!spend(item.price)) return;
  const acc = state.acc[marketPet];
  acc.owned[item.id] = true;
  acc.on[item.id] = true;
  applyAccessories();
  renderMarket();
  toast(`${animals[marketPet].name} got a ${item.name.toLowerCase()}! ${item.icon}`);
}

function toggleAccessory(id) {
  const acc = state.acc[marketPet];
  acc.on[id] = !acc.on[id];
  applyAccessories();
  renderMarket();
}

function buyDecor(type) {
  if (countItem(type) === 0 && !state.inv.some((s) => !s)) {
    $('mkMsg').textContent = 'Your inventory is full.';
    return;
  }
  if (!spend(DECOR[type].price)) return;
  addItem(type, 1);
  renderMarket();
  toast(`${ITEMS[type].icon} ${ITEMS[type].name} bought. Select it and tap the ground to place it.`);
}

function buyRod() {
  if (countItem('rod') > 0) return;
  if (!state.inv.some((s) => !s)) {
    $('mkMsg').textContent = 'Your inventory is full.';
    return;
  }
  if (!spend(ROD_PRICE)) return;
  addItem('rod', 1);
  renderMarket();
  toast('🎣 Fishing rod bought! Select it and tap the river to fish.');
}

function sellAll(type) {
  const n = countItem(type);
  if (!n) return;
  takeItems(type, n);
  const earned = n * SELL_PRICES[type];
  state.coins += earned;
  SFX.coin();
  renderMarket();
  toast(`Sold ${n} ${ITEMS[type].name.toLowerCase()} for ${earned} 🪙`);
}

/* ---------- pet accessories ---------- */
function accessoryMeshes(a) {
  if (a.accMeshes) return a.accMeshes;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 22), mats.collar);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.02, 0.03);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.06, 8, 22), mats.scarf);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.set(0, -0.06, 0.04);
  a.neck.add(collar, scarf);
  const hat = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), mats.partyHat);
  cone.position.y = 0.13;
  const pom = new THREE.Mesh(geo.smallSphere, mats.yellow);
  pom.scale.setScalar(0.035);
  pom.position.y = 0.27;
  hat.add(cone, pom);
  hat.position.set(0.04, 0.2, 0);
  hat.rotation.z = -0.25;
  a.head.add(hat);
  a.accMeshes = { collar, hat, scarf };
  shadowAll(a.root);
  return a.accMeshes;
}

function applyAccessories() {
  for (const a of animalList) {
    const on = state.acc[a.kind].on;
    const m = accessoryMeshes(a);
    for (const id of Object.keys(m)) m[id].visible = !!on[id];
  }
}

/* ---------- garden decorations ---------- */
const decorItems = [];

function buildDecorMesh(type) {
  const g = new THREE.Group();
  if (type === 'flowerpot') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.3, 12), mats.terracotta);
    pot.position.y = 0.15;
    g.add(pot);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const f = new THREE.Mesh(geo.smallSphere, new THREE.MeshStandardMaterial({ color: FLOWER_COLORS[i % FLOWER_COLORS.length], roughness: 0.7 }));
      f.scale.setScalar(0.08);
      f.position.set(Math.cos(a) * 0.1, 0.42 + (i % 2) * 0.06, Math.sin(a) * 0.1);
      g.add(f);
    }
    const leaves = new THREE.Mesh(geo.smallSphere, mats.berryBush);
    leaves.scale.set(0.18, 0.1, 0.18);
    leaves.position.y = 0.33;
    g.add(leaves);
  } else if (type === 'lantern') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6), mats.darkWood);
    post.position.y = 0.7;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), mats.lanternGlow);
    lamp.position.y = 1.52;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.15, 4), mats.darkWood);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 1.74;
    g.add(post, lamp, cap);
  } else if (type === 'bench') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.45), mats.wood);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.06), mats.wood);
    back.position.set(0, 0.75, -0.2);
    g.add(seat, back);
    for (const x of [-0.6, 0.6]) {
      for (const z of [-0.17, 0.17]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), mats.darkWood);
        leg.position.set(x, 0.22, z);
        g.add(leg);
      }
    }
  } else {
    for (const x of [-0.8, 0.8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), mats.fence);
      post.position.set(x, 0.45, 0);
      g.add(post);
    }
    for (const y of [0.35, 0.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.05), mats.fence);
      rail.position.y = y;
      g.add(rail);
    }
  }
  return g;
}

function spawnDecor(type, x, z, rot) {
  const g = buildDecorMesh(type);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  scene.add(g);
  shadowAll(g);
  const rec = { type, x, z, rot, group: g };
  g.traverse((o) => {
    if (o.isMesh) pickable(o, 'decor', rec);
  });
  decorItems.push(rec);
  return rec;
}

function removeDecor(rec) {
  rec.group.traverse((o) => pickables.delete(o));
  scene.remove(rec.group);
  decorItems.splice(decorItems.indexOf(rec), 1);
}

function placeDecor(type, x, z) {
  const slot = state.inv.findIndex((s) => s && s.type === type);
  if (slot < 0) return;
  if (decorItems.length >= 80) {
    toast('You can place up to 80 decorations.');
    return;
  }
  removeOne(slot);
  spawnDecor(type, x, z, player.yaw);
  SFX.place(spatial(x, z));
  toast(`${ITEMS[type].icon} ${ITEMS[type].name} placed.`);
}

function pickupDecor(rec) {
  if (!addItem(rec.type, 1)) {
    toast('Your inventory is full.');
    return;
  }
  removeDecor(rec);
  SFX.pick(spatial(rec.x, rec.z));
  toast(`${ITEMS[rec.type].name} picked up.`);
}

/* ---------- daily missions ---------- */
const MISSION_POOL = [
  { type: 'feed', min: 1, max: 2, reward: 8, text: (n) => `Feed your pets ${n} time${n > 1 ? 's' : ''}` },
  { type: 'lemon', min: 3, max: 5, reward: 6, text: (n) => `Pick up ${n} lemons` },
  { type: 'berry', min: 2, max: 4, reward: 8, text: (n) => `Pick ${n} blueberries` },
  { type: 'sell', min: 2, max: 3, reward: 10, text: (n) => `Sell ${n} lemonades`, ok: () => !!standSite && standSite.status === 'open' },
  { type: 'pet', min: 3, max: 5, reward: 6, text: (n) => `Pet your animals ${n} times` },
  { type: 'fish', min: 1, max: 2, reward: 12, text: (n) => `Catch ${n} fish`, ok: () => !isWinter() && countItem('rod') > 0 },
  { type: 'park', min: 1, max: 1, reward: 12, text: () => 'Take a pet to a pet park' },
];

function ensureMissions() {
  if (state.missions && state.missions.day === state.day) return;
  const pool = MISSION_POOL.filter((m) => !m.ok || m.ok()).sort(() => Math.random() - 0.5).slice(0, 3);
  state.missions = {
    day: state.day,
    list: pool.map((m) => {
      const goal = m.min + Math.floor(Math.random() * (m.max - m.min + 1));
      return { type: m.type, goal, progress: 0, reward: m.reward + (goal - m.min) * 2, done: false };
    }),
  };
  if (state.day > 1) toast('📋 New daily missions!');
  renderMissions();
}

function missionText(m) {
  const def = MISSION_POOL.find((d) => d.type === m.type);
  return def ? def.text(m.goal) : m.type;
}

function missionEvent(type, n = 1) {
  if (!state.missions) return;
  for (const m of state.missions.list) {
    if (m.type !== type || m.done) continue;
    m.progress = Math.min(m.goal, m.progress + n);
    if (m.progress >= m.goal) {
      m.done = true;
      state.coins += m.reward;
      SFX.coin();
      toast(`📋 Mission complete: ${missionText(m)} · +${m.reward} 🪙`);
    }
  }
  renderMissions();
}

function renderMissions() {
  const list = $('msList');
  if (!list || !state.missions) return;
  list.textContent = '';
  for (const m of state.missions.list) {
    const li = document.createElement('li');
    li.className = m.done ? 'done' : '';
    const top = document.createElement('div');
    top.className = 'ms-top';
    const name = document.createElement('span');
    name.textContent = `${m.done ? '✅' : '⬜'} ${missionText(m)}`;
    const reward = document.createElement('b');
    reward.textContent = `+${m.reward} 🪙`;
    top.append(name, reward);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = `${(m.progress / m.goal) * 100}%`;
    bar.append(fill);
    const count = document.createElement('small');
    count.textContent = `${m.progress} / ${m.goal}`;
    li.append(top, bar, count);
    list.append(li);
  }
  const done = state.missions.list.filter((m) => m.done).length;
  $('missionsBtn').classList.toggle('on', done === state.missions.list.length);
}

/* ---------- fishing ---------- */
const fishing = { active: false, t: 0, biteAt: 0, bite: false, x: 0, z: 0, bob: null, line: null };

function buildFishingGear() {
  const bob = new THREE.Group();
  const top = new THREE.Mesh(geo.smallSphere, mats.red);
  top.scale.setScalar(0.07);
  const bottom = new THREE.Mesh(geo.smallSphere, mats.white);
  bottom.scale.set(0.07, 0.04, 0.07);
  bottom.position.y = -0.03;
  bob.add(top, bottom);
  bob.visible = false;
  scene.add(bob);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  fishing.bob = bob;
  fishing.line = line;

  // the rod in the lemon's hand
  const rod = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 1.1, 6), mats.darkWood);
  stick.position.y = 0.45;
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), mats.steel);
  reel.rotation.z = Math.PI / 2;
  reel.position.y = 0.08;
  rod.add(stick, reel);
  rod.rotation.x = 0.75;
  rod.position.copy(HAND_POS);
  rod.visible = false;
  player.group.add(rod);
  player.hand.rod = rod;
}

// Walks to the bank next to the tapped water and casts there.
function goFish(px, pz) {
  if (isWinter()) {
    toast('The river is frozen. Come back in spring to fish.');
    return;
  }
  let z = pz;
  if (Math.abs(z - BRIDGE_Z) < 2) z += 3;
  const side = Math.sign(player.x - riverX(z)) || -1;
  const bank = { x: riverX(z) + side * (RIVER_W / 2 + 0.5), z };
  const cast = { x: riverX(z) + side * (RIVER_W / 2 - 1.8), z };
  goal = { kind: 'fish', x: bank.x, z: bank.z, range: 0.7, cast };
}

function castLine(cx, cz) {
  if (isWinter()) {
    toast('The river is frozen. Come back in spring to fish.');
    return;
  }
  fishing.active = true;
  fishing.t = 0;
  fishing.biteAt = rnd(2.5, 6);
  fishing.bite = false;
  fishing.x = cx;
  fishing.z = cz;
  fishing.bob.visible = true;
  fishing.line.visible = true;
  player.yaw = Math.atan2(cx - player.x, cz - player.z);
  SFX.splash(spatial(cx, cz));
  toast('🎣 Waiting for a bite…');
}

function stopFishing() {
  fishing.active = false;
  fishing.bob.visible = false;
  fishing.line.visible = false;
}

function updateFishing(dt) {
  if (!fishing.active) return;
  if (dirs.size || goal || selectedType() !== 'rod' || state.sleeping) {
    stopFishing();
    return;
  }
  fishing.t += dt;
  const dip = fishing.bite ? -0.06 + Math.sin(T * 25) * 0.03 : Math.sin(T * 3) * 0.015;
  fishing.bob.position.set(fishing.x, 0.08 + dip, fishing.z);
  const s = Math.sin(player.yaw);
  const c = Math.cos(player.yaw);
  const p = fishing.line.geometry.attributes.position;
  p.setXYZ(0, player.x + s * 0.85 + c * 0.3, 1.25 + player.group.position.y, player.z + c * 0.85 - s * 0.3);
  p.setXYZ(1, fishing.x, 0.12 + dip, fishing.z);
  p.needsUpdate = true;
  if (!fishing.bite && fishing.t >= fishing.biteAt) {
    fishing.bite = true;
    bubble('❗', fishing.x, 0.9, fishing.z, { size: 64, bg: false, life: 0.8 });
    SFX.splash(spatial(fishing.x, fishing.z));
  }
  if (fishing.bite && fishing.t >= fishing.biteAt + 0.7) catchFish();
}

function catchFish() {
  const gold = Math.random() < (season().id === 'summer' ? 0.15 : 0.07);
  const type = gold ? 'goldfish' : 'fish';
  const x = fishing.x;
  const z = fishing.z;
  stopFishing();
  if (!addItem(type, 1)) {
    toast('Your inventory is full. The fish got away.');
    return;
  }
  missionEvent('fish');
  SFX.ding(spatial(x, z));
  bubble(gold ? '🐡✨' : '🐠', x, 1, z, { size: 56, bg: false, life: 1.3 });
  toast(gold ? 'A golden fish! 🐡✨ Sell it at the Lemon Market.' : 'You caught a fish! 🐠 Serve it on a plate or sell it.');
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
    animals: animalList.map((a) => ({ kind: a.kind, name: a.name, x: r2(a.x), z: r2(a.z), friend: r2(a.friend), lastVet: a.lastVet, sick: a.sick })),
    torches: torches.map((t) => [r2(t.x), r2(t.z)]),
    picked: [...picked].slice(-3000),
    vets: vets.map((v) => [r2(v.x), r2(v.z)]),
    vetsV: 2, // vets beyond the river
    parks: parks.map((p) => [r2(p.x), r2(p.z)]),
    chestShop: { status: chestShop.status, left: Math.round(chestShop.left * 10) / 10 },
    standSite: { status: standSite.status, left: Math.round(standSite.left * 10) / 10 },
    cableBase: { status: cableBase.status, left: Math.round(cableBase.left * 10) / 10 },
    cable: serializeCable(),
    coins: state.coins,
    stand: { normal: state.stand.normal, premium: state.stand.premium },
    missions: state.missions,
    acc: state.acc,
    decor: decorItems.map((d) => [d.type, r2(d.x), r2(d.z), r2(d.rot)]),
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
  if (d.vetsV === 2) place(vets, d.vets); // older saves keep the new vets beyond the river
  place(parks, d.parks);

  for (const s of Array.isArray(d.animals) ? d.animals : []) {
    const a = animalList.find((x) => x.kind === s.kind);
    if (!a) continue;
    a.x = num(s.x, a.x);
    a.z = num(s.z, a.z);
    a.friend = clamp(num(s.friend, a.friend), 0, 100);
    a.lastVet = Math.max(1, Math.floor(num(s.lastVet, 1)));
    a.sick = !!s.sick;
    if (typeof s.name === 'string' && NAME_RE.test(s.name)) a.name = s.name;
    a.dueNotified = false;
    a.state = 'idle';
    a.timer = 1;
    a.park = null;
    a.plate = null;
    a.target = null;
    a.home = { x: a.x, z: a.z, r: 3 };
  }
  for (const p of plates) setPlateFood(p, false);
  updatePetLabels();

  while (torches.length) removeTorch(torches[0]);
  for (const t of Array.isArray(d.torches) ? d.torches : []) {
    if (Array.isArray(t) && torches.length < MAX_TORCHES) spawnTorch(num(t[0], 0), num(t[1], 0));
  }

  // Renovations: abandoned, being renovated (the timer continues) or open. Older saves start abandoned.
  clearWorkers();
  renovating = null;
  hideRenovatePopup();
  for (const [site, saved] of [[chestShop, d.chestShop], [standSite, d.standSite], [cableBase, d.cableBase]]) {
    const cs = saved || {};
    let status = STATUSES.includes(cs.status) ? cs.status : 'abandoned';
    if (status === 'building' && renovating) status = 'abandoned'; // only one renovation at a time
    if (status === 'building') renovating = site;
    site.stageIdx = -1;
    setSiteStatus(site, status, status === 'building' ? clamp(num(cs.left, site.buildTime), 0, site.buildTime) : 0);
  }
  if (renovating) {
    spawnWorkers(true);
    setJuneWork(true);
  } else {
    setJuneCostume(false);
  }
  applyCable(d.cable);

  picked.clear();
  for (const k of Array.isArray(d.picked) ? d.picked : []) if (typeof k === 'string') picked.add(k);
  // coins, lemonade stand, missions, accessories and decorations
  state.coins = count(d.coins);
  state.stand.normal = Math.min(STAND_MAX, count(d.stand && d.stand.normal));
  state.stand.premium = Math.min(STAND_MAX - state.stand.normal, count(d.stand && d.stand.premium));
  renderStandCups();
  const ms = d.missions;
  state.missions = ms && Number.isFinite(ms.day) && Array.isArray(ms.list)
    ? { day: ms.day, list: ms.list.filter((m) => m && MISSION_POOL.some((p) => p.type === m.type)).slice(0, 3) }
    : null;
  ensureMissions();
  renderMissions();
  for (const kind of ['dog', 'cat']) {
    const src = (d.acc && d.acc[kind]) || {};
    const pick = (o) => Object.fromEntries(ACCESSORIES.map((a) => [a.id, !!(o && o[a.id])]));
    state.acc[kind] = { owned: pick(src.owned), on: pick(src.on) };
  }
  applyAccessories();
  while (decorItems.length) removeDecor(decorItems[0]);
  for (const it of Array.isArray(d.decor) ? d.decor : []) {
    if (Array.isArray(it) && DECOR[it[0]] && decorItems.length < 80) spawnDecor(it[0], num(it[1], 0), num(it[2], 0), num(it[3], 0));
  }
  stopFishing();
  applySeason(false);

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
  displayName: null,   // public My Day name from profiles/{uid}
  mode: 'signin',      // 'signin' or 'signup' form
  profilePending: null, // display name still to be written after a sign up
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
    btn.textContent = `☁ ${account.displayName || account.user.username} · ${note}`;
  } else {
    btn.textContent = '☁ Save progress with My Day';
  }
  $('mdSignedOut').classList.toggle('hidden', signedIn);
  $('mdSignedIn').classList.toggle('hidden', !signedIn);
  if (signedIn) {
    $('mdUser').textContent = account.displayName
      ? `${account.displayName} (@${account.user.username})`
      : account.user.username;
  }
  const signup = account.mode === 'signup';
  $('mdForm').classList.toggle('hidden', signup);
  $('suForm').classList.toggle('hidden', !signup);
  $('mdIntro').textContent = signup
    ? 'Create a My Day account. It works in this game and in the My Day extension.'
    : 'Sign in with your My Day account to save your progress, load it on any device and earn badges. Without an account the game works the same, but nothing is saved.';
  $('suCreate').disabled = account.busy;
  $('mdStatus').textContent = account.status;
  $('mdError').textContent = account.error;
  $('mdSignIn').disabled = account.busy;
  $('mdSaveNow').disabled = account.busy || !account.ready;
  const canRetry = !account.busy && ((signedIn && (!account.ready || !!account.profilePending)) || (!signedIn && MyDay.hasStoredSession()));
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
  if (!account.profilePending) {
    try {
      account.displayName = await MyDay.loadDisplayName();
    } catch (_) {
      account.displayName = null; // the name is only shown in the game; not critical
    }
  }
  const who = account.displayName || account.user.username;
  try {
    const save = await MyDay.loadSave();
    if (save) {
      applyGame(save);
      account.status = 'Progress loaded from My Day.';
      toast(`Welcome back, ${who}! Progress loaded ☁`);
    } else {
      account.lastSaved = await MyDay.writeSave(serializeGame());
      account.status = 'Your progress is now saved to My Day.';
      toast(`Signed in as ${who}. Progress saved ☁`);
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

function setAccountMode(mode) {
  account.mode = mode;
  account.error = '';
  account.status = '';
  renderAccount();
  setTimeout(() => $(mode === 'signup' ? 'suName' : 'mdUsername').focus(), 50);
}

async function submitSignUp(e) {
  e.preventDefault();
  if (account.busy) return;
  const name = MyDay.normalizeDisplayName($('suName').value);
  const username = MyDay.normalizeUsername($('suUsername').value);
  const password = $('suPassword').value;
  const problem = MyDay.validateDisplayName(name)
    || MyDay.validate(username, password)
    || (password !== $('suConfirm').value ? 'The passwords do not match.' : '');
  if (problem) {
    account.error = problem;
    renderAccount();
    return;
  }
  account.busy = true;
  account.error = '';
  account.status = 'Creating your account…';
  renderAccount();
  try {
    account.user = await MyDay.signUp(username, password);
  } catch (err) {
    account.busy = false;
    account.status = '';
    account.error = err.message;
    renderAccount();
    return;
  }
  $('suPassword').value = '';
  $('suConfirm').value = '';
  account.mode = 'signin';
  account.displayName = name;
  account.profilePending = name;
  await saveProfileName();
  account.busy = false;
  if (!account.user) return; // session ended while saving the profile
  await connectAccount();
  if (!account.profilePending) toast(`Welcome to My Day, ${name}! 🍋`);
}

// Writes profiles/{uid} for a brand-new account (only once, right after sign up).
async function saveProfileName() {
  if (!account.user || !account.profilePending) return;
  try {
    await MyDay.createProfile(account.profilePending);
    account.profilePending = null;
  } catch (e) {
    account.error = `Your account was created, but the display name was not saved yet. Tap Retry. (${e.message})`;
    if (e.expired) handleExpired();
  }
  renderAccount();
}

function signOutAccount() {
  MyDay.signOut();
  clearInterval(account.timer);
  account.user = null;
  account.displayName = null;
  account.profilePending = null;
  account.mode = 'signin';
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
  $('mdCreate').addEventListener('click', () => setAccountMode('signup'));
  $('suBack').addEventListener('click', () => setAccountMode('signin'));
  $('suForm').addEventListener('submit', submitSignUp);
  $('mdSaveNow').addEventListener('click', () => saveToCloud(false));
  $('mdSignOut').addEventListener('click', signOutAccount);
  $('mdRetry').addEventListener('click', async () => {
    if (!account.user) return restoreAccount();
    if (account.profilePending) await saveProfileName();
    if (!account.ready) await connectAccount();
    return undefined;
  });
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
  $('sCoins').textContent = state.coins;
  const h = Math.floor(state.tod);
  const m = Math.floor((state.tod - h) * 60);
  $('timeLbl').textContent = `${season().icon} ${season().name} · Day ${state.day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  $('weatherLbl').textContent = state.rain > 0.5 ? (isWinter() ? '🌨 Snowing' : '🌧 Raining') : isNight() ? '🌙 Night' : '☀️ Clear';
  $('coordLbl').textContent = `X ${Math.round(player.x)} · Z ${Math.round(player.z)}`;
  $('stamFill').style.width = `${state.stamina}%`;
  document.querySelectorAll('#hungerRow .lem').forEach((el, i) => {
    const f = clamp((state.hunger - i * 20) / 20, 0, 1);
    el.style.opacity = String(0.2 + 0.8 * f);
    el.style.filter = f < 0.5 ? 'grayscale(1)' : 'none';
  });
  for (const [k, a] of [['Dog', animals.dog], ['Cat', animals.cat]]) {
    $(`f${k}Name`).textContent = a.name;
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
function petName(kind) {
  return (animals[kind] && animals[kind].name) || NAMES[kind];
}
function labelOf(pk) {
  if (pk.kind === 'plate') return `Serve ${petName(pk.ref.who)}'s food`;
  if (pk.kind === 'dog' || pk.kind === 'cat') return `Pet ${petName(pk.kind)}`;
  if (pk.kind === 'chest') return 'Chest Shop';
  if (pk.kind === 'decor') return `Pick up ${ITEMS[pk.ref.type].name}`;
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
  if (t === 'rod') {
    raycaster.setFromCamera(toNDC(x, y), camera);
    const hit = raycaster.intersectObject(river.water, false)[0];
    if (hit) {
      ripple(x, y, 'Fish here');
      goFish(hit.point.x, hit.point.z);
      return;
    }
  }
  const p = groundAt(x, y);
  if (!p) return;
  if (DECOR[t]) {
    goal = { kind: 'placeDecor', type: t, x: p.x, z: p.z, range: 0.8 };
    ripple(x, y, `Place ${ITEMS[t].name}`);
    return;
  }
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
      if (state.camMode === 'first') state.fpPitch = clamp(state.fpPitch - dy * 0.004, -1.2, 1.2);
      else camPitch = clamp(camPitch + dy * 0.004, 0.12, 1.15);
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
    if (state.camMode === 'third') camDist = clamp(camDist + e.deltaY * 0.006, 3.5, 13);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const typing = (e) => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !$('shopOverlay').classList.contains('hidden')) {
      closeShop();
      return;
    }
    const openPanel = ['standOverlay', 'marketOverlay', 'missionsOverlay', 'cableOverlay'].find((id) => !$(id).classList.contains('hidden'));
    if (e.code === 'Escape' && openPanel) {
      $(openPanel).classList.add('hidden');
      return;
    }
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
    const d = /^Digit([1-7])$/.exec(e.code);
    if (d) selectSlot(Number(d[1]) - 1);
    if (e.code === 'KeyE') useSelected();
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) jump();
    }
    if (e.code === 'KeyF') toggleCall();
    if (e.code === 'KeyV') toggleCamera();
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

  document.querySelectorAll('#dpad button[data-dir]').forEach((b) => {
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

  $('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
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
  $('rnGo').addEventListener('click', () => { ensureAudio(); startRenovation(popupSite); });
  $('standClose').addEventListener('click', () => $('standOverlay').classList.add('hidden'));
  $('cbClose').addEventListener('click', closeCable);
  $('cbGen').addEventListener('click', () => { ensureAudio(); buyGenerator(); });
  $('cbSouth').addEventListener('click', () => { ensureAudio(); buySouthLine(); });
  $('cbRide').addEventListener('click', () => { ensureAudio(); requestRide(); });
  $('makeNormal').addEventListener('click', () => makeLemonade(false));
  $('makePremium').addEventListener('click', () => makeLemonade(true));
  $('mkClose').addEventListener('click', () => $('marketOverlay').classList.add('hidden'));
  document.querySelectorAll('#marketOverlay .tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      marketTab = b.dataset.tab;
      $('mkMsg').textContent = '';
      renderMarket();
    });
  });
  $('missionsBtn').addEventListener('click', () => {
    ensureAudio();
    renderMissions();
    $('missionsOverlay').classList.remove('hidden');
  });
  $('msClose').addEventListener('click', () => $('missionsOverlay').classList.add('hidden'));
  $('shopClose').addEventListener('click', closeShop);
  $('shopTorches').addEventListener('click', () => { openChest(); renderShop(); });
  $('tagDog').addEventListener('click', () => { shopPet = 'dog'; renderShop(); });
  $('tagCat').addEventListener('click', () => { shopPet = 'cat'; renderShop(); });
  $('tagBuy').addEventListener('click', buyNameTag);
  $('tagName').addEventListener('keydown', (e) => { if (e.key === 'Enter') buyNameTag(); });
  $('rnClose').addEventListener('click', () => {
    if (popupSite) popupSite.dismissed = true;
    hideRenovatePopup();
  });

  $('callBtn').addEventListener('click', () => { ensureAudio(); toggleCall(); });
  $('btnSound').addEventListener('click', () => {
    state.muted = !state.muted;
    ensureAudio();
    if (master) master.gain.value = state.muted ? 0 : 0.8;
    $('btnSound').textContent = state.muted ? '🔇 Sound off' : '🔊 Sound on';
  });
  $('btnRain').addEventListener('click', () => { ensureAudio(); toggleRain(); });
  $('btnCam').addEventListener('click', () => { ensureAudio(); toggleCamera(); });
  $('btnHelp').addEventListener('click', () => {
    closeUiMenu();
    $('start').classList.remove('hidden');
  });
  setupUiMenu();
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
let frogT = 4;
function updateAmbient(dt) {
  if (!actx) return;
  if (rainGain) rainGain.gain.setTargetAtTime(0.22 * state.rain * (isWinter() ? 0.15 : 1), actx.currentTime, 0.2);
  const rd = Math.max(0, riverDist(player.x, player.z));
  if (riverGain) riverGain.gain.setTargetAtTime(0.14 * Math.pow(clamp(1 - rd / 30, 0, 1), 2), actx.currentTime, 0.3);
  frogT -= dt;
  if (frogT <= 0) {
    frogT = rnd(3, 7);
    if (isNight() && rd < 25 && !isWinter()) SFX.croak(spatial(riverX(player.z), player.z + rnd(-8, 8)));
  }
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
   Cable car: the base station, the generator, the line to South Port,
   the ports and the cabins (a detachable gondola, like the real ones)
   ==================================================================== */
const CABLE_COST = 30;
const CABLE_GAUGE = 2.6;   // half the distance between the two rope lanes
const CABLE_H0 = 4.0;      // rope height inside the stations
const CABLE_HANG = 1.65;   // from the grip on the rope to the cabin roof
const CABIN_H = 2.1;
const CABLE_SPEED = 6;     // m/s out on the line
const CABLE_SLOW = 0.5;    // m/s through the stations, where the cabins are detached
const CABLE_CABINS = 5;
const CABLE_WHEEL = 4;     // the bullwheel sits this far behind the station centre
const CABLE_MOUTH = 13;    // where the rope leaves the station, measured from the bullwheel
const ROUTE_TIME = 90;     // seconds to build the South Port line
const PORT_RANGE = 30;     // the port only works while you are this close
const PORT_FISH_EVERY = 60;
const PORT_CRATE_MAX = 12;
const CABLE_FARE = 5;       // one-way ticket

const CABLE_BASE = { x: 2, z: 48 };
const SOUTH_PORT = { x: riverX(345) - RIVER_W / 2 - 12.5, z: 345 };
const NORTH_PORT = { x: riverX(-340) - RIVER_W / 2 - 7, z: -340 };

const cableLine = (() => {
  const dx = SOUTH_PORT.x - CABLE_BASE.x;
  const dz = SOUTH_PORT.z - CABLE_BASE.z;
  const len = Math.hypot(dx, dz);
  const u = { x: dx / len, z: dz / len };   // along the line, towards South Port
  const n = { x: u.z, z: -u.x };            // across the line (the up lane is on +n)
  const A = { x: CABLE_BASE.x - u.x * CABLE_WHEEL, z: CABLE_BASE.z - u.z * CABLE_WHEEL };
  const B = { x: SOUTH_PORT.x + u.x * CABLE_WHEEL, z: SOUTH_PORT.z + u.z * CABLE_WHEEL };
  const D = len + 2 * CABLE_WHEEL;
  const towers = [];
  const first = 34;
  const last = D - 34;
  const count = Math.max(1, Math.round((last - first) / 52));
  for (let i = 0; i <= count; i++) {
    let d = first + ((last - first) * i) / count;
    // keep every foundation well away from the river
    for (let k = 0; k < 15 && riverDist(A.x + u.x * d, A.z + u.z * d) < CABLE_GAUGE + 4; k++) d += i < count / 2 ? 3 : -3;
    const end = i === 0 || i === count;
    towers.push({ i, d, h: end ? 10.5 : 15 + 2.5 * Math.sin(i * 2.1), x: A.x + u.x * d, z: A.z + u.z * d });
  }
  const sup = [[0, CABLE_H0], [CABLE_MOUTH, CABLE_H0], ...towers.map((t) => [t.d, t.h]), [D - CABLE_MOUTH, CABLE_H0], [D, CABLE_H0]];
  return { u, n, A, B, D, len, towers, sup, rot: Math.atan2(u.x, u.z), loop: 2 * D + 2 * Math.PI * CABLE_GAUGE };
})();

// Height of the haul rope at distance d from the base bullwheel: straight in the stations,
// with a little sag between the towers.
function ropeHeight(d) {
  const s = cableLine.sup;
  for (let i = 0; i < s.length - 1; i++) {
    const [d0, h0] = s[i];
    const [d1, h1] = s[i + 1];
    if (d <= d1 || i === s.length - 2) {
      const span = d1 - d0;
      const t = clamp((d - d0) / (span || 1), 0, 1);
      const sag = span > 20 ? span * 0.022 : 0;
      return h0 + (h1 - h0) * t - sag * 4 * t * (1 - t);
    }
  }
  return CABLE_H0;
}

// A point on the rope loop: up lane (base → port), around the port bullwheel,
// down lane (port → base), around the base bullwheel.
function loopPoint(s, out = {}) {
  const L = cableLine;
  const R = CABLE_GAUGE;
  const arc = Math.PI * R;
  s = ((s % L.loop) + L.loop) % L.loop;
  if (s < L.D) {
    out.seg = 0;
    out.d = s;
    out.x = L.A.x + L.n.x * R + L.u.x * s;
    out.z = L.A.z + L.n.z * R + L.u.z * s;
    out.y = ropeHeight(s);
  } else if (s < L.D + arc) {
    const th = (s - L.D) / R;
    out.seg = 1;
    out.d = L.D;
    out.x = L.B.x + L.n.x * R * Math.cos(th) + L.u.x * R * Math.sin(th);
    out.z = L.B.z + L.n.z * R * Math.cos(th) + L.u.z * R * Math.sin(th);
    out.y = CABLE_H0;
  } else if (s < 2 * L.D + arc) {
    const d = L.D - (s - L.D - arc);
    out.seg = 2;
    out.d = d;
    out.x = L.A.x - L.n.x * R + L.u.x * d;
    out.z = L.A.z - L.n.z * R + L.u.z * d;
    out.y = ropeHeight(d);
  } else {
    const th = (s - 2 * L.D - arc) / R;
    out.seg = 3;
    out.d = 0;
    out.x = L.A.x - L.n.x * R * Math.cos(th) - L.u.x * R * Math.sin(th);
    out.z = L.A.z - L.n.z * R * Math.cos(th) - L.u.z * R * Math.sin(th);
    out.y = CABLE_H0;
  }
  return out;
}

// Line speed out on the rope; the cabins slow down and speed up again inside the stations.
const loopTmp = {};
function loopSpeed(s) {
  const p = loopPoint(s, loopTmp);
  if (p.seg === 1 || p.seg === 3) return CABLE_SLOW;
  const zd = Math.min(p.d, cableLine.D - p.d);
  const t = clamp((zd - 3) / (CABLE_MOUTH - 3), 0, 1);
  return CABLE_SLOW + (CABLE_SPEED - CABLE_SLOW) * t * t * (3 - 2 * t);
}

// world point from a point in a station's own frame (local z points along the line)
function stationPoint(st, lx, lz) {
  const c = Math.cos(st.rot);
  const s = Math.sin(st.rot);
  return { x: st.x + lx * c + lz * s, z: st.z - lx * s + lz * c };
}
const BASE_ST = { x: CABLE_BASE.x, z: CABLE_BASE.z, rot: cableLine.rot };
const PORT_ST = { x: SOUTH_PORT.x, z: SOUTH_PORT.z, rot: cableLine.rot + Math.PI };
const GEN_POS = stationPoint(BASE_ST, -8.2, 2.5);
const PORT_QUAY = stationPoint(PORT_ST, -11, 0);   // the port's quay on the river bank (its local -x faces the water)
const CABLE_BASE_REF = stationPoint(BASE_ST, 4.3, 7);
const CABLE_PORT_REF = stationPoint(PORT_ST, -4.3, 7);
const GEN_REF = { x: GEN_POS.x, z: GEN_POS.z };
const PORT_CRATE = stationPoint(PORT_ST, -9.5, 2.5);

// Distance from the axis of the line, used to keep trees and random places out of its corridor.
function cableCorridorDist(x, z) {
  const L = cableLine;
  const px = x - L.A.x;
  const pz = z - L.A.z;
  const t = clamp(px * L.u.x + pz * L.u.z, 0, L.D);
  return Math.hypot(px - L.u.x * t, pz - L.u.z * t);
}
// Gravel ground around the stations and the ports (no grass growing through the floors).
function onCableGround(x, z) {
  return Math.hypot(x - CABLE_BASE.x, z - CABLE_BASE.z) < 12 || Math.hypot(x - SOUTH_PORT.x, z - SOUTH_PORT.z) < 12 ||
    Math.hypot(x - PORT_QUAY.x, z - PORT_QUAY.z) < 6 || Math.hypot(x - NORTH_PORT.x, z - NORTH_PORT.z) < 8;
}
function nearCable(x, z) {
  return cableCorridorDist(x, z) < CABLE_GAUGE + 5 || onCableGround(x, z) || Math.hypot(x - GEN_POS.x, z - GEN_POS.z) < 4 ||
    Math.hypot(x - PORT_QUAY.x, z - PORT_QUAY.z) < 14 || Math.hypot(x - NORTH_PORT.x, z - NORTH_PORT.z) < 16;
}

const cable = {
  gen: false,          // generator built
  genOn: false,
  power: 0,            // 0..1, the drive speeds up and brakes smoothly
  south: 'none',       // 'none' | 'building' | 'open'
  southLeft: 0,
  stageIdx: -1,
  fish: 0,
  gold: 0,
  portT: 0,
  cabins: [],
  routeParts: [],
  rope: null,
  wheels: [],
  genGroup: null,
  genPad: null,
  genLamp: null,
  genBody: null,
  exhaustT: 0,
  portPlot: null,
  crateFish: [],
  jumpers: [],
  portObstacles: false,
  laneObstacles: false,
  hum: null,
  overlayAt: 'base',
};
const ride = { wait: null, cab: null, to: null, riders: [] };
const SOUTH_STAGES = [
  { at: 0, name: 'Pouring the tower foundations' },
  { at: 0.12, name: 'Raising the towers' },
  { at: 0.55, name: 'Pulling the haul rope' },
  { at: 0.64, name: 'Building the South Port station' },
  { at: 0.9, name: 'Hanging the cabins' },
];
const routeProgress = () => (cable.south === 'open' ? 1 : cable.south === 'building' ? clamp(1 - cable.southLeft / ROUTE_TIME, 0, 1) : 0);

/* ---------- pieces ---------- */
function cbox(parent, w, h, d, m, x, y, z) {
  const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mm.position.set(x, y, z);
  parent.add(mm);
  return mm;
}
function cyl(parent, rt, rb, h, m, x, y, z, seg = 12) {
  const mm = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mm.position.set(x, y, z);
  parent.add(mm);
  return mm;
}
function signMesh(parent, text, w, h, x, y, z, ry = 0, colors = ['#f4f6f8', '#1d3557', '#1d3557']) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    std(0xffffff, { map: signTexture(text, colors[0], colors[1], colors[2]), roughness: 0.7, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

function buildCableMaterials() {
  mats.concrete = std(0xb9b5ab, { roughness: 0.95 });
  mats.gravel = std(0x9d9584, { roughness: 1 });
  mats.towerPaint = std(0x8c949c, { roughness: 0.55, metalness: 0.45 });
  mats.darkMetal = std(0x2c3136, { roughness: 0.5, metalness: 0.6 });
  mats.rope = std(0x45484b, { roughness: 0.45, metalness: 0.7 });
  mats.rubber = std(0x1b1b1b, { roughness: 0.9 });
  mats.cabinPaint = std(0xc8332b, { roughness: 0.4, metalness: 0.25 });
  mats.cabinGlass = std(0xa9d3e6, { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
  mats.stationRoof = std(0xe9ebec, { roughness: 0.6, metalness: 0.2 });
  mats.stationGlass = std(0x9cc7da, { roughness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  mats.safetyLine = std(0xf2c200, { roughness: 0.7 });
  mats.genPaint = std(0x2f6b3d, { roughness: 0.5, metalness: 0.3 });
  mats.lampOn = new THREE.MeshBasicMaterial({ color: 0x46ff6a });
  mats.lampOff = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  mats.cabinLight = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  mats.hull = std(0xf4f1ea, { roughness: 0.6 });
  mats.hullStripe = std(0x1f5f9e, { roughness: 0.6 });
  mats.net = std(0x6d8a7a, { roughness: 1, transparent: true, opacity: 0.8 });
  mats.ribbon = std(0xff6a00, { roughness: 0.8 });
}

// A station: concrete floor, steel frame, roof, the bullwheel with its drive, guide beams and signs.
// `part(mesh, at)` lets the caller show the pieces one by one while it is built.
function buildStation(g, title, part) {
  const R = CABLE_GAUGE;
  const wz = -CABLE_WHEEL;
  const P = (m, at) => (part ? part(m, at) : m);
  P(cbox(g, 10.4, 0.12, 18.4, mats.concrete, 0, 0.06, 0.5), 0.02);
  for (const x of [-3.72, 3.72]) P(cbox(g, 0.12, 0.02, 13, mats.safetyLine, x, 0.13, 0.5), 0.92);
  // steel frame
  for (const x of [-5.05, 5.05]) {
    for (const z of [-8.2, -2.5, 3.5, 9.3]) P(cbox(g, 0.3, 6.2, 0.3, mats.darkMetal, x, 3.1, z), 0.25 + Math.abs(z) * 0.01);
    P(cbox(g, 0.25, 0.4, 18, mats.darkMetal, x, 6.1, 0.55), 0.38);
  }
  for (const z of [-8.2, -2.5, 3.5, 9.3]) P(cbox(g, 10.4, 0.35, 0.25, mats.darkMetal, 0, 6.1, z), 0.4);
  // back wall (only in the middle: you walk in along the platforms on both sides)
  P(cbox(g, 7.4, 6, 0.25, mats.concrete, 0, 3, -8.75), 0.45);
  // glass above head height on the sides
  for (const x of [-5.1, 5.1]) P(cbox(g, 0.06, 2.6, 17.6, mats.stationGlass, x, 4.6, 0.55), 0.82);
  // bullwheel and its drive
  const wheel = new THREE.Group();
  wheel.position.set(0, CABLE_H0, wz);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.13, 8, 48), mats.darkMetal);
  rim.rotation.x = Math.PI / 2;
  wheel.add(rim);
  for (let k = 0; k < 6; k++) {
    const sp = cbox(wheel, 2 * R, 0.08, 0.14, mats.towerPaint, 0, 0, 0);
    sp.rotation.y = (k * Math.PI) / 6;
  }
  cyl(wheel, 0.35, 0.35, 0.4, mats.towerPaint, 0, 0, 0);
  g.add(wheel);
  P(wheel, 0.52);
  cable.wheels.push(wheel);
  P(cyl(g, 0.16, 0.16, 1.1, mats.darkMetal, 0, CABLE_H0 + 0.6, wz), 0.55);
  P(cbox(g, 3.4, 1.4, 3.8, mats.stationRoof, 0, CABLE_H0 + 1.75, wz - 0.4), 0.58);
  P(cyl(g, 0.45, 0.45, 1.6, mats.towerPaint, 1.2, CABLE_H0 + 1.75, wz - 0.4), 0.6).rotation.z = Math.PI / 2;
  // guide beams the cabins run on through the station, hung from the roof
  for (const x of [-R, R]) {
    P(cbox(g, 0.16, 0.24, 13.2, mats.darkMetal, x, CABLE_H0 + 0.45, wz + 6.6), 0.62);
    for (const z of [-1, 3, 7]) P(cbox(g, 0.06, 6.0 - CABLE_H0 - 0.45, 0.06, mats.darkMetal, x, (6.0 + CABLE_H0 + 0.45) / 2, wz + z + 1), 0.62);
  }
  // roof
  P(cbox(g, 10.9, 0.32, 19, mats.stationRoof, 0, 6.42, 0.5), 0.72);
  P(cbox(g, 10.9, 0.5, 0.12, mats.cabinPaint, 0, 6.25, 10.02), 0.74);
  P(signMesh(g, title, 5.2, 1.3, 0, 5.15, 9.55), 0.8);
  P(signMesh(g, title, 5.2, 1.3, 0, 4.6, -8.9, Math.PI), 0.8);
  // lights under the roof
  for (const z of [-5, 0, 5]) for (const x of [-4.2, 4.2]) P(cbox(g, 0.8, 0.06, 0.25, mats.cabinLight, x, 6.2, z), 0.88);
  // boarding gates
  for (const x of [-4.35, 4.35]) {
    P(cyl(g, 0.05, 0.05, 1.0, mats.steel, x - 0.55, 0.6, 0.5, 8), 0.9);
    P(cyl(g, 0.05, 0.05, 1.0, mats.steel, x + 0.55, 0.6, 0.5, 8), 0.9);
    P(cbox(g, 1.1, 0.05, 0.05, mats.cabinPaint, x, 1.0, 0.5), 0.9);
  }
  // operator booth outside the platform
  P(cbox(g, 2.0, 2.4, 2.0, mats.stationRoof, -6.6, 1.2, 6.5), 0.9);
  P(cbox(g, 2.06, 1.0, 1.7, mats.stationGlass, -6.6, 1.7, 6.5), 0.92);
  P(cbox(g, 2.3, 0.15, 2.3, mats.darkMetal, -6.6, 2.47, 6.5), 0.92);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 40), mats.gravel);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.012;
  g.add(ground);
  P(ground, 0.0);
}

function stationObstacles(st) {
  const list = [];
  const add = (lx, lz, r) => {
    const p = stationPoint(st, lx, lz);
    list.push({ x: p.x, z: p.z, r, ck: 'static' });
  };
  for (const x of [-5.05, 5.05]) for (const z of [-8.2, -2.5, 3.5, 9.3]) add(x, z, 0.3);
  for (let x = -3; x <= 3; x += 1.5) add(x, -8.75, 0.8);
  add(0, -CABLE_WHEEL, CABLE_GAUGE + 0.6);
  for (let z = -CABLE_WHEEL; z <= 8; z += 1.6) add(0, z, 1.5);
  add(-6.6, 6.5, 1.3);
  return list;
}
function laneObstacles(st) {
  const list = [];
  for (const x of [-CABLE_GAUGE, CABLE_GAUGE]) {
    for (let z = -CABLE_WHEEL; z <= 20; z += 1.2) {
      const p = stationPoint(st, x, z);
      list.push({ x: p.x, z: p.z, r: 0.8, ck: 'static' });
    }
  }
  return list;
}

function buildTower(t) {
  const g = new THREE.Group();
  g.position.set(t.x, 0, t.z);
  g.rotation.y = cableLine.rot;
  scene.add(g);
  const R = CABLE_GAUGE;
  const H = t.h;
  cbox(g, 2.3, 0.5, 2.3, mats.concrete, 0, 0.2, 0);
  cbox(g, 1.3, 0.1, 1.3, mats.darkMetal, 0, 0.5, 0);
  const colH = H - 1.25;
  cyl(g, 0.28, 0.48, colH, mats.towerPaint, 0, 0.5 + colH / 2, 0, 16);
  // cross arm with braces
  cbox(g, 2 * R + 1.6, 0.45, 0.55, mats.towerPaint, 0, H - 0.72, 0);
  for (const s of [-1, 1]) {
    const br = cbox(g, 0.14, 1.9, 0.14, mats.towerPaint, s * 0.9, H - 1.55, 0);
    br.rotation.z = s * 0.95;
  }
  // sheave trains: the rope rests on the rubber-lined wheels
  for (const x of [-R, R]) {
    cbox(g, 0.18, 0.2, 2.7, mats.darkMetal, x, H - 0.38, 0);
    cbox(g, 0.1, 0.4, 0.2, mats.darkMetal, x, H - 0.6, 0);
    for (const z of [-1.05, -0.35, 0.35, 1.05]) {
      const w = cyl(g, 0.15, 0.15, 0.09, mats.rubber, x, H - 0.15, z, 14);
      w.rotation.z = Math.PI / 2;
    }
    // rope catcher on the outside
    cbox(g, 0.05, 0.35, 0.5, mats.darkMetal, x + (x > 0 ? 0.22 : -0.22), H - 0.05, 0);
  }
  // maintenance platform, railing and ladder
  cbox(g, 2 * R + 1.6, 0.06, 1.3, mats.darkMetal, 0, H - 1.05, 0);
  for (const z of [-0.63, 0.63]) cbox(g, 2 * R + 1.6, 0.04, 0.04, mats.safetyLine, 0, H - 0.5, z);
  for (const x of [-0.2, 0.2]) cbox(g, 0.04, H - 1.6, 0.04, mats.darkMetal, x, (H - 1.0) / 2 + 0.3, -0.62);
  for (let y = 0.9; y < H - 1.1; y += 0.6) cbox(g, 0.4, 0.03, 0.03, mats.darkMetal, 0, y, -0.62);
  signMesh(g, `${t.i + 1}`, 0.5, 0.5, 0, 2.6, 0.5, 0, ['#ffffff', '#111111', '#111111']);
  shadowAll(g);
  return g;
}

function buildRope() {
  const pts = [];
  const step = 2;
  const L = cableLine;
  const p = {};
  for (let s = 0; s < L.loop; ) {
    loopPoint(s, p);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
    s += p.seg === 1 || p.seg === 3 ? 0.6 : step;
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.035, 5, true), mats.rope);
  rope.castShadow = true;
  rope.frustumCulled = false;
  scene.add(rope);
  return rope;
}

function buildCabin(num) {
  const g = new THREE.Group();          // origin on the rope, at the grip
  cbox(g, 0.36, 0.3, 0.7, mats.darkMetal, 0, 0.02, 0);
  for (const z of [-0.22, 0.22]) {
    const w = cyl(g, 0.1, 0.1, 0.08, mats.rubber, 0.2, 0.16, z, 10);
    w.rotation.z = Math.PI / 2;
  }
  const swing = new THREE.Group();      // the hanger and the body swing a little under the grip
  g.add(swing);
  cbox(swing, 0.09, CABLE_HANG - 0.1, 0.09, mats.darkMetal, 0, -CABLE_HANG / 2 - 0.05, 0);
  cbox(swing, 0.7, 0.08, 0.09, mats.darkMetal, 0, -CABLE_HANG + 0.06, 0);
  const body = new THREE.Group();
  body.position.y = -CABLE_HANG - CABIN_H / 2;
  swing.add(body);
  const half = CABIN_H / 2;
  cbox(body, 1.9, 0.62, 1.9, mats.cabinPaint, 0, -half + 0.31, 0);          // lower body
  cbox(body, 1.84, 1.2, 1.84, mats.cabinGlass, 0, -half + 1.22, 0);         // windows
  for (const x of [-0.9, 0.9]) for (const z of [-0.9, 0.9]) cbox(body, 0.1, 1.2, 0.1, mats.cabinPaint, x, -half + 1.22, z);
  cbox(body, 0.06, 1.2, 0.05, mats.darkMetal, 0, -half + 1.22, 0.93);        // door seam
  cbox(body, 1.96, 0.26, 1.96, mats.cabinPaint, 0, half - 0.15, 0);          // roof
  cbox(body, 1.2, 0.12, 1.2, mats.stationRoof, 0, half + 0.03, 0);
  cbox(body, 0.9, 0.03, 0.4, mats.cabinLight, 0, half - 0.3, 0);             // ceiling light
  for (const x of [-0.62, 0.62]) cbox(body, 0.5, 0.42, 1.6, mats.darkMetal, x, -half + 0.45, 0); // benches
  for (const ry of [0, Math.PI]) signMesh(body, `${num}`, 0.42, 0.3, 0, -half + 0.35, ry ? -0.96 : 0.96, ry, ['#ffffff', '#c8332b', '#c8332b']);
  shadowAll(g);
  g.visible = false;
  scene.add(g);
  return { group: g, swing, num, s: 0, x: 0, y: 0, z: 0, yaw: 0, v: 0, tilt: 0, prevD: 0, floorY: 0 };
}

function buildGenerator() {
  const g = new THREE.Group();
  g.position.set(GEN_POS.x, 0, GEN_POS.z);
  g.rotation.y = cableLine.rot;
  scene.add(g);
  // pad with a sign, before the generator is bought
  const pad = new THREE.Group();
  cbox(pad, 2.8, 0.15, 1.8, mats.concrete, 0, 0.075, 0);
  signMesh(pad, `GENERATOR · ${CABLE_COST} 🪙`, 1.7, 0.42, 0, 0.75, 1.0, 0, ['#fff59d', '#3b2412', '#5a3a1e']);
  for (const x of [-0.75, 0.75]) cyl(pad, 0.03, 0.03, 0.8, mats.darkWood, x, 0.4, 0.98, 6);
  g.add(pad);
  // the generator itself
  const gen = new THREE.Group();
  cbox(gen, 2.8, 0.15, 1.8, mats.concrete, 0, 0.075, 0);
  const body = new THREE.Group();
  body.position.y = 0.15;
  cbox(body, 2.2, 1.15, 1.05, mats.genPaint, 0, 0.62, 0);
  cbox(body, 0.08, 0.9, 0.9, mats.darkMetal, 1.12, 0.62, 0);                 // radiator grille
  for (let y = 0.3; y < 1.0; y += 0.12) cbox(body, 0.1, 0.03, 0.86, mats.towerPaint, 1.13, y, 0);
  cbox(body, 2.25, 0.1, 1.1, mats.darkMetal, 0, 1.24, 0);
  cyl(body, 0.06, 0.06, 0.7, mats.darkMetal, -0.7, 1.55, -0.3, 8);           // exhaust
  cyl(body, 0.09, 0.07, 0.08, mats.darkMetal, -0.7, 1.92, -0.3, 8);
  cbox(body, 0.5, 0.42, 0.06, mats.darkMetal, -0.55, 0.85, 0.55);             // control panel
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mats.lampOff);
  lamp.position.set(-0.55, 0.98, 0.6);
  body.add(lamp);
  const tank = cyl(body, 0.3, 0.3, 1.6, mats.cabinPaint, 0, 0.3, -0.85, 14);
  tank.rotation.z = Math.PI / 2;
  gen.add(body);
  // cable conduit to the station
  cbox(gen, 0.12, 0.08, 4.5, mats.darkMetal, 1.3, 0.04, -2.6).rotation.y = 0.9;
  g.add(gen);
  for (const m of [...pad.children, ...body.children]) if (m.isMesh) pickable(m, 'generator', GEN_REF, 'Generator');
  shadowAll(g);
  obstacles.push({ x: GEN_POS.x, z: GEN_POS.z, r: 1.4, ck: 'static' });
  cable.genGroup = gen;
  cable.genPad = pad;
  cable.genLamp = lamp;
  cable.genBody = body;
}

function buildBoat(parent, x, z, ry, len) {
  const b = new THREE.Group();
  b.position.set(x, 0.05, z);
  b.rotation.y = ry;
  const s = new THREE.Shape();
  s.moveTo(-0.7, -len / 2);
  s.lineTo(0.7, -len / 2);
  s.lineTo(0.75, len * 0.2);
  s.quadraticCurveTo(0.7, len * 0.42, 0, len / 2);
  s.quadraticCurveTo(-0.7, len * 0.42, -0.75, len * 0.2);
  s.lineTo(-0.7, -len / 2);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  hullGeo.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, mats.hull);
  b.add(hull);
  cbox(b, 1.52, 0.1, len * 0.9, mats.hullStripe, 0, 0.48, -len * 0.02);
  cbox(b, 1.2, 0.04, len * 0.75, mats.wood, 0, 0.5, -0.1);
  cbox(b, 1.0, 0.9, 1.1, mats.stationRoof, 0, 0.95, -len * 0.18);            // wheelhouse
  cbox(b, 1.02, 0.35, 1.0, mats.stationGlass, 0, 1.15, -len * 0.18);
  cyl(b, 0.04, 0.05, 2.2, mats.wood, 0, 1.6, len * 0.12, 6);                  // mast
  const net = cbox(b, 0.6, 0.25, 0.8, mats.net, 0.2, 0.66, -len * 0.4);
  net.rotation.y = 0.3;
  shadowAll(b);
  parent.add(b);
  return b;
}

let portBoats = [];
function buildSouthPort() {
  // the quay, a pier, boats, the harbour office, fish crates and the cable car terminal plot
  const g = new THREE.Group();
  g.position.set(PORT_ST.x, 0, PORT_ST.z);
  g.rotation.y = PORT_ST.rot;
  scene.add(g);
  const water = riverX(SOUTH_PORT.z) - RIVER_W / 2;
  const toWater = -(water - SOUTH_PORT.x);     // the quay edge in the port's local x (local -x faces the river)
  const gr = new THREE.Mesh(new THREE.CircleGeometry(7, 32), mats.gravel);
  gr.rotation.x = -Math.PI / 2;
  gr.position.set(-11, 0.013, 0);
  g.add(gr);
  cbox(g, 4.5, 0.12, 16, mats.concrete, toWater + 2.25, 0.06, 0);              // quay
  cbox(g, 0.4, 0.6, 16, mats.concrete, toWater + 0.2, 0.0, 0);                  // quay wall at the water
  for (let z = -7; z <= 7; z += 3.5) cyl(g, 0.12, 0.15, 0.4, mats.darkMetal, toWater + 0.4, 0.45, z, 10); // bollards
  // wooden pier into the river
  cbox(g, 3.5, 0.12, 2.0, mats.wood, toWater - 1.75, 0.34, -2.5);
  for (const x of [-0.6, -1.8, -3.0]) for (const z of [-3.4, -1.6]) cyl(g, 0.11, 0.11, 0.9, mats.darkWood, toWater + x, 0, z, 8);
  portBoats = [buildBoat(g, toWater - 2.6, -6.0, 0.0, 4.6), buildBoat(g, toWater - 2.6, 1.6, Math.PI, 3.8)];
  // harbour office, behind the station
  cbox(g, 2.6, 2.6, 3.4, mats.marketWall, -9.2, 1.3, -12);
  cbox(g, 3.0, 0.25, 3.8, mats.hullStripe, -9.2, 2.72, -12);
  signMesh(g, 'SOUTH PORT', 3.0, 0.65, -9.2, 3.25, -10.2, 0, ['#e3f2fd', '#0d47a1', '#1565c0']);
  // fish crates, nets drying, a lamp post
  for (const [x, z] of [[-9.6, 6.2], [-10.4, 6.9], [-9.4, 7.4]]) cbox(g, 0.8, 0.45, 0.6, mats.wood, x, 0.23, z);
  const crate = cbox(g, 1.1, 0.55, 0.8, mats.wood2, -9.5, 0.28, 2.5);
  pickable(crate, 'portcrate', PORT_CRATE, 'Fish crate');
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(geo.smallSphere, i % 3 ? mats.cone : mats.hullStripe);
    f.scale.set(0.08, 0.06, 0.2);
    f.position.set(-9.85 + (i % 3) * 0.33, 0.6, 2.3 + Math.floor(i / 3) * 0.35);
    f.rotation.y = 0.3 * (i - 2);
    f.visible = false;
    g.add(f);
    cable.crateFish.push(f);
  }
  for (const z of [-4.2, -5.8]) cyl(g, 0.04, 0.04, 1.6, mats.darkWood, -10.6, 0.8, z, 6);
  const net = cbox(g, 0.04, 1.2, 1.5, mats.net, -10.6, 0.95, -5);
  net.rotation.y = 0.05;
  cyl(g, 0.06, 0.08, 3.6, mats.darkMetal, -8.2, 1.8, -7.6, 8);
  cbox(g, 0.35, 0.2, 0.35, mats.cabinLight, -8.2, 3.65, -7.6);
  // where the cable car terminal will be built
  const plot = new THREE.Group();
  for (const [x, z] of [[-5, -8], [5, -8], [-5, 9], [5, 9]]) cyl(plot, 0.04, 0.04, 0.9, mats.wood, x, 0.45, z, 6);
  for (const [x, z, w, d] of [[0, -8, 10, 0.03], [0, 9, 10, 0.03], [-5, 0.5, 0.03, 17], [5, 0.5, 0.03, 17]]) cbox(plot, w, 0.05, d, mats.ribbon, x, 0.7, z);
  signMesh(plot, 'CABLE CAR STATION · SOON', 2.6, 0.6, 0, 1.0, 9.2, 0, ['#fff59d', '#3b2412', '#5a3a1e']);
  g.add(plot);
  cable.portPlot = plot;
  shadowAll(g);
  const office = stationPoint(PORT_ST, -9.2, -12);
  obstacles.push({ x: office.x, z: office.z, r: 2.0, ck: 'static' });
  obstacles.push({ x: PORT_CRATE.x, z: PORT_CRATE.z, r: 0.7, ck: 'static' });
  // the cable car terminal, built together with the line
  const st = new THREE.Group();
  g.add(st);
  buildStation(st, 'SOUTH PORT', (m, at) => routePart(m, 0.64 + at * 0.26));
  for (const m of st.children) pickableDeep(m, 'cableport', CABLE_PORT_REF, 'South Port cable car');
  shadowAll(st);
  addPoi({ type: 'port', x: PORT_QUAY.x, z: PORT_QUAY.z, icon: '⚓', label: 'South Port', clear: 14 });
}

function buildNorthPort() {
  const g = new THREE.Group();
  const rot = Math.PI / 2;
  g.position.set(NORTH_PORT.x, 0, NORTH_PORT.z);
  g.rotation.y = rot;
  scene.add(g);
  // local +z points east, to the river
  const edge = riverX(NORTH_PORT.z) - RIVER_W / 2 - NORTH_PORT.x;
  cbox(g, 14, 0.3, 4, mats.concrete, 0, 0.15, edge - 2);
  cbox(g, 2, 0.12, 3.5, mats.wood, -2, 0.34, edge + 1.5);
  for (const z of [0.8, 2.2, 3.0]) for (const x of [-2.8, -1.2]) cyl(g, 0.11, 0.11, 0.9, mats.darkWood, x, 0, edge + z, 8);
  buildBoat(g, 1.8, edge + 3.4, Math.PI / 2, 4.2);
  // closed boathouse and a locked gate
  cbox(g, 5, 3, 3.6, mats.ruinWood, -3, 1.5, -2);
  cbox(g, 5.4, 0.25, 4.0, mats.roof, -3, 3.1, -2);
  for (let x = -7; x <= 7; x += 2) cyl(g, 0.05, 0.05, 1.6, mats.steel, x, 0.8, -6, 6);
  cbox(g, 14, 0.05, 0.05, mats.steel, 0, 1.5, -6);
  cbox(g, 14, 0.05, 0.05, mats.steel, 0, 0.5, -6);
  cbox(g, 2.4, 1.4, 0.06, mats.darkMetal, 2, 0.85, -6.05);
  signMesh(g, 'NORTH PORT · LOCKED 🔒', 3, 0.7, 2, 2.1, -6.1, Math.PI, ['#ffcdd2', '#b71c1c', '#b71c1c']);
  shadowAll(g);
  obstacles.push({ x: NORTH_PORT.x, z: NORTH_PORT.z, r: 3, ck: 'static' });
  addPoi({ type: 'port', x: NORTH_PORT.x, z: NORTH_PORT.z, icon: '🔒', label: 'North Port (locked)', clear: 16 });
}

function pickableDeep(obj, kind, ref, label) {
  obj.traverse((o) => {
    // floors stay walkable: tapping them walks there instead of opening the panel
    if (!o.isMesh) return;
    const flat = o.geometry.type === 'BoxGeometry' && o.geometry.parameters.height <= 0.13;
    if (o.geometry.type !== 'CircleGeometry' && !flat) pickable(o, kind, ref, label);
  });
}

function routePart(m, at) {
  cable.routeParts.push({ mesh: m, at, baseY: m.scale.y });
  return m;
}

let cableBase = null;
function buildCableCar() {
  buildCableMaterials();
  cableBase = makeSite({
    key: 'cable',
    title: 'Cable Car Base',
    x: CABLE_BASE.x,
    z: CABLE_BASE.z,
    rot: cableLine.rot,
    ws: 2.6,
    hookK: 6,
    cost: { type: 'coin', n: CABLE_COST },
    buildTime: 90,
    popTitle: '🚡 Cable car base',
    goText: 'Build',
    unlockText: 'Build the main station of the cable car. June and the lemon builders need about 1:30.',
    hintText: `The cable car base costs ${CABLE_COST} 🪙.`,
    startText: 'Construction started! June and the lemon builders are on their way 🏗',
    doneText: 'The cable car base is ready! 🚡 Now build the generator and the line to South Port.',
    icons: ['🚡', '🏗', '🚡'],
    labels: ['Cable car (build here)', 'Cable car (building)', 'Cable car'],
    stages: [
      { at: 0, name: 'Pouring the foundation' },
      { at: 0.22, name: 'Raising the steel frame' },
      { at: 0.5, name: 'Installing the bullwheel' },
      { at: 0.7, name: 'Putting on the roof' },
      { at: 0.88, name: 'Testing the brakes' },
    ],
  });
  const g = new THREE.Group();
  g.position.set(CABLE_BASE.x, 0, CABLE_BASE.z);
  g.rotation.y = cableLine.rot;
  scene.add(g);
  const normal = new THREE.Group();
  buildStation(normal, 'CABLE CAR', (m, at) => {
    cableBase.parts.push({ mesh: m, at: 0.02 + at * 0.95, baseY: m.scale.y });
    return m;
  });
  for (const m of normal.children) pickableDeep(m, 'cablebase', CABLE_BASE_REF, 'Cable car');
  g.add(normal);
  cableBase.normal = normal;
  // the plot: survey stakes, ribbons and a sign
  const ruin = new THREE.Group();
  const gravel = cbox(ruin, 10.4, 0.04, 18.4, mats.gravel, 0, 0.02, 0.5);
  for (const [x, z] of [[-5.2, -8.7], [5.2, -8.7], [-5.2, 9.7], [5.2, 9.7]]) cyl(ruin, 0.04, 0.04, 0.9, mats.wood, x, 0.45, z, 6);
  for (const [x, z, w, d] of [[0, -8.7, 10.4, 0.03], [0, 9.7, 10.4, 0.03], [-5.2, 0.5, 0.03, 18.4], [5.2, 0.5, 0.03, 18.4]]) cbox(ruin, w, 0.05, d, mats.ribbon, x, 0.72, z);
  const sign = signMesh(ruin, `CABLE CAR · ${CABLE_COST} 🪙`, 2.4, 0.6, 0, 1.15, 10.1, 0, ['#fff59d', '#3b2412', '#5a3a1e']);
  for (const x of [-1, 1]) cyl(ruin, 0.04, 0.04, 1.2, mats.darkWood, x, 0.6, 10.05, 6);
  // a tall billboard you can see from home
  const board = signMesh(ruin, `🚡 CABLE CAR · BUILD HERE · ${CABLE_COST} 🪙`, 5.2, 1.3, 0, 3.0, -9.4, Math.PI, ['#fff59d', '#c8332b', '#c8332b']);
  for (const x of [-2.3, 2.3]) cyl(ruin, 0.08, 0.08, 3.7, mats.darkWood, x, 1.85, -9.3, 8);
  pickable(board, 'ruin', cableBase, 'Cable car base plot');
  const tripod = new THREE.Group();
  tripod.position.set(2.5, 0, 6);
  for (let k = 0; k < 3; k++) {
    const leg = cyl(tripod, 0.02, 0.02, 1.4, mats.crane, 0, 0.65, 0, 5);
    leg.rotation.set(0.25 * Math.cos((k * TAU) / 3), 0, 0.25 * Math.sin((k * TAU) / 3));
  }
  cbox(tripod, 0.2, 0.18, 0.3, mats.darkMetal, 0, 1.38, 0);
  ruin.add(tripod);
  for (const m of [gravel, sign, ...ruin.children]) if (m.isMesh) pickable(m, 'ruin', cableBase, 'Cable car base plot');
  g.add(ruin);
  cableBase.ruin = ruin;
  buildBigScaffold(cableBase, g);
  shadowAll(g);
  const stObs = stationObstacles(BASE_ST);
  cableBase.onStatus = (status) => {
    if (status !== 'abandoned' && !cableBase.obstaclesOn) {
      cableBase.obstaclesOn = true;
      obstacles.push(...stObs);
    }
  };
  cableBase.poi = addPoi({ type: 'cable', x: CABLE_BASE.x, z: CABLE_BASE.z, icon: '📐', label: 'Cable car base', clear: 16 });
  sites.push(cableBase);
  setSiteStatus(cableBase, 'abandoned', 0);

  // signpost by the path near home
  const post = new THREE.Group();
  post.position.set(5.5, 0, 7);
  cyl(post, 0.06, 0.07, 2.4, mats.darkWood, 0, 1.2, 0, 8);
  const arrow = signMesh(post, '🚡 CABLE CAR · 40 m SOUTH', 1.9, 0.45, 0, 2.0, 0.08, Math.PI, ['#fff59d', '#3b2412', '#5a3a1e']);
  arrow.rotation.y = Math.PI;
  shadowAll(post);
  scene.add(post);
  obstacles.push({ x: 5.5, z: 7, r: 0.25, ck: 'static' });

  buildGenerator();
  for (const t of cableLine.towers) routePart(buildTower(t), 0.05 + (0.5 * t.i) / Math.max(1, cableLine.towers.length - 1));
  cable.rope = buildRope();
  for (let i = 0; i < CABLE_CABINS; i++) cable.cabins.push(buildCabin(i + 1));
  placeCabins();
  buildSouthPort();
  buildNorthPort();
  applyCableVisuals();
}

// A big building site: a tower crane, fences, cones and a pile of steel beams.
function buildBigScaffold(site, g) {
  const sc = new THREE.Group();
  const crane = new THREE.Group();
  crane.position.set(-8.5, 0, -5);
  cbox(crane, 2, 0.6, 2, mats.concrete, 0, 0.3, 0);
  cbox(crane, 0.7, 12, 0.7, mats.crane, 0, 6.6, 0);
  for (let y = 1.2; y < 12; y += 1.2) {
    const d = cbox(crane, 0.06, 1.6, 0.06, mats.crane, 0, y, 0.36);
    d.rotation.z = 0.6;
  }
  const jib = new THREE.Group();
  jib.position.y = 12.7;
  cbox(jib, 0.9, 0.9, 0.9, mats.crane, 0, 0, 0);
  cbox(jib, 0.8, 0.7, 0.8, mats.stationGlass, 0.3, -0.1, 0.7);
  cbox(jib, 11, 0.4, 0.4, mats.crane, 5.5, 0.2, 0);
  cbox(jib, 4, 0.35, 0.35, mats.crane, -2.2, 0.2, 0);
  cbox(jib, 1.2, 0.9, 0.9, mats.concrete, -3.6, -0.2, 0);
  cbox(jib, 0.5, 0.35, 0.5, mats.darkMetal, 7.5, -0.15, 0);
  const cableM = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), mats.steel);
  cableM.position.x = 7.5;
  jib.add(cableM);
  const hook = cbox(jib, 0.3, 0.25, 0.3, mats.darkMetal, 7.5, -2, 0);
  crane.add(jib);
  sc.add(crane);
  // fence panels around the plot
  for (let z = -8; z <= 9; z += 2.4) for (const x of [-6, 6]) {
    cbox(sc, 0.05, 1.8, 2.2, mats.net, x, 0.95, z);
    cyl(sc, 0.03, 0.03, 1.9, mats.steel, x, 0.95, z - 1.1, 5);
  }
  for (const [x, z] of [[2.5, 11], [-2.5, 11], [0, 11.6]]) cyl(sc, 0.0, 0.17, 0.45, mats.cone, x, 0.23, z, 10);
  const wip = signMesh(sc, 'WORK IN PROGRESS', 2.2, 0.6, 0, 1.2, 11.2, 0, ['#ffcc00', '#111111', '#111111']);
  wip.material = mats.signWip;
  // pile of steel beams where the carrier picks them up (matches the worker's pile point)
  const k = site.ws;
  for (let i = 0; i < 6; i++) cbox(sc, 2.4, 0.12, 0.2, mats.towerPaint, -2.7 * k, 0.08 + i * 0.13, 0.7 * k + (i % 2) * 0.3);
  g.add(sc);
  site.scaffold = sc;
  site.jib = jib;
  site.cable = cableM;
  site.hook = hook;
}

function placeCabins() {
  cable.cabins.forEach((c, i) => {
    c.s = (cableLine.loop * i) / CABLE_CABINS + 3;
    poseCabin(c, 0, 0);
  });
}

const capTmp = {};
const capTmp2 = {};
function poseCabin(c, accel, dt) {
  const p = loopPoint(c.s, capTmp);
  const q = loopPoint(c.s + 0.6, capTmp2);
  c.x = p.x;
  c.y = p.y;
  c.z = p.z;
  c.seg = p.seg;
  c.d = p.d;
  c.yaw = Math.atan2(q.x - p.x, q.z - p.z);
  // the cabin swings back when it speeds up and forward when it brakes, plus a little wind
  const target = clamp(-accel * 0.05, -0.2, 0.2);
  c.tilt += (target - c.tilt) * Math.min(1, dt * 2.5);
  c.group.position.set(p.x, p.y, p.z);
  c.group.rotation.y = c.yaw;
  c.swing.rotation.x = c.tilt + Math.sin(T * 1.3 + c.num) * 0.015 * cable.power;
  c.swing.rotation.z = Math.sin(T * 0.9 + c.num * 2) * 0.02 * (1 + state.rain);
  c.floorY = p.y - CABLE_HANG - CABIN_H + 0.12;
}

function applyCableVisuals() {
  const p = routeProgress();
  const building = cable.south === 'building';
  for (const part of cable.routeParts) {
    const t = building ? clamp((p - part.at) / 0.05, 0, 1) : cable.south === 'open' ? 1 : 0;
    part.mesh.visible = t > 0;
    part.mesh.scale.y = part.baseY * Math.max(0.05, t);
  }
  cable.rope.visible = p >= 0.58 && cableBase.status === 'open';
  cable.portPlot.visible = p < 0.64;
  const showCabins = cable.south === 'open' || (building && p >= 0.92);
  for (const c of cable.cabins) c.group.visible = showCabins;
  cable.genPad.visible = !cable.gen;
  cable.genGroup.visible = cable.gen;
  cable.genLamp.material = cable.genOn ? mats.lampOn : mats.lampOff;
  if (cable.south !== 'none' && !cable.towerObstacles) {
    cable.towerObstacles = true;
    for (const t of cableLine.towers) obstacles.push({ x: t.x, z: t.z, r: 1.2, ck: 'static' });
  }
  if (cable.south === 'open' && !cable.laneObstacles) {
    cable.laneObstacles = true;
    obstacles.push(...laneObstacles(BASE_ST), ...laneObstacles(PORT_ST));
  }
  if (p >= 0.64 && !cable.portObstacles) {
    cable.portObstacles = true;
    obstacles.push(...stationObstacles(PORT_ST));
  }
}

function southStageIndex() {
  const p = routeProgress();
  let idx = 0;
  SOUTH_STAGES.forEach((st, i) => {
    if (p >= st.at) idx = i;
  });
  return idx;
}

/* ---------- overlay: generator, lines and rides ---------- */
function openCable(at) {
  cable.overlayAt = at;
  renderCable();
  $('cableOverlay').classList.remove('hidden');
}
function closeCable() {
  $('cableOverlay').classList.add('hidden');
}
function cableRunning() {
  return cable.south === 'open' && cable.gen && cable.genOn;
}
function renderCable() {
  const atBase = cable.overlayAt === 'base';
  $('cbTitle').textContent = atBase ? '🚡 Cable car · Base' : '🚡 Cable car · South Port';
  let status;
  if (cable.south !== 'open') status = 'No line is running yet.';
  else if (!cable.gen) status = 'The line is ready, but it needs a generator to run.';
  else if (!cable.genOn) status = 'Stopped: the generator is off.';
  else status = `Running · ${CABLE_CABINS} cabins · about ${Math.round(cableLine.len)} m to South Port.`;
  $('cbStatus').textContent = status;
  $('cbCoins').textContent = state.coins;
  const gen = $('cbGen');
  if (!cable.gen) {
    $('cbGenTxt').textContent = `Powers the drive. Costs ${CABLE_COST} 🪙.`;
    gen.textContent = 'Build';
    gen.disabled = !atBase;
  } else {
    $('cbGenTxt').textContent = cable.genOn ? 'On · humming quietly' : 'Off';
    gen.textContent = cable.genOn ? 'Turn off' : 'Turn on';
    gen.disabled = !atBase || !!ride.cab;
  }
  if (!atBase && cable.gen) $('cbGenTxt').textContent += ' · switch it at the base';
  const south = $('cbSouth');
  if (cable.south === 'none') {
    $('cbSouthTxt').textContent = `${Math.round(cableLine.len)} m line, ${cableLine.towers.length} towers. Costs ${CABLE_COST} 🪙.`;
    south.textContent = 'Build';
    south.disabled = false;
  } else if (cable.south === 'building') {
    const s = Math.ceil(cable.southLeft);
    $('cbSouthTxt').textContent = `${SOUTH_STAGES[southStageIndex()].name} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    south.textContent = 'Building…';
    south.disabled = true;
  } else {
    $('cbSouthTxt').textContent = 'Open ✓';
    south.textContent = 'Open';
    south.disabled = true;
  }
  const rideBtn = $('cbRide');
  rideBtn.textContent = `${atBase ? '🚡 Ride to South Port' : '🚡 Ride to the base'} · 🪙 ${CABLE_FARE}`;
  rideBtn.disabled = cable.south !== 'open';
  $('cbMsg').textContent = '';
}
function cableMsg(t) {
  $('cbMsg').textContent = t;
}
function buyGenerator() {
  if (cable.gen) {
    toggleGenerator();
    return;
  }
  if (cableBase.status !== 'open') return cableMsg('Build the cable car base first.');
  if (state.coins < CABLE_COST) return cableMsg(`You need ${CABLE_COST} 🪙. You have ${state.coins}.`);
  state.coins -= CABLE_COST;
  cable.gen = true;
  cable.genOn = true;
  SFX.genStart();
  applyCableVisuals();
  refreshHud();
  renderCable();
  toast('The generator is running ⚡');
}
function toggleGenerator() {
  if (!cable.gen) return;
  if (ride.cab) return toast('You cannot switch the generator from a cabin.');
  cable.genOn = !cable.genOn;
  if (cable.genOn) SFX.genStart();
  else SFX.genStop();
  applyCableVisuals();
  if (!$('cableOverlay').classList.contains('hidden')) renderCable();
  toast(cable.genOn ? 'Generator on ⚡ The cabins start moving.' : 'Generator off. The cabins brake and stop.');
}
function buySouthLine() {
  if (cable.south !== 'none') return;
  if (cableBase.status !== 'open') return cableMsg('Build the cable car base first.');
  if (state.coins < CABLE_COST) return cableMsg(`You need ${CABLE_COST} 🪙. You have ${state.coins}.`);
  state.coins -= CABLE_COST;
  cable.south = 'building';
  cable.southLeft = ROUTE_TIME;
  cable.stageIdx = -1;
  SFX.chime();
  applyCableVisuals();
  refreshHud();
  renderCable();
  toast('The South Port line is being built 🏗');
}
function finishSouthLine() {
  cable.south = 'open';
  cable.southLeft = 0;
  placeCabins();
  applyCableVisuals();
  SFX.chime();
  toast(cable.gen ? 'The South Port line is open! 🚡' : 'The South Port line is open! Build the generator to start it ⚡');
  updateBuildChip();
}

function boardSpot(at) {
  const L = cableLine;
  const R = CABLE_GAUGE + 1.75;
  return at === 'base'
    ? { x: L.A.x + L.n.x * R + L.u.x * 2.5, z: L.A.z + L.n.z * R + L.u.z * 2.5 }
    : { x: L.B.x - L.n.x * R - L.u.x * 2.5, z: L.B.z - L.n.z * R - L.u.z * 2.5 };
}
function arriveSpot(at) {
  const L = cableLine;
  const R = CABLE_GAUGE + 1.75;
  return at === 'base'
    ? { x: L.A.x - L.n.x * R + L.u.x * 1.5, z: L.A.z - L.n.z * R + L.u.z * 1.5 }
    : { x: L.B.x + L.n.x * R - L.u.x * 1.5, z: L.B.z + L.n.z * R - L.u.z * 1.5 };
}
function requestRide() {
  if (cable.south !== 'open') return cableMsg('There is no line yet.');
  if (!cable.gen) return cableMsg('The line needs a generator to run.');
  if (!cable.genOn) return cableMsg(cable.overlayAt === 'base' ? 'Turn the generator on first.' : 'The generator at the base is off, so the cabins are stopped.');
  if (state.coins < CABLE_FARE) return cableMsg(`A ticket costs ${CABLE_FARE} 🪙. You have ${state.coins}.`);
  const at = cable.overlayAt;
  const p = boardSpot(at);
  closeCable();
  goal = { kind: 'cableBoard', x: p.x, z: p.z, range: 0.6, at };
}
function startWaiting(at) {
  ride.wait = at;
  toast(`Waiting for the next cabin… The ticket (${CABLE_FARE} 🪙) is paid when you step in. 🚡`);
}
function followersNear() {
  return animalList.filter((a) => state.call && a.friend >= FOLLOW_MIN && Math.hypot(a.x - player.x, a.z - player.z) < 10);
}
function board(c) {
  ride.wait = null;
  if (state.coins < CABLE_FARE) {
    toast(`A ticket costs ${CABLE_FARE} 🪙. You have ${state.coins}.`);
    return;
  }
  state.coins -= CABLE_FARE;
  refreshHud();
  ride.cab = c;
  ride.to = c.seg === 0 ? 'port' : 'base';
  ride.riders = followersNear();
  for (const a of ride.riders) a.root.visible = false;
  goal = null;
  dirs.clear();
  SFX.cableBell();
  const pets = ride.riders.length ? ` ${ride.riders.map((a) => a.name).join(' and ')} ride with you for free.` : '';
  toast(`All aboard! Ticket: ${CABLE_FARE} 🪙.${pets} 🚡`);
}
function alight() {
  const p = arriveSpot(ride.to);
  player.x = p.x;
  player.z = p.z;
  const out = ride.to === 'port' ? 1 : -1;
  player.yaw = Math.atan2(cableLine.u.x * out, cableLine.u.z * out);
  ride.riders.forEach((a, i) => {
    a.x = p.x + (i ? 1.2 : -1.2) * cableLine.u.x;
    a.z = p.z + (i ? 1.2 : -1.2) * cableLine.u.z;
    a.root.visible = true;
  });
  ride.riders = [];
  const to = ride.to;
  ride.cab = null;
  ride.to = null;
  SFX.cableBell();
  toast(to === 'port' ? 'Welcome to South Port ⚓' : 'Back at the cable car base 🚡');
}

/* ---------- every frame ---------- */
function updateCable(dt) {
  // building the line
  if (cable.south === 'building') {
    cable.southLeft = Math.max(0, cable.southLeft - dt);
    const idx = southStageIndex();
    if (idx !== cable.stageIdx) {
      if (cable.stageIdx >= 0) toast(`🚡 South Port line: ${SOUTH_STAGES[idx].name}`);
      cable.stageIdx = idx;
    }
    applyCableVisuals();
    updateBuildChip();
    if (cable.southLeft <= 0) finishSouthLine();
    if (!$('cableOverlay').classList.contains('hidden')) renderCable();
  }
  // generator: hum, vibration and a little exhaust
  const target = cableRunning() ? 1 : 0;
  cable.power += clamp(target - cable.power, -dt / 3, dt / 4);
  if (cable.gen && cable.genOn) {
    cable.genBody.position.x = Math.sin(T * 90) * 0.004;
    cable.exhaustT -= dt;
    if (cable.exhaustT <= 0 && Math.hypot(player.x - GEN_POS.x, player.z - GEN_POS.z) < 40) {
      cable.exhaustT = rnd(0.9, 1.6);
      const e = stationPoint({ x: GEN_POS.x, z: GEN_POS.z, rot: cableLine.rot }, -0.7, -0.3);
      spawnDust(e.x, e.z);
      dustPuffs[dustPuffs.length - 1].sp.position.y = 2.1;
    }
  }
  if (actx) {
    if (!cable.hum) {
      const g = actx.createGain();
      g.gain.value = 0;
      const f = actx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 170;
      for (const [type, hz, v] of [['sawtooth', 47, 1], ['triangle', 94, 0.5]]) {
        const o = actx.createOscillator();
        o.type = type;
        o.frequency.value = hz;
        const og = actx.createGain();
        og.gain.value = v;
        o.connect(og).connect(f);
        o.start();
      }
      f.connect(g).connect(master);
      cable.hum = g;
    }
    const d = Math.hypot(player.x - GEN_POS.x, player.z - GEN_POS.z);
    const v = cable.gen && cable.genOn ? 0.05 * Math.pow(clamp(1 - d / 26, 0, 1), 2) : 0;
    cable.hum.gain.setTargetAtTime(v, actx.currentTime, 0.4);
  }
  // cabins
  if (cable.south === 'open') {
    const spin = cable.power * CABLE_SPEED * dt / CABLE_GAUGE;
    for (const w of cable.wheels) w.rotation.y -= spin;
    for (const c of cable.cabins) {
      const v = loopSpeed(c.s) * cable.power;
      const accel = dt > 0 ? (v - c.v) / dt : 0;
      c.v = v;
      const prevD = c.d;
      c.s = (c.s + v * dt) % cableLine.loop;
      poseCabin(c, accel, dt);
      // a soft clack as the grip runs over the tower wheels
      if (v > 0.1 && (c.seg === 0 || c.seg === 2)) {
        for (const t of cableLine.towers) {
          if ((prevD - t.d) * (c.d - t.d) < 0 && Math.hypot(t.x - player.x, t.z - player.z) < 45) SFX.clack(spatial(t.x, t.z));
        }
      }
    }
  }
  // boarding and riding
  if (ride.wait) {
    const sp = boardSpot(ride.wait);
    if (Math.hypot(player.x - sp.x, player.z - sp.z) > 2.5 || !cableRunning()) {
      ride.wait = null;
    } else {
      const c = cable.cabins.find((cb) => (ride.wait === 'base'
        ? cb.seg === 0 && cb.d > 0.3 && cb.d < 3
        : cb.seg === 2 && cb.d < cableLine.D - 0.3 && cb.d > cableLine.D - 3));
      if (c) board(c);
    }
  }
  if (ride.cab) {
    const c = ride.cab;
    if ((ride.to === 'port' && c.seg === 0 && c.d > cableLine.D - 3) || (ride.to === 'base' && c.seg === 2 && c.d < 3)) alight();
    else for (const a of ride.riders) {
      a.x = c.x;
      a.z = c.z;
      a.root.visible = false;
    }
  }
  updatePort(dt);
}

// South Port: while you are near, the fishermen bring in one fish a minute.
function updatePort(dt) {
  for (const [i, b] of portBoats.entries()) {
    b.position.y = 0.05 + Math.sin(T * 1.3 + i * 2) * 0.04;
    b.rotation.z = Math.sin(T * 0.9 + i) * 0.03;
  }
  const near = Math.hypot(player.x - PORT_QUAY.x, player.z - PORT_QUAY.z) < PORT_RANGE;
  if (near && cable.fish + cable.gold < PORT_CRATE_MAX) {
    cable.portT += dt;
    if (cable.portT >= PORT_FISH_EVERY) {
      cable.portT -= PORT_FISH_EVERY;
      const gold = Math.random() < 0.05;
      if (gold) cable.gold++;
      else cable.fish++;
      fishJump();
      SFX.splash(spatial(PORT_QUAY.x, PORT_QUAY.z));
      bubble(gold ? '+1 🐡' : '+1 🐠', PORT_CRATE.x, 1.6, PORT_CRATE.z, { size: 40, life: 1.6 });
      renderCrate();
    }
  }
  for (let i = cable.jumpers.length - 1; i >= 0; i--) {
    const j = cable.jumpers[i];
    j.t += dt;
    const k = j.t / 0.9;
    j.m.position.set(j.x + j.dx * k, 0.05 + Math.sin(Math.PI * k) * 1.1, j.z + j.dz * k);
    j.m.rotation.x = -Math.PI * (k - 0.5);
    if (k >= 1) {
      scene.remove(j.m);
      cable.jumpers.splice(i, 1);
    }
  }
}
function fishJump() {
  const w = riverX(PORT_QUAY.z);
  const m = new THREE.Mesh(geo.smallSphere, mats.hullStripe);
  m.scale.set(0.1, 0.08, 0.26);
  scene.add(m);
  cable.jumpers.push({ m, t: 0, x: w + rnd(-1.5, 1.5), z: PORT_QUAY.z + rnd(-5, 5), dx: rnd(-0.6, 0.6), dz: rnd(0.8, 1.4) });
}
function renderCrate() {
  const n = cable.fish + cable.gold;
  cable.crateFish.forEach((f, i) => { f.visible = i < Math.min(6, n); });
}
function collectPortFish() {
  if (!cable.fish && !cable.gold) {
    const left = Math.ceil(PORT_FISH_EVERY - cable.portT);
    toast(`The crate is empty. The next fish comes in about ${left} s, while you stay within ${PORT_RANGE} m.`);
    return;
  }
  const g = cable.gold ? addItem('goldfish', cable.gold) : 0;
  cable.gold -= g;
  const f = cable.fish ? addItem('fish', cable.fish) : 0;
  cable.fish -= f;
  renderCrate();
  if (!f && !g) {
    toast('Your inventory is full.');
    return;
  }
  renderInv();
  SFX.pick(spatial(PORT_CRATE.x, PORT_CRATE.z));
  toast(`You took ${f ? `${f} 🐠` : ''}${f && g ? ' and ' : ''}${g ? `${g} 🐡` : ''} from the port crate.`);
}

function cableChipText() {
  if (cable.south !== 'building') return '';
  const s = Math.max(0, Math.ceil(cable.southLeft));
  return `🚡 South Port line · ${SOUTH_STAGES[southStageIndex()].name} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawCableOnMap(g, toS, s) {
  const L = cableLine;
  const [ax, ay] = toS(CABLE_BASE.x, CABLE_BASE.z);
  const [bx, by] = toS(SOUTH_PORT.x, SOUTH_PORT.z);
  if (cable.south === 'none') {
    // the planned line, faint and dashed
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    g.setLineDash([3, 6]);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    g.restore();
    return;
  }
  g.save();
  g.strokeStyle = 'rgba(40,40,40,0.85)';
  g.lineWidth = Math.max(1.5, s * 1.2);
  if (cable.south === 'building') g.setLineDash([5, 4]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#555';
  for (const t of L.towers) {
    const [x, y] = toS(t.x, t.z);
    g.fillRect(x - 2, y - 2, 4, 4);
  }
  if (cable.south === 'open') {
    g.fillStyle = '#c8332b';
    for (const c of cable.cabins) {
      const [x, y] = toS(c.x, c.z);
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

function serializeCable() {
  return {
    gen: cable.gen, on: cable.genOn, south: cable.south,
    left: Math.round(cable.southLeft * 10) / 10, fish: cable.fish, gold: cable.gold, portT: Math.round(cable.portT),
  };
}
function applyCable(d) {
  const c = d && typeof d === 'object' ? d : {};
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  ride.wait = null;
  if (ride.cab) {
    for (const a of ride.riders) a.root.visible = true;
    ride.cab = null;
    ride.riders = [];
  }
  cable.gen = !!c.gen && cableBase.status === 'open';
  cable.genOn = cable.gen && !!c.on;
  cable.south = ['none', 'building', 'open'].includes(c.south) && cableBase.status === 'open' ? c.south : 'none';
  cable.southLeft = cable.south === 'building' ? clamp(n(c.left) || ROUTE_TIME, 0, ROUTE_TIME) : 0;
  cable.stageIdx = -1;
  cable.fish = clamp(Math.floor(n(c.fish)), 0, PORT_CRATE_MAX);
  cable.gold = clamp(Math.floor(n(c.gold)), 0, PORT_CRATE_MAX - cable.fish);
  cable.portT = clamp(n(c.portT), 0, PORT_FISH_EVERY);
  cable.power = cableRunning() ? 1 : 0;
  placeCabins();
  applyCableVisuals();
  renderCrate();
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
  updateCable(dt);
  updatePlayer(dt);
  updateCamera(dt);
  ground.position.set(player.x, 0, player.z);
  // keep the ground pattern fixed in the world while the plane follows the lemon
  mats.ground.map.offset.set(player.x / GROUND_TILE, -player.z / GROUND_TILE);
  windU.uTime.value = T;
  windU.uWind.value = 1 + state.rain * 1.2;
  updatePollen(dt);
  updateEnvironment(dt);
  for (const a of animalList) updateAnimal(a, dt, T);
  updateHealth();
  updateParks(dt);
  for (const c of crows) updateCrow(c, dt, T);
  updateRenovations(dt);
  updateRiver(dt);
  updateFireflies(dt);
  updateVisitors(dt);
  updateFishing(dt);
  updateSeasonal(dt);
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
    applySeason(true);
    ensureMissions();
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
  buildStand();
  buildMarket();
  buildSeasonProps();
  buildRiver();
  buildPath();
  buildBridge();
  buildCableCar();
  generateRandomPois();
  for (const v of vets) buildVet(v);
  for (const pk of parks) buildPark(pk);
  buildAnimals();
  buildCrows();
  buildPlayer();
  buildFlyers();
  buildBeacon();
  buildFireflies();
  buildPollen();
  buildFishingGear();
  applyAccessories();
  applySeason(false);
  ensureMissions();
  renderStandCups();
  updateChunks(true);
}

function startRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xbfe3f5, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
