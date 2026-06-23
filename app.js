// ═══════════════════════════════════════════════════════════════
//  MiGaraje — app.js
//  Reemplaza firebaseConfig con tu configuración de Firebase.
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  addDoc, getDocs, deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── CONFIGURA AQUÍ TU FIREBASE ───────────────────────────────
  const firebaseConfig = {
    apiKey: "AIzaSyBkgD5NOFZkfXgIVBZFADD3tJmMwhHyZ6M",
    authDomain: "migaraje-d8f90.firebaseapp.com",
    projectId: "migaraje-d8f90",
    storageBucket: "migaraje-d8f90.firebasestorage.app",
    messagingSenderId: "796506122449",
    appId: "1:796506122449:web:0c907dc2c3db98452a3df0"
  };
// ──────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ═══════════════════════════ STATE ═══════════════════════════
let currentCarId   = null;
let currentCarName = null;
let currentRecordId = null;   // para el modal de detalle / borrar

// ═══════════════════════════ UTILS ═══════════════════════════
const $ = id => document.getElementById(id);
const show = id => { $(id)?.classList.remove('hidden'); };
const hide = id => { $(id)?.classList.add('hidden'); };

function showToast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), ms);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function typeLabel(type) {
  return { oil: 'Cambio de Aceite', maintenance: 'Mantenimiento', breakdown: 'Avería' }[type] ?? type;
}
function typeIcon(type) {
  return { oil: '🛢️', maintenance: '🔧', breakdown: '⚠️' }[type] ?? '📋';
}
function typeBadgeClass(type) {
  return { oil: 'oil', maintenance: 'maintenance', breakdown: 'breakdown' }[type] ?? '';
}

// ═══════════════════════════ SCREENS ═══════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  window.scrollTo(0, 0);
}

// ═══════════════════════════ MODALS ═══════════════════════════
function openModal(id)  { $(id)?.classList.remove('hidden'); }
function closeModal(id) { $(id)?.classList.add('hidden'); }

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ═══════════════════════════ CARS ═══════════════════════════
async function loadCars() {
  const list = $('cars-list');
  list.innerHTML = '';
  try {
    const q = query(collection(db, 'cars'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    if (snap.empty) {
      hide('cars-list');
      show('cars-empty');
      return;
    }
    show('cars-list');
    hide('cars-empty');
    snap.forEach(docSnap => renderCarCard(docSnap.id, docSnap.data()));
  } catch (err) {
    console.error(err);
    showToast('❌ Error al cargar los coches');
  }
}

function renderCarCard(id, data) {
  const list = $('cars-list');
  const card = document.createElement('div');
  card.className = 'car-card';
  card.style.setProperty('--car-color', data.color || '#6c63ff');
  card.dataset.carId = id;
  card.innerHTML = `
    <div class="car-avatar" style="background:${data.color || '#6c63ff'}">🚗</div>
    <div class="car-info">
      <div class="car-name">${esc(data.name)}</div>
      <div class="car-sub">${esc(data.brand || '')}${data.year ? ' · ' + data.year : ''}</div>
    </div>
    <div class="car-actions">
      <button class="car-delete-btn" data-car-id="${id}" title="Eliminar coche">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
      <div class="car-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>
  `;
  // Navigate to records
  card.addEventListener('click', e => {
    if (e.target.closest('.car-delete-btn')) return;
    currentCarId   = id;
    currentCarName = data.name;
    $('records-car-name').textContent = data.name;
    showScreen('screen-records');
    loadRecords();
  });
  // Delete car
  card.querySelector('.car-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteCar(id, data.name);
  });
  list.appendChild(card);
}

async function deleteCar(id, name) {
  if (!confirm(`¿Eliminar "${name}" y todos sus registros?`)) return;
  try {
    // borrar registros
    const rSnap = await getDocs(collection(db, 'cars', id, 'records'));
    await Promise.all(rSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'cars', id));
    showToast('🗑️ Coche eliminado');
    loadCars();
  } catch (err) {
    console.error(err);
    showToast('❌ Error al eliminar');
  }
}

// Add Car modal
$('btn-add-car').addEventListener('click', () => openAddCarModal());
$('btn-add-car-empty').addEventListener('click', () => openAddCarModal());

function openAddCarModal() {
  $('car-name').value  = '';
  $('car-brand').value = '';
  $('car-year').value  = '';
  $('car-color').value = '#6c63ff';
  $('car-color-label').textContent = '#6c63ff';
  openModal('modal-car');
  $('car-name').focus();
}

$('car-color').addEventListener('input', e => {
  $('car-color-label').textContent = e.target.value;
});

$('btn-save-car').addEventListener('click', async () => {
  const name = $('car-name').value.trim();
  if (!name) { showToast('⚠️ Escribe un nombre'); return; }
  try {
    await addDoc(collection(db, 'cars'), {
      name,
      brand: $('car-brand').value.trim(),
      year:  $('car-year').value  || null,
      color: $('car-color').value,
      createdAt: serverTimestamp()
    });
    closeModal('modal-car');
    showToast('✅ Coche añadido');
    loadCars();
  } catch (err) {
    console.error(err);
    showToast('❌ Error al guardar');
  }
});

