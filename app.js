// ═══════════════════════════════════════════════════════════════
//  MiGaraje — app.js
//  ⚠️  Reemplaza firebaseConfig con tu configuración real.
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  addDoc, getDocs, deleteDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── ⚙️  TU CONFIGURACIÓN DE FIREBASE ────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBkgD5NOFZkfXgIVBZFADD3tJmMwhHyZ6M",
  authDomain: "migaraje-d8f90.firebaseapp.com",
  projectId: "migaraje-d8f90",
  storageBucket: "migaraje-d8f90.firebasestorage.app",
  messagingSenderId: "796506122449",
  appId: "1:796506122449:web:0c907dc2c3db98452a3df0"
};
// ──────────────────────────────────────────────────────────────

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);
const auth  = getAuth(fbApp);

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}

// Persistencia: se aplica antes de onAuthStateChanged (no async en top-level)
setPersistence(auth, browserLocalPersistence).catch(console.error);

// ══════════════ STATE ══════════════
let currentUser = null;
let carId       = null;
let carName     = null;
let detailRecordId = null;

// ══════════════ DOM HELPERS ══════════════
const $ = id => document.getElementById(id);
const hide = el => (typeof el === 'string' ? $(el) : el)?.classList.add('hidden');
const show = el => (typeof el === 'string' ? $(el) : el)?.classList.remove('hidden');
const esc  = s  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function showToast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.add('hidden'), ms);
}

function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmtKm(v)  { return v ? Number(v).toLocaleString('es-ES') + ' km' : null; }
function fmtEur(v) { return v ? Number(v).toFixed(2) + ' €' : null; }

