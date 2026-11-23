/*
  My Day account link for The Lemon Garden.
  Signs in with a My Day account (Firebase Auth REST) and keeps the game save
  and badges in Firestore (REST). The game works the same without an account.
*/

const API_KEY = 'AIzaSyCo4JYefEeciY4TgcUs5GyWm3-4g70ws3M'; // public web key
const PROJECT_ID = 'myday-chat-f21b5';
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
const SIGNUP_API_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
const REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;
const DB_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const STORE_KEY = 'lemonGarden.mydaySession';
const EMAIL_DOMAIN = 'myday.app';

export const BADGE_IDS = ['lemon_1', 'lemon_2', 'lemon_secret'];

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const MIN_PASSWORD = 6;
const MAX_DISPLAY_NAME = 20;
const SIGNUP_ERRORS = {
  EMAIL_EXISTS: 'This username is already taken.',
  INVALID_EMAIL: 'This username is not valid.',
  WEAK_PASSWORD: `Password: at least ${MIN_PASSWORD} characters.`,
  OPERATION_NOT_ALLOWED: 'Creating accounts is turned off right now.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Try again later.',
};
const AUTH_ERRORS = {
  EMAIL_NOT_FOUND: 'No My Day account with this username.',
  INVALID_PASSWORD: 'Wrong password.',
  INVALID_LOGIN_CREDENTIALS: 'Wrong username or password.',
  INVALID_EMAIL: 'This username is not valid.',
  USER_DISABLED: 'This My Day account is disabled.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Try again later.',
};

// { uid, username, refreshToken, idToken, expiresAt }
let session = null;

/* ---------- session storage (only the refresh token, uid and username) ---------- */
function writeStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      uid: session.uid,
      username: session.username,
      refreshToken: session.refreshToken,
    }));
  } catch (_) { /* storage unavailable: the session lasts until reload */ }
}
function readStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return s && s.uid && s.refreshToken ? s : null;
  } catch (_) {
    return null;
  }
}
function clearStore() {
  try { localStorage.removeItem(STORE_KEY); } catch (_) { /* nothing to clear */ }
}

function offlineError() {
  const e = new Error('Could not reach My Day. Check your internet connection and try again.');
  e.offline = true;
  return e;
}

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch (_) {
    throw offlineError();
  }
}

/* ---------- auth ---------- */
export function currentUser() {
  return session ? { uid: session.uid, username: session.username } : null;
}

export function hasStoredSession() {
  return !!readStore();
}

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function validate(username, password) {
  if (!USERNAME_RE.test(username)) return 'Username: 3–20 characters, lowercase letters, numbers and _ only.';
  if (String(password || '').length < MIN_PASSWORD) return `Password: at least ${MIN_PASSWORD} characters.`;
  return '';
}

export function normalizeDisplayName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

export function validateDisplayName(name) {
  if (!name) return 'Display name: required.';
  if (name.length > MAX_DISPLAY_NAME) return `Display name: at most ${MAX_DISPLAY_NAME} characters.`;
  return '';
}

function errorCode(body) {
  return String((body.error && body.error.message) || '').split(/[\s:]/)[0];
}

function startSession(body, username) {
  session = {
    uid: body.localId,
    username,
    refreshToken: body.refreshToken,
    idToken: body.idToken,
    expiresAt: Date.now() + Number(body.expiresIn || 3600) * 1000,
  };
  writeStore();
}