// Back from records
document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.target));
});

// ═══════════════════════════ RECORDS ═══════════════════════════
async function loadRecords() {
  const list = $('records-list');
  list.innerHTML = '';
  try {
    const q = query(
      collection(db, 'cars', currentCarId, 'records'),
      orderBy('fecha', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      hide('records-list');
      show('records-empty');
      return;
    }
    show('records-list');
    hide('records-empty');
    snap.forEach(d => renderRecordCard(d.id, d.data()));
  } catch (err) {
    console.error(err);
    showToast('❌ Error al cargar registros');
  }
}

function renderRecordCard(id, data) {
  const list = $('records-list');
  const card = document.createElement('div');
  card.className = 'record-card';
  card.dataset.type = data.type;
  card.dataset.recordId = id;

  const kmsStr = data.kms ? ` · ${Number(data.kms).toLocaleString('es-ES')} km` : '';
  const precioStr = data.precio ? ` · ${Number(data.precio).toFixed(2)} €` : '';

  card.innerHTML = `
    <div class="record-icon">${typeIcon(data.type)}</div>
    <div class="record-info">
      <div class="record-title">${esc(data.nombre || typeLabel(data.type))}</div>
      <div class="record-meta">${formatDate(data.fecha)}${kmsStr}${precioStr}</div>
    </div>
    <span class="record-badge ${typeBadgeClass(data.type)}">${typeLabel(data.type)}</span>
  `;
  card.addEventListener('click', () => openDetailModal(id, data));
  list.appendChild(card);
}

// Add record buttons
$('btn-add-record').addEventListener('click', openTypeModal);
$('btn-add-record-empty').addEventListener('click', openTypeModal);

function openTypeModal() { openModal('modal-type'); }

// Type selector
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    closeModal('modal-type');
    if (type === 'oil') {
      resetOilForm();
      openModal('modal-oil');
    } else {
      resetGeneralForm(type);
      openModal('modal-general');
    }
  });
});

// Back buttons in sub-modals
$('btn-back-oil').addEventListener('click', () => {
  closeModal('modal-oil');
  openModal('modal-type');
});
$('btn-back-general').addEventListener('click', () => {
  closeModal('modal-general');
  openModal('modal-type');
});

// ═══════════════════════ OIL CHANGE FORM ═══════════════════
function resetOilForm() {
  $('oil-fecha').value     = todayISO();
  $('oil-kms').value       = '';
  $('oil-tipo').value      = '';
  $('oil-taller').value    = '';
  $('oil-precio').value    = '';
  $('oil-prox-kms').value  = '';
  $('oil-notas').value     = '';
  document.querySelectorAll('.check-table input[type=checkbox]').forEach(cb => { cb.checked = false; });
}

function getChecks() {
  const result = {};
  document.querySelectorAll('.check-row').forEach(row => {
    const item = row.dataset.item;
    const servicio = row.querySelector('[data-col="servicio"]').checked;
    const proximo  = row.querySelector('[data-col="proximo"]').checked;
    result[item] = { servicio, proximo };
  });
  return result;
}

$('btn-save-oil').addEventListener('click', async () => {
  const fecha = $('oil-fecha').value;
  if (!fecha) { showToast('⚠️ Indica la fecha'); return; }
  try {
    await addDoc(collection(db, 'cars', currentCarId, 'records'), {
      type:     'oil',
      nombre:   'Cambio de Aceite',
      fecha,
      kms:      $('oil-kms').value     || null,
      tipoAceite: $('oil-tipo').value.trim()   || null,
      taller:   $('oil-taller').value.trim()  || null,
      precio:   $('oil-precio').value  || null,
      proxKms:  $('oil-prox-kms').value || null,
      notas:    $('oil-notas').value.trim()   || null,
      checks:   getChecks(),
      createdAt: serverTimestamp()
    });
    closeModal('modal-oil');
    showToast('✅ Cambio de aceite guardado');
    loadRecords();
  } catch (err) {
    console.error(err);
    showToast('❌ Error al guardar');
  }
});

// ═══════════════════════ GENERAL FORM ═══════════════════════
let _currentType = 'maintenance';

function resetGeneralForm(type) {
  _currentType = type;
  $('modal-general-title').textContent = type === 'breakdown' ? '⚠️ Avería' : '🔧 Mantenimiento';
  $('gen-nombre').value = '';
  $('gen-fecha').value  = todayISO();
  $('gen-kms').value    = '';
  $('gen-taller').value = '';
  $('gen-precio').value = '';
  $('gen-notas').value  = '';
}

