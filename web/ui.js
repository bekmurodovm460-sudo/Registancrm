// =========================================================
// REGISTAN CRM — interfeys qatlami
//   • Yon menyu (guruhlangan, telefonda ochiladigan) va ixcham header
//   • Global o'quvchi qidiruvi + 👁 O'quvchi kartochkasi
//   • Dashboard: ko'rsatkichlar va grafiklar (Chart.js)
//   • Kids Mock: xonalar bo'yicha boshqaruv va ro'yxatni chop etish
// app.js / platform.js funksiyalarini o'zgartirmaydi — ustidan kengaytiradi.
// =========================================================
const crm = () => window.crm;
const sb = () => window.crm.sb;
const canWrite = () => ['admin', 'operator'].includes(crm()?.role);
const esc = s => escapeHtml(s ?? '');
const BRAND = '#F2642A';
const fmtDate = d => (d ? new Date(d).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }) : '');
const nf = n => Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ');

// ---------------------------------------------------------
// Uslublar
// ---------------------------------------------------------
document.head.insertAdjacentHTML('beforeend', `<style id="crm-ui-css">
  :root { --hdr: 72px; }
  .crm-shell { display: flex; width: 100%; max-width: 1600px; margin: 0 auto; flex: 1; align-items: flex-start; }
  .crm-side { width: 232px; flex-shrink: 0; position: sticky; top: var(--hdr); height: calc(100vh - var(--hdr)); overflow-y: auto;
    padding: 14px 10px 28px; background: #fff; border-right: 1px solid #e2e8f0; }
  .crm-side-title { font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; color: #94a3b8; padding: 12px 10px 6px; }
  .crm-nav { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 9px 12px; border-radius: 12px;
    font-size: 13px; font-weight: 700; color: #334155; transition: background .15s, color .15s; margin-bottom: 2px; }
  .crm-nav:hover { background: #fff1ea; color: #c2410c; }
  .crm-nav.is-active { background: ${BRAND}; color: #fff; box-shadow: 0 6px 16px -6px rgba(242,100,42,.7); }
  .crm-side-ov { display: none; }
  .crm-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 70; width: 240px; background: #fff; color: #0f172a;
    border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 20px 40px -12px rgba(15,23,42,.35); padding: 6px; }
  .crm-menu button { display: block; width: 100%; text-align: left; padding: 9px 12px; border-radius: 10px; font-size: 12px; font-weight: 700;
    background: transparent !important; color: #0f172a !important; border: 0 !important; box-shadow: none !important; }
  .crm-menu button:hover { background: #f1f5f9 !important; }
  details.crm-actions > summary { list-style: none; cursor: pointer; }
  details.crm-actions > summary::-webkit-details-marker { display: none; }
  .crm-search-res { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 70; background: #fff; color: #0f172a; border-radius: 16px;
    border: 1px solid #e2e8f0; box-shadow: 0 20px 40px -12px rgba(15,23,42,.35); max-height: 360px; overflow-y: auto; padding: 6px; }
  .crm-search-res button { display: flex; width: 100%; justify-content: space-between; gap: 8px; text-align: left; padding: 8px 10px; border-radius: 10px; font-size: 12px; }
  .crm-search-res button:hover, .crm-search-res button.on { background: #fff1ea; }
  .kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 14px 16px; }
  .kpi .v { font-size: 24px; font-weight: 900; color: #0f172a; line-height: 1.1; }
  .kpi .l { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
  .kpi .s { font-size: 11px; color: #94a3b8; margin-top: 4px; font-weight: 600; }
  @media (max-width: 1023px) {
    .crm-side { position: fixed; left: 0; top: 0; height: 100vh; z-index: 80; transform: translateX(-105%); transition: transform .2s ease; box-shadow: 0 0 40px rgba(0,0,0,.25); }
    .crm-side.open { transform: none; }
    .crm-side-ov.open { display: block; position: fixed; inset: 0; z-index: 75; background: rgba(15,23,42,.45); }
  }
  @media (max-width: 640px) { #header-count-badge, #crm-user-chip { display: none !important; } #crm-search { width: 100% !important; } #crm-search-box { flex: 1 1 100%; } }
  @media print { .crm-side, .crm-side-ov { display: none !important; } }
</style>`);

