// =========================================================
// REGISTAN CRM — Supabase saqlash qatlami
// auth, to'liq yuklash, diff-sinxronlash, realtime, ID bloklari
// =========================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const { SUPABASE_URL, SUPABASE_KEY } = window.CRM_CONFIG;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const crm = window.crm = {
  sb,
  user: null,
  profile: null,
  role: null,
  tests: [],
  submissions: [],
  registrations: [],
  online: true
};

// ---------------------------------------------------------
// Kolleksiyalar: ilova `state` <-> jadval
// ---------------------------------------------------------
const SETTINGS_KEYS = ['schoolRules', 'mockRules', 'gformsConfig', 'kidsMockFormConfig', 'gdriveConfig', 'mockSessions', 'mockRooms'];

const COLLECTIONS = [
  arrayCollection('classes', 'crm_classes', 'name', o => String(o.name), o => ({ name: String(o.name), data: o })),
  arrayCollection('students', 'crm_students', 'id', o => String(o.id), o => ({ id: Number(o.id), data: o })),
  arrayCollection('mockStudents', 'crm_mock_students', 'id', o => String(o.id), o => ({ id: Number(o.id), data: o })),
  arrayCollection('payments', 'crm_payments', 'id', o => String(o.id), o => ({ id: Number(o.id), data: o })),
  {
    name: 'usedCards', table: 'crm_used_cards', pk: 'key',
    items() {
      const m = new Map();
      Object.entries(state.usedCards || {}).forEach(([k, v]) => m.set(k, { key: k, data: { v } }));
      return m;
    },
    applyRows(rows) {
      state.usedCards = {};
      rows.forEach(r => { state.usedCards[r.key] = r.data ? r.data.v : true; });
    },
    applyOne(row, deleted) {
      if (!state.usedCards) state.usedCards = {};
      if (deleted) delete state.usedCards[row.key];
      else state.usedCards[row.key] = row.data ? row.data.v : true;
    },
    keyOfRow: r => String(r.key)
  },
  {
    name: 'settings', table: 'crm_settings', pk: 'key', adminOnly: true,
    items() {
      const m = new Map();
      SETTINGS_KEYS.forEach(k => { if (state[k] !== undefined) m.set(k, { key: k, value: state[k] }); });
      return m;
    },
    applyRows(rows) { rows.forEach(r => { if (SETTINGS_KEYS.includes(r.key)) state[r.key] = r.value; }); },
    applyOne(row, deleted) { if (!deleted && SETTINGS_KEYS.includes(row.key)) state[row.key] = row.value; },
    keyOfRow: r => String(r.key)
  }
];

function arrayCollection(name, table, pk, keyOf, toRow) {
  return {
    name, table, pk,
    items() {
      const m = new Map();
      (state[name] || []).forEach(o => { if (o && keyOf(o) !== 'undefined') m.set(keyOf(o), toRow(o)); });
      return m;
    },
    applyRows(rows) { state[name] = rows.map(r => r.data); },
    applyOne(row, deleted) {
      const arr = state[name] || (state[name] = []);
      const k = String(row[pk]);
      const idx = arr.findIndex(o => keyOf(o) === k);
      if (deleted) { if (idx >= 0) arr.splice(idx, 1); return; }
      if (idx >= 0) arr[idx] = row.data; else arr.push(row.data);
    },
    keyOfRow: r => String(r[pk])
  };
}

// Oxirgi serverga mos holat: kolleksiya -> (kalit -> JSON)
const snapshot = new Map(COLLECTIONS.map(c => [c.name, new Map()]));
const rowJson = row => JSON.stringify(row.data !== undefined ? row.data : row.value);

// ---------------------------------------------------------
// Holat belgisi (header)
// ---------------------------------------------------------
function setStatus(kind, text) {
  const el = document.getElementById('cloud-status-badge');
  if (!el) return;
  const map = {
    ok: '☁️ Sinxron',
    saving: '⏳ Saqlanmoqda…',
    error: '⚠️ Saqlanmadi',
    offline: '📴 Offline'
  };
  el.textContent = text || map[kind] || kind;
  el.title = kind === 'ok' ? 'Barcha o‘zgarishlar bulutli bazada saqlangan' : '';
}

// ---------------------------------------------------------
// Yuklash
// ---------------------------------------------------------
async function fetchAll(table, order) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select('*').range(from, from + size - 1);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