$('btn-save-general').addEventListener('click', async () => {
  const nombre = $('gen-nombre').value.trim();
  const fecha  = $('gen-fecha').value;
  if (!nombre) { showToast('⚠️ Escribe un nombre'); return; }
  if (!fecha)  { showToast('⚠️ Indica la fecha');   return; }
  try {
    await addDoc(collection(db, 'cars', currentCarId, 'records'), {
      type:    _currentType,
      nombre,
      fecha,
      kms:     $('gen-kms').value    || null,
      taller:  $('gen-taller').value.trim() || null,
      precio:  $('gen-precio').value || null,
      notas:   $('gen-notas').value.trim()  || null,
      createdAt: serverTimestamp()
    });
    closeModal('modal-general');
    showToast('✅ Registro guardado');
    loadRecords();
  } catch (err) {
    console.error(err);
    showToast('❌ Error al guardar');
  }
});

// ═══════════════════════ DETAIL MODAL ═══════════════════════
const CHECK_NAMES = {
  filtro_aceite:    'Filtro aceite',
  filtro_aire:      'Filtro aire',
  filtro_gasolina:  'Filtro gasolina',
  filtro_polen:     'Filtro polen',
  correas:          'Correas',
  niveles:          'Niveles'
};

function openDetailModal(id, data) {
  currentRecordId = id;
  $('detail-title').textContent = data.nombre || typeLabel(data.type);

  const body = $('detail-body');
  body.innerHTML = '';

  // Pill
  const pill = document.createElement('span');
  pill.className = `type-pill ${typeBadgeClass(data.type)}`;
  pill.textContent = `${typeIcon(data.type)} ${typeLabel(data.type)}`;
  body.appendChild(pill);

  if (data.type === 'oil') {
    // Info rows
    appendSection(body, 'Datos generales', [
      ['Fecha',              formatDate(data.fecha)],
      ['Kilómetros',         data.kms    ? Number(data.kms).toLocaleString('es-ES') + ' km' : '—'],
      ['Tipo de aceite',     data.tipoAceite || '—'],
      ['Taller',             data.taller  || '—'],
      ['Precio',             data.precio  ? Number(data.precio).toFixed(2) + ' €'  : '—'],
      ['Próxima revisión',   data.proxKms ? Number(data.proxKms).toLocaleString('es-ES') + ' km' : '—'],
    ]);

    if (data.notas) {
      appendSection(body, 'Notas', [['', data.notas]]);
    }

    // Checks table
    if (data.checks) {
      const secTitle = document.createElement('h3');
      secTitle.className = 'section-label mt';
      secTitle.style.marginTop = '4px';
      secTitle.textContent = 'Elementos revisados';
      body.appendChild(secTitle);

      const tbl = document.createElement('div');
      tbl.className = 'detail-checks';
      tbl.innerHTML = `
        <div class="detail-check-header">
          <span></span><span>Servicio</span><span>Próximo</span>
        </div>
      `;
      Object.entries(data.checks).forEach(([key, val]) => {
        const row = document.createElement('div');
        row.className = 'detail-check-row';
        row.innerHTML = `
          <span>${CHECK_NAMES[key] || key}</span>
          <span class="${val.servicio ? 'chk-yes' : 'chk-no'}">${val.servicio ? '✔' : '—'}</span>
          <span class="${val.proximo  ? 'chk-yes' : 'chk-no'}">${val.proximo  ? '✔' : '—'}</span>
        `;
        tbl.appendChild(row);
      });
      body.appendChild(tbl);
    }

  } else {
    appendSection(body, 'Datos', [
      ['Nombre',      data.nombre  || '—'],
      ['Fecha',       formatDate(data.fecha)],
      ['Kilómetros',  data.kms    ? Number(data.kms).toLocaleString('es-ES') + ' km' : '—'],
      ['Taller',      data.taller  || '—'],
      ['Precio',      data.precio  ? Number(data.precio).toFixed(2) + ' €'  : '—'],
    ]);
    if (data.notas) {
      appendSection(body, 'Notas', [['', data.notas]]);
    }
  }

  openModal('modal-detail');
}

function appendSection(container, title, rows) {
  const sec = document.createElement('div');
  sec.className = 'detail-section';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'section-label';
    h.textContent = title;
    sec.appendChild(h);
  }
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'detail-row';
    row.innerHTML = `
      <span class="label">${esc(label)}</span>
      <span class="value">${esc(String(value ?? '—'))}</span>
    `;
    sec.appendChild(row);
  });
  container.appendChild(sec);
}

// Delete record
$('btn-delete-record').addEventListener('click', async () => {
  if (!currentRecordId || !currentCarId) return;
  if (!confirm('¿Eliminar este registro?')) return;
  try {
    await deleteDoc(doc(db, 'cars', currentCarId, 'records', currentRecordId));
    closeModal('modal-detail');
    showToast('🗑️ Registro eliminado');
    loadRecords();
  } catch (err) {
    console.error(err);
    showToast('❌ Error al eliminar');
  }
});

// ═══════════════════════ HELPERS ═══════════════════════════
function todayISO() {
  return new Date().toISOString().split('T')[0];
}
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════ INIT ═══════════════════════════════
loadCars();
