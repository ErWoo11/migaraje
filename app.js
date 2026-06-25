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

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}

// ══════════════ STATE ══════════════
let carId   = null;
let carName = null;
let detailRecordId = null;

// ══════════════ DOM HELPERS ══════════════
const $ = id => document.getElementById(id);
const hide = el => (typeof el === 'string' ? $(el) : el)?.classList.add('hidden');
const show = el => (typeof el === 'string' ? $(el) : el)?.classList.remove('hidden');
const esc  = s  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function showToast(msg, ms = 2400) {
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
function fmtKm(v) {
  if (!v) return null;
  return Number(v).toLocaleString('es-ES') + ' km';
}
function fmtEur(v) {
  if (!v) return null;
  return Number(v).toFixed(2) + ' €';
}

const TYPE_LABEL = { oil:'Cambio de Aceite', maintenance:'Mantenimiento', breakdown:'Avería' };
const TYPE_ICON_SVG = {
  oil: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="8" rx="7" ry="4"/><path d="M5 8v8c0 2.2 3.1 4 7 4s7-1.8 7-4V8"/><path d="M5 12c0 2.2 3.1 4 7 4s7-1.8 7-4"/></svg>`,
  maintenance: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  breakdown: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};
const TYPE_ICON  = { oil:'🛢️', maintenance:'🔧', breakdown:'⚠️' };
const TYPE_PILL  = { oil:'oil', maintenance:'maintenance', breakdown:'breakdown' };

// ══════════════ SCREENS ══════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id)?.classList.add('active');
  window.scrollTo({ top:0, behavior:'instant' });
}

document.querySelectorAll('.nav-back').forEach(btn =>
  btn.addEventListener('click', () => showScreen(btn.dataset.target))
);

// ══════════════ MODALS ══════════════
const openModal  = id => $(id)?.classList.remove('hidden');
const closeModal = id => $(id)?.classList.add('hidden');

document.querySelectorAll('.modal-close').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.modal))
);
document.querySelectorAll('.sheet-overlay').forEach(ov =>
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); })
);

// ══════════════ CARS ══════════════
async function loadCars() {
  const list = $('cars-list');
  list.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--text3);font-size:.85rem">Cargando…</div>';
  hide('cars-empty');
  try {
    const q    = query(collection(db,'cars'), orderBy('createdAt','asc'));
    const snap = await getDocs(q);
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
  const color = data.color || '#6366f1';
  const dimColor = color + '22';
  const card = document.createElement('div');
  card.className = 'car-card';
  card.style.setProperty('--car-accent', color);
  card.style.setProperty('--car-accent-dim', dimColor);
  card.dataset.carId = id;
  const sub = [data.brand, data.year].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="car-avatar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1"/><path d="M19 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1"/><path d="M14 17H9"/><path d="M17 17v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M9 8l1-4h4l1 4"/></svg></div>
    <div class="car-info">
      <div class="car-name">${esc(data.name)}</div>
      ${sub ? `<div class="car-meta">${esc(sub)}</div>` : ''}
    </div>
    <button class="car-del" data-id="${id}" aria-label="Eliminar coche">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
      </svg>
    </button>
    <div class="car-chevron">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>
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
    const rSnap = await getDocs(collection(db,'cars',id,'records'));
    await Promise.all(rSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db,'cars',id));
    showToast('Coche eliminado');
    loadCars();
  } catch(err) { console.error(err); showToast('Error al eliminar'); }
}

// Add car modal
['btn-add-car','btn-add-car-empty'].forEach(id => $(id)?.addEventListener('click', openCarModal));
function openCarModal() {
  $('car-name').value=$('car-brand').value=$('car-year').value='';
  $('car-color').value='#6366f1';
  $('car-color-hex').textContent='#6366f1';
  openModal('modal-car');
  setTimeout(() => $('car-name').focus(), 350);
}
$('car-color').addEventListener('input', e => { $('car-color-hex').textContent = e.target.value; });

$('btn-save-car').addEventListener('click', async () => {
  const name = $('car-name').value.trim();
  if (!name) { showToast('Escribe un nombre'); return; }
  try {
    await addDoc(collection(db,'cars'), {
      name,
      brand: $('car-brand').value.trim() || null,
      year:  $('car-year').value  || null,
      color: $('car-color').value,
      createdAt: serverTimestamp()
    });
    closeModal('modal-car');
    showToast('Coche añadido');
    loadCars();
  } catch(err) { console.error(err); showToast('Error al guardar'); }
});

// ══════════════ RECORDS ══════════════
async function loadRecords() {
  const list = $('records-list');
  list.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--text3);font-size:.85rem">Cargando…</div>';
  hide('records-empty');
  try {
    const q = query(collection(db,'cars',carId,'records'), orderBy('fecha','desc'));
    const snap = await getDocs(q);
    list.innerHTML = '';
    if (snap.empty) { hide(list); show('records-empty'); return; }
    show(list); hide('records-empty');
    snap.forEach(d => renderRecordCard(d.id, d.data()));
  } catch(err) { console.error(err); list.innerHTML=''; showToast('Error al cargar'); }
}

function renderRecordCard(id, data) {
  const pill = TYPE_PILL[data.type] || 'maintenance';
  const meta  = [fmtDate(data.fecha), fmtKm(data.kms), fmtEur(data.precio)].filter(Boolean).join(' · ');
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

['btn-add-record','btn-add-record-empty'].forEach(id => $(id)?.addEventListener('click', () => openModal('modal-type')));

// ══════════════ TYPE SELECT ══════════════
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

// ══════════════ OIL FORM ══════════════
function resetOilForm() {
  $('oil-fecha').value    = todayISO();
  $('oil-kms').value      = '';
  $('oil-tipo').value     = '';
  $('oil-taller').value   = '';
  $('oil-precio').value   = '';
  $('oil-prox-kms').value = '';
  $('oil-notas').value    = '';
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
    await addDoc(collection(db,'cars',carId,'records'), {
      type:       'oil',
      nombre:     'Cambio de Aceite',
      fecha,
      kms:        $('oil-kms').value      || null,
      tipoAceite: $('oil-tipo').value.trim()    || null,
      taller:     $('oil-taller').value.trim()  || null,
      precio:     $('oil-precio').value   || null,
      proxKms:    $('oil-prox-kms').value || null,
      notas:      $('oil-notas').value.trim()   || null,
      checks:     readChecks(),
      createdAt:  serverTimestamp()
    });
    closeModal('modal-oil');
    showToast('Cambio de aceite guardado');
    loadRecords();
  } catch(err) { console.error(err); showToast('Error al guardar'); }
});

// ══════════════ GENERAL FORM ══════════════
let _genType = 'maintenance';
function resetGenForm(type) {
  _genType = type;
  $('modal-general-title').textContent = type === 'breakdown' ? 'Avería' : 'Mantenimiento';
  $('gen-nombre').value=$('gen-kms').value=$('gen-taller').value=$('gen-precio').value=$('gen-notas').value='';
  $('gen-fecha').value = todayISO();
}
$('btn-save-general').addEventListener('click', async () => {
  const nombre = $('gen-nombre').value.trim();
  const fecha  = $('gen-fecha').value;
  if (!nombre) { showToast('Escribe un nombre'); return; }
  if (!fecha)  { showToast('Indica la fecha');   return; }
  try {
    await addDoc(collection(db,'cars',carId,'records'), {
      type:   _genType, nombre, fecha,
      kms:    $('gen-kms').value    || null,
      taller: $('gen-taller').value.trim() || null,
      precio: $('gen-precio').value || null,
      notas:  $('gen-notas').value.trim()  || null,
      createdAt: serverTimestamp()
    });
    closeModal('modal-general');
    showToast('Registro guardado');
    loadRecords();
  } catch(err) { console.error(err); showToast('Error al guardar'); }
});

// ══════════════ DETAIL MODAL ══════════════
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

  // pill
  const pill = document.createElement('span');
  pill.className = `detail-pill detail-pill--${TYPE_PILL[data.type]}`;
  pill.innerHTML = '';
  const pillIcon = document.createElement('span');
  pillIcon.style.cssText = 'display:flex;align-items:center;';
  pillIcon.innerHTML = TYPE_ICON_SVG[data.type] || '';
  pill.appendChild(pillIcon);
  pill.appendChild(document.createTextNode(TYPE_LABEL[data.type]));
  body.appendChild(pill);

  if (data.type === 'oil') {
    addRows(body, 'Datos generales', [
      ['Fecha',            fmtDate(data.fecha)],
      ['Kilómetros',       fmtKm(data.kms)   || '—'],
      ['Tipo de aceite',   data.tipoAceite    || '—'],
      ['Taller',           data.taller        || '—'],
      ['Precio',           fmtEur(data.precio)|| '—'],
      ['Próxima revisión', fmtKm(data.proxKms)|| '—'],
    ]);
    if (data.checks) {
      const lbl = document.createElement('p');
      lbl.className = 'detail-sec-label'; lbl.style.marginTop='8px';
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
    addRows(body, 'Datos', [
      ['Nombre',      data.nombre        || '—'],
      ['Fecha',       fmtDate(data.fecha)],
      ['Kilómetros',  fmtKm(data.kms)   || '—'],
      ['Taller',      data.taller        || '—'],
      ['Precio',      fmtEur(data.precio)|| '—'],
    ]);
  }

  if (data.notas) {
    const lbl = document.createElement('p');
    lbl.className='detail-sec-label'; lbl.style.marginTop='8px';
    lbl.textContent='Notas'; body.appendChild(lbl);
    const n = document.createElement('div');
    n.className='detail-notas'; n.textContent=data.notas;
    body.appendChild(n);
  }

  openModal('modal-detail');
}

function addRows(container, label, rows) {
  const lbl = document.createElement('p');
  lbl.className = 'detail-sec-label'; lbl.style.marginTop='4px';
  lbl.textContent = label;
  container.appendChild(lbl);
  const sec = document.createElement('div');
  sec.className = 'detail-section';
  rows.forEach(([l, v], i) => {
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
    await deleteDoc(doc(db,'cars',carId,'records',detailRecordId));
    closeModal('modal-detail');
    showToast('Registro eliminado');
    loadRecords();
  } catch(err) { console.error(err); showToast('Error al eliminar'); }
});

// ══════════════ INIT ══════════════
loadCars();
