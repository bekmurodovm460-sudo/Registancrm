// =========================================================
// REGISTAN CRM — platforma bo'limlari:
//   📝 Testlar & OMR · 🧒 Bot arizalari · 🔗 Edutizim · 👥 Xodimlar · 🤖 Telegram bot
// app.js dagi render funksiyalarini kengaytiradi / almashtiradi.
// =========================================================
import { drawSheet, readSheet, rgbaToGray, gradeAnswers } from './omr.js';

const crm = () => window.crm;
const sb = () => window.crm.sb;
const isAdmin = () => crm().role === 'admin';
const canWrite = () => ['admin', 'operator'].includes(crm().role);
const esc = s => escapeHtml(s ?? '');
const fmtDate = d => (d ? new Date(d).toLocaleString('uz-UZ', { dateStyle: 'short', timeStyle: 'short' }) : '');
const card = (inner, cls = '') => `<div class="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 ${cls}">${inner}</div>`;
const input = 'px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white';
const btn = (color = 'slate-900') => `px-4 py-2 rounded-xl bg-${color} text-white text-xs font-black hover:opacity-90 transition`;

async function invoke(fn, body) {
  const { data, error } = await sb().functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { /* */ }
    return { ok: false, error: msg };
  }
  return data;
}

async function setSecret(key, value) {
  const { error } = await sb().rpc('crm_set_secret', { p_key: key, p_value: value });
  if (error) throw error;
}
async function secretStatus() {
  const { data } = await sb().rpc('crm_secret_status');
  const m = {};
  (data || []).forEach(r => { m[r.key] = r; });
  return m;
}

// ---------------------------------------------------------
// Router kengaytmasi
// ---------------------------------------------------------
const NEW_TABS = {
  tests: () => renderTestsTab(),
  regs: () => renderRegsTab(),
  edutizim: () => renderEdutizimTab(),
  supabase: () => renderStaffTab(),
  telegram: () => renderTelegramTab()
};
const origRender = window.renderCurrentTab;
window.renderCurrentTab = function () {
  if (NEW_TABS[currentTab]) { NEW_TABS[currentTab](); updateHeaderStats(); return; }
  origRender();
};

// =========================================================
// 📝 TESTLAR & OMR
// =========================================================
let editingTest = null;
let subsFilter = 'ALL';