const TYPE_LABEL = { oil:'Cambio de Aceite', maintenance:'Mantenimiento', breakdown:'Avería' };
const TYPE_ICON_SVG = {
  oil: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="8" rx="7" ry="4"/><path d="M5 8v8c0 2.2 3.1 4 7 4s7-1.8 7-4V8"/><path d="M5 12c0 2.2 3.1 4 7 4s7-1.8 7-4"/></svg>`,
  maintenance: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  breakdown:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};
const TYPE_PILL = { oil:'oil', maintenance:'maintenance', breakdown:'breakdown' };

// ══════════════════════════════════════════════
//  AUTENTICACIÓN
// ══════════════════════════════════════════════

// Traducción de códigos de error de Firebase
function authErrorMsg(code) {
  const map = {
    'auth/invalid-email':            'El correo electrónico no es válido.',
    'auth/user-not-found':           'No existe ninguna cuenta con ese correo.',
    'auth/wrong-password':           'Contraseña incorrecta.',
    'auth/invalid-credential':       'Correo o contraseña incorrectos.',
    'auth/email-already-in-use':     'Ya existe una cuenta con ese correo.',
    'auth/weak-password':            'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests':        'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    'auth/network-request-failed':   'Error de red. Comprueba tu conexión.',
    'auth/user-disabled':            'Esta cuenta ha sido deshabilitada.',
    'auth/missing-password':         'Introduce una contraseña.',
    'auth/missing-email':            'Introduce un correo electrónico.',
  };
  return map[code] || 'Ha ocurrido un error. Inténtalo de nuevo.';
}

function setAuthLoading(btn, loading) {
  const text = btn.querySelector('.btn-auth__text');
  const spin = btn.querySelector('.btn-auth__spin');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  spin.classList.toggle('hidden', !loading);
}

function showAuthError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAuthError(id) { $(id)?.classList.add('hidden'); }

// ── Tabs Login / Registro ──
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.auth-tab').forEach(t => {
      t.classList.toggle('auth-tab--active', t.dataset.tab === target);
      t.setAttribute('aria-selected', t.dataset.tab === target);
    });
    $('form-login').classList.toggle('hidden', target !== 'login');
    $('form-register').classList.toggle('hidden', target !== 'register');
    hideAuthError('login-error');
    hideAuthError('reg-error');
  });
});

// ── Mostrar / ocultar contraseña ──
function togglePw(inputId, btnId) {
  $(btnId)?.addEventListener('click', () => {
    const input = $(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}
togglePw('login-password', 'toggle-login-pw');
togglePw('reg-password',   'toggle-reg-pw');

// ── LOGIN ──
$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  hideAuthError('login-error');
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) {
    showAuthError('login-error', 'Introduce tu correo y contraseña.');
    return;
  }
  const btn = $('btn-login');
  setAuthLoading(btn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged maneja la navegación
  } catch (err) {
    showAuthError('login-error', authErrorMsg(err.code));
    setAuthLoading(btn, false);
  }
});

// ── REGISTRO ──
$('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  hideAuthError('reg-error');
  const name     = $('reg-name').value.trim();
  const email    = $('reg-email').value.trim();
  const password = $('reg-password').value;
  if (!name)     { showAuthError('reg-error', 'Introduce tu nombre.'); return; }
  if (!email)    { showAuthError('reg-error', 'Introduce tu correo.'); return; }
  if (!password) { showAuthError('reg-error', 'Introduce una contraseña.'); return; }
  const btn = $('btn-register');
  setAuthLoading(btn, true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // onAuthStateChanged maneja la navegación
  } catch (err) {
    showAuthError('reg-error', authErrorMsg(err.code));
    setAuthLoading(btn, false);
  }
});

// ── RECUPERAR CONTRASEÑA ──
$('btn-forgot').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  if (!email) {
    showAuthError('login-error', 'Introduce tu correo arriba para recuperar la contraseña.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    hideAuthError('login-error');
    showToast('Correo de recuperación enviado');
  } catch (err) {
    showAuthError('login-error', authErrorMsg(err.code));
  }
});

// ── CERRAR SESIÓN ──
$('btn-logout').addEventListener('click', async () => {
  if (!confirm('¿Cerrar sesión?')) return;
  await signOut(auth);
});

// ── OBSERVADOR DE SESIÓN — corazón del sistema ──
// Firebase llama a este callback UNA vez al arrancar (con user o null)
// y luego cada vez que cambia la sesión.
onAuthStateChanged(auth, user => {
  currentUser = user;

  // Ocultar splash siempre, con pequeña transición
  const splash = $('screen-splash');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 350);
  }

  if (user) {
    // Sesión activa → ir a la app
    const name = user.displayName?.split(' ')[0] || 'de nuevo';
    $('hero-greeting').textContent = `Hola, ${name}`;
    showScreen('screen-cars');
    loadCars();
  } else {
    // Sin sesión → login (nunca llamar a loadCars aquí)
    carId = null; carName = null;
    showScreen('screen-login');
    // Limpiar formularios
    $('login-email').value = $('login-password').value = '';
    $('reg-name').value = $('reg-email').value = $('reg-password').value = '';
    hideAuthError('login-error');
    hideAuthError('reg-error');
    // Volver a tab login
    document.querySelectorAll('.auth-tab').forEach(t => {
      const isLogin = t.dataset.tab === 'login';
      t.classList.toggle('auth-tab--active', isLogin);
      t.setAttribute('aria-selected', isLogin);
    });
    $('form-login').classList.remove('hidden');
    $('form-register').classList.add('hidden');
    // Reset loading states
    [$('btn-login'), $('btn-register')].forEach(btn => {
      if (btn) setAuthLoading(btn, false);
    });
  }
});

// ══════════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id)?.classList.add('active');
  window.scrollTo({ top:0, behavior:'instant' });
}

document.querySelectorAll('.nav-back').forEach(btn =>
  btn.addEventListener('click', () => showScreen(btn.dataset.target))
);

// ══════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════
const openModal  = id => $(id)?.classList.remove('hidden');
const closeModal = id => $(id)?.classList.add('hidden');

document.querySelectorAll('.modal-close').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.modal))
);
document.querySelectorAll('.sheet-overlay').forEach(ov =>
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); })
);

// ══════════════════════════════════════════════
//  COCHES — rutas con userId: users/{uid}/cars
// ══════════════════════════════════════════════

// Colección raíz del usuario autenticado
const userCars = () => collection(db, 'users', currentUser.uid, 'cars');
const userCar  = id => doc(db, 'users', currentUser.uid, 'cars', id);
const carRecs  = (cid) => collection(db, 'users', currentUser.uid, 'cars', cid, 'records');
const carRec   = (cid, rid) => doc(db, 'users', currentUser.uid, 'cars', cid, 'records', rid);

async function loadCars() {
  if (!currentUser) return;   // guard: nunca ejecutar sin sesión
  const list = $('cars-list');
  list.innerHTML = '<div class="loading-msg">Cargando…</div>';
  hide('cars-empty');
  try {
    const snap = await getDocs(query(userCars(), orderBy('createdAt','asc')));
    list.innerHTML = '';
    if (snap.empty) { hide(list); show('cars-empty'); return; }
    show(list); hide('cars-empty');
    snap.forEach(d => renderCarCard(d.id, d.data()));
  } catch (err) {
    console.error(err);
    list.innerHTML = '';
    showToast('Error al cargar los coches');
  }
}

function renderCarCard(id, data) {
  const color    = data.color || '#d9251c';
  const dimColor = color + '18';
  const card = document.createElement('div');
  card.className = 'car-card';
  card.style.setProperty('--car-accent', color);
  card.style.setProperty('--car-accent-dim', dimColor);
  const sub = [data.brand, data.year].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="car-avatar">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1"/>
        <path d="M19 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1"/>
        <path d="M14 17H9"/><path d="M17 17v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4"/>
        <circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>
        <path d="M9 8l1-4h4l1 4"/>
      </svg>
    </div>
    <div class="car-info">
      <div class="car-name">${esc(data.name)}</div>
      ${sub ? `<div class="car-meta">${esc(sub)}</div>` : ''}
    </div>
    <button class="car-del" data-id="${id}" aria-label="Eliminar coche">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>
      </svg>
    </button>
    <div class="car-chevron">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>`;
  card.addEventListener('click', e => {
    if (e.target.closest('.car-del')) return;
    carId = id; carName = data.name;
    $('records-car-name').textContent = data.name;
    showScreen('screen-records');
    loadRecords();
  });
  card.querySelector('.car-del').addEventListener('click', e => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar "${data.name}" y todos sus registros?`)) return;
    deleteCar(id);
  });
  $('cars-list').appendChild(card);
}

async function deleteCar(id) {
  try {
    const rSnap = await getDocs(carRecs(id));
    await Promise.all(rSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(userCar(id));
    showToast('Coche eliminado');
    loadCars();
  } catch (err) { console.error(err); showToast('Error al eliminar'); }
}

['btn-add-car','btn-add-car-empty'].forEach(id => $(id)?.addEventListener('click', openCarModal));
function openCarModal() {
  $('car-name').value = $('car-brand').value = $('car-year').value = '';
  $('car-color').value = '#d9251c';
  $('car-color-hex').textContent = '#d9251c';
  openModal('modal-car');
  setTimeout(() => $('car-name').focus(), 350);
}
$('car-color').addEventListener('input', e => { $('car-color-hex').textContent = e.target.value; });

$('btn-save-car').addEventListener('click', async () => {
  const name = $('car-name').value.trim();
  if (!name) { showToast('Escribe un nombre'); return; }
  try {
    await addDoc(userCars(), {
      name,
      brand: $('car-brand').value.trim() || null,
      year:  $('car-year').value         || null,
      color: $('car-color').value,
      createdAt: serverTimestamp()
    });
    closeModal('modal-car');
    showToast('Coche añadido');
    loadCars();
  } catch (err) { console.error(err); showToast('Error al guardar'); }
});

// ══════════════════════════════════════════════
//  REGISTROS
// ══════════════════════════════════════════════

async function loadRecords() {
  if (!currentUser) return;   // guard
  const list = $('records-list');
  list.innerHTML = '<div class="loading-msg">Cargando…</div>';
  hide('records-empty');
  try {
    const snap = await getDocs(query(carRecs(carId), orderBy('fecha','desc')));
    list.innerHTML = '';
    if (snap.empty) { hide(list); show('records-empty'); return; }
    show(list); hide('records-empty');
    snap.forEach(d => renderRecordCard(d.id, d.data()));
  } catch (err) { console.error(err); list.innerHTML = ''; showToast('Error al cargar'); }
}

function renderRecordCard(id, data) {
  const pill = TYPE_PILL[data.type] || 'maintenance';
  const meta = [fmtDate(data.fecha), fmtKm(data.kms), fmtEur(data.precio)].filter(Boolean).join(' · ');
  const card = document.createElement('div');
  card.className = 'record-card';
  card.dataset.type = data.type;
  card.innerHTML = `
    <div class="record-icon-wrap record-icon-wrap--${data.type}">${TYPE_ICON_SVG[data.type] || ''}</div>
    <div class="record-info">
      <div class="record-title">${esc(data.nombre || TYPE_LABEL[data.type])}</div>
      <div class="record-meta">${esc(meta || '—')}</div>
    </div>
    <span class="record-pill record-pill--${pill}">${TYPE_LABEL[data.type] || data.type}</span>`;
  card.addEventListener('click', () => openDetailModal(id, data));
  $('records-list').appendChild(card);
}

['btn-add-record','btn-add-record-empty'].forEach(id =>
  $(id)?.addEventListener('click', () => openModal('modal-type'))
);

// ── Selector de tipo ──
document.querySelectorAll('.type-card').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    closeModal('modal-type');
    if (type === 'oil') { resetOilForm(); openModal('modal-oil'); }
    else                { resetGenForm(type); openModal('modal-general'); }
  });
});

$('btn-back-oil').addEventListener('click',     () => { closeModal('modal-oil');     openModal('modal-type'); });
$('btn-back-general').addEventListener('click', () => { closeModal('modal-general'); openModal('modal-type'); });

// ── Formulario Cambio de Aceite ──
function resetOilForm() {
  $('oil-fecha').value = todayISO();
  ['oil-kms','oil-tipo','oil-taller','oil-precio','oil-prox-kms','oil-notas'].forEach(id => $(id).value = '');
  document.querySelectorAll('#modal-oil input[type=checkbox]').forEach(cb => cb.checked = false);
}
function readChecks() {
  const result = {};
  document.querySelectorAll('#modal-oil .check-item').forEach(row => {
    const item = row.dataset.item;
    result[item] = {
      servicio: row.querySelector('[data-col="servicio"]').checked,
      proximo:  row.querySelector('[data-col="proximo"]').checked
    };
  });
  return result;
}

$('btn-save-oil').addEventListener('click', async () => {
  const fecha = $('oil-fecha').value;
  if (!fecha) { showToast('Indica la fecha'); return; }
  try {
    await addDoc(carRecs(carId), {
      type: 'oil', nombre: 'Cambio de Aceite', fecha,
      kms:        $('oil-kms').value        || null,
      tipoAceite: $('oil-tipo').value.trim()   || null,
      taller:     $('oil-taller').value.trim() || null,
      precio:     $('oil-precio').value     || null,
      proxKms:    $('oil-prox-kms').value   || null,
      notas:      $('oil-notas').value.trim()  || null,
      checks:     readChecks(),
      createdAt:  serverTimestamp()
    });
    closeModal('modal-oil');
    showToast('Cambio de aceite guardado');
    loadRecords();
  } catch (err) { console.error(err); showToast('Error al guardar'); }
});

// ── Formulario Mantenimiento / Avería ──
let _genType = 'maintenance';
function resetGenForm(type) {
  _genType = type;
  $('modal-general-title').textContent = type === 'breakdown' ? 'Avería' : 'Mantenimiento';
  ['gen-nombre','gen-kms','gen-taller','gen-precio','gen-notas'].forEach(id => $(id).value = '');
  $('gen-fecha').value = todayISO();
}
$('btn-save-general').addEventListener('click', async () => {
  const nombre = $('gen-nombre').value.trim();
  const fecha  = $('gen-fecha').value;
  if (!nombre) { showToast('Escribe un nombre'); return; }
  if (!fecha)  { showToast('Indica la fecha');   return; }
  try {
    await addDoc(carRecs(carId), {
      type: _genType, nombre, fecha,
      kms:    $('gen-kms').value        || null,
      taller: $('gen-taller').value.trim() || null,
      precio: $('gen-precio').value     || null,
      notas:  $('gen-notas').value.trim()  || null,
      createdAt: serverTimestamp()
    });
    closeModal('modal-general');
    showToast('Registro guardado');
    loadRecords();
  } catch (err) { console.error(err); showToast('Error al guardar'); }
});

// ══════════════════════════════════════════════
//  DETALLE DE REGISTRO
// ══════════════════════════════════════════════
const CHECK_NAME = {
  filtro_aceite:      'Filtro aceite',
  filtro_gasoil:      'Filtro gasoil',
  filtro_aire:        'Filtro aire',
  filtro_habitaculo:  'Filtro habitáculo',
  niveles:            'Niveles',
  presion_neumaticos: 'Presión neumáticos'
};

function openDetailModal(id, data) {
  detailRecordId = id;
  $('detail-title').textContent = data.nombre || TYPE_LABEL[data.type];
  const body = $('detail-body');
  body.innerHTML = '';

  // Pill tipo
  const pill = document.createElement('span');
  pill.className = `detail-pill detail-pill--${TYPE_PILL[data.type]}`;
  const pillIcon = document.createElement('span');
  pillIcon.style.cssText = 'display:flex;align-items:center;';
  pillIcon.innerHTML = TYPE_ICON_SVG[data.type] || '';
  pill.appendChild(pillIcon);
  pill.appendChild(document.createTextNode(TYPE_LABEL[data.type]));
  body.appendChild(pill);

  if (data.type === 'oil') {
    addDetailRows(body, 'Datos generales', [
      ['Fecha',            fmtDate(data.fecha)],
      ['Kilómetros',       fmtKm(data.kms)    || '—'],
      ['Tipo de aceite',   data.tipoAceite     || '—'],
      ['Taller',           data.taller         || '—'],
      ['Precio',           fmtEur(data.precio) || '—'],
      ['Próxima revisión', fmtKm(data.proxKms) || '—'],
    ]);
    if (data.checks) {
      const lbl = document.createElement('p');
      lbl.className = 'detail-sec-label'; lbl.style.marginTop = '8px';
      lbl.textContent = 'Elementos revisados';
      body.appendChild(lbl);
      const tbl = document.createElement('div');
      tbl.className = 'detail-checks';
      tbl.innerHTML = `<div class="detail-checks-header">
        <span class="dch-spacer"></span>
        <span class="dch-col">Servicio</span>
        <span class="dch-col">Próximo</span>
      </div>`;
      Object.entries(data.checks).forEach(([k, v]) => {
        const row = document.createElement('div');
        row.className = 'detail-check-row';
        row.innerHTML = `
          <span class="dcr-name">${CHECK_NAME[k] || k}</span>
          <span class="dcr-col">${v.servicio ? '<span class="chk-done">✓</span>' : '<span class="chk-none">—</span>'}</span>
          <span class="dcr-col">${v.proximo  ? '<span class="chk-next">próximo</span>' : '<span class="chk-none">—</span>'}</span>`;
        tbl.appendChild(row);
      });
      body.appendChild(tbl);
    }
  } else {
    addDetailRows(body, 'Datos', [
      ['Nombre',     data.nombre         || '—'],
      ['Fecha',      fmtDate(data.fecha)],
      ['Kilómetros', fmtKm(data.kms)     || '—'],
      ['Taller',     data.taller         || '—'],
      ['Precio',     fmtEur(data.precio) || '—'],
    ]);
  }

  if (data.notas) {
    const lbl = document.createElement('p');
    lbl.className = 'detail-sec-label'; lbl.style.marginTop = '8px';
    lbl.textContent = 'Notas';
    body.appendChild(lbl);
    const n = document.createElement('div');
    n.className = 'detail-notas'; n.textContent = data.notas;
    body.appendChild(n);
  }

  openModal('modal-detail');
}

function addDetailRows(container, label, rows) {
  const lbl = document.createElement('p');
  lbl.className = 'detail-sec-label'; lbl.style.marginTop = '4px';
  lbl.textContent = label;
  container.appendChild(lbl);
  const sec = document.createElement('div');
  sec.className = 'detail-section';
  rows.forEach(([l, v]) => {
    const row = document.createElement('div');
    row.className = 'detail-row';
    row.innerHTML = `<span class="detail-lbl">${esc(l)}</span><span class="detail-val">${esc(v)}</span>`;
    sec.appendChild(row);
  });
  container.appendChild(sec);
}

$('btn-delete-record').addEventListener('click', async () => {
  if (!detailRecordId || !carId) return;
  if (!confirm('¿Eliminar este registro?')) return;
  try {
    await deleteDoc(carRec(carId, detailRecordId));
    closeModal('modal-detail');
    showToast('Registro eliminado');
    loadRecords();
  } catch (err) { console.error(err); showToast('Error al eliminar'); }
});

// ══════════════════════════════════════════════
//  INIT — onAuthStateChanged lo arranca todo
// ══════════════════════════════════════════════
// (No hay loadCars() aquí — lo llama el observer cuando hay sesión)