async function loadAll() {
  for (const c of COLLECTIONS) {
    const rows = await fetchAll(c.table, c.pk);
    c.applyRows(rows);
    const snap = snapshot.get(c.name);
    snap.clear();
    // snapshot ilova formatidan qayta hisoblanadi (bir xil serializatsiya uchun)
    c.items().forEach((row, k) => snap.set(k, rowJson(row)));
  }
  await loadPlatformData();
}

async function loadPlatformData() {
  const [tests, subs, regs] = await Promise.all([
    sb.from('crm_tests').select('*').order('created_at', { ascending: false }),
    sb.from('crm_omr_submissions').select('*').order('created_at', { ascending: false }).limit(500),
    sb.from('crm_mock_registrations').select('*').order('created_at', { ascending: false }).limit(2000)
  ]);
  crm.tests = tests.data || [];
  crm.submissions = subs.data || [];
  crm.registrations = regs.data || [];
}
crm.reloadPlatformData = async () => { await loadPlatformData(); scheduleRender(true); };

// ---------------------------------------------------------
// Sinxronlash (diff -> upsert / delete)
// ---------------------------------------------------------
let syncTimer = null;
let syncing = false;
let dirty = false;
let retryDelay = 2000;

window.crmQueueSync = function () {
  dirty = true;
  setStatus('saving');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, 400);
};

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function runSync() {
  if (!crm.user) return;
  if (syncing) { dirty = true; return; }
  syncing = true;
  dirty = false;
  let failed = false;
  const denied = [];
  for (const c of COLLECTIONS) {
    if (c.adminOnly && crm.role !== 'admin') continue;
    const snap = snapshot.get(c.name);
    const cur = c.items();
    const upserts = [];
    cur.forEach((row, k) => { const j = rowJson(row); if (snap.get(k) !== j) upserts.push([k, row, j]); });
    const deletes = [...snap.keys()].filter(k => !cur.has(k));
    try {
      for (const part of chunk(upserts, 500)) {
        const { error } = await sb.from(c.table).upsert(part.map(p => p[1]), { onConflict: c.pk });
        if (error) throw error;
        part.forEach(([k, , j]) => snap.set(k, j));
      }
      for (const part of chunk(deletes, 300)) {
        const keys = c.pk === 'id' ? part.map(Number) : part;
        const { error, count } = await sb.from(c.table).delete({ count: 'exact' }).in(c.pk, keys);
        if (error) throw error;
        if (count !== null && count < part.length) {
          const e = new Error('Ruxsat yo‘q'); e.code = '42501'; throw e;
        }
        part.forEach(k => snap.delete(k));
      }
    } catch (err) {
      console.warn('Sinxronlash xatosi', c.table, err);
      if (err.code === '42501' || /row-level security|permission/i.test(err.message || '')) {
        denied.push(c);
      } else {
        failed = true;
      }
    }
  }
  syncing = false;

  if (denied.length) {
    // Ruxsat yo'q o'zgarishlarni bekor qilib, serverdagi holatni qaytaramiz
    for (const c of denied) {
      try {
        const rows = await fetchAll(c.table, c.pk);
        c.applyRows(rows);
        const snap = snapshot.get(c.name);
        snap.clear();
        c.items().forEach((row, k) => snap.set(k, rowJson(row)));
      } catch (e) { /* keyingi urinishda */ }
    }
    showToast('Bu amal uchun ruxsatingiz yo‘q — o‘zgarish bekor qilindi', '⛔');
    scheduleRender(true);
  }

  if (failed) {
    setStatus(navigator.onLine ? 'error' : 'offline');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
    return;
  }
  retryDelay = 2000;
  if (dirty) { runSync(); return; }
  setStatus('ok');
}

window.addEventListener('beforeunload', e => {
  if (dirty || syncing) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('online', () => window.crmQueueSync());

// ---------------------------------------------------------
// Realtime
// ---------------------------------------------------------
let renderTimer = null;
function scheduleRender(force) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const a = document.activeElement;
    const busy = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('main');
    if (busy && !force) { scheduleRender(); return; }
    try { renderCurrentTab(); } catch (e) { console.warn(e); }
  }, typing() ? 1200 : 300);
  function typing() {
    const a = document.activeElement;
    return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
  }
}
crm.scheduleRender = scheduleRender;

