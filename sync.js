/* =========================================================
   Sincronización con Firebase (Firestore + inicio con Google)
   Se carga solo si firebase-config.js tiene la configuración.
   Usa las variables globales de app.js: db, estado, render,
   guardarLocal, toast, esc.
   ========================================================= */
import { initializeApp } from './lib/firebase/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut, connectAuthEmulator, signInWithCredential
} from './lib/firebase/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, query, where, getDocs, setDoc, updateDoc, onSnapshot, writeBatch,
  arrayUnion, arrayRemove, serverTimestamp
} from './lib/firebase/firebase-firestore.js';

const COLS = ['gastos', 'pagos', 'tareas'];
const cfg = window.FIREBASE_CONFIG;
const app = initializeApp(cfg);
const auth = getAuth(app);
const fs = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true
});
if (cfg.emulador) { // solo para pruebas locales
  connectAuthEmulator(auth, `http://${cfg.emulador}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(fs, cfg.emulador, 8080);
  // Inicio de sesión simulado, solo disponible con el emulador
  window.__entrarPrueba = (email, uid) => signInWithCredential(auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email, email_verified: true })));
}

const s = {
  user: null, hogar: null, estado: 'desconectado', error: null,
  espejo: new Map(),        // 'col/id' -> contenido que ya tiene Firestore
  listos: new Set(), ajustesConocidos: false, pendiente: false, subs: []
};

/* ---------- utilidades ---------- */
function estable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : estable(x)).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + estable(v[k])).join(',') + '}';
}
const limpio = o => JSON.parse(JSON.stringify(o));
const ajustesCompartidos = () => ({ tc: db.ajustes.tc, tcFecha: db.ajustes.tcFecha || null, categorias: db.ajustes.categorias });
const prefKey = uid => 'misecretaria.hogar.' + uid;
function leerPref(uid) { try { return localStorage.getItem(prefKey(uid)); } catch (e) { return null; } }
function guardarPref(uid, id) { try { localStorage.setItem(prefKey(uid), id); } catch (e) { /* nada */ } }

function mensajeError(e) {
  const c = (e && e.code) || '';
  if (c.includes('unauthorized-domain')) return 'Falta autorizar este sitio en Firebase (Authentication → Configuración → Dominios autorizados).';
  if (c.includes('operation-not-allowed') || c.includes('configuration-not-found')) return 'Activa el acceso con Google en Firebase (Authentication → Método de acceso → Google).';
  if (c.includes('permission-denied')) return 'Firebase rechazó el acceso. Revisa que pegaste las reglas de Firestore.';
  if (c.includes('network-request-failed') || c.includes('unavailable')) return 'Sin conexión a internet. Se sincronizará cuando vuelva.';
  if (c.includes('invalid-api-key') || c.includes('api-key-not-valid')) return 'La configuración de Firebase no es válida (apiKey).';
  return 'Error de sincronización: ' + ((e && e.message) || e);
}

function renderSeguro() {
  const a = document.activeElement;
  if (a && a.closest && a.closest('#vista') && a.matches('input, textarea, select')) return;
  render();
}
function avisar() {
  indicador();
  if (estado.tab === 'ajustes') renderSeguro();
}
function indicador() {
  const el = document.getElementById('syncChip');
  if (!el) return;
  let clase = 'off', titulo = 'Sincronización apagada: entra con Google en Ajustes';
  if (s.estado === 'error') { clase = 'error'; titulo = s.error || 'Error de sincronización'; }
  else if (s.estado === 'conectando' || s.estado === 'sincronizando') { clase = 'pend'; titulo = 'Conectando…'; }
  else if (s.estado === 'activo') {
    if (!navigator.onLine) { clase = 'pend'; titulo = 'Sin internet: los cambios se subirán al reconectar'; }
    else if (s.pendiente) { clase = 'pend'; titulo = 'Subiendo cambios…'; }
    else { clase = 'ok'; titulo = 'Sincronizado'; }
  }
  el.hidden = false;
  el.className = 'sync-chip ' + clase;
  el.title = titulo;
  el.setAttribute('aria-label', titulo);
}

/* ---------- conexión ---------- */
function desconectar() {
  s.subs.forEach(u => u());
  s.subs = [];
  s.hogar = null;
  s.espejo.clear();
  s.listos.clear();
  s.ajustesConocidos = false;
  s.pendiente = false;
}

async function conectar(user) {
  s.estado = 'conectando'; s.error = null; avisar();
  const email = (user.email || '').toLowerCase();
  const pref = leerPref(user.uid);
  let hogar = null;
  try {
    const snap = await getDocs(query(collection(fs, 'hogares'), where('emails', 'array-contains', email)));
    const hogares = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    hogar = hogares.find(h => h.id === pref) || hogares.find(h => h.dueno !== user.uid) || hogares.find(h => h.id === user.uid);
    if (!hogar) {
      hogar = { id: user.uid, dueno: user.uid, emails: [email], nombre: 'Hogar de ' + (user.displayName || email) };
      const { id, ...datos } = hogar;
      await setDoc(doc(fs, 'hogares', id), { ...datos, creado: serverTimestamp() });
    }
  } catch (e) {
    if (!pref) throw e;          // primera vez: necesita internet
    hogar = { id: pref };        // sin conexión: usar el último hogar conocido
  }
  if (s.user !== user) return;   // cambió la sesión mientras esperábamos
  s.hogar = hogar;
  guardarPref(user.uid, hogar.id);
  s.estado = 'sincronizando'; avisar();

  const base = ['hogares', hogar.id];
  s.subs.push(onSnapshot(doc(fs, ...base), d => {
    if (d.exists()) s.hogar = { id: d.id, ...d.data() };
    avisar();
  }, fallo));
  for (const col of COLS) {
    s.subs.push(onSnapshot(collection(fs, ...base, col), { includeMetadataChanges: true }, snap => alCambiar(col, snap), fallo));
  }
  s.subs.push(onSnapshot(doc(fs, ...base, 'config', 'ajustes'), { includeMetadataChanges: true }, alCambiarAjustes, fallo));
}

function fallo(e) {
  console.warn(e);
  s.error = mensajeError(e);
  s.estado = 'error';
  avisar();
}

function marcarListo(nombre) {
  if (s.listos.has(nombre)) return;
  s.listos.add(nombre);
  if (s.listos.size === COLS.length + 1 && s.estado !== 'activo') {
    s.estado = 'activo';
    empujar();               // primera vez: sube lo que solo existe en este dispositivo
    avisar();
  }
}

const pendientes = {};
function actualizarPendiente(nombre, snap) {
  pendientes[nombre] = snap.metadata.hasPendingWrites;
  s.pendiente = Object.values(pendientes).some(Boolean);
}

function alCambiar(col, snap) {
  let cambio = false;
  for (const ch of snap.docChanges()) {
    const key = col + '/' + ch.doc.id;
    if (ch.type === 'removed') {
      db[col] = db[col].filter(x => x.id !== ch.doc.id);
      s.espejo.delete(key);
    } else {
      const data = { ...ch.doc.data(), id: ch.doc.id };
      const j = estable(data);
      if (s.espejo.get(key) === j && db[col].some(x => x.id === data.id && estable(x) === j)) continue;
      const i = db[col].findIndex(x => x.id === data.id);
      if (i >= 0) db[col][i] = data; else db[col].push(data);
      s.espejo.set(key, j);
    }
    cambio = true;
  }
  actualizarPendiente(col, snap);
  if (cambio) { guardarLocal(); renderSeguro(); }
  marcarListo(col);
  indicador();
}

function alCambiarAjustes(d) {
  const key = 'config/ajustes';
  if (d.exists()) {
    s.ajustesConocidos = true;
    const a = d.data();
    const j = estable({ tc: a.tc, tcFecha: a.tcFecha || null, categorias: a.categorias });
    if (s.espejo.get(key) !== j) {
      s.espejo.set(key, j);
      if (estable(ajustesCompartidos()) !== j) {
        Object.assign(db.ajustes, { tc: a.tc, tcFecha: a.tcFecha || null, categorias: a.categorias });
        guardarLocal(); renderSeguro();
      }
    }
  } else if (!d.metadata.fromCache) {
    s.ajustesConocidos = true;   // el servidor confirma que no hay ajustes: se suben los locales
  }
  actualizarPendiente('config', d);
  marcarListo('config');
  if (s.estado === 'activo') empujar();
  indicador();
}

/* ---------- subir cambios locales ---------- */
function empujar() {
  if (s.estado !== 'activo' || !s.hogar) return;
  const base = ['hogares', s.hogar.id];
  const ops = [];
  for (const col of COLS) {
    const vivos = new Set();
    for (const it of db[col]) {
      const key = col + '/' + it.id;
      vivos.add(key);
      const j = estable(it);
      if (s.espejo.get(key) !== j) {
        s.espejo.set(key, j);
        ops.push(b => b.set(doc(fs, ...base, col, it.id), limpio(it)));
      }
    }
    for (const key of [...s.espejo.keys()]) {
      if (key.startsWith(col + '/') && !vivos.has(key)) {
        s.espejo.delete(key);
        const id = key.slice(col.length + 1);
        ops.push(b => b.delete(doc(fs, ...base, col, id)));
      }
    }
  }
  if (s.ajustesConocidos) {
    const a = ajustesCompartidos();
    const j = estable(a);
    if (s.espejo.get('config/ajustes') !== j) {
      s.espejo.set('config/ajustes', j);
      ops.push(b => b.set(doc(fs, ...base, 'config', 'ajustes'), limpio(a)));
    }
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(fs);
    ops.slice(i, i + 400).forEach(f => f(b));
    b.commit().catch(fallo);
  }
  if (ops.length) { s.pendiente = true; indicador(); }
}

/* ---------- acciones ---------- */
async function entrar() {
  s.error = null;
  const prov = new GoogleAuthProvider();
  prov.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, prov);
  } catch (e) {
    const c = e.code || '';
    if (c.includes('popup-blocked') || c.includes('operation-not-supported')) return signInWithRedirect(auth, prov);
    if (c.includes('popup-closed') || c.includes('cancelled-popup')) return;
    s.error = mensajeError(e); avisar();
  }
}
async function salir() {
  if (!confirm('¿Cerrar sesión? Tus datos se quedan en este dispositivo, pero dejarán de sincronizarse.')) return;
  await signOut(auth);
  toast('Sesión cerrada');
}
async function compartir(email) {
  email = (email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Escribe un correo válido'); return; }
  try {
    await updateDoc(doc(fs, 'hogares', s.hogar.id), { emails: arrayUnion(email) });
    toast('Acceso dado a ' + email);
  } catch (e) { toast(mensajeError(e)); }
}
async function quitarAcceso(email) {
  if (!confirm(`¿Quitar el acceso de ${email}? Dejará de ver y editar tus datos.`)) return;
  try { await updateDoc(doc(fs, 'hogares', s.hogar.id), { emails: arrayRemove(email) }); toast('Acceso quitado'); }
  catch (e) { toast(mensajeError(e)); }
}

function htmlAjustes() {
  const u = s.user;
  let h = `<h3>Sincronización</h3>`;
  if (!u) {
    return h + `<p class="muted small">Entra con tu cuenta de Google para tener los mismos datos en el celular y en la laptop,
      con copia automática en la nube. Tus datos actuales se suben solos.</p>
      ${s.error ? `<p class="small txt-danger">${esc(s.error)}</p>` : ''}
      <div class="acciones"><button class="btn primary" data-action="sync-entrar">Entrar con Google</button></div>`;
  }
  const textoEstado = {
    conectando: 'Conectando…', sincronizando: 'Descargando tus datos…', error: s.error || 'Error',
    activo: !navigator.onLine ? 'Sin internet: los cambios se subirán al reconectar.' : s.pendiente ? 'Subiendo cambios…' : 'Todo sincronizado ✓'
  }[s.estado] || '';
  h += `<p class="small">Conectado como <strong>${esc(u.email)}</strong></p>
    <p class="small ${s.estado === 'error' ? 'txt-danger' : 'muted'}">${esc(textoEstado)}</p>`;
  const hog = s.hogar;
  if (hog && hog.dueno && hog.emails) {
    if (hog.dueno === u.uid) {
      const otros = hog.emails.filter(e => e !== (u.email || '').toLowerCase());
      h += `<h3>Compartir con un familiar</h3>
        <p class="muted small">La persona entra a la app con su cuenta de Google y verá y editará los mismos gastos, pagos y pendientes.</p>
        ${otros.map(e => `<div class="fila"><span class="fila-main"><span class="fila-titulo">${esc(e)}</span></span>
          <button class="btn-sm ghost" data-action="sync-quitar" data-email="${esc(e)}">Quitar</button></div>`).join('')}
        <form id="fCompartir" class="fila-form">
          <label class="lbl">Correo de Google<input name="email" type="email" inputmode="email" placeholder="familiar@gmail.com" required></label>
          <button class="btn ghost" type="submit">Dar acceso</button>
        </form>`;
    } else {
      h += `<p class="muted small">Estás usando los datos compartidos de <strong>${esc(hog.emails[0] || 'otra cuenta')}</strong>.</p>`;
    }
  }
  return h + `<div class="acciones"><button class="btn ghost" data-action="sync-salir">Cerrar sesión</button></div>`;
}

const api = { empujar, entrar, salir, compartir, quitarAcceso, htmlAjustes, get estado() { return s.estado; } };

export function iniciar() {
  window.Sync = api;
  indicador();
  window.addEventListener('online', indicador);
  window.addEventListener('offline', indicador);
  getRedirectResult(auth).catch(e => { s.error = mensajeError(e); avisar(); });
  onAuthStateChanged(auth, async user => {
    desconectar();
    s.user = user;
    if (!user) { s.estado = 'desconectado'; avisar(); return; }
    try { await conectar(user); } catch (e) { if (s.user === user) fallo(e); }
  });
  if (estado.tab === 'ajustes') render();
}
