// =========================================================
// LAYLO PARDAYEVA KITOBXONLIK AKADEMIYASI — CRM
// Rollar: admin (hammasi) · moderator (kitob, test, taqriz, guruh) · kassir (a'zolar, kassa)
// =========================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const { SUPABASE_URL, SUPABASE_KEY } = window.KA_CONFIG;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const S = { me: null, view: 'dashboard', settings: {}, cache: {} };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => (d ? new Date(d).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDay = d => (d ? new Date(d).toLocaleDateString('uz-UZ') : '—');
const money = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';
const role = () => S.me?.role;
const is = (...r) => r.includes(role());
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function toast(msg, ok = true) {
  const t = $('toast');
  t.textContent = (ok ? '✅ ' : '⚠️ ') + msg;
  t.style.background = ok ? '#1f2a37' : '#be123c';
  t.classList.remove('opacity-0', 'translate-y-4');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('opacity-0', 'translate-y-4'), 3200);
}
function modal(html) { $('modal-box').innerHTML = `<button class="absolute top-3 right-4 text-xl text-slate-400" onclick="closeModal()">✕</button>${html}`; $('modal').classList.remove('hidden'); }
window.closeModal = () => { $('modal').classList.add('hidden'); $('modal-box').innerHTML = ''; };

async function fn(action, body = {}) {
  const { data, error } = await sb.functions.invoke('ka-admin', { body: { action, ...body } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { /* */ }
    return { ok: false, error: msg };
  }
  return data;
}
async function mediaUrl(fileId) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ka-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'media', fileId })
  });
  if (!res.ok) throw new Error('Fayl olinmadi');
  return URL.createObjectURL(await res.blob());
}
const chk = (error, okMsg) => { if (error) { toast(error.message || String(error), false); return false; } if (okMsg) toast(okMsg); return true; };

// =========================================================
// Kirish
// =========================================================
let signUp = false;
$('a-toggle').onclick = () => {
  signUp = !signUp;
  $('name-wrap').style.display = signUp ? 'block' : 'none';
  $('a-btn').textContent = signUp ? 'Ro‘yxatdan o‘tish' : 'Kirish';
  $('a-toggle').textContent = signUp ? 'Hisobim bor — kirish' : 'Yangi xodim — ro‘yxatdan o‘tish';
};
$('a-btn').onclick = async () => {
  const email = $('a-email').value.trim(), password = $('a-pass').value;
  $('a-msg').textContent = '';
  if (!email || password.length < 6) { $('a-msg').textContent = 'Email va kamida 6 belgili parol kiriting'; return; }
  const r = signUp
    ? await sb.auth.signUp({ email, password, options: { data: { app: 'ka', full_name: $('a-name').value.trim() || email.split('@')[0] }, emailRedirectTo: location.origin } })
    : await sb.auth.signInWithPassword({ email, password });
  if (r.error) { $('a-msg').textContent = r.error.message; return; }
  if (signUp && !r.data.session) { $('a-msg').style.color = '#059669'; $('a-msg').textContent = 'Emailingizga tasdiqlash xati yuborildi.'; return; }
  boot();
};
window.logout = async () => { await sb.auth.signOut(); location.reload(); };

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  ['auth', 'app', 'pending'].forEach(id => $(id).classList.add('hidden'));
  if (!session) { $('auth').classList.remove('hidden'); return; }
  let { data: me } = await sb.from('ka_staff').select('*').eq('id', session.user.id).maybeSingle();
  if (!me) { // boshqa tizim (Registan CRM) hisobi bilan kirgan — Akademiyaga ariza
    await sb.rpc('ka_join');
    ({ data: me } = await sb.from('ka_staff').select('*').eq('id', session.user.id).maybeSingle());
  }
  if (!me || me.role === 'pending') { $('pending').classList.remove('hidden'); return; }
  S.me = me;
  $('me-name').textContent = me.full_name || me.email;
  $('me-role').textContent = { admin: '👑 Admin', moderator: '🎓 Moderator / ustoz', kassir: '💳 Kassir' }[me.role];
  $('app').classList.remove('hidden');
  await loadSettings();
  buildNav();
  const v = location.hash.slice(1);
  go(NAV.some(n => n.id === v && n.roles.includes(role())) ? v : 'dashboard');
  subscribe();
}

async function loadSettings() {
  const { data } = await sb.from('ka_settings').select('key,value');
  S.settings = Object.fromEntries((data || []).map(r => [r.key, r.value]));
}

// =========================================================
// Navigatsiya
// =========================================================
const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', roles: ['admin', 'moderator', 'kassir'] },
  { id: 'members', icon: '👤', label: 'A’zolar', roles: ['admin', 'moderator', 'kassir'] },
  { id: 'books', icon: '📚', label: 'Kitoblar', roles: ['admin', 'moderator'] },
  { id: 'tests', icon: '📝', label: 'Kitob testlari', roles: ['admin', 'moderator'] },
  { id: 'reviews', icon: '🎙', label: 'Audio taqrizlar', roles: ['admin', 'moderator'], badge: 'reviews_new' },
  { id: 'groups', icon: '👥', label: 'Guruhlar va chat', roles: ['admin', 'moderator'] },
  { id: 'contests', icon: '🏆', label: 'Tanlovlar', roles: ['admin', 'moderator'] },
  { id: 'kassa', icon: '💳', label: 'Kassa', roles: ['admin', 'kassir'], badge: 'payments_pending' },
  { id: 'broadcast', icon: '📢', label: 'Xabar yuborish', roles: ['admin'] },
  { id: 'settings', icon: '⚙️', label: 'Sozlamalar', roles: ['admin'] },
  { id: 'profile', icon: '🔗', label: 'Profil va bot', roles: ['admin', 'moderator', 'kassir'] }
];
let badges = {};
function buildNav() {
  $('nav').innerHTML = NAV.filter(n => n.roles.includes(role())).map(n => `
    <button onclick="go('${n.id}')" id="nav-${n.id}" class="nav-item w-full text-left px-3 py-2 rounded-xl text-sm font-semibold hover:bg-gold-50 flex items-center gap-2">
      <span>${n.icon}</span><span class="flex-1">${n.label}</span>
      ${n.badge && badges[n.badge] ? `<span class="badge bg-rose-500 text-white">${badges[n.badge]}</span>` : ''}
    </button>`).join('');
  $(`nav-${S.view}`)?.classList.add('active');
}
async function refreshBadges() {
  const { data } = await sb.rpc('ka_dashboard');
  if (data) { badges = data; buildNav(); }
  return data;
}
window.go = v => {
  S.view = v;
  location.hash = v;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  $(`nav-${v}`)?.classList.add('active');
  if (window.innerWidth < 1024) $('nav').classList.add('hidden');
  if (chatSub && v !== 'groups') { sb.removeChannel(chatSub); chatSub = null; }
  render();
};
function render() { (VIEWS[S.view] || VIEWS.dashboard)(); }
const page = (title, sub, right = '') => `
  <div class="flex items-end justify-between gap-3 flex-wrap mb-5">
    <div><h1 class="font-serif text-3xl font-black">${title}</h1>${sub ? `<p class="text-sm text-slate-500 mt-1">${sub}</p>` : ''}</div>
    <div class="flex gap-2 flex-wrap">${right}</div>
  </div>`;

// Realtime: yangi taqriz / to'lov / a'zo — badge va toast
function subscribe() {
  sb.channel('ka-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ka_reviews' }, () => { if (is('admin', 'moderator')) { toast('Yangi audio taqriz keldi 🎙'); refreshBadges(); if (S.view === 'reviews') render(); } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ka_payments' }, p => { if (is('admin', 'kassir') && p.new.status === 'Kutilmoqda') { toast('Yangi to‘lov cheki 💳'); refreshBadges(); if (S.view === 'kassa') render(); } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ka_members' }, p => { toast(`Yangi a’zo: ${p.new.full_name}`); if (S.view === 'members' || S.view === 'dashboard') render(); })
    .subscribe();
}

// =========================================================
// 📊 Dashboard
// =========================================================
const VIEWS = {};
VIEWS.dashboard = async () => {
  $('view').innerHTML = page('Dashboard', 'Akademiyaning umumiy holati') + '<div class="text-slate-400">⏳</div>';
  const [d, { data: top }, { data: recent }] = await Promise.all([
    refreshBadges(),
    sb.rpc('ka_leaderboard', { p_period: 'month', p_limit: 10 }),
    sb.from('ka_completions').select('id,kind,title,points,created_at,member:ka_members(full_name)').order('id', { ascending: false }).limit(8)
  ]);
  if (!d) return;
  const tile = (icon, label, val, sub = '', go2 = '') => `
    <button ${go2 ? `onclick="go('${go2}')"` : ''} class="card text-left hover:shadow-md transition">
      <div class="text-xs font-bold text-slate-500">${icon} ${label}</div>
      <div class="text-3xl font-black mt-1">${val}</div>
      ${sub ? `<div class="text-xs text-slate-500 mt-1">${sub}</div>` : ''}
    </button>`;
  $('view').innerHTML = page('Dashboard', 'Akademiyaning umumiy holati') + `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${tile('👤', 'A’zolar', d.members, `+${d.members_week} shu haftada`, 'members')}
      ${tile('📚', 'Kitoblar', d.books, `${d.opens} marta yuklab olingan`, is('kassir') ? '' : 'books')}
      ${tile('📝', 'Testlar', d.attempts, `${d.passed} tasi o‘tgan`, is('kassir') ? '' : 'tests')}
      ${tile('🎓', 'Yakunlangan kitoblar', d.completions, 'sertifikat berilgan')}
      ${tile('🎙', 'Kutilayotgan taqrizlar', d.reviews_new, 'baholash kerak', is('kassir') ? '' : 'reviews')}
      ${tile('👥', 'Guruhlar', d.groups, `${d.meetings_next} ta rejalashtirilgan uchrashuv`, is('kassir') ? '' : 'groups')}
      ${S.settings.membership?.enabled || is('admin', 'kassir') ? tile('💳', 'Pullik a’zolar', d.paid, `${d.payments_pending} ta chek kutmoqda`, is('moderator') ? '' : 'kassa') : ''}
      ${is('admin', 'kassir') ? tile('💰', 'Shu oy tushum', money(d.revenue_month), '', 'kassa') : ''}
    </div>
    <div class="grid lg:grid-cols-2 gap-4 mt-4">
      <div class="card">
        <h3 class="font-black mb-3">🏅 Shu oy reytingi</h3>
        <table class="tbl"><thead><tr><th>#</th><th>A’zo</th><th>Ball</th><th>Kitob</th><th>Tanlov</th></tr></thead><tbody>
        ${(top || []).map(r => `<tr><td class="font-black">${['🥇', '🥈', '🥉'][r.rank - 1] || r.rank}</td><td class="font-semibold">${esc(r.full_name)}<div class="text-[11px] text-slate-400">${esc(r.city || '')}</div></td><td class="font-black">${r.points}</td><td>${r.books}</td><td>${r.contests}</td></tr>`).join('') || '<tr><td colspan="5" class="text-slate-400 text-center py-6">Hali natija yo‘q</td></tr>'}
        </tbody></table>
      </div>
      <div class="card">
        <h3 class="font-black mb-3">🎓 So‘nggi sertifikatlar</h3>
        <div class="space-y-2">
        ${(recent || []).map(c => `<div class="flex items-center gap-3 text-sm"><span>${c.kind === 'book' ? '📖' : '🏆'}</span><div class="flex-1"><b>${esc(c.member?.full_name)}</b> — ${esc(c.title)}</div><span class="badge bg-gold-100 text-gold-700">+${c.points}</span><span class="text-xs text-slate-400">${fmtDay(c.created_at)}</span></div>`).join('') || '<div class="text-slate-400 text-sm">Hali yo‘q</div>'}
        </div>
      </div>
    </div>`;
};