function subscribeRealtime() {
  const ch = sb.channel('crm-live');
  COLLECTIONS.forEach(c => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: c.table }, payload => {
      const deleted = payload.eventType === 'DELETE';
      const row = deleted ? payload.old : payload.new;
      if (!row) return;
      const k = c.keyOfRow(row);
      const snap = snapshot.get(c.name);
      if (deleted) {
        if (!snap.has(k)) return;
        snap.delete(k);
      } else {
        const j = JSON.stringify(row.data !== undefined ? row.data : row.value);
        if (snap.get(k) === j) return; // o'zimizning yozuvimiz
        snap.set(k, j);
      }
      c.applyOne(row, deleted);
      scheduleRender();
    });
  });
  const platformTables = {
    crm_tests: ['tests', 'code'],
    crm_omr_submissions: ['submissions', 'id'],
    crm_mock_registrations: ['registrations', 'id']
  };
  Object.entries(platformTables).forEach(([table, [key, pk]]) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      const arr = crm[key];
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      const idx = arr.findIndex(x => x[pk] === row[pk]);
      if (payload.eventType === 'DELETE') { if (idx >= 0) arr.splice(idx, 1); }
      else if (idx >= 0) arr[idx] = row; else arr.unshift(row);
      if (payload.eventType === 'INSERT' && table === 'crm_mock_registrations') {
        showToast(`Botdan yangi Kids Mock arizasi: ${row.full_name}`, '🧒');
      }
      if (payload.eventType === 'INSERT' && table === 'crm_omr_submissions') {
        showToast(`Bot orqali tekshirildi: ${row.student_name || ''} — ${row.score ?? ''} ball`, '📝');
      }
      scheduleRender();
    });
  });
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED') setStatus('ok');
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('offline');
  });
}

// ---------------------------------------------------------
// ID bloklari (bir vaqtda ishlovchi operatorlar to'qnashmasligi uchun)
// ---------------------------------------------------------
async function reserveIdBlock() {
  const { data, error } = await sb.rpc('crm_reserve_id_block');
  if (error) { console.warn('ID blok olinmadi', error); return; }
  window.__crmIdBlock = { start: Number(data), end: Number(data) + 1000 };
}
crm.reserveIdBlock = reserveIdBlock;