// ---------------------------------------------------------
// 1) Yon menyu va header
// ---------------------------------------------------------
const NAV_GROUPS = [
  ['Asosiy', ['dashboard', 'classes', 'students', 'schools']],
  ['Imtihonlar', ['tests', 'kidsmock', 'regs', 'proctors']],
  ['Natijalar', ['winners', 'groups', 'cards']],
  ['Sotuv', ['calls', 'kassa', 'edutizim']],
  ['Sozlamalar', ['telegram', 'supabase', 'parent', 'gdrive', 'gforms']]
];
const ACTIONS = ['window.print()', 'openSchoolRulesModal()', 'exportFullExcel()', 'downloadStandaloneHtml()', 'openHtmlPasteModal()', 'openClearBaseModal()', 'resetToDefault711()'];

function toggleSide(open) {
  document.getElementById('crm-side')?.classList.toggle('open', open);
  document.getElementById('crm-side-ov')?.classList.toggle('open', open);
}
window.crmToggleSide = toggleSide;

function syncHeaderHeight() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--hdr', h.offsetHeight + 'px');
}

function buildLayout() {
  const nav = document.querySelector('header nav');
  if (!nav || document.getElementById('crm-side')) return;
  const header = document.querySelector('header');
  const main = document.querySelector('main');

  // Yon menyu
  const side = document.createElement('aside');
  side.id = 'crm-side';
  side.className = 'crm-side';
  side.innerHTML = `
    <div class="flex items-center justify-between px-2 pb-2 lg:hidden">
      <b class="text-sm text-slate-900">Registan LC</b>
      <button onclick="crmToggleSide(false)" class="w-8 h-8 rounded-lg bg-slate-100 font-black">✕</button>
    </div>
    ${NAV_GROUPS.map(([t]) => `<div class="crm-side-title">${t}</div><div data-g="${t}"></div>`).join('')}`;
  NAV_GROUPS.forEach(([t, ids]) => {
    const box = side.querySelector(`[data-g="${t}"]`);
    ids.forEach(id => { const b = document.getElementById('nav-' + id); if (b) box.appendChild(b); });
  });
  nav.querySelectorAll('.nav-btn').forEach(b => side.querySelector('[data-g="Sozlamalar"]').appendChild(b));
  side.querySelectorAll('.nav-btn').forEach(b => { b.className = 'nav-btn crm-nav'; });
  nav.parentElement.remove();

  const shell = document.createElement('div');
  shell.className = 'crm-shell';
  main.parentNode.insertBefore(shell, main);
  shell.append(side, main);
  main.classList.add('min-w-0');
  const ov = document.createElement('div');
  ov.id = 'crm-side-ov';
  ov.className = 'crm-side-ov';
  ov.onclick = () => toggleSide(false);
  document.body.appendChild(ov);

  // Header: ☰, subtitle faqat kattada, amallar menyusi, qidiruv
  const row = header.firstElementChild;
  row.classList.remove('py-3');
  row.classList.add('py-2.5');
  const brand = row.firstElementChild;
  brand.insertAdjacentHTML('afterbegin', `<button onclick="crmToggleSide(true)" class="lg:hidden w-10 h-10 rounded-xl bg-white/15 border border-white/30 text-white text-lg font-black shrink-0" aria-label="Menyu">☰</button>`);
  brand.querySelector('p')?.classList.add('hidden', 'xl:block');
  const actionsBox = row.lastElementChild;
  const details = document.createElement('details');
  details.className = 'crm-actions relative';
  details.innerHTML = `<summary class="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 text-xs font-bold">⚙️ Amallar ▾</summary><div class="crm-menu"></div>`;
  const menu = details.querySelector('.crm-menu');
  ACTIONS.forEach(fn => { const b = actionsBox.querySelector(`button[onclick="${fn}"]`); if (b) menu.appendChild(b); });
  actionsBox.appendChild(details);
  document.addEventListener('click', e => { if (!details.contains(e.target)) details.open = false; });
  menu.addEventListener('click', () => { details.open = false; });

  actionsBox.insertAdjacentHTML('afterbegin', `
    <div class="relative" id="crm-search-box">
      <input id="crm-search" autocomplete="off" placeholder="🔍 O‘quvchi qidirish…"
        class="w-44 sm:w-56 px-3 py-2 rounded-xl bg-white/95 text-slate-900 text-xs font-bold border border-white/40 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300">
      <div id="crm-search-res" class="crm-search-res hidden"></div>
    </div>`);
  wireSearch();

  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);
  new ResizeObserver(syncHeaderHeight).observe(header);
}

