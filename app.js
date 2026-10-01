/* ================= CONFIG ================= */
const API_URL = 'https://script.google.com/macros/s/AKfycbyJDbUgZvAw3C_seA3T-1EOQY7G5oIdE23eBSB6PXdBX6okX_-aIyu-sG31stUy_XZ0xw/exec';
const PHOTO_W = 525, PHOTO_H = 675;          // 35:45 ratio (~380 dpi at 35x45 mm)
const CACHE_KEY = 'sus_emp_cache_v1';
/* ========================================== */

const $ = id => document.getElementById(id);
const S = { rows: [], sel: null, newPhoto: null, stream: null, facing: 'user', saving: false, pin: sessionStorage.getItem('sus_pin') || '' };

/* ---------- helpers ---------- */
function toast(msg, type = '') {
  const t = $('toast'); t.textContent = msg; t.className = 'toast ' + type; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3800);
}
function setStatus(txt, cls = '') { const p = $('status'); p.textContent = txt; p.className = 'pill ' + cls; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function driveThumb(url) {
  const m = /[-\w]{25,}/.exec(url || ''); return m ? `https://drive.google.com/thumbnail?id=${m[0]}&sz=w500` : '';
}

/* ---------- load data (row = [details, designation, zone, ward, photo, timestamp]) ---------- */
async function loadData(fresh) {
  // show cached list instantly, then refresh in background
  if (!fresh) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.rows) { S.rows = c.rows; ready(true); }
    } catch (e) {}
  }
  try {
    const r = await fetch(`${API_URL}?action=data&pin=${encodeURIComponent(S.pin)}`);
    const j = await r.json();
    if (j.error === 'PIN') { askPin(); return; }
    if (j.error) throw new Error(j.error);
    S.rows = j.rows;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rows: j.rows })); } catch (e) {}
    ready(false);
  } catch (e) {
    if (!S.rows.length) setStatus('Load failed', 'bad');
    toast('Could not load data. Check your connection and refresh.', 'bad');
  }
}
function ready(fromCache) {
  $('search').disabled = false;
  setStatus(`${S.rows.length} employees` + (fromCache ? ' •' : ''), 'ok');
}

/* ---------- PIN ---------- */
function askPin() { $('pinModal').hidden = false; $('pinInput').focus(); }
$('pinBtn').onclick = () => {
  S.pin = $('pinInput').value.trim(); sessionStorage.setItem('sus_pin', S.pin);
  $('pinModal').hidden = true; localStorage.removeItem(CACHE_KEY); loadData(true);
};
$('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('pinBtn').click(); });

/* ---------- searchable dropdown ---------- */
let active = -1, shown = [];
function renderList(q) {
  const term = q.trim().toLowerCase();
  shown = [];
  for (let i = 0; i < S.rows.length && shown.length < 60; i++) {
    if (!term || S.rows[i][0].toLowerCase().includes(term)) shown.push(i);
  }
  const ul = $('list');
  if (!shown.length) ul.innerHTML = '<li class="empty">No matching employee</li>';
  else ul.innerHTML = shown.map((ri, k) => {
    const r = S.rows[ri];
    let label = esc(r[0]);
    if (term) { const at = r[0].toLowerCase().indexOf(term); if (at >= 0) label = esc(r[0].slice(0, at)) + '<mark>' + esc(r[0].slice(at, at + term.length)) + '</mark>' + esc(r[0].slice(at + term.length)); }
    return `<li data-i="${ri}" class="${k === active ? 'act' : ''}">${label}<small>${esc(r[1] || '')}</small></li>`;
  }).join('');
  ul.hidden = false;
}
$('search').addEventListener('focus', e => { active = -1; e.target.select(); renderList(''); });
$('search').addEventListener('input', e => { active = -1; renderList(e.target.value); $('clearBtn').hidden = !e.target.value; });
$('search').addEventListener('keydown', e => {
  const items = $('list').querySelectorAll('li[data-i]');
  if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
  else if (e.key === 'Enter') { e.preventDefault(); const i = items[Math.max(active, 0)]; if (i) select(+i.dataset.i); return; }
  else if (e.key === 'Escape') { closeList(); return; }
  else return;
  items.forEach((li, k) => li.classList.toggle('act', k === active));
  if (items[active]) items[active].scrollIntoView({ block: 'nearest' });
});
$('list').addEventListener('pointerdown', e => {
  const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); select(+li.dataset.i); }
});
$('search').addEventListener('blur', () => { setTimeout(() => { closeList(); $('search').value = S.sel ? S.rows[S.sel.i][0] : ''; $('clearBtn').hidden = !S.sel; }, 120); });
$('clearBtn').onclick = () => { resetForm(); $('search').value = ''; $('search').focus(); };
function closeList() { $('list').hidden = true; }

function select(i) {
  const r = S.rows[i];
  S.sel = { i };
  $('search').value = r[0]; $('clearBtn').hidden = false;
  $('designation').value = r[1] || ''; $('zone').value = r[2] || ''; $('ward').value = r[3] || '';
  S.newPhoto = null; showPhoto(driveThumb(r[4]), false);
  $('photoNote').textContent = r[4] ? 'Existing photo found. Take/choose a new one to replace it.' : 'No photo yet.';
  $('lastUpdated').hidden = false;
  $('lastUpdated').textContent = r[5] ? 'Last updated: ' + r[5] : 'Not updated yet';
  $('details').classList.remove('disabled'); $('saveBtn').disabled = false;
  closeList(); $('search').blur();
}
function resetForm() {
  S.sel = null; S.newPhoto = null;
  ['designation', 'zone', 'ward'].forEach(id => $(id).value = '');
  showPhoto('', false); $('lastUpdated').hidden = true; $('photoNote').textContent = '';
  $('details').classList.add('disabled'); $('saveBtn').disabled = true; $('clearBtn').hidden = true;
}

