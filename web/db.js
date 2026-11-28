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
  schoolId: null,
  schoolName: '',
  tests: [],
  submissions: [],
  registrations: [],
  online: true
};

// ---------------------------------------------------------
// Kolleksiyalar: ilova `state` <-> jadval
// ---------------------------------------------------------
const SETTINGS_KEYS = ['schoolRules', 'mockRules', 'gformsConfig', 'kidsMockFormConfig', 'gdriveConfig', 'mockSessions', 'mockRooms', 'centerInfo', 'eduLeadDefaults', 'mockSchedule', 'botAdmins', 'directorSmsPhones'];

// Sinf va o'quvchilar faol maktab bo'yicha (scoped) yuklanadi; har bir yozuvga schoolId qo'yiladi
const stampSchool = o => { if (!o.schoolId) o.schoolId = crm.schoolId; return o; };

const COLLECTIONS = [
  { ...arrayCollection('schools', 'crm_schools', 'id', o => String(o.id), o => ({ id: String(o.id), data: o })), adminOnly: true },
  { ...arrayCollection('classes', 'crm_classes', 'name', o => String(o.name), o => ({ name: String(o.name), data: stampSchool(o) })), scoped: true, conflict: 'school_id,name' },
  { ...arrayCollection('students', 'crm_students', 'id', o => String(o.id), o => ({ id: Number(o.id), data: stampSchool(o) })), scoped: true },
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
    // Maktab ball tizimi har bir maktab uchun alohida: kalit `schoolRules@<maktab>`
    items() {
      const m = new Map();
      SETTINGS_KEYS.forEach(k => {
        if (state[k] === undefined) return;
        const key = k === 'schoolRules' ? `schoolRules@${crm.schoolId}` : k;
        m.set(key, { key, value: state[k] });
      });
      return m;
    },
    applyRows(rows) {
      const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
      SETTINGS_KEYS.filter(k => k !== 'schoolRules').forEach(k => { if (byKey[k] !== undefined) state[k] = byKey[k]; });
      const own = byKey[`schoolRules@${crm.schoolId}`];
      const legacy = crm.schoolId === '12-maktab' ? byKey.schoolRules : undefined;
      state.schoolRules = own || legacy || { q1: 40, w1: 1.5, q2: 40, w2: 1 };
    },
    applyOne(row, deleted) {
      if (deleted) return;
      if (row.key === `schoolRules@${crm.schoolId}`) state.schoolRules = row.value;
      else if (SETTINGS_KEYS.includes(row.key) && row.key !== 'schoolRules') state[row.key] = row.value;
    },
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
async function fetchAll(table, order, schoolId) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select('*').range(from, from + size - 1);
    if (schoolId) q = q.eq('school_id', schoolId);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

async function loadCollection(c) {
  const rows = await fetchAll(c.table, c.pk, c.scoped ? crm.schoolId : null);
  c.applyRows(rows);
  const snap = snapshot.get(c.name);
  snap.clear();
  // snapshot ilova formatidan qayta hisoblanadi (bir xil serializatsiya uchun)
  c.items().forEach((row, k) => snap.set(k, rowJson(row)));
}

const SCHOOL_KEY = 'crm_active_school';
function pickSchool() {
  const schools = state.schools || [];
  const ids = schools.map(x => String(x.id));
  if (crm.role === 'teacher') return crm.profile?.school_id || '12-maktab';
  let saved = null;
  try { saved = localStorage.getItem(SCHOOL_KEY); } catch (e) { /* */ }
  if (saved && ids.includes(saved)) return saved;
  return ids.includes('12-maktab') ? '12-maktab' : (ids[0] || '12-maktab');
}

function setActiveSchool(id) {
  crm.schoolId = id;
  const sc = (state.schools || []).find(x => String(x.id) === id);
  crm.schoolName = sc?.name || id;
  try { localStorage.setItem(SCHOOL_KEY, id); } catch (e) { /* */ }
  applySchoolLabels();
}

function applySchoolLabels() {
  const t = document.getElementById('crm-school-title');
  if (t) t.textContent = `Registan LC · ${crm.schoolName} CRM`;
  document.querySelectorAll('.crm-school-name').forEach(el => { el.textContent = crm.schoolName; });
  const sel = document.getElementById('crm-school-select');
  if (sel) {
    sel.innerHTML = (state.schools || []).map(x => `<option value="${escapeHtml(x.id)}" ${x.id === crm.schoolId ? 'selected' : ''}>🏫 ${escapeHtml(x.name || x.id)}</option>`).join('');
    sel.disabled = crm.role === 'teacher';
  }
  document.title = `${crm.schoolName} · Registan LC CRM`;
}
crm.applySchoolLabels = applySchoolLabels;

async function loadAll() {
  const schoolsCol = COLLECTIONS.find(c => c.name === 'schools');
  await loadCollection(schoolsCol);
  setActiveSchool(pickSchool());
  for (const c of COLLECTIONS) {
    if (c !== schoolsCol) await loadCollection(c);
  }
  await loadPlatformData();
}

// Faol maktabni almashtirish: kutilayotgan saqlashni tugatib, sinf/o'quvchilarni qayta yuklaymiz
crm.switchSchool = async id => {
  if (id === crm.schoolId) return;
  clearTimeout(syncTimer);
  if (dirty || syncing) {
    if (!syncing) await runSync();
    for (let i = 0; i < 100 && (syncing || dirty); i++) await new Promise(r => setTimeout(r, 100));
  }
  setActiveSchool(id);
  setStatus('saving', '⏳ Maktab yuklanmoqda…');
  for (const c of COLLECTIONS) if (c.scoped || c.name === 'settings') await loadCollection(c);
  openedClassName = null;
  loadState();
  renderCurrentTab();
  setStatus('ok');
  showToast(`${crm.schoolName} tanlandi`, '🏫');
};

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
        const { error } = await sb.from(c.table).upsert(part.map(p => p[1]), { onConflict: c.conflict || c.pk });
        if (error) throw error;
        part.forEach(([k, , j]) => snap.set(k, j));
      }
      for (const part of chunk(deletes, 300)) {
        const keys = c.pk === 'id' ? part.map(Number) : part;
        let del = sb.from(c.table).delete({ count: 'exact' }).in(c.pk, keys);
        if (c.scoped) del = del.eq('school_id', crm.schoolId);
        const { error, count } = await del;
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
      try { await loadCollection(c); } catch (e) { /* keyingi urinishda */ }
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
      if (c.scoped && row.school_id && row.school_id !== crm.schoolId) return; // boshqa maktab
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
      if (c.name === 'schools') applySchoolLabels();
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

// ---------------------------------------------------------
// Sayt kirish rejimi: ochiq (avtomatik) yoki yopiq (bitta umumiy parol)
// ---------------------------------------------------------
const KIOSK_ID = '00000000-0000-4000-a000-00000000c0de';
crm.KIOSK_ID = KIOSK_ID;
crm.isKiosk = () => crm.user?.id === KIOSK_ID;

async function enterSite() {
  authOverlay(`<div class="text-center text-sm font-bold text-slate-600">⏳ Ochilmoqda…</div>`);
  const { data: info } = await sb.rpc('crm_access_info');
  crm.accessMode = info?.mode || 'open';
  crm.kioskEmail = info?.email;
  if (crm.accessMode === 'open') {
    const { data: cred } = await sb.rpc('crm_open_login');
    if (cred?.email) {
      const { error } = await sb.auth.signInWithPassword({ email: cred.email, password: cred.password });
      if (!error) return; // onAuthStateChange -> boot
    }
  }
  showSitePassword();
}

function showSitePassword(msg = '') {
  authOverlay(`
    <form id="crm-site-form" class="space-y-3">
      <input id="crm-site-pass" type="password" required autocomplete="current-password" placeholder="Platforma paroli" class="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-center" />
      <div id="crm-site-msg" class="text-xs font-bold text-rose-600 text-center">${escapeHtml(msg)}</div>
      <button class="w-full py-3 rounded-xl bg-[#F2642A] hover:bg-orange-600 text-white font-black text-sm">🔐 Kirish</button>
    </form>
    <div class="flex justify-between text-xs font-bold">
      <button id="crm-staff-login" class="text-indigo-700">Xodim hisobi (email) bilan kirish</button>
      <a href="parent.html" class="text-slate-500">👨‍👩‍👧 Ota-onalar</a>
    </div>
  `);
  setTimeout(() => document.getElementById('crm-site-pass')?.focus(), 50);
  document.getElementById('crm-staff-login').onclick = () => showLogin();
  document.getElementById('crm-site-form').onsubmit = async e => {
    e.preventDefault();
    const password = document.getElementById('crm-site-pass').value;
    document.getElementById('crm-site-msg').textContent = '⏳';
    const { error } = await sb.auth.signInWithPassword({ email: crm.kioskEmail || 'platforma@registan-crm.local', password });
    if (error) showSitePassword('Parol noto‘g‘ri');
  };
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
      <button id="crm-auth-site" class="text-slate-500">← Umumiy parol</button>
      <a href="parent.html" class="text-slate-500">👨‍👩‍👧 Ota-onalar</a>
    </div>
  `);
  document.getElementById('crm-auth-toggle').onclick = () => showLogin(isSignup ? 'login' : 'signup');
  document.getElementById('crm-auth-site').onclick = () => enterSite();
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
  if (badge && !document.getElementById('crm-school-select')) {
    badge.insertAdjacentHTML('beforebegin', `<select id="crm-school-select" onchange="crm.switchSchool(this.value)" title="Faol maktab"
      class="text-[11px] font-black px-3 py-1.5 rounded-xl bg-white text-[#F2642A] border border-white/30 max-w-[200px]"></select>`);
  }
  if (badge && !document.getElementById('crm-user-chip')) {
    const roleLabel = crm.isKiosk() ? '🌐 Umumiy kirish' : ({ admin: '👑 Admin', operator: '🎧 Operator', teacher: '👩‍🏫 O‘qituvchi' }[crm.role] || crm.role);
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
  if (!session) { await enterSite(); return; }
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

  // Bo'sh baza namunaviy (o'ylab topilgan) 711 o'quvchi bilan avtomatik to'ldirilmaydi —
  // haqiqiy ro'yxat Excel orqali (CRM yoki imtihon botidagi "📥 Excel yuklash") yuklanadi.

  document.getElementById('crm-auth')?.remove();
  decorateHeader();
  applySchoolLabels();
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