// ---------------------------------------------------------
// Auth UI
// ---------------------------------------------------------
function authOverlay(html) {
  let el = document.getElementById('crm-auth');
  if (!el) {
    el = document.createElement('div');
    el.id = 'crm-auth';
    el.className = 'fixed inset-0 z-[100] bg-gradient-to-br from-[#F2642A] via-orange-500 to-amber-400 flex items-center justify-center p-4';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
    <div class="text-center">
      <div class="text-3xl">🎓</div>
      <h1 class="text-lg font-black text-slate-900">Registan LC · CRM Platforma</h1>
      <p class="text-xs text-slate-500">12-Maktab · Kids Mock · Telegram bot · Edutizim</p>
    </div>
    ${html}
  </div>`;
  return el;
}

function showLogin(mode = 'login', msg = '') {
  const isSignup = mode === 'signup';
  authOverlay(`
    <form id="crm-auth-form" class="space-y-3">
      ${isSignup ? `<input id="crm-auth-name" required placeholder="F.I.Sh." class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold" />` : ''}
      <input id="crm-auth-email" type="email" required autocomplete="email" placeholder="Email" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold" />
      <input id="crm-auth-pass" type="password" required minlength="6" autocomplete="${isSignup ? 'new-password' : 'current-password'}" placeholder="Parol" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold" />
      <div id="crm-auth-msg" class="text-xs font-bold ${msg.startsWith('✅') ? 'text-emerald-700' : 'text-rose-600'}">${escapeHtml(msg)}</div>
      <button class="w-full py-3 rounded-xl bg-[#F2642A] hover:bg-orange-600 text-white font-black text-sm">${isSignup ? '📝 Ro‘yxatdan o‘tish' : '🔐 Kirish'}</button>
    </form>
    <div class="flex justify-between text-xs font-bold">
      <button id="crm-auth-toggle" class="text-indigo-700">${isSignup ? 'Hisobim bor — kirish' : 'Yangi xodim — ro‘yxatdan o‘tish'}</button>
      <a href="parent.html" class="text-slate-500">👨‍👩‍👧 Ota-onalar</a>
    </div>
  `);
  document.getElementById('crm-auth-toggle').onclick = () => showLogin(isSignup ? 'login' : 'signup');
  document.getElementById('crm-auth-form').onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById('crm-auth-email').value.trim();
    const password = document.getElementById('crm-auth-pass').value;
    const msgEl = document.getElementById('crm-auth-msg');
    msgEl.className = 'text-xs font-bold text-slate-500';
    msgEl.textContent = '⏳ Tekshirilmoqda…';
    if (isSignup) {
      const full_name = document.getElementById('crm-auth-name').value.trim();
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: location.origin + location.pathname } });
      if (error) return showLogin('signup', error.message);
      if (!data.session) return showLogin('login', '✅ Emailingizga tasdiqlash xati yuborildi. Tasdiqlab, so‘ng kiring.');
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return showLogin('login', error.message === 'Invalid login credentials' ? 'Email yoki parol noto‘g‘ri' : error.message);
    }
  };
}

function showPending() {
  authOverlay(`
    <div class="text-center space-y-3">
      <div class="text-sm font-bold text-slate-700">⏳ Hisobingiz yaratildi, lekin hali tasdiqlanmagan.</div>
      <div class="text-xs text-slate-500">Administrator sizga rol (operator / o‘qituvchi) berishi bilan tizimga kira olasiz.</div>
      <div class="text-xs font-mono text-slate-400">${escapeHtml(crm.user.email || '')}</div>
      <div class="flex gap-2 justify-center">
        <button onclick="location.reload()" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black">🔄 Qayta tekshirish</button>
        <button onclick="crmLogout()" class="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-black">Chiqish</button>
      </div>
    </div>
  `);
}

window.crmLogout = async () => { await sb.auth.signOut(); location.reload(); };

function decorateHeader() {
  const badge = document.getElementById('cloud-status-badge');
  if (badge && !document.getElementById('crm-user-chip')) {
    const roleLabel = { admin: '👑 Admin', operator: '🎧 Operator', teacher: '👩‍🏫 O‘qituvchi' }[crm.role] || crm.role;
    badge.insertAdjacentHTML('afterend', `
      <span id="crm-user-chip" class="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white/15 text-white border border-white/30" title="${escapeHtml(crm.user.email || '')}">${roleLabel} · ${escapeHtml(crm.profile?.full_name || crm.user.email || '')}</span>
      <button onclick="crmLogout()" class="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 text-xs font-bold transition">🚪 Chiqish</button>
    `);
  }
  document.body.classList.add('role-' + crm.role);
  // Faqat admin uchun tugmalar
  ['openSchoolRulesModal()', 'openClearBaseModal()', 'resetToDefault711()', 'openHtmlPasteModal()'].forEach(fn => {
    document.querySelectorAll(`header button[onclick="${fn}"]`).forEach(b => b.classList.add('admin-only'));
  });
}

// ---------------------------------------------------------
// Boot
// ---------------------------------------------------------
let booted = false;
async function boot(session) {
  if (booted) return;
  if (!session) { showLogin(); return; }
  crm.user = session.user;
  const { data: profile, error } = await sb.from('crm_profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) { showLogin('login', 'Profil o‘qilmadi: ' + error.message); return; }
  crm.profile = profile;
  crm.role = profile?.role || 'pending';
  if (crm.role === 'pending') { showPending(); return; }
  booted = true;

  authOverlay(`<div class="text-center text-sm font-bold text-slate-600">⏳ Bulutli baza yuklanmoqda…</div>`);
  try {
    await loadAll();
  } catch (e) {
    authOverlay(`<div class="text-center space-y-3"><div class="text-sm font-bold text-rose-600">Baza yuklanmadi: ${escapeHtml(e.message || String(e))}</div>
      <button onclick="location.reload()" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black">🔄 Qayta urinish</button></div>`);
    booted = false;
    return;
  }
  await reserveIdBlock();

  // Bo'sh baza: admin uchun standart 711 o'quvchini yuklash
  if (!state.classes.length && !state.students.length && crm.role === 'admin') {
    const def = generateDefault711Data();
    state.classes = def.classes;
    state.students = def.students;
    showToast('Baza bo‘sh edi — standart 711 o‘quvchi bulutga yuklanmoqda', '☁️');
    window.crmQueueSync();
  }

  document.getElementById('crm-auth')?.remove();
  decorateHeader();
  loadState();
  switchTab('dashboard');
  subscribeRealtime();
  setStatus('ok');
}

let bootPromise = null;
function bootOnce(session) {
  if (booted || bootPromise) return;
  bootPromise = boot(session).finally(() => { bootPromise = null; });
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') { location.reload(); return; }
  if (session && !booted) setTimeout(() => bootOnce(session), 0);
});

sb.auth.getSession().then(({ data }) => bootOnce(data.session));