// =========================================================
// 👤 A'zolar
// =========================================================
let mSearch = '';
const F = { m: 'all', rv: 'Yangi', pay: 'Kutilmoqda' };
window.setFilter = (k, v) => { F[k] = v; render(); };
window.render = () => render();
window.toast = toast;
VIEWS.members = async () => {
  const { data: members } = await sb.from('ka_members').select('*').order('id', { ascending: false }).limit(2000);
  S.cache.members = members || [];
  const now = Date.now();
  const q = mSearch.toLowerCase();
  const list = S.cache.members.filter(m => (!q || `${m.full_name} ${m.phone} ${m.city} ${m.tg_username}`.toLowerCase().includes(q)) &&
    (F.m === 'all' || (F.m === 'paid' ? m.paid_until && new Date(m.paid_until) > now : F.m === 'blocked' ? m.status === 'blocked' : !(m.paid_until && new Date(m.paid_until) > now))));
  $('view').innerHTML = page('A’zolar', `${S.cache.members.length} ta a’zo botda ro‘yxatdan o‘tgan`, `
    <input class="inp w-56" placeholder="🔍 Ism, telefon, shahar" value="${esc(mSearch)}" oninput="mSearchSet(this.value)">
    <select class="inp w-40" onchange="setFilter('m', this.value)">${[['all', 'Hammasi'], ['paid', '💳 Pullik'], ['unpaid', 'To‘lamagan'], ['blocked', '⛔ Bloklangan']].map(([v, l]) => `<option value="${v}" ${v === F.m ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn btn-soft" onclick="exportMembers()">📥 Excel</button>`) + `
    <div class="card overflow-x-auto"><table class="tbl"><thead><tr><th>№</th><th>F.I.Sh.</th><th>Yosh</th><th>Shahar</th><th>Telefon</th><th>A’zolik</th><th>Ro‘yxat</th><th></th></tr></thead><tbody>
    ${list.slice(0, 500).map(m => `<tr>
      <td class="text-slate-400 font-mono">#${m.id}</td>
      <td class="font-bold">${esc(m.full_name)}${m.status === 'blocked' ? ' <span class="badge bg-rose-100 text-rose-700">bloklangan</span>' : ''}${m.tg_username ? `<div class="text-[11px] text-sky-600 font-normal">@${esc(m.tg_username)}</div>` : ''}</td>
      <td>${m.age ?? ''}</td><td>${esc(m.city || '')}</td><td class="font-mono text-xs">${esc(m.phone || '')}</td>
      <td>${m.paid_until && new Date(m.paid_until) > now ? `<span class="badge bg-emerald-100 text-emerald-700">${fmtDay(m.paid_until)} gacha</span>` : '<span class="text-slate-400">—</span>'}</td>
      <td class="text-xs text-slate-500">${fmtDay(m.created_at)}</td>
      <td class="whitespace-nowrap"><button class="btn btn-soft btn-sm" onclick="memberCard(${m.id})">Ochish</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="text-center text-slate-400 py-8">A’zolar yo‘q. Ular botda /start orqali ro‘yxatdan o‘tadi.</td></tr>'}
    </tbody></table></div>`;
};
window.mSearchSet = v => { mSearch = v; clearTimeout(window._ms); window._ms = setTimeout(() => { render(); setTimeout(() => { const i = document.querySelector('#view input'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 50); }, 300); };
window.exportMembers = async () => {
  await loadXlsx();
  const rows = S.cache.members.map(m => ({ ID: m.id, 'F.I.Sh.': m.full_name, Yosh: m.age, Shahar: m.city, Telefon: m.phone, Telegram: m.tg_username ? '@' + m.tg_username : '', 'A’zolik': m.paid_until ? fmtDay(m.paid_until) : '', Holat: m.status, Ro‘yxat: fmtDay(m.created_at) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'A’zolar');
  XLSX.writeFile(wb, 'Kitobxonlar.xlsx');
};
async function loadXlsx() {
  if (window.XLSX) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
window.memberCard = async id => {
  const m = S.cache.members.find(x => x.id === id);
  const [{ data: comps }, { data: atts }, { data: pays }, { data: gm }] = await Promise.all([
    sb.from('ka_completions').select('*').eq('member_id', id).order('id', { ascending: false }),
    sb.from('ka_attempts').select('id,pct,passed,status,finished_at,test:ka_tests(title,kind)').eq('member_id', id).order('id', { ascending: false }).limit(20),
    is('admin', 'kassir') ? sb.from('ka_payments').select('*').eq('member_id', id).order('id', { ascending: false }) : { data: [] },
    sb.from('ka_group_members').select('group:ka_groups(name)').eq('member_id', id)
  ]);
  modal(`
    <h2 class="font-serif text-2xl font-black">${esc(m.full_name)}</h2>
    <div class="text-sm text-slate-500">${m.age ? m.age + ' yosh · ' : ''}${esc(m.city || '')} · ${esc(m.phone || '')} ${m.tg_username ? `· <a class="text-sky-600" href="https://t.me/${esc(m.tg_username)}" target="_blank">@${esc(m.tg_username)}</a>` : ''}</div>
    <div class="text-sm mt-1">👥 ${(gm || []).map(g => esc(g.group?.name)).join(', ') || 'guruhsiz'} · 💳 ${m.paid_until && new Date(m.paid_until) > new Date() ? `${fmtDay(m.paid_until)} gacha` : 'a’zolik yo‘q'}</div>
    <div class="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
      <div><h4 class="font-black mb-1">🎓 Sertifikatlar (${(comps || []).length})</h4>
        ${(comps || []).map(c => `<div class="flex items-center gap-2 py-1 border-b border-slate-100"><span class="flex-1">${c.kind === 'book' ? '📖' : '🏆'} ${esc(c.title)} <span class="text-xs text-slate-400">${esc(c.cert_no)}</span></span><b>+${c.points}</b>${is('admin', 'moderator') ? `<button class="btn btn-soft btn-sm" onclick="resendCert(${c.id})">↻</button>` : ''}</div>`).join('') || '<div class="text-slate-400">—</div>'}
      </div>
      <div><h4 class="font-black mb-1">📝 Testlar</h4>
        ${(atts || []).map(a => `<div class="py-1 border-b border-slate-100">${esc(a.test?.title)} — ${a.status === 'done' ? `<b>${a.pct}%</b> ${a.test?.kind === 'book' ? (a.passed ? '✅' : '❌') : ''}` : '⏳ jarayonda'}</div>`).join('') || '<div class="text-slate-400">—</div>'}
      </div>
    </div>
    ${is('admin', 'kassir') ? `<h4 class="font-black mt-4 mb-1 text-sm">💳 To‘lovlar</h4>${(pays || []).map(p => `<div class="text-sm py-1 border-b border-slate-100">${fmtDay(p.created_at)} · ${money(p.amount)} · ${p.days} kun · ${esc(p.status)}</div>`).join('') || '<div class="text-sm text-slate-400">—</div>'}
      <div class="mt-3 grid grid-cols-4 gap-2 items-end">
        <label class="f">Summa<input id="pm-amount" class="inp" type="number" value="${S.settings.membership?.price || 50000}"></label>
        <label class="f">Kun<input id="pm-days" class="inp" type="number" value="${S.settings.membership?.days || 30}"></label>
        <label class="f">Usul<select id="pm-method" class="inp"><option>naqd</option><option>karta</option><option>o‘tkazma</option><option>boshqa</option></select></label>
        <button class="btn btn-green justify-center" onclick="addPayment(${m.id})">＋ To‘lov</button>
      </div>` : ''}
    ${is('admin') ? `<div class="mt-4 flex gap-2 flex-wrap">
      <button class="btn ${m.status === 'blocked' ? 'btn-green' : 'btn-red'} btn-sm" onclick="toggleBlock(${m.id}, '${m.status === 'blocked' ? 'active' : 'blocked'}')">${m.status === 'blocked' ? '✅ Blokdan chiqarish' : '⛔ Bloklash'}</button>
      <button class="btn btn-soft btn-sm" onclick="deleteMember(${m.id})">🗑 O‘chirish</button></div>` : ''}`);
};
window.addPayment = async id => {
  const r = await fn('payment_add', { memberId: id, amount: $('pm-amount').value, days: $('pm-days').value, method: $('pm-method').value });
  if (!r.ok) return toast(r.error, false);
  toast('To‘lov kiritildi, a’zolik uzaytirildi'); closeModal(); render();
};
window.toggleBlock = async (id, status) => { const { error } = await sb.from('ka_members').update({ status }).eq('id', id); if (chk(error, 'Saqlandi')) { closeModal(); render(); } };
window.deleteMember = async id => { if (!confirm('A’zo va uning barcha natijalari o‘chiriladi. Davom etasizmi?')) return; const { error } = await sb.from('ka_members').delete().eq('id', id); if (chk(error, 'O‘chirildi')) { closeModal(); render(); } };
window.resendCert = async id => { toast('Yuborilmoqda…'); const r = await fn('resend_cert', { id }); r.ok ? toast('Sertifikat botga yuborildi') : toast(r.error, false); };

// =========================================================
// 📚 Kitoblar
// =========================================================
VIEWS.books = async () => {
  const [{ data: books }, { data: opens }] = await Promise.all([
    sb.from('ka_books').select('*').order('sort').order('id', { ascending: false }),
    sb.from('ka_book_opens').select('book_id')
  ]);
  S.cache.books = books || [];
  const cnt = {};
  (opens || []).forEach(o => { cnt[o.book_id] = (cnt[o.book_id] || 0) + 1; });
  $('view').innerHTML = page('Kitoblar', 'PDF, audio va qo‘llanma. Katta fayllarni botga /yukla orqali biriktirish mumkin.', '<button class="btn btn-gold" onclick="editBook()">＋ Kitob qo‘shish</button>') + `
    <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
    ${S.cache.books.map(b => `
      <div class="card flex gap-4 ${b.active ? '' : 'opacity-60'}">
        <div class="w-20 h-28 rounded-lg bg-gold-50 flex-shrink-0 overflow-hidden flex items-center justify-center text-3xl">${b.cover_url ? `<img src="${esc(b.cover_url)}" class="w-full h-full object-cover">` : '📖'}</div>
        <div class="flex-1 min-w-0">
          <div class="font-black leading-tight">${esc(b.title)}</div>
          <div class="text-xs text-slate-500">${esc(b.author || '')}${b.category ? ' · ' + esc(b.category) : ''}</div>
          <div class="flex gap-1 flex-wrap mt-2 text-[11px]">
            <span class="badge ${b.pdf_path || b.pdf_file_id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">📄 PDF</span>
            <span class="badge ${b.audio_path || b.audio_file_id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">🎧 Audio</span>
            <span class="badge ${b.guide || b.guide_path || b.guide_file_id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}">📘 Qo‘llanma</span>
            ${b.premium ? '<span class="badge bg-gold-100 text-gold-700">🔒 pullik</span>' : ''}
            ${b.active ? '' : '<span class="badge bg-slate-200">yashirin</span>'}
          </div>
          <div class="text-[11px] text-slate-400 mt-1">⬇️ ${cnt[b.id] || 0} marta olingan</div>
          <div class="flex gap-1 mt-2"><button class="btn btn-soft btn-sm" onclick="editBook(${b.id})">✏️ Tahrirlash</button><button class="btn btn-soft btn-sm" onclick="go('tests');setTimeout(()=>editTest(null, ${b.id}),300)">📝 Test</button></div>
        </div>
      </div>`).join('') || '<div class="card text-slate-400">Hali kitob yo‘q.</div>'}
    </div>`;
};
window.editBook = id => {
  const b = S.cache.books.find(x => x.id === id) || { title: '', author: '', category: '', description: '', pages: '', guide: '', premium: false, active: true, sort: 0 };
  const fileRow = (kind, label, accept) => {
    const has = b[`${kind}_path`] || b[`${kind}_file_id`];
    return `<div class="flex items-center gap-2 text-sm"><span class="w-28 font-bold">${label}</span>
      <span class="flex-1 text-xs ${has ? 'text-emerald-700' : 'text-slate-400'}">${b[`${kind}_path`] ? '☁️ yuklangan' : ''}${b[`${kind}_file_id`] ? ' ✈️ Telegram' : ''}${has ? '' : 'yo‘q'}</span>
      <input type="file" id="bf-${kind}" accept="${accept}" class="text-xs w-48"></div>`;
  };
  modal(`
    <h2 class="font-serif text-2xl font-black mb-4">${id ? 'Kitobni tahrirlash' : 'Yangi kitob'}</h2>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="f sm:col-span-2">Nomi *<input id="b-title" class="inp" value="${esc(b.title)}"></label>
      <label class="f">Muallif<input id="b-author" class="inp" value="${esc(b.author || '')}"></label>
      <label class="f">Janr / toifa<input id="b-category" class="inp" value="${esc(b.category || '')}" placeholder="Badiiy, ilmiy-ommabop…"></label>
      <label class="f">Sahifalar<input id="b-pages" type="number" class="inp" value="${b.pages || ''}"></label>
      <label class="f">Tartib (kichik — yuqorida)<input id="b-sort" type="number" class="inp" value="${b.sort || 0}"></label>
      <label class="f sm:col-span-2">Tavsif<textarea id="b-desc" rows="3" class="inp">${esc(b.description || '')}</textarea></label>
      <label class="f sm:col-span-2">📘 Qo‘llanma (asosiy g‘oyalar, qahramonlar, muhokama savollari)<textarea id="b-guide" rows="7" class="inp font-mono text-xs" placeholder="📌 Asosiy g‘oya: …&#10;👤 Qahramonlar: …&#10;❓ Muhokama savollari:&#10;1. …">${esc(b.guide || '')}</textarea></label>
    </div>
    <div class="mt-3 space-y-2 p-3 rounded-xl bg-gold-50">
      ${fileRow('pdf', '📄 PDF', 'application/pdf')}
      ${fileRow('audio', '🎧 Audio', 'audio/*')}
      ${fileRow('guide', '📘 Qo‘llanma PDF', 'application/pdf')}
      <div class="flex items-center gap-2 text-sm"><span class="w-28 font-bold">🖼 Muqova</span><span class="flex-1 text-xs text-slate-400">${b.cover_url ? 'bor' : 'yo‘q'}</span><input type="file" id="bf-cover" accept="image/*" class="text-xs w-48"></div>
      <p class="text-[11px] text-slate-500">Saytdan 50 MB gacha. Kattaroq fayl (masalan uzun audio) — botga ulangan holda <b>/yukla</b> buyrug‘i bilan Telegram’ning o‘ziga yuklang.</p>
    </div>
    <div class="flex gap-4 mt-3 text-sm">
      <label class="flex items-center gap-2"><input type="checkbox" id="b-premium" ${b.premium ? 'checked' : ''}> 🔒 Faqat pullik a’zolar</label>
      <label class="flex items-center gap-2"><input type="checkbox" id="b-active" ${b.active ? 'checked' : ''}> Botda ko‘rinadi</label>
    </div>
    <div class="flex gap-2 mt-4">
      <button class="btn btn-gold" id="b-save" onclick="saveBook(${id || 'null'})">💾 Saqlash</button>
      ${id && is('admin') ? `<button class="btn btn-red" onclick="deleteBook(${id})">🗑 O‘chirish</button>` : ''}
      <span id="b-progress" class="text-xs text-slate-500 self-center"></span>
    </div>`);
};
async function upload(bucket, file, prefix) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}
window.saveBook = async id => {
  const v = k => $(k).value.trim();
  if (!v('b-title')) return toast('Kitob nomini kiriting', false);
  const row = {
    title: v('b-title'), author: v('b-author') || null, category: v('b-category') || null, pages: Number(v('b-pages')) || null,
    sort: Number(v('b-sort')) || 0, description: v('b-desc') || null, guide: v('b-guide') || null,
    premium: $('b-premium').checked, active: $('b-active').checked
  };
  $('b-save').disabled = true;
  try {
    for (const kind of ['pdf', 'audio', 'guide']) {
      const f = $(`bf-${kind}`).files[0];
      if (!f) continue;
      if (f.size > 50 * 1024 * 1024) throw new Error(`${kind}: 50 MB dan katta — botda /yukla dan foydalaning`);
      $('b-progress').textContent = `⏳ ${f.name} yuklanmoqda…`;
      row[`${kind}_path`] = await upload('ka-books', f, kind);
      row[`${kind}_file_id`] = null; // yangi fayl — Telegram nusxasi qayta yaratiladi
    }
    const cover = $('bf-cover').files[0];
    if (cover) {
      $('b-progress').textContent = '⏳ Muqova yuklanmoqda…';
      const p = await upload('ka-covers', cover, 'c');
      row.cover_url = sb.storage.from('ka-covers').getPublicUrl(p).data.publicUrl;
    }
  } catch (e) { $('b-save').disabled = false; $('b-progress').textContent = ''; return toast(e.message || String(e), false); }
  const { error } = id ? await sb.from('ka_books').update(row).eq('id', id) : await sb.from('ka_books').insert(row);
  if (chk(error, 'Kitob saqlandi')) { closeModal(); render(); } else $('b-save').disabled = false;
};
window.deleteBook = async id => { if (!confirm('Kitob, uning testlari va natijalardagi bog‘lanish o‘chiriladi. Davom etasizmi?')) return; const { error } = await sb.from('ka_books').delete().eq('id', id); if (chk(error, 'O‘chirildi')) { closeModal(); render(); } };

// =========================================================
// 📝 Testlar (kitob testlari) va 🏆 Tanlovlar (yopiq test) — umumiy muharrir
// Savollarni matndan import qilish formati:
//   1. Savol matni?
//   A) variant
//   *B) to'g'ri variant
// =========================================================
function parseQuestions(text) {
  const qs = [];
  let cur = null;
  text.split(/\r?\n/).forEach(line => {
    const l = line.trim();
    if (!l) return;
    const opt = l.match(/^(\*)?\s*([A-Fa-f])[).:]\s*(.+?)\s*(\*)?$/);
    if (opt && cur) {
      if (opt[1] || opt[4]) cur.a = cur.o.length;
      cur.o.push(opt[3]);
      return;
    }
    const q = l.match(/^\d+\s*[).:-]\s*(.+)$/);
    cur = { q: q ? q[1] : l, o: [], a: -1 };
    qs.push(cur);
  });
  const bad = qs.findIndex(q => q.o.length < 2 || q.a < 0);
  return { qs, bad };
}
const questionsToText = qs => (qs || []).map((q, i) => `${i + 1}. ${q.q}\n${q.o.map((o, j) => `${j === q.a ? '*' : ''}${LETTERS[j]}) ${o}`).join('\n')}`).join('\n\n');

VIEWS.tests = async () => {
  const [{ data: tests }, { data: books }, { data: atts }] = await Promise.all([
    sb.from('ka_tests').select('*').eq('kind', 'book').order('id', { ascending: false }),
    sb.from('ka_books').select('id,title').order('title'),
    sb.from('ka_attempts').select('test_id,passed,status')
  ]);
  S.cache.tests = tests || [];
  S.cache.books = S.cache.books?.length ? S.cache.books : books || [];
  S.cache.bookList = books || [];
  const st = {};
  (atts || []).forEach(a => { if (a.status !== 'done') return; st[a.test_id] = st[a.test_id] || { n: 0, p: 0 }; st[a.test_id].n++; if (a.passed) st[a.test_id].p++; });
  const bname = id => (books || []).find(b => b.id === id)?.title || '—';
  $('view').innerHTML = page('Kitob testlari', 'Kitobni o‘qigan a’zo botda test topshiradi; o‘tsa — audio taqriz yuboradi.', '<button class="btn btn-gold" onclick="editTest()">＋ Test qo‘shish</button>') + `
    <div class="card overflow-x-auto"><table class="tbl"><thead><tr><th>Test</th><th>Kitob</th><th>Savollar</th><th>O‘tish</th><th>Urinish</th><th>Topshirgan / o‘tgan</th><th>Holat</th><th></th></tr></thead><tbody>
    ${S.cache.tests.map(t => `<tr>
      <td class="font-bold">${esc(t.title)}</td><td>${esc(bname(t.book_id))}</td><td>${(t.questions || []).length}</td><td>${t.pass_pct}%</td><td>${t.max_attempts}</td>
      <td>${st[t.id] ? `${st[t.id].n} / <b class="text-emerald-700">${st[t.id].p}</b>` : '0'}</td>
      <td>${t.active ? '<span class="badge bg-emerald-100 text-emerald-700">faol</span>' : '<span class="badge bg-slate-100">o‘chiq</span>'}</td>
      <td><button class="btn btn-soft btn-sm" onclick="editTest(${t.id})">✏️</button></td>
    </tr>`).join('') || '<tr><td colspan="8" class="text-center text-slate-400 py-8">Hali test yo‘q</td></tr>'}
    </tbody></table></div>`;
};

window.editTest = async (id, bookId, kind = 'book') => {
  if (!S.cache.bookList) { const { data } = await sb.from('ka_books').select('id,title').order('title'); S.cache.bookList = data || []; }
  const all = [...(S.cache.tests || []), ...(S.cache.contests || [])];
  const t = all.find(x => x.id === id) || { kind, title: '', book_id: bookId || null, questions: [], pass_pct: S.settings.rules?.passPct || 70, max_attempts: S.settings.rules?.maxAttempts || 3, time_limit_min: kind === 'contest' ? 30 : null, active: true, premium: false };
  const contest = t.kind === 'contest';
  const local = v => (v ? new Date(new Date(v).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  if (!id && bookId) { const b = S.cache.bookList.find(x => x.id === bookId); if (b) t.title = `«${b.title}» testi`; }
  modal(`
    <h2 class="font-serif text-2xl font-black mb-4">${id ? 'Tahrirlash' : contest ? 'Yangi tanlov' : 'Yangi kitob testi'}</h2>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="f sm:col-span-2">Nomi *<input id="t-title" class="inp" value="${esc(t.title)}"></label>
      ${contest ? `
        <label class="f">Ochiladi<input id="t-opens" type="datetime-local" class="inp" value="${local(t.opens_at)}"></label>
        <label class="f">Yopiladi<input id="t-closes" type="datetime-local" class="inp" value="${local(t.closes_at)}"></label>
        <label class="f">Vaqt (daqiqa)<input id="t-time" type="number" class="inp" value="${t.time_limit_min || ''}"></label>
        <label class="f">Kitob (ixtiyoriy)<select id="t-book" class="inp"><option value="">— umumiy —</option>${S.cache.bookList.map(b => `<option value="${b.id}" ${b.id === t.book_id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>
        <label class="f sm:col-span-2">Tavsif<input id="t-desc" class="inp" value="${esc(t.description || '')}"></label>` : `
        <label class="f sm:col-span-2">Kitob *<select id="t-book" class="inp">${S.cache.bookList.map(b => `<option value="${b.id}" ${b.id === t.book_id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>
        <label class="f">O‘tish chegarasi (%)<input id="t-pass" type="number" class="inp" value="${t.pass_pct}"></label>
        <label class="f">Urinishlar soni<input id="t-max" type="number" class="inp" value="${t.max_attempts}"></label>`}
      <label class="f sm:col-span-2">Savollar <span class="font-normal text-slate-400">— har savoldan keyin variantlar; to‘g‘ri javob oldiga <b>*</b> qo‘ying</span>
        <textarea id="t-qs" rows="14" class="inp font-mono text-xs" placeholder="1. Asar muallifi kim?&#10;A) Oybek&#10;*B) Abdulla Qodiriy&#10;C) Cho‘lpon&#10;D) Hamza">${esc(questionsToText(t.questions))}</textarea></label>
    </div>
    <div class="flex gap-4 mt-3 text-sm">
      <label class="flex items-center gap-2"><input type="checkbox" id="t-active" ${t.active ? 'checked' : ''}> Faol</label>
      <label class="flex items-center gap-2"><input type="checkbox" id="t-premium" ${t.premium ? 'checked' : ''}> 🔒 Pullik a’zolar uchun</label>
    </div>
    <div id="t-check" class="text-xs mt-2"></div>
    <div class="flex gap-2 mt-4">
      <button class="btn btn-gold" onclick="saveTest(${id || 'null'}, '${t.kind}')">💾 Saqlash</button>
      <button class="btn btn-soft" onclick="checkQs()">🔎 Tekshirish</button>
      ${id && is('admin') ? `<button class="btn btn-red" onclick="deleteTest(${id})">🗑</button>` : ''}
    </div>`);
};
window.checkQs = () => {
  const { qs, bad } = parseQuestions($('t-qs').value);
  $('t-check').innerHTML = bad >= 0 ? `<span class="text-rose-600 font-bold">⚠️ ${bad + 1}-savolda kamida 2 variant va bitta * belgili to‘g‘ri javob bo‘lishi kerak.</span>` : `<span class="text-emerald-700 font-bold">✅ ${qs.length} ta savol to‘g‘ri.</span>`;
  return bad < 0 && qs.length ? qs : null;
};
window.saveTest = async (id, kind) => {
  const qs = checkQs();
  if (!qs) return toast('Savollarni tekshiring', false);
  if (qs.some(q => q.o.length > 6)) return toast('Ko‘pi bilan 6 ta variant', false);
  const title = $('t-title').value.trim();
  if (!title) return toast('Nomini kiriting', false);
  const row = { kind, title, questions: qs, active: $('t-active').checked, premium: $('t-premium').checked, book_id: Number($('t-book').value) || null };
  if (kind === 'contest') {
    Object.assign(row, {
      description: $('t-desc').value.trim() || null, time_limit_min: Number($('t-time').value) || null, max_attempts: 1, pass_pct: 0,
      opens_at: $('t-opens').value ? new Date($('t-opens').value).toISOString() : null,
      closes_at: $('t-closes').value ? new Date($('t-closes').value).toISOString() : null
    });
    if (!row.opens_at || !row.closes_at) return toast('Ochilish va yopilish vaqtini kiriting', false);
    if (!id) row.announced = new Date(row.opens_at) < new Date(Date.now() - 3600_000);
  } else {
    if (!row.book_id) return toast('Kitobni tanlang', false);
    Object.assign(row, { pass_pct: Number($('t-pass').value) || 70, max_attempts: Number($('t-max').value) || 3 });
  }
  const { error } = id ? await sb.from('ka_tests').update(row).eq('id', id) : await sb.from('ka_tests').insert(row);
  if (chk(error, 'Saqlandi')) { closeModal(); render(); }
};
window.deleteTest = async id => { if (!confirm('Test va barcha urinishlar o‘chiriladi. Davom etasizmi?')) return; const { error } = await sb.from('ka_tests').delete().eq('id', id); if (chk(error, 'O‘chirildi')) { closeModal(); render(); } };

// =========================================================
// 🎙 Audio taqrizlar
// =========================================================
VIEWS.reviews = async () => {
  let q = sb.from('ka_reviews').select('*, member:ka_members(full_name,city), book:ka_books(title), attempt:ka_attempts(pct)').order('id', { ascending: F.rv === 'Yangi' }).limit(100);
  if (F.rv !== 'all') q = q.eq('status', F.rv);
  const { data: rows } = await q;
  const pass = S.settings.rules?.reviewPass ?? 6;
  $('view').innerHTML = page('Audio taqrizlar', `Testdan o‘tgan a’zolar yuborgan 2 daqiqalik ovozli taqrizlar. ${pass}+ ball — kitob yakunlanadi va sertifikat avtomatik yuboriladi.`, `
    <select class="inp w-44" onchange="setFilter('rv', this.value)">${[['Yangi', '⏳ Yangi'], ['Qayta', '🔁 Qayta so‘ralgan'], ['Baholandi', '✅ Baholangan'], ['all', 'Hammasi']].map(([v, l]) => `<option value="${v}" ${v === F.rv ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + `
    <div class="space-y-3">
    ${(rows || []).map(r => `
      <div class="card">
        <div class="flex items-start gap-4 flex-wrap">
          <div class="flex-1 min-w-[220px]">
            <div class="font-black">${esc(r.member?.full_name)} <span class="text-xs font-normal text-slate-400">${esc(r.member?.city || '')}</span></div>
            <div class="text-sm">📖 ${esc(r.book?.title)} · test: <b>${r.attempt?.pct ?? '—'}%</b> · ⏱ ${r.duration || '?'} s</div>
            <div class="text-xs text-slate-400">${fmt(r.created_at)} · #${r.id}</div>
            ${r.status !== 'Yangi' ? `<div class="text-sm mt-1">${r.status === 'Baholandi' ? `✅ Baho: <b>${r.score}/10</b>` : '🔁 Qayta yuborish so‘ralgan'}${r.comment ? ` — <i>${esc(r.comment)}</i>` : ''}</div>` : ''}
          </div>
          <div class="w-full sm:w-auto"><button class="btn btn-soft btn-sm" id="pl-${r.id}" onclick="playReview(${r.id}, '${esc(r.file_id)}')">▶️ Tinglash</button><div id="au-${r.id}"></div></div>
        </div>
        ${r.status !== 'Baholandi' ? `
        <div class="mt-3 flex items-end gap-2 flex-wrap">
          <div><div class="text-xs font-bold text-slate-500 mb-1">Baho</div><div class="flex gap-1" id="sc-${r.id}">${[...Array(11).keys()].map(n => `<button onclick="pickScore(${r.id},${n})" class="w-8 h-8 rounded-lg text-sm font-black ${n >= pass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}" data-n="${n}">${n}</button>`).join('')}</div></div>
          <input id="cm-${r.id}" class="inp flex-1 min-w-[200px]" placeholder="Izoh (a’zoga yuboriladi)">
          <button class="btn btn-gold" onclick="gradeReview(${r.id})">✅ Baholash</button>
          <button class="btn btn-soft" onclick="gradeReview(${r.id}, true)">🔁 Qayta so‘rash</button>
        </div>` : ''}
      </div>`).join('') || '<div class="card text-slate-400 text-center py-10">🎉 Kutilayotgan taqriz yo‘q</div>'}
    </div>`;
};
const picked = {};
window.pickScore = (id, n) => {
  picked[id] = n;
  document.querySelectorAll(`#sc-${id} button`).forEach(b => b.style.outline = Number(b.dataset.n) === n ? '3px solid #b8892d' : '');
};
window.playReview = async (id, fileId) => {
  $(`pl-${id}`).textContent = '⏳';
  try {
    const url = await mediaUrl(fileId);
    $(`au-${id}`).innerHTML = `<audio controls autoplay src="${url}" class="mt-2 w-72 max-w-full"></audio>`;
    $(`pl-${id}`).remove();
  } catch (e) { $(`pl-${id}`).textContent = '⚠️ Qayta urinish'; toast(e.message, false); }
};
window.gradeReview = async (id, again = false) => {
  if (!again && picked[id] === undefined) return toast('Avval bahoni tanlang (0–10)', false);
  const r = await fn('grade_review', { id, score: picked[id] ?? 0, comment: $(`cm-${id}`).value, again });
  if (!r.ok) return toast(r.error, false);
  toast(again ? 'Qayta yuborish so‘raldi' : r.completed ? `Kitob yakunlandi${r.certificate ? ', sertifikat yuborildi 🎓' : ' (sertifikat yuborilmadi: ' + (r.certError || '') + ')'}` : 'Baholandi');
  refreshBadges(); render();
};

// =========================================================
// 👥 Guruhlar, chat, uchrashuvlar
// =========================================================
let chatSub = null, openGroupId = null;
VIEWS.groups = async () => {
  const [{ data: groups }, { data: gm }, { data: staff }, { data: books }] = await Promise.all([
    sb.from('ka_groups').select('*, book:ka_books(title)').order('id'),
    sb.from('ka_group_members').select('group_id'),
    sb.from('ka_staff').select('id,full_name,role').in('role', ['admin', 'moderator']),
    sb.from('ka_books').select('id,title').order('title')
  ]);
  S.cache.groups = groups || []; S.cache.staff = staff || []; S.cache.bookList = books || [];
  const cnt = {};
  (gm || []).forEach(x => { cnt[x.group_id] = (cnt[x.group_id] || 0) + 1; });
  if (openGroupId && !S.cache.groups.some(g => g.id === openGroupId)) openGroupId = null;
  $('view').innerHTML = page('Guruhlar va chat', 'Kitobxonlik guruhlari: chat (Mini App), Jitsi uchrashuvlari, a’zolar.', is('admin') ? '<button class="btn btn-gold" onclick="editGroup()">＋ Guruh yaratish</button>' : '') + `
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="space-y-3">
      ${S.cache.groups.map(g => `
        <button onclick="openGroup(${g.id})" class="card w-full text-left ${openGroupId === g.id ? 'ring-2 ring-gold-500' : ''} ${g.active ? '' : 'opacity-60'}">
          <div class="flex items-center gap-2"><div class="font-black flex-1">${esc(g.name)}</div>${g.premium ? '<span class="badge bg-gold-100 text-gold-700">🔒</span>' : ''}${g.is_open ? '' : '<span class="badge bg-slate-100">yopiq</span>'}</div>
          <div class="text-xs text-slate-500 mt-1">👤 ${cnt[g.id] || 0} a’zo · 🎓 ${esc(S.cache.staff.find(s => s.id === g.moderator_id)?.full_name || 'moderatorsiz')}</div>
          ${g.book?.title ? `<div class="text-xs mt-1">📖 ${esc(g.book.title)}</div>` : ''}
          <div class="text-xs mt-1 font-mono text-gold-600">Kod: ${esc(g.invite_code)}</div>
        </button>`).join('') || '<div class="card text-slate-400">Hali guruh yo‘q</div>'}
      </div>
      <div class="lg:col-span-2" id="group-panel">${openGroupId ? '' : '<div class="card text-slate-400 text-center py-16">← Guruhni tanlang</div>'}</div>
    </div>`;
  if (openGroupId) openGroup(openGroupId);
};
window.editGroup = id => {
  const g = S.cache.groups.find(x => x.id === id) || { name: '', description: '', moderator_id: null, book_id: null, is_open: true, premium: false, active: true };
  modal(`
    <h2 class="font-serif text-2xl font-black mb-4">${id ? 'Guruhni tahrirlash' : 'Yangi guruh'}</h2>
    <div class="grid sm:grid-cols-2 gap-3">
      <label class="f sm:col-span-2">Nomi *<input id="g-name" class="inp" value="${esc(g.name)}" placeholder="Masalan: Payshanba kitob klubi"></label>
      <label class="f sm:col-span-2">Tavsif<input id="g-desc" class="inp" value="${esc(g.description || '')}"></label>
      <label class="f">Moderator / ustoz<select id="g-mod" class="inp" ${is('admin') ? '' : 'disabled'}><option value="">—</option>${S.cache.staff.map(s => `<option value="${s.id}" ${s.id === g.moderator_id ? 'selected' : ''}>${esc(s.full_name)} (${s.role})</option>`).join('')}</select></label>
      <label class="f">Hozir o‘qilayotgan kitob<select id="g-book" class="inp"><option value="">—</option>${S.cache.bookList.map(b => `<option value="${b.id}" ${b.id === g.book_id ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>
    </div>
    <div class="flex gap-4 mt-3 text-sm flex-wrap">
      <label class="flex items-center gap-2"><input type="checkbox" id="g-open" ${g.is_open ? 'checked' : ''}> Ochiq (botdagi ro‘yxatda ko‘rinadi)</label>
      <label class="flex items-center gap-2"><input type="checkbox" id="g-premium" ${g.premium ? 'checked' : ''}> 🔒 Pullik a’zolar</label>
      <label class="flex items-center gap-2"><input type="checkbox" id="g-active" ${g.active ? 'checked' : ''}> Faol</label>
    </div>
    <div class="flex gap-2 mt-4"><button class="btn btn-gold" onclick="saveGroup(${id || 'null'})">💾 Saqlash</button>
    ${id && is('admin') ? `<button class="btn btn-red" onclick="deleteGroup(${id})">🗑 O‘chirish</button>` : ''}</div>`);
};
window.saveGroup = async id => {
  const row = { name: $('g-name').value.trim(), description: $('g-desc').value.trim() || null, book_id: Number($('g-book').value) || null, is_open: $('g-open').checked, premium: $('g-premium').checked, active: $('g-active').checked };
  if (is('admin')) row.moderator_id = $('g-mod').value || null;
  if (!row.name) return toast('Nomini kiriting', false);
  const { data, error } = id ? await sb.from('ka_groups').update(row).eq('id', id).select('id').single() : await sb.from('ka_groups').insert(row).select('id').single();
  if (chk(error, 'Saqlandi')) { closeModal(); openGroupId = data.id; render(); }
};
window.deleteGroup = async id => { if (!confirm('Guruh, chat tarixi va uchrashuvlar o‘chiriladi. Davom etasizmi?')) return; const { error } = await sb.from('ka_groups').delete().eq('id', id); if (chk(error, 'O‘chirildi')) { closeModal(); openGroupId = null; render(); } };

window.openGroup = async id => {
  openGroupId = id;
  document.querySelectorAll('#view .card.ring-2').forEach(e => e.classList.remove('ring-2', 'ring-gold-500'));
  const g = S.cache.groups.find(x => x.id === id);
  const can = is('admin') || g.moderator_id === S.me.id;
  const [{ data: msgs }, { data: meets }, { data: mem }] = await Promise.all([
    sb.from('ka_messages').select('*').eq('group_id', id).order('id', { ascending: false }).limit(80),
    sb.from('ka_meetings').select('*').eq('group_id', id).order('starts_at', { ascending: false }).limit(20),
    sb.from('ka_group_members').select('joined_at, member:ka_members(id,full_name,city,phone)').eq('group_id', id)
  ]);
  const jitsi = (S.settings.jitsi?.domain || 'meet.jit.si').replace(/^https?:\/\//, '');
  const bot = S.settings.botUsername;
  const now = Date.now();
  $('group-panel').innerHTML = `
    <div class="card">
      <div class="flex items-start gap-3 flex-wrap">
        <div class="flex-1"><h2 class="font-serif text-2xl font-black">${esc(g.name)}</h2>
          <div class="text-xs text-slate-500">${esc(g.description || '')}</div>
          <div class="text-xs mt-1">🔑 Kod: <b class="font-mono">${esc(g.invite_code)}</b>${bot ? ` · 🔗 <a class="text-sky-600" target="_blank" href="https://t.me/${esc(bot)}?start=g_${esc(g.invite_code)}">t.me/${esc(bot)}?start=g_${esc(g.invite_code)}</a> <button class="text-gold-600 font-bold" onclick="navigator.clipboard.writeText('https://t.me/${esc(bot)}?start=g_${esc(g.invite_code)}');toast('Havola nusxalandi')">nusxa</button>` : ''}</div>
        </div>
        ${can ? `<button class="btn btn-soft btn-sm" onclick="editGroup(${g.id})">✏️ Sozlash</button>` : ''}
      </div>
    </div>
    <div class="grid xl:grid-cols-5 gap-4 mt-4">
      <div class="xl:col-span-3 card flex flex-col" style="height:560px">
        <h3 class="font-black mb-2">💬 Chat</h3>
        <div id="chat-box" class="flex-1 overflow-y-auto space-y-2 pr-1 text-sm"></div>
        ${can ? `<form class="flex gap-2 mt-2" onsubmit="staffSend(event, ${g.id})"><input id="chat-inp" class="inp" maxlength="2000" placeholder="Ustoz sifatida yozish…"><button class="btn btn-gold">➤</button></form>` : '<div class="text-xs text-slate-400 mt-2">Faqat guruh moderatori va admin yozadi.</div>'}
      </div>
      <div class="xl:col-span-2 space-y-4">
        <div class="card">
          <h3 class="font-black mb-2">🎥 Uchrashuvlar</h3>
          ${can ? `<div class="space-y-2 mb-3 p-3 rounded-xl bg-gold-50">
            <input id="mt-title" class="inp" placeholder="Mavzu: «Kichkina shahzoda» muhokamasi">
            <div class="grid grid-cols-2 gap-2"><input id="mt-start" type="datetime-local" class="inp"><input id="mt-dur" type="number" class="inp" value="60" placeholder="daqiqa"></div>
            <input id="mt-notes" class="inp" placeholder="Izoh (ixtiyoriy)">
            <button class="btn btn-gold w-full justify-center" onclick="addMeeting(${g.id})">＋ Rejalashtirish va xabar berish</button>
            <p class="text-[11px] text-slate-500">A’zolarga darhol xabar va 30 daqiqa oldin eslatma boradi. Xonani birinchi kirgan ustoz ochadi (${esc(jitsi)} — moderator kirishi talab qilinishi mumkin).</p>
          </div>` : ''}
          <div class="space-y-2">
          ${(meets || []).map(m => { const end = new Date(m.starts_at).getTime() + m.duration_min * 60000; return `
            <div class="text-sm border-b border-slate-100 pb-2 ${end < now ? 'opacity-50' : ''}">
              <div class="font-bold">${esc(m.title)}</div>
              <div class="text-xs text-slate-500">${fmt(m.starts_at)} · ${m.duration_min} daq. ${m.reminded ? '· ⏰ eslatildi' : ''}</div>
              <div class="flex gap-1 mt-1">
                <a class="btn btn-sm btn-green" target="_blank" href="https://${esc(jitsi)}/${encodeURIComponent(m.room)}#userInfo.displayName=${encodeURIComponent(JSON.stringify(S.me.full_name || 'Ustoz'))}">🎥 Kirish</a>
                ${can && end > now ? `<button class="btn btn-sm btn-soft" onclick="notifyMeeting(${m.id})">📣 Qayta xabar</button><button class="btn btn-sm btn-soft" onclick="deleteMeeting(${m.id}, ${g.id})">🗑</button>` : ''}
              </div>
            </div>`; }).join('') || '<div class="text-sm text-slate-400">Hali uchrashuv yo‘q</div>'}
          </div>
        </div>
        <div class="card">
          <h3 class="font-black mb-2">👤 A’zolar (${(mem || []).length})</h3>
          <div class="max-h-72 overflow-y-auto space-y-1 text-sm">
          ${(mem || []).map(x => `<div class="flex items-center gap-2"><span class="flex-1">${esc(x.member?.full_name)} <span class="text-xs text-slate-400">${esc(x.member?.city || '')}</span></span>${can ? `<button class="text-rose-500 text-xs" onclick="kick(${g.id}, ${x.member?.id})">chiqarish</button>` : ''}</div>`).join('') || '<div class="text-slate-400">Hali a’zo yo‘q — kod yoki havolani ulashing.</div>'}
          </div>
        </div>
      </div>
    </div>`;
  const box = $('chat-box');
  box.innerHTML = '';
  (msgs || []).reverse().forEach(m => addChatMsg(m, can));
  box.scrollTop = box.scrollHeight;
  if (chatSub) sb.removeChannel(chatSub);
  chatSub = sb.channel(`chat-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ka_messages', filter: `group_id=eq.${id}` }, p => {
      if (p.eventType === 'INSERT') { addChatMsg(p.new, can); box.scrollTop = box.scrollHeight; }
      if (p.eventType === 'UPDATE') { const el = $(`cm${p.new.id}`); if (el) el.outerHTML = chatMsgHtml(p.new, can); }
    }).subscribe();
};
function chatMsgHtml(m, can) {
  return `<div id="cm${m.id}" class="group flex gap-2 ${m.staff_id ? 'bg-gold-50' : 'bg-slate-50'} rounded-xl px-3 py-2">
    <div class="flex-1 min-w-0"><div class="text-xs font-black ${m.staff_id ? 'text-gold-600' : 'text-slate-600'}">${m.staff_id ? '🎓 ' : ''}${esc(m.author_name)} <span class="font-normal text-slate-400">${fmt(m.created_at)}</span></div>
    <div class="whitespace-pre-wrap break-words ${m.deleted ? 'italic text-slate-400' : ''}">${m.deleted ? 'o‘chirilgan: ' + esc(m.text) : esc(m.text)}</div></div>
    ${can && !m.deleted ? `<button class="opacity-0 group-hover:opacity-100 text-xs text-rose-500" onclick="delMsg(${m.id})">o‘chirish</button>` : ''}
  </div>`;
}
function addChatMsg(m, can) { if ($(`cm${m.id}`)) return; $('chat-box').insertAdjacentHTML('beforeend', chatMsgHtml(m, can)); }
window.staffSend = async (e, gid) => {
  e.preventDefault();
  const text = $('chat-inp').value.trim();
  if (!text) return;
  $('chat-inp').value = '';
  const { error } = await sb.from('ka_messages').insert({ group_id: gid, staff_id: S.me.id, author_name: S.me.full_name || 'Ustoz', text });
  if (error) { $('chat-inp').value = text; toast(error.message, false); }
};
window.delMsg = async id => { const { error } = await sb.from('ka_messages').update({ deleted: true }).eq('id', id); chk(error); };
window.kick = async (gid, mid) => { if (!confirm('A’zoni guruhdan chiqarasizmi?')) return; const { error } = await sb.from('ka_group_members').delete().eq('group_id', gid).eq('member_id', mid); if (chk(error, 'Chiqarildi')) openGroup(gid); };
window.addMeeting = async gid => {
  const title = $('mt-title').value.trim(), start = $('mt-start').value;
  if (!title || !start) return toast('Mavzu va vaqtni kiriting', false);
  const startsAt = new Date(start);
  const { data, error } = await sb.from('ka_meetings').insert({
    group_id: gid, title, starts_at: startsAt.toISOString(), duration_min: Number($('mt-dur').value) || 60, notes: $('mt-notes').value.trim() || null,
    reminded: startsAt.getTime() - Date.now() < 30 * 60000
  }).select('id').single();
  if (!chk(error)) return;
  const r = await fn('meeting_notify', { id: data.id });
  toast(r.ok ? `Uchrashuv rejalashtirildi, ${r.sent} a’zoga xabar yuborildi` : `Saqlandi, lekin xabar yuborilmadi: ${r.error}`, r.ok);
  openGroup(gid);
};
window.notifyMeeting = async id => { const r = await fn('meeting_notify', { id }); r.ok ? toast(`${r.sent} a’zoga yuborildi`) : toast(r.error, false); };
window.deleteMeeting = async (id, gid) => { if (!confirm('Uchrashuvni bekor qilasizmi?')) return; const { error } = await sb.from('ka_meetings').delete().eq('id', id); if (chk(error, 'Bekor qilindi')) openGroup(gid); };

// =========================================================
// 🏆 Tanlovlar (yakuniy yopiq test)
// =========================================================
VIEWS.contests = async () => {
  const [{ data: tests }, { data: atts }] = await Promise.all([
    sb.from('ka_tests').select('*').eq('kind', 'contest').order('opens_at', { ascending: false }),
    sb.from('ka_attempts').select('test_id,status')
  ]);
  S.cache.contests = tests || [];
  const n = {};
  (atts || []).forEach(a => { if (a.status === 'done') n[a.test_id] = (n[a.test_id] || 0) + 1; });
  const now = Date.now();
  $('view').innerHTML = page('Tanlovlar', 'Yakuniy yopiq test: belgilangan vaqtda ochiladi, bitta urinish, natija va g‘oliblar e’lon qilinganda hammaga sertifikat boradi.', '<button class="btn btn-gold" onclick="editTest(null, null, \'contest\')">＋ Tanlov e’lon qilish</button>') + `
    <div class="space-y-3">
    ${S.cache.contests.map(t => {
      const o = new Date(t.opens_at).getTime(), c = new Date(t.closes_at).getTime();
      const st = t.results_published ? ['🏁 Natijalar e’lon qilingan', 'bg-slate-100'] : now < o ? ['⏳ Kutilmoqda', 'bg-sky-100 text-sky-700'] : now <= c ? ['🟢 Davom etmoqda', 'bg-emerald-100 text-emerald-700'] : ['⌛ Yakunlangan — natijani e’lon qiling', 'bg-amber-100 text-amber-800'];
      return `<div class="card">
        <div class="flex items-start gap-3 flex-wrap">
          <div class="flex-1"><div class="font-black text-lg">${esc(t.title)}</div>
            <div class="text-sm text-slate-500">${fmt(t.opens_at)} → ${fmt(t.closes_at)} · ${(t.questions || []).length} savol${t.time_limit_min ? ` · ⏱ ${t.time_limit_min} daq.` : ''} · 👤 ${n[t.id] || 0} qatnashchi</div>
            <span class="badge ${st[1]} mt-1">${st[0]}</span>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button class="btn btn-soft btn-sm" onclick="contestResults(${t.id})">📋 Natijalar</button>
            <button class="btn btn-soft btn-sm" onclick="editTest(${t.id})">✏️</button>
            ${!t.results_published && now > c ? `<button class="btn btn-gold btn-sm" onclick="publishContest(${t.id})">🏁 E’lon qilish va sertifikat yuborish</button>` : ''}
            ${t.results_published ? `<button class="btn btn-soft btn-sm" onclick="publishContest(${t.id}, true)">↻ Qayta e’lon</button>` : ''}
          </div>
        </div>
        <div id="cr-${t.id}"></div>
      </div>`; }).join('') || '<div class="card text-slate-400 text-center py-10">Hali tanlov yo‘q</div>'}
    </div>`;
};
window.contestResults = async id => {
  const box = $(`cr-${id}`);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const { data } = await sb.from('ka_attempts').select('correct,total,pct,duration_sec,status,member:ka_members(full_name,city)').eq('test_id', id).order('correct', { ascending: false }).order('duration_sec');
  box.innerHTML = `<table class="tbl mt-3"><thead><tr><th>#</th><th>A’zo</th><th>To‘g‘ri</th><th>%</th><th>Vaqt</th></tr></thead><tbody>
    ${(data || []).filter(a => a.status === 'done').map((a, i) => `<tr><td class="font-black">${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(a.member?.full_name)} <span class="text-xs text-slate-400">${esc(a.member?.city || '')}</span></td><td>${a.correct}/${a.total}</td><td>${a.pct}%</td><td>${a.duration_sec ? `${Math.floor(a.duration_sec / 60)}:${String(a.duration_sec % 60).padStart(2, '0')}` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="text-slate-400">Hali qatnashchi yo‘q</td></tr>'}
  </tbody></table>`;
};
window.publishContest = async (id, again) => {
  if (!confirm(again ? 'Natijalar qayta hisoblanib, sertifikatlar qayta yuboriladi. Davom etasizmi?' : 'Natijalar e’lon qilinadi va barcha qatnashchilarga sertifikat yuboriladi. Davom etasizmi?')) return;
  toast('E’lon qilinmoqda… (qatnashchilar ko‘p bo‘lsa biroz vaqt oladi)');
  const r = await fn('contest_publish', { id });
  r.ok ? toast(`${r.participants} qatnashchi, ${r.sent} ta sertifikat yuborildi`) : toast(r.error, false);
  render();
};

// =========================================================
// 💳 Kassa
// =========================================================
VIEWS.kassa = async () => {
  let q = sb.from('ka_payments').select('*, member:ka_members(full_name,phone,paid_until)').order('id', { ascending: false }).limit(300);
  if (F.pay !== 'all') q = q.eq('status', F.pay);
  const { data: rows } = await q;
  const ms = S.settings.membership || {};
  const { data: monthRows } = await sb.from('ka_payments').select('amount').eq('status', 'Tasdiqlandi').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const month = (monthRows || []).reduce((s, r) => s + Number(r.amount), 0);
  $('view').innerHTML = page('Kassa', `Pullik a’zolik: ${ms.enabled ? `<b class="text-emerald-700">yoqilgan</b> · ${money(ms.price)} / ${ms.days} kun` : '<b>o‘chirilgan</b> (Sozlamalar → A’zolik)'} · Shu oy: <b>${money(month)}</b>`, `
    <select class="inp w-44" onchange="setFilter('pay', this.value)">${[['Kutilmoqda', '⏳ Kutilmoqda'], ['Tasdiqlandi', '✅ Tasdiqlangan'], ['Rad etildi', '❌ Rad etilgan'], ['all', 'Hammasi']].map(([v, l]) => `<option value="${v}" ${v === F.pay ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="btn btn-soft" onclick="exportPayments()">📥 Excel</button>`) + `
    <div class="card mb-4 text-sm">➕ Naqd to‘lovni kiritish: <b>A’zolar</b> bo‘limida a’zoni oching → “＋ To‘lov”.</div>
    <div class="card overflow-x-auto"><table class="tbl"><thead><tr><th>№</th><th>A’zo</th><th>Summa</th><th>Kun</th><th>Usul</th><th>Chek</th><th>Holat</th><th>Sana</th><th></th></tr></thead><tbody>
    ${(rows || []).map(p => `<tr>
      <td class="font-mono text-slate-400">#${p.id}</td>
      <td class="font-bold">${esc(p.member?.full_name)}<div class="text-[11px] font-normal text-slate-500">${esc(p.member?.phone || '')}</div></td>
      <td class="font-black">${money(p.amount)}</td><td>${p.days}</td><td>${esc(p.method)}</td>
      <td>${p.receipt_file_id ? `<button class="btn btn-soft btn-sm" onclick="showReceipt('${esc(p.receipt_file_id)}')">🧾 Ko‘rish</button>` : '—'}${p.note ? `<div class="text-[11px] text-slate-500 mt-1">${esc(p.note)}</div>` : ''}</td>
      <td><span class="badge ${p.status === 'Tasdiqlandi' ? 'bg-emerald-100 text-emerald-700' : p.status === 'Rad etildi' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}">${esc(p.status)}</span></td>
      <td class="text-xs text-slate-500">${fmt(p.created_at)}</td>
      <td class="whitespace-nowrap">${p.status === 'Kutilmoqda' ? `<button class="btn btn-green btn-sm" onclick="decidePay(${p.id}, 'Tasdiqlandi')">✅</button> <button class="btn btn-red btn-sm" onclick="decidePay(${p.id}, 'Rad etildi')">✕</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="9" class="text-center text-slate-400 py-8">Yozuv yo‘q</td></tr>'}
    </tbody></table></div>`;
  S.cache.payments = rows || [];
};
window.showReceipt = async fileId => {
  modal('<div class="text-center py-10">⏳</div>');
  try {
    const url = await mediaUrl(fileId);
    $('modal-box').innerHTML = `<button class="absolute top-3 right-4 text-xl text-slate-400" onclick="closeModal()">✕</button><h3 class="font-black mb-3">🧾 To‘lov cheki</h3><img src="${url}" class="max-h-[75vh] mx-auto rounded-xl" onerror="this.outerHTML='<iframe src=&quot;${url}&quot; class=&quot;w-full h-[70vh]&quot;></iframe>'">`;
  } catch (e) { closeModal(); toast(e.message, false); }
};
window.decidePay = async (id, status) => {
  let note;
  if (status === 'Rad etildi') { note = prompt('Rad etish sababi (a’zoga yuboriladi):', 'Chek ma’lumotlari mos kelmadi'); if (note === null) return; }
  const r = await fn('payment_decide', { id, status, note });
  r.ok ? toast(status === 'Tasdiqlandi' ? 'Tasdiqlandi, a’zolik uzaytirildi' : 'Rad etildi') : toast(r.error, false);
  refreshBadges(); render();
};
window.exportPayments = async () => {
  await loadXlsx();
  const rows = (S.cache.payments || []).map(p => ({ '№': p.id, 'A’zo': p.member?.full_name, Telefon: p.member?.phone, Summa: Number(p.amount), Kun: p.days, Usul: p.method, Holat: p.status, Sana: fmt(p.created_at), Izoh: p.note || '' }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Kassa');
  XLSX.writeFile(wb, 'Kassa.xlsx');
};

// =========================================================
// 📢 Xabar yuborish
// =========================================================
VIEWS.broadcast = async () => {
  const { data: groups } = await sb.from('ka_groups').select('id,name').eq('active', true).order('id');
  $('view').innerHTML = page('Xabar yuborish', 'Bot orqali a’zolarga e’lon yuborish') + `
    <div class="card max-w-2xl space-y-3">
      <label class="f">Kimga<select id="bc-aud" class="inp">
        <option value="all">Barcha a’zolar</option><option value="paid">💳 Pullik a’zolar</option><option value="unpaid">To‘lamaganlar</option>
        ${(groups || []).map(g => `<option value="group:${g.id}">👥 ${esc(g.name)}</option>`).join('')}
      </select></label>
      <label class="f">Matn<textarea id="bc-text" rows="7" class="inp" placeholder="Hurmatli kitobxonlar! …"></textarea></label>
      <button class="btn btn-gold" id="bc-btn" onclick="sendBroadcast()">📢 Yuborish</button>
      <p class="text-xs text-slate-500">Yuborish soniyasiga ~25 ta xabar tezlikda bo‘ladi.</p>
    </div>`;
};
window.sendBroadcast = async () => {
  const text = $('bc-text').value.trim();
  if (!text) return toast('Matnni yozing', false);
  if (!confirm('Xabar yuborilsinmi?')) return;
  $('bc-btn').disabled = true; $('bc-btn').textContent = '⏳ Yuborilmoqda…';
  const r = await fn('broadcast', { text, audience: $('bc-aud').value });
  $('bc-btn').disabled = false; $('bc-btn').textContent = '📢 Yuborish';
  r.ok ? toast(`${r.sent}/${r.total} ta a’zoga yuborildi`) : toast(r.error, false);
};

// =========================================================
// ⚙️ Sozlamalar (admin)
// =========================================================
VIEWS.settings = async () => {
  await loadSettings();
  const [{ data: secrets }, { data: staff }, st] = await Promise.all([sb.rpc('ka_secret_status'), sb.from('ka_staff').select('*').order('created_at'), fn('status')]);
  const set = Object.fromEntries((secrets || []).map(s => [s.key, s]));
  const ms = S.settings.membership || {}, rules = S.settings.rules || {}, about = S.settings.about || {}, jitsi = S.settings.jitsi || {};
  const miniDefault = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}miniapp.html`;
  const whOk = st?.ok && st.webhook?.url === st.expected;
  $('view').innerHTML = page('Sozlamalar', 'Bot, a’zolik, qoidalar va xodimlar') + `
    <div class="grid xl:grid-cols-2 gap-4">
      <div class="card space-y-3">
        <h3 class="font-black">🤖 Telegram bot</h3>
        <div class="text-sm">${st?.ok ? `Bot: <b>@${esc(st.bot?.username)}</b> · Webhook: ${whOk ? '<b class="text-emerald-700">✅ ulangan</b>' : '<b class="text-rose-600">✗ ulanmagan</b>'}${st.webhook?.last_error_message ? `<div class="text-xs text-rose-600">Oxirgi xato: ${esc(st.webhook.last_error_message)}</div>` : ''}` : `<span class="text-slate-500">${esc(st?.error || 'Token kiritilmagan')}</span>`}</div>
        <label class="f">Bot tokeni (@BotFather) ${set.telegram_bot_token ? '<span class="text-emerald-700">· o‘rnatilgan</span>' : ''}<input id="s-token" class="inp font-mono" placeholder="${set.telegram_bot_token ? '•••••• (o‘zgartirish uchun yangisini kiriting)' : '123456:ABC…'}"></label>
        <label class="f">Admin chat ID (ixtiyoriy, guruhda /id) ${set.telegram_admin_chat_id ? '<span class="text-emerald-700">· o‘rnatilgan</span>' : ''}<input id="s-chat" class="inp font-mono" placeholder="-100…"></label>
        <label class="f">Mini App manzili<input id="s-mini" class="inp" value="${esc(S.settings.miniAppUrl || miniDefault)}"></label>
        <button class="btn btn-gold" onclick="saveBot()">💾 Saqlash va botni ulash</button>
      </div>
      <div class="card space-y-3">
        <h3 class="font-black">💳 Pullik a’zolik (ixtiyoriy)</h3>
        <label class="flex items-center gap-2 text-sm font-bold"><input type="checkbox" id="s-ms-on" ${ms.enabled ? 'checked' : ''}> Yoqilgan — 🔒 belgilangan kitob, test va guruhlar faqat a’zolarga</label>
        <div class="grid grid-cols-2 gap-2">
          <label class="f">Narx (so‘m)<input id="s-ms-price" type="number" class="inp" value="${ms.price ?? 50000}"></label>
          <label class="f">Muddat (kun)<input id="s-ms-days" type="number" class="inp" value="${ms.days ?? 30}"></label>
          <label class="f">Karta raqami<input id="s-ms-card" class="inp" value="${esc(ms.card || '')}"></label>
          <label class="f">Karta egasi<input id="s-ms-owner" class="inp" value="${esc(ms.cardOwner || '')}"></label>
        </div>
        <label class="f">Izoh<input id="s-ms-note" class="inp" value="${esc(ms.note || '')}"></label>
        <button class="btn btn-gold" onclick="saveMembership()">💾 Saqlash</button>
      </div>
      <div class="card space-y-3">
        <h3 class="font-black">📏 Qoidalar</h3>
        <div class="grid grid-cols-2 gap-2">
          <label class="f">Test o‘tish chegarasi (%)<input id="s-r-pass" type="number" class="inp" value="${rules.passPct ?? 70}"></label>
          <label class="f">Urinishlar (standart)<input id="s-r-max" type="number" class="inp" value="${rules.maxAttempts ?? 3}"></label>
          <label class="f">Audio: min (soniya)<input id="s-r-amin" type="number" class="inp" value="${rules.audioMinSec ?? 60}"></label>
          <label class="f">Audio: maks (soniya)<input id="s-r-amax" type="number" class="inp" value="${rules.audioMaxSec ?? 120}"></label>
          <label class="f">Taqriz o‘tish bali (0–10)<input id="s-r-rp" type="number" class="inp" value="${rules.reviewPass ?? 6}"></label>
          <label class="f">Jitsi domeni<input id="s-jitsi" class="inp" value="${esc(jitsi.domain || 'meet.jit.si')}"></label>
        </div>
        <label class="f">Botdagi salomlashuv matni (HTML: &lt;b&gt;, &lt;i&gt;)<textarea id="s-about" rows="4" class="inp">${esc(about.text || '')}</textarea></label>
        <button class="btn btn-gold" onclick="saveRules()">💾 Saqlash</button>
      </div>
      <div class="card">
        <h3 class="font-black mb-2">👥 Xodimlar</h3>
        <p class="text-xs text-slate-500 mb-2">Yangi xodim saytda ro‘yxatdan o‘tadi, siz unga rol berasiz.</p>
        <table class="tbl"><thead><tr><th>Xodim</th><th>Rol</th><th>Bot</th><th></th></tr></thead><tbody>
        ${(staff || []).map(s => `<tr><td><b>${esc(s.full_name)}</b><div class="text-[11px] text-slate-500">${esc(s.email)}</div></td>
          <td>${s.id === S.me.id ? '👑 admin (siz)' : `<select class="inp py-1" onchange="setRole('${s.id}', this.value)">${['pending', 'moderator', 'kassir', 'admin'].map(r => `<option value="${r}" ${r === s.role ? 'selected' : ''}>${{ pending: '⏳ kutilmoqda', moderator: '🎓 moderator', kassir: '💳 kassir', admin: '👑 admin' }[r]}</option>`).join('')}</select>`}</td>
          <td>${s.tg_user_id ? '✅' : '—'}</td>
          <td>${s.id !== S.me.id ? `<button class="text-rose-500 text-xs" onclick="delStaff('${s.id}')">o‘chirish</button>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
};
window.saveBot = async () => {
  try {
    const t = $('s-token').value.trim(), c = $('s-chat').value.trim();
    if (t) { const { error } = await sb.rpc('ka_set_secret', { p_key: 'telegram_bot_token', p_value: t }); if (error) throw error; }
    if (c) { const { error } = await sb.rpc('ka_set_secret', { p_key: 'telegram_admin_chat_id', p_value: c }); if (error) throw error; }
  } catch (e) { return toast(e.message, false); }
  const r = await fn('setup', { miniAppUrl: $('s-mini').value.trim() });
  r.ok ? toast(`Bot ulandi${r.miniApp ? ', Mini App tugmasi o‘rnatildi' : ''}`) : toast(r.error, false);
  render();
};
async function putSetting(key, value) { const { error } = await sb.from('ka_settings').upsert({ key, value, updated_at: new Date().toISOString() }); if (!error) S.settings[key] = value; return error; }
window.saveMembership = async () => {
  const err = await putSetting('membership', { enabled: $('s-ms-on').checked, price: Number($('s-ms-price').value) || 0, days: Number($('s-ms-days').value) || 30, card: $('s-ms-card').value.trim(), cardOwner: $('s-ms-owner').value.trim(), note: $('s-ms-note').value.trim() });
  chk(err, 'A’zolik sozlamalari saqlandi');
};
window.saveRules = async () => {
  const e1 = await putSetting('rules', { passPct: Number($('s-r-pass').value) || 70, maxAttempts: Number($('s-r-max').value) || 3, audioMinSec: Number($('s-r-amin').value) || 0, audioMaxSec: Number($('s-r-amax').value) || 120, reviewPass: Number($('s-r-rp').value) || 6 });
  const e2 = await putSetting('jitsi', { domain: $('s-jitsi').value.trim() || 'meet.jit.si' });
  const e3 = await putSetting('about', { text: $('s-about').value });
  chk(e1 || e2 || e3, 'Saqlandi');
};
window.setRole = async (id, r) => { const { error } = await sb.from('ka_staff').update({ role: r }).eq('id', id); chk(error, 'Rol yangilandi'); };
window.delStaff = async id => { if (!confirm('Xodim panelga kira olmaydi. O‘chirilsinmi?')) return; const { error } = await sb.from('ka_staff').delete().eq('id', id); if (chk(error, 'O‘chirildi')) render(); };

// =========================================================
// 🔗 Profil: botga bog'lash
// =========================================================
VIEWS.profile = async () => {
  const { data: me } = await sb.from('ka_staff').select('*').eq('id', S.me.id).single();
  const bot = S.settings.botUsername;
  $('view').innerHTML = page('Profil va bot', esc(me.email)) + `
    <div class="card max-w-xl space-y-3 text-sm">
      <div>Telegram: ${me.tg_user_id ? '<b class="text-emerald-700">✅ bog‘langan</b>' : '<b>bog‘lanmagan</b>'}</div>
      <p>Botga bog‘lansangiz: yangi ${is('kassir') ? 'to‘lov cheklari' : 'audio taqrizlar'} shu zahoti Telegram’ga keladi${is('admin', 'moderator') ? ', katta kitob fayllarini <b>/yukla</b> orqali biriktira olasiz' : ''}.</p>
      <button class="btn btn-gold" onclick="newLinkCode()">🔑 Bog‘lash kodini olish</button>
      <div id="link-code"></div>
      ${bot ? `<p class="text-xs text-slate-500">Bot: <a class="text-sky-600" href="https://t.me/${esc(bot)}" target="_blank">@${esc(bot)}</a></p>` : ''}
    </div>`;
};
window.newLinkCode = async () => {
  const { data, error } = await sb.rpc('ka_new_link_code');
  if (!chk(error)) return;
  const bot = S.settings.botUsername;
  $('link-code').innerHTML = `<div class="p-3 rounded-xl bg-gold-50">Botga yozing: <code class="font-black text-lg">/ulash ${esc(data)}</code>${bot ? `<div class="mt-1"><a class="text-sky-600" target="_blank" href="https://t.me/${esc(bot)}">@${esc(bot)} ni ochish</a></div>` : ''}</div>`;
};

sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
boot();