// Creates a My Day account (Firebase Auth) and signs in with it.
export async function signUp(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  const problem = validate(username, password);
  if (problem) throw new Error(problem);
  const res = await request(SIGNUP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@${EMAIL_DOMAIN}`, password, returnSecureToken: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(SIGNUP_ERRORS[errorCode(body)] || 'Could not create the account. Please try again.');
  startSession(body, username);
  return currentUser();
}

export async function signIn(rawUsername, password) {
  const username = normalizeUsername(rawUsername);
  const problem = validate(username, password);
  if (problem) throw new Error(problem);
  const res = await request(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@${EMAIL_DOMAIN}`, password, returnSecureToken: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(AUTH_ERRORS[errorCode(body)] || 'Sign in failed. Please try again.');
  startSession(body, username);
  return currentUser();
}

async function refreshToken() {
  const res = await request(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id_token) {
    signOut();
    const e = new Error('Your My Day session has expired. Please sign in again.');
    e.expired = true;
    throw e;
  }
  session.idToken = body.id_token;
  session.refreshToken = body.refresh_token || session.refreshToken;
  session.uid = body.user_id || session.uid;
  session.expiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
  writeStore();
}

// Restores a stored session after a reload. Resolves to the user, or null when there is none.
export async function restoreSession() {
  const s = readStore();
  if (!s) return null;
  session = { uid: s.uid, username: s.username, refreshToken: s.refreshToken, idToken: null, expiresAt: 0 };
  try {
    await refreshToken();
  } catch (e) {
    if (!e.expired) session = null; // offline: keep the stored session for the next try
    throw e;
  }
  return currentUser();
}

// Clears only the game's own session.
export function signOut() {
  session = null;
  clearStore();
}

async function idToken() {
  if (!session) throw new Error('Not signed in.');
  if (!session.idToken || Date.now() > session.expiresAt - 60000) await refreshToken();
  return session.idToken;
}

/* ---------- Firestore REST ---------- */
async function firestore(method, path, fields) {
  const send = async () => request(`${DB_URL}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${await idToken()}`, 'Content-Type': 'application/json' },
    body: fields ? JSON.stringify({ fields }) : undefined,
  });
  let res = await send();
  if (res.status === 401 && session) {
    session.idToken = null; // token rejected: refresh once and retry
    res = await send();
  }
  return res;
}

async function readDocument(path) {
  const res = await firestore('GET', path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read from My Day (error ${res.status}).`);
  const body = await res.json();
  return body.fields || {};
}

async function writeDocument(path, fields) {
  const res = await firestore('PATCH', path, fields);
  if (!res.ok) throw new Error(`Could not save to My Day (error ${res.status}).`);
}

// gameSaves/{uid}: { data: JSON string, savedAt: timestamp }
export async function loadSave() {
  const fields = await readDocument(`gameSaves/${session.uid}`);
  if (!fields || !fields.data || typeof fields.data.stringValue !== 'string') return null;
  try {
    return JSON.parse(fields.data.stringValue);
  } catch (_) {
    return null;
  }
}

export async function writeSave(data) {
  const savedAt = new Date();
  await writeDocument(`gameSaves/${session.uid}`, {
    data: { stringValue: JSON.stringify(data) },
    savedAt: { timestampValue: savedAt.toISOString() },
  });
  return savedAt;
}

// gameProfiles/{uid}: lemon_1, lemon_2, lemon_secret (true once earned) and updatedAt
export async function loadBadges() {
  const fields = (await readDocument(`gameProfiles/${session.uid}`)) || {};
  const badges = {};
  for (const id of BADGE_IDS) badges[id] = !!(fields[id] && fields[id].booleanValue === true);
  return badges;
}

// Writes every earned badge as true. Badges that are not earned are left out, never written as false.
export async function writeBadges(badges) {
  const fields = {};
  for (const id of BADGE_IDS) if (badges[id]) fields[id] = { booleanValue: true };
  if (!Object.keys(fields).length) return;
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  await writeDocument(`gameProfiles/${session.uid}`, fields);
}

// profiles/{uid}: the My Day profile; "name" is the public display name.
export async function loadDisplayName() {
  const fields = await readDocument(`profiles/${session.uid}`);
  return fields && fields.name && typeof fields.name.stringValue === 'string' ? fields.name.stringValue : null;
}

// Only used right after an account is created. Writing without updateMask replaces the
// whole document, so this must never run for an existing profile (it would drop bio/showcase).
export async function createProfile(name) {
  await writeDocument(`profiles/${session.uid}`, { name: { stringValue: name } });
}