function renderTestsTab() {
  const el = document.getElementById('tab-tests');
  const tests = crm().tests;
  const t = editingTest || { code: '', title: '', kind: 'mock', num_questions: 30, num_options: 4, answer_key: '', q1_count: 0, w1: 1, w2: 1, session: (state.mockSessions || [])[0] || mockExamSession, active: true };
  const subs = crm().submissions.filter(s => subsFilter === 'ALL' || s.test_code === subsFilter);
  el.innerHTML = `
  <div class="grid lg:grid-cols-3 gap-5">
    ${card(`
      <h2 class="text-lg font-black text-slate-900">${editingTest ? '✏️ Testni tahrirlash' : '➕ Yangi test (javob kaliti)'}</h2>
      <p class="text-[11px] text-slate-500 mb-3">Bot shu kalit bo‘yicha varaq rasmini tekshiradi.</p>
      ${canWrite() ? `
      <div class="space-y-2.5 text-xs">
        <div class="grid grid-cols-2 gap-2">
          <label class="font-bold">Kod<input id="t-code" value="${esc(t.code)}" ${editingTest ? 'disabled' : ''} placeholder="KM-NOY-1" class="${input} w-full mt-1 uppercase"></label>
          <label class="font-bold">Turi<select id="t-kind" class="${input} w-full mt-1">
            <option value="mock" ${t.kind === 'mock' ? 'selected' : ''}>Kids Mock</option>
            <option value="school" ${t.kind === 'school' ? 'selected' : ''}>Maktab testi</option></select></label>
        </div>
        <label class="font-bold block">Nomi<input id="t-title" value="${esc(t.title)}" placeholder="Kids Mock — Noyabr, ingliz tili" class="${input} w-full mt-1"></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="font-bold">Savollar soni<input id="t-n" type="number" min="1" max="60" value="${t.num_questions}" class="${input} w-full mt-1"></label>
          <label class="font-bold">Variantlar<select id="t-o" class="${input} w-full mt-1">
            ${[3, 4, 5].map(n => `<option ${Number(t.num_options) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </div>
        <label class="font-bold block">Javob kaliti <span class="text-slate-400 font-semibold">(masalan: ABCDA… yoki 1A 2B 3C)</span>
          <textarea id="t-key" rows="3" class="${input} w-full mt-1 font-mono uppercase">${esc(t.answer_key)}</textarea></label>
        <div id="t-key-info" class="text-[11px] font-bold text-slate-500"></div>
        <div class="grid grid-cols-3 gap-2">
          <label class="font-bold">1-bo‘lim savoli<input id="t-q1" type="number" min="0" value="${t.q1_count}" class="${input} w-full mt-1"></label>
          <label class="font-bold">1-bo‘lim balli<input id="t-w1" type="number" step="0.1" value="${t.w1}" class="${input} w-full mt-1"></label>
          <label class="font-bold">2-bo‘lim balli<input id="t-w2" type="number" step="0.1" value="${t.w2}" class="${input} w-full mt-1"></label>
        </div>
        <label class="font-bold block">Sessiya<input id="t-session" value="${esc(t.session || '')}" class="${input} w-full mt-1"></label>
        <label class="flex items-center gap-2 font-bold"><input id="t-active" type="checkbox" ${t.active ? 'checked' : ''}> Botda faol (o‘quvchilar tanlay oladi)</label>
        <div class="flex gap-2 pt-1">
          <button onclick="crmSaveTest()" class="${btn('[#F2642A]')}">💾 Saqlash</button>
          ${editingTest ? `<button onclick="crmEditTest(null)" class="${btn('slate-400')}">Bekor</button>` : ''}
        </div>
      </div>` : '<div class="text-xs text-slate-500">Test yaratish uchun operator yoki admin roli kerak.</div>'}
    `)}

    <div class="lg:col-span-2 space-y-5">
      ${card(`
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 class="text-lg font-black text-slate-900">📋 Testlar (${tests.length})</h2>
          <span class="text-[11px] text-slate-500">Varaqni chop eting → o‘quvchi to‘ldiradi → botga rasmini yuboradi</span>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-xs">
          <thead><tr class="text-left text-slate-500 border-b"><th class="py-2">Kod</th><th>Nomi</th><th>Savol</th><th>Turi</th><th>Holat</th><th>Natija</th><th></th></tr></thead>
          <tbody>
          ${tests.map(x => `
            <tr class="border-b border-slate-100">
              <td class="py-2 font-black font-mono">${esc(x.code)}</td>
              <td class="font-bold">${esc(x.title)}<div class="text-[10px] text-slate-400">${esc(x.session || '')}</div></td>
              <td>${x.num_questions} × ${x.num_options}</td>
              <td>${x.kind === 'mock' ? '🧒 Mock' : '🏫 Maktab'}</td>
              <td>${x.active ? '<span class="text-emerald-700 font-black">● Faol</span>' : '<span class="text-slate-400 font-bold">Yopiq</span>'}</td>
              <td class="font-bold">${crm().submissions.filter(s => s.test_code === x.code).length}</td>
              <td class="text-right whitespace-nowrap">
                <button onclick="crmPrintSheet('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold">🖨️ Varaq</button>
                ${canWrite() ? `<button onclick="crmEditTest('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-slate-100 font-bold">✏️</button>
                <button onclick="crmToggleTest('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-slate-100 font-bold">${x.active ? '⏸' : '▶️'}</button>` : ''}
                ${isAdmin() ? `<button onclick="crmDeleteTest('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">🗑</button>` : ''}
              </td>
            </tr>`).join('') || '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-bold">Hali test yo‘q — chapdagi forma orqali qo‘shing.</td></tr>'}
          </tbody></table></div>
      `)}

      ${card(`
        <h2 class="text-lg font-black text-slate-900 mb-1">🔍 Varaqni brauzerda tekshirish</h2>
        <p class="text-[11px] text-slate-500 mb-3">Telefon yoki skaner rasmini yuklang — bot bilan bir xil OMR algoritmi ishlaydi.</p>
        <div class="flex flex-wrap gap-2 items-center">
          <select id="omr-test" class="${input}">${tests.map(x => `<option value="${esc(x.code)}">${esc(x.code)} — ${esc(x.title)}</option>`).join('')}</select>
          <input id="omr-name" placeholder="O‘quvchi F.I.Sh." class="${input} min-w-[200px]">
          <input id="omr-file" type="file" accept="image/*" class="text-xs">
          <button onclick="crmWebOmr()" class="${btn('indigo-600')}">⚡ Tekshirish</button>
        </div>
        <div id="omr-result" class="mt-3 text-xs"></div>
      `)}

      ${card(`
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 class="text-lg font-black text-slate-900">📊 Tekshirilgan natijalar (${subs.length})</h2>
          <div class="flex gap-2">
            <select onchange="crmSubsFilter(this.value)" class="${input}">
              <option value="ALL">Barcha testlar</option>
              ${tests.map(x => `<option value="${esc(x.code)}" ${subsFilter === x.code ? 'selected' : ''}>${esc(x.code)}</option>`).join('')}
            </select>
            <button onclick="crmExportSubs()" class="${btn('emerald-600')}">📥 Excel</button>
          </div>
        </div>
        <div class="overflow-x-auto max-h-[520px]"><table class="w-full text-xs">
          <thead class="sticky top-0 bg-white"><tr class="text-left text-slate-500 border-b"><th class="py-2">Vaqt</th><th>O‘quvchi</th><th>Test</th><th>To‘g‘ri</th><th>Ball</th><th>Manba</th><th>Javoblar</th></tr></thead>
          <tbody>
          ${subs.slice(0, 300).map(s => `
            <tr class="border-b border-slate-100">
              <td class="py-2 text-slate-500 whitespace-nowrap">${fmtDate(s.created_at)}</td>
              <td class="font-black">${esc(s.student_name)}</td>
              <td class="font-mono">${esc(s.test_code)}</td>
              <td class="font-bold">${s.correct ?? ''}</td>
              <td class="font-black text-[#F2642A]">${s.score ?? ''}</td>
              <td>${s.source === 'telegram' ? '🤖 Bot' : '🌐 Web'}</td>
              <td class="font-mono text-[10px] text-slate-500 break-all max-w-[260px]">${esc(s.answers || '')}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-bold">Hali natija yo‘q.</td></tr>'}
          </tbody></table></div>
      `)}
    </div>
  </div>`;
  const keyEl = document.getElementById('t-key');
  if (keyEl) {
    const upd = () => {
      const k = normalizeKey(keyEl.value);
      const n = Number(document.getElementById('t-n').value) || 0;
      document.getElementById('t-key-info').innerHTML = `Kalit uzunligi: <b class="${k.length === n ? 'text-emerald-700' : 'text-rose-600'}">${k.length}</b> / ${n}`;
    };
    keyEl.oninput = upd;
    document.getElementById('t-n').oninput = upd;
    upd();
  }
}

function normalizeKey(raw) {
  const s = String(raw || '').toUpperCase();
  // "1A 2B 3C" ko'rinishi
  if (/\d/.test(s)) {
    const pairs = [...s.matchAll(/(\d+)\s*[-.):]?\s*([A-E])/g)];
    if (pairs.length) {
      const arr = [];
      pairs.forEach(m => { arr[Number(m[1]) - 1] = m[2]; });
      return Array.from(arr, x => x || '?').join('');
    }
  }
  return s.replace(/[^A-E]/g, '');
}

window.crmEditTest = code => {
  editingTest = code ? { ...crm().tests.find(t => t.code === code) } : null;
  renderTestsTab();
};
window.crmSubsFilter = v => { subsFilter = v; renderTestsTab(); };

window.crmSaveTest = async () => {
  const v = id => document.getElementById(id).value;
  const row = {
    code: (editingTest?.code || v('t-code')).trim().toUpperCase().replace(/\s+/g, '-'),
    title: v('t-title').trim(),
    kind: v('t-kind'),
    num_questions: Number(v('t-n')),
    num_options: Number(v('t-o')),
    answer_key: normalizeKey(v('t-key')),
    q1_count: Number(v('t-q1')) || 0,
    w1: Number(v('t-w1')) || 1,
    w2: Number(v('t-w2')) || 1,
    session: v('t-session').trim(),
    active: document.getElementById('t-active').checked
  };
  if (!row.code || !row.title) return showToast('Kod va nomini kiriting', '⚠️');
  if (row.answer_key.length !== row.num_questions || row.answer_key.includes('?')) {
    return showToast(`Javob kaliti ${row.num_questions} ta bo‘lishi kerak (hozir ${row.answer_key.length})`, '⚠️');
  }
  if ([...row.answer_key].some(c => 'ABCDE'.indexOf(c) >= row.num_options)) return showToast('Kalitda variantlar sonidan ortiq harf bor', '⚠️');
  const { error } = await sb().from('crm_tests').upsert(row);
  if (error) return showToast('Saqlanmadi: ' + error.message, '⚠️');
  editingTest = null;
  await crm().reloadPlatformData();
  showToast(`${row.code} testi saqlandi — botda tanlash mumkin`);
};
window.crmToggleTest = async code => {
  const t = crm().tests.find(x => x.code === code);
  const { error } = await sb().from('crm_tests').update({ active: !t.active }).eq('code', code);
  if (error) return showToast(error.message, '⚠️');
  t.active = !t.active;
  renderTestsTab();
};
window.crmDeleteTest = async code => {
  if (!confirm(`${code} testini o‘chirasizmi? Natijalar saqlanib qoladi.`)) return;
  const { error } = await sb().from('crm_tests').delete().eq('code', code);
  if (error) return showToast(error.message, '⚠️');
  await crm().reloadPlatformData();
};

window.crmPrintSheet = code => {
  const t = crm().tests.find(x => x.code === code);
  const cv = document.createElement('canvas');
  const W = 2480; // 300 dpi A4
  cv.width = W;
  cv.height = Math.round(W * 297 / 210);
  drawSheet(cv.getContext('2d'), W, t);
  const url = cv.toDataURL('image/png');
  const w = window.open('', '_blank');
  if (!w) return showToast('Brauzer yangi oynani blokladi', '⚠️');
  w.document.write(`<!doctype html><html><head><title>${esc(t.code)} — javoblar varaqasi</title>
    <style>@page{size:A4;margin:0}html,body{margin:0}img{width:210mm;height:297mm;display:block}
    .bar{position:fixed;top:8px;right:8px;font:600 14px sans-serif}@media print{.bar{display:none}}</style></head>
    <body><div class="bar"><button onclick="print()">🖨️ Chop etish</button> <a download="${esc(t.code)}-varaq.png" href="${url}">PNG yuklash</a></div>
    <img src="${url}" onload="setTimeout(()=>print(),300)"></body></html>`);
  w.document.close();
};

function fileToGray(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 2000 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s);
      cv.height = Math.round(img.height * s);
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve({ gray: rgbaToGray(d.data, cv.width, cv.height), width: cv.width, height: cv.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

window.crmWebOmr = async () => {
  const code = document.getElementById('omr-test').value;
  const file = document.getElementById('omr-file').files[0];
  const name = document.getElementById('omr-name').value.trim();
  const box = document.getElementById('omr-result');
  const t = crm().tests.find(x => x.code === code);
  if (!t || !file) return showToast('Test va rasmni tanlang', '⚠️');
  box.innerHTML = '⏳ O‘qilmoqda…';
  const img = await fileToGray(file);
  const r = readSheet(img, { numQuestions: t.num_questions, numOptions: t.num_options });
  if (!r.ok) { box.innerHTML = `<div class="text-rose-600 font-bold">⚠️ ${esc(r.error)}</div>`; return; }
  const g = gradeAnswers(r.answers, t);
  box.innerHTML = `
    <div class="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
      <div class="font-black text-emerald-900">✅ ${g.correct} / ${g.total} to‘g‘ri · Ball: ${g.score}${t.q1_count ? ` (1-bo‘lim ${g.q1}, 2-bo‘lim ${g.q2})` : ''}</div>
      <div class="font-mono text-[11px] break-all">O‘qildi: ${esc(r.answers)}</div>
      <div class="font-mono text-[11px] break-all text-slate-500">Kalit:  ${esc(t.answer_key)}</div>
      ${g.wrong.length ? `<div class="text-[11px] text-rose-700">Xatolar: ${g.wrong.map(w => `${w.q}(${w.given}→${w.right})`).join(', ')}</div>` : ''}
      ${canWrite() && name ? `<button id="omr-save" class="${btn('emerald-600')} mt-1">💾 Natijani saqlash</button>` : '<div class="text-[11px] text-slate-500">Saqlash uchun o‘quvchi ismini kiriting.</div>'}
    </div>`;
  const save = document.getElementById('omr-save');
  if (save) save.onclick = async () => {
    const { error } = await sb().from('crm_omr_submissions').insert({
      test_code: t.code, source: 'web', student_name: name, answers: r.answers,
      correct: g.correct, q1_correct: g.q1, q2_correct: g.q2, score: g.score, details: { wrong: g.wrong }
    });
    if (error) return showToast(error.message, '⚠️');
    if (t.kind === 'mock') {
      state.mockStudents.push({ id: crmNextId(), fullName: name, room: 'Web OMR', session: t.session || mockExamSession, q1: t.q1_count ? g.q1 : g.correct, q2: t.q1_count ? g.q2 : 0, score: g.score, source: 'web-omr', testCode: t.code });
      saveState();
    }
    await crm().reloadPlatformData();
    showToast(`${name}: ${g.score} ball saqlandi`);
  };
};

window.crmExportSubs = () => {
  const subs = crm().submissions.filter(s => subsFilter === 'ALL' || s.test_code === subsFilter);
  const rows = subs.map(s => ({ Vaqt: fmtDate(s.created_at), 'O‘quvchi': s.student_name, Test: s.test_code, 'To‘g‘ri': s.correct, '1-bo‘lim': s.q1_correct, '2-bo‘lim': s.q2_correct, Ball: s.score, Manba: s.source, Javoblar: s.answers }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'OMR natijalar');
  XLSX.writeFile(wb, `OMR_natijalar_${subsFilter}.xlsx`);
};

// =========================================================
// 🧒 BOT ARIZALARI (Kids Mock ro'yxati)
// =========================================================
let regSearch = '';
let regSession = 'ALL';
const REG_STATUSES = ['Yangi', 'Tasdiqlandi', 'Keldi', 'Kelmadi', 'Bekor'];

function renderRegsTab() {
  const el = document.getElementById('tab-regs');
  const all = crm().registrations;
  const sessions = [...new Set(all.map(r => r.session).filter(Boolean))];
  const q = regSearch.toLowerCase();
  const list = all.filter(r => (regSession === 'ALL' || r.session === regSession) && (!q || `${r.full_name} ${r.phone} ${r.room}`.toLowerCase().includes(q)));
  const rooms = state.mockRooms || [{ name: '1-xona', capacity: 30 }, { name: '2-xona', capacity: 30 }, { name: '3-xona', capacity: 30 }, { name: '4-xona', capacity: 30 }];
  const mockSessions = state.mockSessions || [mockExamSession];
  const byRoom = {};
  list.filter(r => r.status !== 'Bekor').forEach(r => { byRoom[r.room] = (byRoom[r.room] || 0) + 1; });
  el.innerHTML = `
    <div class="grid lg:grid-cols-4 gap-5">
      <div class="lg:col-span-3 space-y-5">
        ${card(`
          <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 class="text-lg font-black text-slate-900">🧒 Telegram bot orqali Kids Mock arizalari (${list.length})</h2>
            <div class="flex gap-2 flex-wrap">
              <input value="${esc(regSearch)}" oninput="crmRegSearch(this.value)" placeholder="Ism / telefon / xona" class="${input}">
              <select onchange="crmRegSession(this.value)" class="${input}"><option value="ALL">Barcha sessiyalar</option>${sessions.map(s => `<option ${s === regSession ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
              <button onclick="crmExportRegs()" class="${btn('emerald-600')}">📥 Excel</button>
            </div>
          </div>
          <div class="flex gap-2 flex-wrap mb-3">${Object.entries(byRoom).map(([r, n]) => `<span class="px-3 py-1 rounded-xl bg-orange-50 border border-orange-200 text-[11px] font-black text-orange-800">🚪 ${esc(r)}: ${n}</span>`).join('')}</div>
          <div class="overflow-x-auto max-h-[640px]"><table class="w-full text-xs">
            <thead class="sticky top-0 bg-white"><tr class="text-left text-slate-500 border-b"><th class="py-2">№</th><th>F.I.Sh.</th><th>Sinf</th><th>Telefon</th><th>Sessiya</th><th>Xona</th><th>Holat</th><th>Vaqt</th><th></th></tr></thead>
            <tbody>
            ${list.map(r => `
              <tr class="border-b border-slate-100">
                <td class="py-2 font-mono text-slate-400">KM-${r.id}</td>
                <td class="font-black">${esc(r.full_name)}${r.tg_username ? `<div class="text-[10px] text-sky-600">@${esc(r.tg_username)}</div>` : ''}</td>
                <td>${esc(r.grade)}</td>
                <td class="font-mono">${esc(r.phone)}</td>
                <td class="text-[11px]">${esc(r.session)}</td>
                <td>${canWrite() ? `<select onchange="crmRegUpdate(${r.id},{room:this.value})" class="${input} py-1">${[...rooms.map(x => x.name), 'Navbatda'].map(n => `<option ${n === r.room ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : esc(r.room)}</td>
                <td>${canWrite() ? `<select onchange="crmRegUpdate(${r.id},{status:this.value})" class="${input} py-1">${REG_STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : esc(r.status)}</td>
                <td class="text-slate-500 whitespace-nowrap">${fmtDate(r.created_at)}</td>
                <td class="whitespace-nowrap">${canWrite() ? `<button onclick="crmRegToMock(${r.id})" class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold" title="Kids Mock natijalar ro‘yxatiga qo‘shish">➕ Mock</button>` : ''}</td>
              </tr>`).join('') || '<tr><td colspan="9" class="py-6 text-center text-slate-400 font-bold">Hali ariza yo‘q. Ota-onalar botdagi “🧒 Kids Mock ro‘yxatdan o‘tish” tugmasi orqali yoziladi.</td></tr>'}
            </tbody></table></div>
        `)}
      </div>
      ${card(`
        <h3 class="text-sm font-black text-slate-900 mb-2">⚙️ Bot sozlamalari</h3>
        <label class="text-xs font-bold block">Imtihon sessiyalari (har qatorda bittasi)
          <textarea id="reg-sessions" rows="3" ${isAdmin() ? '' : 'disabled'} class="${input} w-full mt-1">${esc(mockSessions.join('\n'))}</textarea></label>
        <label class="text-xs font-bold block mt-2">Xonalar va sig‘imi (masalan: 1-xona:30)
          <textarea id="reg-rooms" rows="4" ${isAdmin() ? '' : 'disabled'} class="${input} w-full mt-1 font-mono">${esc(rooms.map(r => `${r.name}:${r.capacity}`).join('\n'))}</textarea></label>
        ${isAdmin() ? `<button onclick="crmSaveRegSettings()" class="${btn('[#F2642A]')} mt-2 w-full">💾 Saqlash</button>` : '<div class="text-[11px] text-slate-400 mt-2">Faqat admin o‘zgartiradi.</div>'}
        <p class="text-[11px] text-slate-500 mt-3">Bot ariza kelganda birinchi bo‘sh xonani avtomatik beradi. Xonalar to‘lsa — “Navbatda”.</p>
      `, 'h-fit')}
    </div>`;
}
window.crmRegSearch = v => { regSearch = v; renderRegsTab(); const i = document.querySelector('#tab-regs input'); i.focus(); i.setSelectionRange(v.length, v.length); };
window.crmRegSession = v => { regSession = v; renderRegsTab(); };
window.crmRegUpdate = async (id, patch) => {
  const { error } = await sb().from('crm_mock_registrations').update(patch).eq('id', id);
  if (error) return showToast(error.message, '⚠️');
  Object.assign(crm().registrations.find(r => r.id === id), patch);
  showToast('Ariza yangilandi');
};
window.crmRegToMock = id => {
  const r = crm().registrations.find(x => x.id === id);
  if (state.mockStudents.some(m => m.regId === id)) return showToast('Bu ariza allaqachon Kids Mock ro‘yxatida', 'ℹ️');
  state.mockStudents.push({ id: crmNextId(), fullName: r.full_name, room: r.room, session: r.session || mockExamSession, q1: 0, q2: 0, score: 0, phone: r.phone, regId: id, source: 'telegram-reg' });
  saveState();
  showToast(`${r.full_name} Kids Mock ro‘yxatiga qo‘shildi`);
};
window.crmSaveRegSettings = () => {
  state.mockSessions = document.getElementById('reg-sessions').value.split('\n').map(s => s.trim()).filter(Boolean);
  state.mockRooms = document.getElementById('reg-rooms').value.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, cap] = s.split(':');
    return { name: name.trim(), capacity: Number(cap) || 30 };
  });
  saveState();
  showToast('Bot sozlamalari saqlandi');
};
window.crmExportRegs = () => {
  const rows = crm().registrations.map(r => ({ 'Ariza': `KM-${r.id}`, 'F.I.Sh.': r.full_name, Sinf: r.grade, Telefon: r.phone, Sessiya: r.session, Xona: r.room, Holat: r.status, Telegram: r.tg_username ? '@' + r.tg_username : '', Vaqt: fmtDate(r.created_at) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Kids Mock arizalar');
  XLSX.writeFile(wb, 'KidsMock_arizalar.xlsx');
};

// =========================================================
// 🔗 EDUTIZIM
// =========================================================
let eduRows = null;
let eduSearch = '';
let eduLog = [];

async function loadEdu() {
  eduRows = await (async () => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb().from('crm_edu_students').select('id,full_name,phone,phone_digits,groups,synced_at').order('full_name').range(from, from + 999);
      if (error || !data) break;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  })();
  const { data } = await sb().from('crm_sync_log').select('*').eq('source', 'edutizim').order('created_at', { ascending: false }).limit(10);
  eduLog = data || [];
}

async function renderEdutizimTab() {
  const el = document.getElementById('tab-edutizim');
  if (eduRows === null) {
    el.innerHTML = card('<div class="text-sm font-bold text-slate-500">⏳ Edutizim ma’lumotlari yuklanmoqda…</div>');
    await loadEdu();
  }
  const secrets = isAdmin() ? await secretStatus() : {};
  const q = eduSearch.toLowerCase();
  const list = eduRows.filter(r => !q || `${r.full_name} ${r.phone} ${r.groups}`.toLowerCase().includes(q));
  const regPhones = new Set(crm().registrations.map(r => String(r.phone || '').replace(/\D/g, '').slice(-9)));
  const matched = eduRows.filter(r => r.phone_digits && regPhones.has(r.phone_digits)).length;
  el.innerHTML = `
    <div class="grid lg:grid-cols-3 gap-5">
      <div class="space-y-5">
        ${card(`
          <h2 class="text-lg font-black text-slate-900">🔗 Registan.edutizim.uz</h2>
          <p class="text-[11px] text-slate-500 mb-3">Platforma edutizimga xodim hisobi (telefon + parol) bilan kiradi va o‘quvchilar/guruhlarni olib keladi. Parol faqat serverda saqlanadi, brauzerga qaytmaydi.</p>
          ${isAdmin() ? `
          <div class="space-y-2 text-xs">
            <label class="font-bold block">Login (telefon) ${secrets.edutizim_login ? '<span class="text-emerald-700">✓ saqlangan</span>' : ''}
              <input id="edu-login" placeholder="+998 90 123 45 67" class="${input} w-full mt-1"></label>
            <label class="font-bold block">Parol ${secrets.edutizim_password ? '<span class="text-emerald-700">✓ saqlangan</span>' : ''}
              <input id="edu-pass" type="password" autocomplete="new-password" placeholder="••••••" class="${input} w-full mt-1"></label>
            <details class="text-[11px]"><summary class="cursor-pointer font-bold text-slate-500">Qo‘shimcha</summary>
              <label class="font-bold block mt-1">API manzili ${secrets.edutizim_base_url ? '<span class="text-emerald-700">✓</span>' : '<span class="text-slate-400">(standart)</span>'}
                <input id="edu-base" placeholder="https://backend.edutizim.uz/moderator-web-api" class="${input} w-full mt-1"></label>
            </details>
            <button onclick="crmSaveEdu()" class="${btn('slate-900')} w-full">💾 Login ma’lumotlarini saqlash</button>
          </div>` : '<div class="text-[11px] text-slate-500">Login ma’lumotlarini admin kiritadi.</div>'}
          ${canWrite() ? `
          <div class="flex gap-2 mt-3">
            <button onclick="crmEduRun('test')" class="${btn('indigo-600')} flex-1">🔐 Ulanishni tekshirish</button>
            <button onclick="crmEduRun('sync')" class="${btn('[#F2642A]')} flex-1">🔄 Sinxronlash</button>
          </div>` : ''}
          <div id="edu-result" class="mt-3 text-xs"></div>
        `)}
        ${card(`
          <h3 class="text-sm font-black text-slate-900 mb-2">🧾 Sinxronlash tarixi</h3>
          <div class="space-y-1.5 text-[11px]">
            ${eduLog.map(l => `<div class="flex justify-between gap-2"><span class="${l.ok ? 'text-emerald-700' : 'text-rose-600'} font-bold">${l.ok ? '✓' : '✗'} ${esc(l.message)}</span><span class="text-slate-400 whitespace-nowrap">${fmtDate(l.created_at)}</span></div>`).join('') || '<div class="text-slate-400">Hali sinxronlanmagan.</div>'}
          </div>
        `)}
      </div>
      <div class="lg:col-span-2">
        ${card(`
          <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h2 class="text-lg font-black text-slate-900">🎓 Edutizim o‘quvchilari (${eduRows.length})</h2>
            <input value="${esc(eduSearch)}" oninput="crmEduSearch(this.value)" placeholder="Ism / telefon / guruh" class="${input}">
          </div>
          <div class="text-[11px] text-slate-500 mb-2">🔁 Bot arizalari bilan telefon bo‘yicha mos kelganlar: <b class="text-indigo-700">${matched}</b></div>
          <div class="overflow-x-auto max-h-[640px]"><table class="w-full text-xs">
            <thead class="sticky top-0 bg-white"><tr class="text-left text-slate-500 border-b"><th class="py-2">F.I.Sh.</th><th>Telefon</th><th>Guruh(lar)</th><th>Yangilangan</th></tr></thead>
            <tbody>
              ${list.slice(0, 500).map(r => `<tr class="border-b border-slate-100 ${r.phone_digits && regPhones.has(r.phone_digits) ? 'bg-indigo-50' : ''}">
                <td class="py-1.5 font-black">${esc(r.full_name)}</td><td class="font-mono">${esc(r.phone)}</td><td>${esc(r.groups)}</td><td class="text-slate-400">${fmtDate(r.synced_at)}</td></tr>`).join('') ||
                '<tr><td colspan="4" class="py-6 text-center text-slate-400 font-bold">Ma’lumot yo‘q — chapda login kiritib “Sinxronlash” ni bosing.</td></tr>'}
            </tbody></table></div>
        `)}
      </div>
    </div>`;
}
window.crmEduSearch = v => { eduSearch = v; renderEdutizimTab().then(() => { const i = document.querySelector('#tab-edutizim input[oninput]'); i.focus(); i.setSelectionRange(v.length, v.length); }); };
window.crmSaveEdu = async () => {
  try {
    const login = document.getElementById('edu-login').value.trim();
    const pass = document.getElementById('edu-pass').value;
    const base = document.getElementById('edu-base').value.trim();
    if (login) await setSecret('edutizim_login', login);
    if (pass) await setSecret('edutizim_password', pass);
    if (base) await setSecret('edutizim_base_url', base);
    showToast('Edutizim login ma’lumotlari xavfsiz saqlandi', '🔐');
    renderEdutizimTab();
  } catch (e) { showToast(e.message, '⚠️'); }
};
window.crmEduRun = async action => {
  const box = document.getElementById('edu-result');
  box.innerHTML = '⏳ Edutizim bilan bog‘lanilmoqda…';
  const r = await invoke('edutizim-sync', { action });
  if (!r.ok) { box.innerHTML = `<div class="text-rose-600 font-bold">⚠️ ${esc(r.error)}</div>`; return; }
  if (action === 'test') {
    box.innerHTML = `<div class="text-emerald-700 font-bold">✅ Ulanish muvaffaqiyatli. Filiallar: ${esc((r.branches || []).map(b => b.name).join(', ') || '—')}</div>`;
    return;
  }
  box.innerHTML = `<div class="text-emerald-700 font-bold">✅ ${r.students} o‘quvchi va ${r.groups} guruh olindi (${Math.round(r.ms / 1000)} s)</div>`;
  eduRows = null;
  renderEdutizimTab();
};

// =========================================================
// 👥 XODIMLAR (rollar)
// =========================================================
async function renderStaffTab() {
  const el = document.getElementById('tab-supabase');
  const { data: profiles } = await sb().from('crm_profiles').select('*').order('created_at');
  const classes = (state.classes || []).map(c => c.name);
  el.innerHTML = `<div class="max-w-4xl mx-auto space-y-5">
    ${card(`
      <h2 class="text-lg font-black text-slate-900">👥 Xodimlar va rollar</h2>
      <p class="text-[11px] text-slate-500 mb-3">Yangi xodim login sahifasida “ro‘yxatdan o‘tish” qiladi, so‘ng admin unga rol beradi.
        <b>Admin</b> — hammasi · <b>Operator</b> — o‘quvchi/qo‘ng‘iroq/kassa/test (o‘chirishsiz) · <b>O‘qituvchi</b> — ko‘rish va faqat o‘z sinfi ballarini tahrirlash.</p>
      ${isAdmin() ? `
      <div class="overflow-x-auto"><table class="w-full text-xs">
        <thead><tr class="text-left text-slate-500 border-b"><th class="py-2">F.I.Sh.</th><th>Email</th><th>Rol</th><th>Sinf (o‘qituvchi)</th><th>Qo‘shilgan</th><th></th></tr></thead>
        <tbody>${(profiles || []).map(p => `
          <tr class="border-b border-slate-100 ${p.role === 'pending' ? 'bg-amber-50' : ''}">
            <td class="py-2 font-black">${esc(p.full_name)}</td>
            <td class="font-mono text-[11px]">${esc(p.email)}</td>
            <td><select ${p.id === crm().user.id ? 'disabled' : ''} onchange="crmSetRole('${p.id}',{role:this.value})" class="${input} py-1">
              ${['pending', 'operator', 'teacher', 'admin'].map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${{ pending: '⏳ Kutilmoqda', operator: '🎧 Operator', teacher: '👩‍🏫 O‘qituvchi', admin: '👑 Admin' }[r]}</option>`).join('')}</select></td>
            <td><select onchange="crmSetRole('${p.id}',{class_name:this.value||null})" class="${input} py-1"><option value="">—</option>${classes.map(c => `<option ${c === p.class_name ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
            <td class="text-slate-400">${fmtDate(p.created_at)}</td>
            <td>${p.id !== crm().user.id ? `<button onclick="crmDelProfile('${p.id}')" class="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">🗑</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>` : `<div class="text-xs">Sizning rolingiz: <b>${esc(crm().role)}</b>. Rollarni faqat admin boshqaradi.</div>`}
    `)}
    ${card(`
      <h3 class="text-sm font-black text-slate-900 mb-1">☁️ Bulutli baza</h3>
      <div class="text-xs text-slate-600">Barcha ma’lumotlar Supabase (PostgreSQL) da saqlanadi va barcha kompyuterlarda real vaqtda yangilanadi. Holat: <b id="cloud-inline">${esc(document.getElementById('cloud-status-badge')?.textContent || '')}</b></div>
      <div class="text-[11px] text-slate-400 mt-1">Ota-onalar uchun ochiq sahifa: <a class="text-indigo-700 font-bold" href="parent.html" target="_blank">parent.html</a></div>
    `)}
  </div>`;
}
window.crmSetRole = async (id, patch) => {
  const { error } = await sb().from('crm_profiles').update(patch).eq('id', id);
  if (error) return showToast(error.message, '⚠️');
  showToast('Xodim ma’lumoti yangilandi');
};
window.crmDelProfile = async id => {
  if (!confirm('Xodimni tizimdan chiqarasizmi? (rol olib tashlanadi)')) return;
  const { error } = await sb().from('crm_profiles').update({ role: 'pending' }).eq('id', id);
  if (error) return showToast(error.message, '⚠️');
  renderStaffTab();
};

// =========================================================
// 🤖 TELEGRAM BOT (app.js dagi versiyani almashtiradi)
// =========================================================
async function renderTelegramTab() {
  const container = document.getElementById('tab-telegram');
  const winners = getAllParallelTop3Winners();
  const defaultWinnerId = selectedCardPreviewStudentId || (winners[0] && winners[0].student.id) || '';
  container.innerHTML = `<div class="max-w-3xl mx-auto space-y-5">
    ${card(`
      <h2 class="text-xl font-black text-slate-900">🤖 Telegram bot</h2>
      <p class="text-xs text-slate-500">Bot o‘quvchilarga <b>javoblar varaqasi rasmi orqali natijani tekshirish</b> va <b>Kids Mock’ga ro‘yxatdan o‘tish</b> imkonini beradi. Natijalar va arizalar CRM’ga real vaqtda tushadi.</p>
      <div id="tg-status" class="mt-3 text-xs p-3 rounded-2xl bg-slate-50 border border-slate-200">⏳ Bot holati tekshirilmoqda…</div>
      ${isAdmin() ? `
      <div class="grid sm:grid-cols-2 gap-2 mt-3 text-xs">
        <label class="font-bold">BotFather token<input id="tg-token-inp" type="password" autocomplete="off" placeholder="123456:ABC…" class="${input} w-full mt-1 font-mono"></label>
        <label class="font-bold">Admin / guruh Chat ID (xabarnomalar)<input id="tg-chat-inp" placeholder="-100… yoki 123456789" class="${input} w-full mt-1 font-mono"></label>
      </div>
      <div class="flex flex-wrap gap-2 mt-2">
        <button onclick="saveTelegramConfig()" class="${btn('sky-600')}">💾 Saqlash va botni ulash</button>
        <button onclick="crmTgStatus()" class="${btn('slate-500')}">🔄 Holat</button>
      </div>
      <p class="text-[11px] text-slate-400 mt-2">Token serverda saqlanadi va brauzerga qaytmaydi. Chat ID ni bilish uchun botga yoki guruhga <code>/id</code> yozing.</p>` : ''}
    `)}
    ${winners.length && canWrite() ? card(`
      <div class="text-sm font-black text-slate-800 mb-2">🖼️ Sovrindor karta rasmini Telegramga yuborish</div>
      <div class="flex flex-wrap gap-2">
        <select id="tg-winner-select" class="flex-1 min-w-[220px] ${input}">
          ${winners.map(({ student, prize }) => `<option value="${student.id}" ${student.id === defaultWinnerId ? 'selected' : ''}>${esc(prize.gradeKey)} · ${esc(student.className)} — ${esc(student.fullName)} (${formatMoney(prize.amount)})</option>`).join('')}
        </select>
        <input id="tg-target-chat" placeholder="Chat ID (bo‘sh = admin chat)" class="${input} font-mono">
        <button onclick="sendVipCardToTelegramBot(Number(document.getElementById('tg-winner-select').value))" class="${btn('emerald-600')}">📤 Yuborish</button>
      </div>
    `) : ''}
  </div>`;
  crmTgStatus();
}
window.renderTelegramTab = renderTelegramTab;

window.crmTgStatus = async () => {
  const box = document.getElementById('tg-status');
  if (!box) return;
  const r = await invoke('tg-admin', { action: 'status' });
  if (!r.ok) { box.innerHTML = `<span class="text-rose-600 font-bold">⚠️ ${esc(r.error || 'Bot ulanmagan')}</span>`; return; }
  const wh = r.webhook || {};
  const connected = (wh.url || '').includes('/functions/v1/telegram-bot');
  box.innerHTML = `
    <div class="font-black text-slate-900">@${esc(r.bot?.username)} · ${esc(r.bot?.first_name)}</div>
    <div>Webhook: ${connected ? '<b class="text-emerald-700">✅ ulangan</b>' : '<b class="text-rose-600">✗ ulanmagan</b>'} ${wh.pending_update_count ? `· navbatda ${wh.pending_update_count}` : ''}</div>
    ${wh.last_error_message ? `<div class="text-rose-600">Oxirgi xato: ${esc(wh.last_error_message)}</div>` : ''}
    <div>Admin xabarnomalari: ${r.adminChatSet ? '✅' : '—'}</div>
    <a class="text-sky-700 font-bold" href="https://t.me/${esc(r.bot?.username)}" target="_blank">t.me/${esc(r.bot?.username)} ↗</a>`;
};

window.saveTelegramConfig = async () => {
  const token = document.getElementById('tg-token-inp').value.trim();
  const chat = document.getElementById('tg-chat-inp').value.trim();
  try {
    if (token) await setSecret('telegram_bot_token', token);
    if (chat) await setSecret('telegram_admin_chat_id', chat);
  } catch (e) { return showToast(e.message, '⚠️'); }
  const r = await invoke('tg-admin', { action: 'setWebhook' });
  if (!r.ok) showToast('Webhook xatosi: ' + r.error, '⚠️');
  else showToast('Bot ulandi! Endi botga /start yozib ko‘ring', '🤖');
  document.getElementById('tg-token-inp').value = '';
  crmTgStatus();
};

window.sendVipCardToTelegramBot = async studentId => {
  const st = state.students.find(s => s.id === studentId);
  if (!st) return;
  const prize = getStudentPrizeInfo(st, getParallelRankMap());
  const canvas = buildCardCanvas(st, prize);
  const chatId = document.getElementById('tg-target-chat')?.value.trim() || '';
  showToast('Karta yuborilmoqda…', '⏳');
  const r = await invoke('tg-admin', {
    action: 'sendPhoto',
    chatId,
    fileName: `card_${st.id}.png`,
    photoBase64: canvas.toDataURL('image/png'),
    caption: `🏆 ${st.fullName} (${st.className})\n${prize.tier}\nKarta: ${formatMoney(prize.amount)}\nKod: ${getPromoCode(st.id)}\n⏳ 2 oy davomida amal qiladi`
  });
  showToast(r.ok ? 'Karta rasmi Telegramga yuborildi!' : 'Telegram xatosi: ' + r.error, r.ok ? '🤖' : '⚠️');
};