/* ---------- photo preview ---------- */
function showPhoto(src, isNew) {
  const img = $('preview'), fr = $('frame');
  if (src) { img.src = src; img.hidden = false; $('noPhoto').hidden = true; fr.classList.add('has'); }
  else { img.removeAttribute('src'); img.hidden = true; $('noPhoto').hidden = false; fr.classList.remove('has'); }
  fr.classList.toggle('new', !!isNew); $('rmBtn').hidden = !isNew;
}
$('rmBtn').onclick = () => {
  S.newPhoto = null; const r = S.rows[S.sel.i]; showPhoto(driveThumb(r[4]), false);
  $('photoNote').textContent = r[4] ? 'Existing photo kept.' : 'No photo yet.';
};

/* crop any source to 35:45 (cover) and export as compressed JPEG */
function cropToPassport(src, sw, sh, mirror) {
  const c = document.createElement('canvas'); c.width = PHOTO_W; c.height = PHOTO_H;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, PHOTO_W, PHOTO_H);
  const target = PHOTO_W / PHOTO_H; let cw = sw, ch = sh;
  if (sw / sh > target) cw = sh * target; else ch = sw / target;
  const sx = (sw - cw) / 2, sy = (sh - ch) / 2;
  x.imageSmoothingQuality = 'high';
  if (mirror) { x.translate(PHOTO_W, 0); x.scale(-1, 1); }
  x.drawImage(src, sx, sy, cw, ch, 0, 0, PHOTO_W, PHOTO_H);
  return c.toDataURL('image/jpeg', 0.88);
}
function setNewPhoto(dataUrl) {
  S.newPhoto = dataUrl; showPhoto(dataUrl, true);
  $('photoNote').textContent = 'New photo ready. It will be saved on submit.';
}

/* ---------- gallery ---------- */
$('galBtn').onclick = () => $('file').click();
$('file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    setNewPhoto(cropToPassport(bmp, bmp.width, bmp.height, false));
  } catch (err) { toast('Could not read that image', 'bad'); }
};

/* ---------- camera ---------- */
async function startStream() {
  stopStream();
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    const v = $('video'); v.srcObject = S.stream; v.classList.toggle('mirror', S.facing === 'user');
  } catch (e) {
    closeCam(); toast('Camera unavailable. Allow camera access or use Gallery.', 'bad');
  }
}
function stopStream() { if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; } }
function closeCam() { stopStream(); $('camModal').hidden = true; }
$('camBtn').onclick = () => { $('camModal').hidden = false; startStream(); };
$('camClose').onclick = closeCam;
$('flipBtn').onclick = () => { S.facing = S.facing === 'user' ? 'environment' : 'user'; startStream(); };
$('studio').onchange = e => $('vf').classList.toggle('studio', e.target.checked);
$('snapBtn').onclick = () => {
  const v = $('video'); if (!v.videoWidth) return;
  setNewPhoto(cropToPassport(v, v.videoWidth, v.videoHeight, S.facing === 'user'));
  closeCam();
};

/* ---------- save (with freeze) ---------- */
function freeze(on) {
  S.saving = on; $('freeze').hidden = !on; document.body.classList.toggle('frozen', on);
  document.querySelectorAll('input,button').forEach(el => { if (on) { el.dataset.was = el.disabled ? '1' : '0'; el.disabled = true; } else el.disabled = el.dataset.was === '1'; });
}
window.addEventListener('beforeunload', e => { if (S.saving) { e.preventDefault(); e.returnValue = ''; } });

async function post(body, tries = 3) {
  for (let n = 1; n <= tries; n++) {
    try {
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.error === 'BUSY' && n < tries) { await new Promise(res => setTimeout(res, 1200 * n)); continue; }
      return j;
    } catch (e) { if (n === tries) return { error: 'Network error. Please try again.' }; await new Promise(res => setTimeout(res, 1200 * n)); }
  }
}

$('saveBtn').onclick = async () => {
  if (!S.sel || S.saving) return;
  const r = S.rows[S.sel.i];
  const payload = { action: 'save', pin: S.pin, details: r[0], designation: $('designation').value.trim(), zone: $('zone').value.trim(), ward: $('ward').value.trim(), image: S.newPhoto || '' };
  freeze(true);
  const res = await post(payload);
  freeze(false);
  if (res.error === 'PIN') { askPin(); return; }
  if (res.error) { toast(res.error, 'bad'); return; }
  // update local copy so re-selecting shows fresh data
  r[1] = payload.designation; r[2] = payload.zone; r[3] = payload.ward; r[5] = res.timestamp; if (res.photoUrl) r[4] = res.photoUrl;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rows: S.rows })); } catch (e) {}
  toast('Saved successfully ✔  ' + r[0], 'ok');
  resetForm(); $('search').value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ---------- start ---------- */
if (API_URL.startsWith('PASTE')) { setStatus('Set API_URL', 'bad'); toast('Paste your Apps Script URL in app.js', 'bad'); }
else loadData();