// switchTab: yon menyuda faol bo'limni belgilash
const origSwitch = window.switchTab;
window.switchTab = function (name) {
  origSwitch(name);
  markActive(name);
  toggleSide(false);
};
function markActive(name) {
  document.querySelectorAll('#crm-side .nav-btn').forEach(b => {
    b.classList.remove('bg-[#F2642A]', 'shadow', 'bg-white/15');
    b.classList.toggle('is-active', b.id === 'nav-' + name);
  });
}

// ---------------------------------------------------------
// 2) Global qidiruv
// ---------------------------------------------------------
function wireSearch() {
  const inp = document.getElementById('crm-search');
  const res = document.getElementById('crm-search-res');
  let sel = 0;
  const norm = s => String(s || '').toLowerCase().replace(/[ʻʼ‘’'`]/g, '');
  const find = q => {
    const t = norm(q).trim();
    const d = q.replace(/\D/g, '');
    if (t.length < 2 && d.length < 3) return [];
    return (state.students || []).filter(s =>
      norm(s.fullName).includes(t) || (d.length >= 3 && (String(s.phone || '').replace(/\D/g, '').includes(d) || String(s.studentPhone || '').replace(/\D/g, '').includes(d)))
    ).slice(0, 10);
  };
  const draw = () => {
    const list = find(inp.value);
    if (!inp.value.trim()) return res.classList.add('hidden');
    res.classList.remove('hidden');
    res.innerHTML = list.length
      ? list.map((s, i) => `<button data-id="${s.id}" class="${i === sel ? 'on' : ''}"><span><b>${esc(s.fullName)}</b><span class="block text-[10px] text-slate-500">${esc(s.className)} · ${esc(s.phone || 'raqamsiz')}</span></span><b class="text-[#F2642A]">${Number(s.score) || 0}</b></button>`).join('')
      : '<div class="p-3 text-xs text-slate-500 font-bold">Topilmadi</div>';
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('focus', draw);
  inp.addEventListener('keydown', e => {
    const n = res.querySelectorAll('button[data-id]').length;
    if (e.key === 'ArrowDown') { sel = Math.min(n - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter') { const b = res.querySelectorAll('button[data-id]')[sel]; if (b) b.click(); }
    if (e.key === 'Escape') { res.classList.add('hidden'); inp.blur(); }
  });
  res.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    res.classList.add('hidden');
    inp.value = '';
    window.crmOpenStudent(Number(b.dataset.id));
  });
  document.addEventListener('click', e => { if (!document.getElementById('crm-search-box')?.contains(e.target)) res.classList.add('hidden'); });
}

// ---------------------------------------------------------
// 3) 👁 O'quvchi kartochkasi
// ---------------------------------------------------------
const CALL_STATUSES = ['Yangi', 'Bog‘lanildi', 'Sinov darsiga yozildi', 'Raqamsiz'];
window.crmOpenStudent = id => {
  const st = (state.students || []).find(s => s.id === id);
  if (!st) return showToast('O‘quvchi topilmadi', '⚠️');
  const rankMap = getParallelRankMap();
  const pr = getStudentPrizeInfo(st, rankMap);
  const subs = (crm()?.submissions || []).filter(x => x.student_id === id);
  const pays = (state.payments || []).filter(p => p.studentName === st.fullName && p.className === st.className);
  const edu = crm()?.eduPushed?.[id];
  const tel = p => p ? `<a href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}" class="font-black text-sky-700 underline">${esc(p)}</a>` : '<span class="text-slate-400">—</span>';
  const top3 = pr.rank <= 3;
  document.getElementById('crm-student-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
  <div id="crm-student-modal" class="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onclick="if(event.target===this)this.remove()">
    <div class="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
      <div class="p-5 sm:p-6 text-white bg-gradient-to-br from-[#5C1608] via-[#9A3412] to-[#F2642A] rounded-t-3xl relative">
        <button onclick="document.getElementById('crm-student-modal').remove()" class="absolute top-4 right-4 w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 font-black">✕</button>
        <div class="text-[11px] font-bold uppercase tracking-wider text-orange-100">👁 O‘quvchi kartochkasi · ID ${st.id}</div>
        <div class="text-2xl font-black mt-1 pr-10">${esc(st.fullName)}</div>
        <div class="text-sm text-orange-100 font-semibold mt-0.5">${esc(st.className)} sinf · ${esc(typeof schoolName === 'function' ? schoolName() : '')}</div>
        <div class="grid grid-cols-3 gap-2 mt-4">
          <div class="bg-white/15 rounded-2xl p-3"><div class="text-[10px] font-bold uppercase text-orange-100">Ball</div><div class="text-2xl font-black">${Number(st.score) || 0}</div><div class="text-[10px] text-orange-100">${Number(st.q1) || 0} + ${Number(st.q2) || 0}</div></div>
          <div class="bg-white/15 rounded-2xl p-3"><div class="text-[10px] font-bold uppercase text-orange-100">Parallel o‘rni</div><div class="text-2xl font-black">#${pr.rank < 999 ? pr.rank : '—'}</div><div class="text-[10px] text-orange-100">${esc(pr.gradeKey)} · ${pr.totalInParallel} ta</div></div>
          <div class="bg-white/15 rounded-2xl p-3"><div class="text-[10px] font-bold uppercase text-orange-100">Sovrin</div><div class="text-lg font-black leading-tight mt-1">${top3 ? esc(formatMoney(pr.amount)) : '—'}</div><div class="text-[10px] text-orange-100">${top3 ? esc(pr.tier) : 'TOP-3 da emas'}</div></div>
        </div>
      </div>
      <div class="p-5 sm:p-6 space-y-5 text-sm">
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200"><div class="text-[10px] font-black uppercase text-slate-500">👨‍👩‍👧 Ota-ona telefoni</div><div class="mt-1">${tel(st.phone)}</div></div>
          <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200"><div class="text-[10px] font-black uppercase text-slate-500">📱 O‘quvchi telefoni</div><div class="mt-1">${tel(st.studentPhone)}</div></div>
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block"><span class="text-[10px] font-black uppercase text-slate-500">📞 Qo‘ng‘iroq holati</span>
            <select id="sc-call" ${canWrite() ? '' : 'disabled'} class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white">
              ${CALL_STATUSES.map(s => `<option ${s === st.callStatus ? 'selected' : ''}>${s}</option>`).join('')}
            </select></label>
          <div class="p-3 rounded-2xl ${edu ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border">
            <div class="text-[10px] font-black uppercase text-slate-500">🔗 Edutizim</div>
            <div class="mt-1 font-black ${edu ? 'text-emerald-700' : 'text-slate-500'}">${edu ? '✅ Lid sifatida yuborilgan' : 'Yuborilmagan'}</div>
          </div>
        </div>
        <label class="block"><span class="text-[10px] font-black uppercase text-slate-500">📝 Izoh</span>
          <textarea id="sc-note" rows="2" ${canWrite() ? '' : 'disabled'} class="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold">${esc(st.note || '')}</textarea></label>
        ${canWrite() ? `<button onclick="crmSaveStudentCard(${st.id})" class="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black">💾 Holat va izohni saqlash</button>` : ''}

        <div>
          <div class="text-xs font-black text-slate-900 mb-2">📊 Imtihon natijalari (${subs.length + (st.lastExam && !subs.length ? 1 : 0)})</div>
          ${subs.length ? `<div class="space-y-1.5">${subs.map(x => `
            <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span><b class="font-mono">${esc(x.test_code)}</b> · ${fmtDate(x.created_at)} · ${/manual/.test(x.source || '') ? '✍️ qo‘lda' : '📸 varaq'}</span>
              <span>${x.correct ?? ''} to‘g‘ri · <b class="text-[#F2642A]">${x.score ?? ''} ball</b></span>
            </div>`).join('')}</div>`
            : st.lastExam ? `<div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"><b class="font-mono">${esc(st.lastExam.test)}</b> · ${fmtDate(st.lastExam.at)} · <b class="text-[#F2642A]">${esc(st.lastExam.score)} ball</b></div>`
            : '<div class="text-xs text-slate-400 font-bold">Hali tizim orqali kiritilgan natija yo‘q (ball qo‘lda kiritilgan bo‘lishi mumkin).</div>'}
        </div>

        <div>
          <div class="text-xs font-black text-slate-900 mb-2">💳 To‘lovlar (${pays.length})</div>
          ${pays.length ? pays.map(p => `<div class="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-1.5"><span>${esc(p.date)} · ${esc(p.promo || '')}</span><b>${esc(formatMoney(p.finalAmount))}</b></div>`).join('') : '<div class="text-xs text-slate-400 font-bold">To‘lov yo‘q.</div>'}
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          ${canWrite() ? `<button onclick="document.getElementById('crm-student-modal').remove();crmEditStudent(${st.id})" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-black">✏️ Tahrirlash</button>` : ''}
          ${canWrite() && !edu ? `<button onclick="crmPushToEdu(${st.id})" class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black">➡️ Edutizimga yuborish</button>` : ''}
          ${top3 ? `<button onclick="document.getElementById('crm-student-modal').remove();openStudentCardPreview(${st.id})" class="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-black">🏅 Yutuqli karta</button>` : ''}
          ${top3 && canWrite() ? `<button onclick="document.getElementById('crm-student-modal').remove();applyWinnerDiscountToKassa(${st.id})" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black">💳 Kassaga</button>` : ''}
        </div>
      </div>
    </div>
  </div>`);
};
window.crmSaveStudentCard = id => {
  const st = state.students.find(s => s.id === id);
  if (!st) return;
  st.callStatus = document.getElementById('sc-call').value;
  st.note = document.getElementById('sc-note').value.trim();
  saveState();
  showToast(`${st.fullName}: ma’lumot saqlandi`, '💾');
  document.getElementById('crm-student-modal')?.remove();
  if (typeof renderCurrentTab === 'function') renderCurrentTab();
};

// Jadvallardagi o'quvchilar yoniga 👁 tugmasi
function addCardButtons() {
  document.querySelectorAll('main button[onclick^="crmEditStudent("], main button[onclick^="deleteStudentById("]').forEach(b => {
    const id = Number(b.getAttribute('onclick').match(/\d+/)?.[0]);
    if (!id || b.parentElement.querySelector(`[data-card="${id}"]`)) return;
    b.parentElement.insertAdjacentHTML('afterbegin', `<button data-card="${id}" onclick="crmOpenStudent(${id})" title="O‘quvchi kartochkasi" class="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#c2410c] font-black mr-1">👁</button>`);
  });
}

// ---------------------------------------------------------
// 4) Dashboard: ko'rsatkichlar va grafiklar
// ---------------------------------------------------------
const charts = {};
function chartBase() {
  if (!window.Chart) return false;
  Chart.defaults.font.family = 'Inter, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#64748b';
  return true;
}
function makeChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !chartBase()) return;
  charts[id]?.destroy();
  charts[id] = new Chart(el, cfg);
}
const barOpts = (horizontal = false, suffix = '') => ({
  indexAxis: horizontal ? 'y' : 'x',
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 10, callbacks: { label: c => ` ${nf(c.parsed[horizontal ? 'x' : 'y'])}${suffix}` } } },
  scales: {
    x: { grid: { display: horizontal, color: '#f1f5f9' }, border: { display: false }, beginAtZero: true },
    y: { grid: { display: !horizontal, color: '#f1f5f9' }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } }
  }
});
const barDs = data => ({ data, backgroundColor: BRAND, hoverBackgroundColor: '#c2410c', borderRadius: 4, borderSkipped: 'start', maxBarThickness: 26 });

const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dayKey(d)); }
  return out;
}

function renderDashboardExtras() {
  const host = document.getElementById('tab-dashboard');
  if (!host || host.querySelector('#crm-dash-x')) return;
  const S = state.students || [];
  const regs = crm()?.registrations || [];
  const subs = crm()?.submissions || [];
  const pays = state.payments || [];
  const today = dayKey(new Date());
  const withPhone = S.filter(s => String(s.phone || '').trim()).length;
  const avg = S.length ? (S.reduce((a, s) => a + (Number(s.score) || 0), 0) / S.length).toFixed(1) : '0';
  const trial = S.filter(s => s.callStatus === 'Sinov darsiga yozildi').length;
  const reached = S.filter(s => s.callStatus === 'Bog‘lanildi' || s.callStatus === 'Sinov darsiga yozildi').length;
  const income = pays.reduce((a, p) => a + (Number(p.finalAmount) || 0), 0);
  const eduCount = Object.keys(crm()?.eduPushed || {}).length;
  const activeRegs = regs.filter(r => r.status !== 'Bekor');

  host.insertAdjacentHTML('afterbegin', `
  <div id="crm-dash-x" class="space-y-5">
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <div class="kpi"><div class="l">🎓 O‘quvchilar</div><div class="v">${nf(S.length)}</div><div class="s">📱 ${S.length ? Math.round(withPhone / S.length * 100) : 0}% raqamli</div></div>
      <div class="kpi"><div class="l">📈 O‘rtacha ball</div><div class="v">${avg}</div><div class="s">${(state.classes || []).length} ta sinf</div></div>
      <div class="kpi"><div class="l">🧒 Kids Mock</div><div class="v">${nf(activeRegs.length)}</div><div class="s">bugun +${regs.filter(r => dayKey(r.created_at) === today).length} ariza</div></div>
      <div class="kpi"><div class="l">📸 Tekshirilgan</div><div class="v">${nf(subs.length)}</div><div class="s">bugun +${subs.filter(x => dayKey(x.created_at) === today).length} varaq</div></div>
      <div class="kpi"><div class="l">📞 Sinov darsi</div><div class="v">${nf(trial)}</div><div class="s">bog‘lanildi: ${nf(reached)} / ${nf(withPhone)}</div></div>
      <div class="kpi"><div class="l">💳 Kassa</div><div class="v text-[20px]">${esc(formatMoney(income))}</div><div class="s">${pays.length} to‘lov · Edu: ${eduCount}</div></div>
    </div>
    <div class="grid lg:grid-cols-2 gap-4">
      <div class="bg-white rounded-3xl p-5 border border-slate-200"><div class="font-black text-slate-900 text-sm">📊 Sinflar bo‘yicha o‘rtacha ball</div><div class="text-[11px] text-slate-500 mb-3">Har bir sinfning o‘rtacha bali</div><div class="h-64"><canvas id="ch-class"></canvas></div></div>
      <div class="bg-white rounded-3xl p-5 border border-slate-200"><div class="font-black text-slate-900 text-sm">🎯 Ball taqsimoti</div><div class="text-[11px] text-slate-500 mb-3">Nechta o‘quvchi qaysi ball oralig‘ida</div><div class="h-64"><canvas id="ch-bands"></canvas></div></div>
      <div class="bg-white rounded-3xl p-5 border border-slate-200"><div class="font-black text-slate-900 text-sm">🧒 Kids Mock arizalari · 14 kun</div><div class="text-[11px] text-slate-500 mb-3">Kunlik yangi arizalar (bot + Mini App)</div><div class="h-56"><canvas id="ch-regs"></canvas></div></div>
      <div class="bg-white rounded-3xl p-5 border border-slate-200"><div class="font-black text-slate-900 text-sm">📞 Qo‘ng‘iroq holatlari</div><div class="text-[11px] text-slate-500 mb-3">Ota-onalar bilan ishlash bosqichlari</div><div class="h-56"><canvas id="ch-calls"></canvas></div></div>
    </div>
    <div class="bg-white rounded-3xl p-5 border border-slate-200">
      <div class="font-black text-slate-900 text-sm mb-3">⚡ So‘nggi faollik</div>
      <div id="crm-activity" class="space-y-1.5 text-xs"></div>
    </div>
  </div>`);

  // Sinflar o'rtachasi
  const byClass = {};
  S.forEach(s => { (byClass[s.className] ||= []).push(Number(s.score) || 0); });
  const classNames = Object.keys(byClass).sort((a, b) => a.localeCompare(b, 'uz', { numeric: true }));
  makeChart('ch-class', { type: 'bar', data: { labels: classNames, datasets: [barDs(classNames.map(c => +(byClass[c].reduce((a, b) => a + b, 0) / byClass[c].length).toFixed(1)))] }, options: barOpts(false, ' ball') });

  // Ball taqsimoti
  const bands = ['0–19', '20–39', '40–59', '60–79', '80–100'];
  const bandCnt = [0, 0, 0, 0, 0];
  S.forEach(s => { const v = Number(s.score) || 0; bandCnt[Math.min(4, Math.floor(v / 20))]++; });
  makeChart('ch-bands', { type: 'bar', data: { labels: bands, datasets: [barDs(bandCnt)] }, options: barOpts(false, ' o‘quvchi') });

  // Arizalar 14 kun
  const days = lastDays(14);
  const regDay = Object.fromEntries(days.map(d => [d, 0]));
  regs.forEach(r => { const k = dayKey(r.created_at); if (k in regDay) regDay[k]++; });
  makeChart('ch-regs', {
    type: 'line',
    data: { labels: days.map(d => d.slice(8) + '.' + d.slice(5, 7)), datasets: [{ data: days.map(d => regDay[d]), borderColor: BRAND, backgroundColor: 'rgba(242,100,42,.12)', fill: true, tension: .3, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: BRAND, pointBorderWidth: 2 }] },
    options: { ...barOpts(false, ' ariza'), interaction: { mode: 'index', intersect: false } }
  });

  // Qo'ng'iroq holatlari
  const callCnt = CALL_STATUSES.map(st => S.filter(s => (s.callStatus || 'Yangi') === st).length);
  makeChart('ch-calls', { type: 'bar', data: { labels: CALL_STATUSES, datasets: [barDs(callCnt)] }, options: barOpts(true, ' ta') });

  // Faollik lentasi
  const feed = [
    ...regs.map(r => ({ t: r.created_at, h: `🧒 <b>${esc(r.full_name)}</b> Kids Mock’ga yozildi · ${esc(r.subject1 || '')} + ${esc(r.subject2 || 'Ingliz tili')} · 🚪 ${esc(r.room || '')}` })),
    ...subs.map(x => ({ t: x.created_at, h: `📸 <b>${esc(x.student_name)}</b> · ${esc(x.test_code)} · <b class="text-[#F2642A]">${esc(x.score)} ball</b>${x.class_name ? ' · ' + esc(x.class_name) : ''}` }))
  ].filter(x => x.t).sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 10);
  document.getElementById('crm-activity').innerHTML = feed.length
    ? feed.map(f => `<div class="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100"><span>${f.h}</span><span class="text-slate-400 whitespace-nowrap">${fmtDate(f.t)}</span></div>`).join('')
    : '<div class="text-slate-400 font-bold">Hali faollik yo‘q.</div>';
}

// ---------------------------------------------------------
// 5) Kids Mock: xonalar bo'yicha boshqaruv (🧒 Bot arizalari bo'limida)
// ---------------------------------------------------------
let roomSession = '';
function renderRoomsPanel() {
  const host = document.getElementById('tab-regs');
  if (!host || host.querySelector('#crm-rooms')) return;
  const regs = (crm()?.registrations || []).filter(r => r.status !== 'Bekor');
  const sessions = [...new Set(regs.map(r => r.session || '—'))];
  if (!roomSession || !sessions.includes(roomSession)) roomSession = sessions[0] || '';
  const caps = Object.fromEntries((state.mockRooms || []).map(r => [r.name, Number(r.capacity) || 30]));
  const list = regs.filter(r => (r.session || '—') === roomSession);
  const rooms = {};
  list.forEach(r => { (rooms[r.room || 'Navbatda'] ||= []).push(r); });
  const names = Object.keys(rooms).sort((a, b) => a.localeCompare(b, 'uz', { numeric: true }));
  const inMock = new Set((state.mockStudents || []).map(m => m.regId).filter(Boolean));
  host.insertAdjacentHTML('afterbegin', `
  <div id="crm-rooms" class="bg-white rounded-3xl p-5 border border-slate-200">
    <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
      <div><h2 class="text-lg font-black text-slate-900">🚪 Kids Mock xonalari</h2>
      <div class="text-[11px] text-slate-500">Imtihon kuni: ro‘yxatni chop eting → kelganlarni belgilang → natijalar ro‘yxatiga o‘tkazing.</div></div>
      ${sessions.length > 1 ? `<select onchange="crmRoomSession(this.value)" class="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold">${sessions.map(s => `<option ${s === roomSession ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : `<span class="text-xs font-black text-slate-600">${esc(roomSession || 'Sessiya yo‘q')}</span>`}
    </div>
    ${names.length ? `<div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">${names.map(n => {
      const rs = rooms[n];
      const cap = n === 'Navbatda' ? 0 : (caps[n] || 30); // bot ham sozlanmagan xonani 30 deb oladi
      const came = rs.filter(r => r.status === 'Keldi').length;
      const pct = cap ? Math.min(100, Math.round(rs.length / cap * 100)) : 100;
      const moved = rs.filter(r => inMock.has(r.id)).length;
      return `<div class="p-4 rounded-2xl border ${n === 'Navbatda' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}">
        <div class="flex items-center justify-between"><b class="text-slate-900">🚪 ${esc(n)}</b><span class="text-xs font-black text-slate-600">${rs.length}${cap ? ' / ' + cap : ''}</span></div>
        <div class="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${pct >= 100 ? '#dc2626' : BRAND}"></div></div>
        <div class="text-[11px] text-slate-500 mt-2 font-semibold">✅ Keldi: <b>${came}</b> · 📋 Natijada: <b>${moved}</b></div>
        <div class="flex flex-wrap gap-1.5 mt-3">
          <button onclick="crmPrintRoom('${esc(n)}')" class="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-black">🖨️ Ro‘yxat</button>
          ${canWrite() ? `<button onclick="crmRoomAllCame('${esc(n)}')" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black">✅ Hammasi keldi</button>
          <button onclick="crmRoomToMock('${esc(n)}')" class="px-2.5 py-1.5 rounded-lg bg-[#F2642A] text-white text-[11px] font-black">➕ Natijalarga</button>` : ''}
        </div>
      </div>`;
    }).join('')}</div>` : '<div class="text-sm text-slate-400 font-bold">Hali ariza yo‘q.</div>'}
  </div>`);
}
const roomRegs = room => (crm()?.registrations || []).filter(r => r.status !== 'Bekor' && (r.session || '—') === roomSession && (r.room || 'Navbatda') === room)
  .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'uz'));
window.crmRoomSession = v => { roomSession = v; document.getElementById('crm-rooms')?.remove(); renderRoomsPanel(); };
window.crmPrintRoom = room => {
  const rs = roomRegs(room);
  const w = window.open('', '_blank');
  if (!w) return showToast('Brauzer yangi oynani blokladi', '⚠️');
  w.document.write(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${esc(room)} — Kids Mock</title>
  <style>body{font-family:Inter,Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px;margin:0}p{margin:4px 0 16px;color:#475569;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:7px 8px;text-align:left}th{background:#fff1ea}td.n{width:28px;text-align:center}td.s{width:110px}</style></head><body>
  <h1>Registan LC · Kids Mock — ${esc(room)}</h1><p>${esc(roomSession)} · ${rs.length} ta o‘quvchi · chop etildi: ${new Date().toLocaleString('uz-UZ')}</p>
  <table><thead><tr><th>№</th><th>F.I.Sh.</th><th>Sinf</th><th>1-fan</th><th>2-fan</th><th>Telefon</th><th>Ariza</th><th>Imzo</th></tr></thead><tbody>
  ${rs.map((r, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(r.full_name)}</b></td><td>${esc(r.grade)}</td><td>${esc(r.subject1 || '')} ${esc(r.level || '')}</td><td>${esc(r.subject2 || 'Ingliz tili')} ${esc(r.level2 || '')}</td><td>${esc(r.phone)}</td><td>KM-${r.id}</td><td class="s"></td></tr>`).join('')}
  </tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
};
window.crmRoomAllCame = async room => {
  const ids = roomRegs(room).filter(r => r.status !== 'Keldi').map(r => r.id);
  if (!ids.length) return showToast('Bu xonada hamma allaqachon “Keldi”', 'ℹ️');
  if (!confirm(`${room}: ${ids.length} ta o‘quvchini “Keldi” deb belgilaysizmi?`)) return;
  const { error } = await sb().from('crm_mock_registrations').update({ status: 'Keldi' }).in('id', ids);
  if (error) return showToast(error.message, '⚠️');
  crm().registrations.forEach(r => { if (ids.includes(r.id)) r.status = 'Keldi'; });
  showToast(`${ids.length} ta o‘quvchi “Keldi” deb belgilandi`, '✅');
  renderCurrentTab();
};
window.crmRoomToMock = room => {
  const have = new Set((state.mockStudents || []).map(m => m.regId).filter(Boolean));
  const rs = roomRegs(room).filter(r => !have.has(r.id) && r.status !== 'Kelmadi');
  if (!rs.length) return showToast('Bu xonadagilar allaqachon natijalar ro‘yxatida', 'ℹ️');
  rs.forEach(r => state.mockStudents.push({ id: crmNextId(), fullName: r.full_name, room: r.room, session: r.session || '', q1: 0, q2: 0, score: 0, phone: r.phone, regId: r.id, subject1: r.subject1 || 'Matematika', level: r.level || 'Oson', subject2: r.subject2 || 'Ingliz tili', level2: r.level2 || 'Oson', teacher: r.teacher || '', source: 'telegram-reg' }));
  saveState();
  showToast(`${rs.length} ta o‘quvchi Kids Mock natijalar ro‘yxatiga qo‘shildi`, '➕');
  renderCurrentTab();
};

// ---------------------------------------------------------
// Render ilgagi
// ---------------------------------------------------------
const prevRender = window.renderCurrentTab;
window.renderCurrentTab = function () {
  prevRender();
  setTimeout(() => {
    if (currentTab === 'dashboard') renderDashboardExtras();
    if (currentTab === 'regs') renderRoomsPanel();
    addCardButtons();
    markActive(currentTab);
  }, 0);
};

buildLayout();
markActive(typeof currentTab !== 'undefined' ? currentTab : 'dashboard');
