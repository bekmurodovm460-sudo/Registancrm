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
  schools: () => renderSchoolsTab(),
  tests: () => renderTestsTab(),
  regs: () => renderRegsTab(),
  edutizim: () => renderEdutizimTab(),
  supabase: () => renderStaffTab(),
  proctors: () => renderProctorsTab(),
  telegram: () => renderTelegramTab()
};
const origRender = window.renderCurrentTab;
window.renderCurrentTab = function () {
  if (NEW_TABS[currentTab]) { NEW_TABS[currentTab](); updateHeaderStats(); return; }
  origRender();
};


// =========================================================
// 🏫 MAKTABLAR
// =========================================================
let editingSchool = null;

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[ʻʼ‘’'`]/g, '').replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

async function renderSchoolsTab() {
  const el = document.getElementById('tab-schools');
  const { data: stats } = await sb().rpc('crm_school_stats');
  const st = Object.fromEntries((stats || []).map(r => [r.school_id, r]));
  const schools = state.schools || [];
  const e = editingSchool || { id: '', name: '', city: '', director: '', phone: '', address: '' };
  el.innerHTML = `
  <div class="grid lg:grid-cols-3 gap-5">
    ${card(`
      <h2 class="text-lg font-black text-slate-900">${editingSchool ? '✏️ Maktabni tahrirlash' : '➕ Yangi maktab qo‘shish'}</h2>
      <p class="text-[11px] text-slate-500 mb-3">Har bir maktabning sinflari, o‘quvchilari, ball tizimi va TOP-3 reytingi alohida yuritiladi.</p>
      ${isAdmin() ? `
      <div class="space-y-2.5 text-xs">
        <label class="font-bold block">Maktab nomi<input id="sc-name" value="${esc(e.name)}" placeholder="Masalan: 5-Maktab" class="${input} w-full mt-1"></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="font-bold">Shahar / tuman<input id="sc-city" value="${esc(e.city || '')}" placeholder="Qarshi" class="${input} w-full mt-1"></label>
          <label class="font-bold">Telefon<input id="sc-phone" value="${esc(e.phone || '')}" placeholder="+998 …" class="${input} w-full mt-1"></label>
        </div>
        <label class="font-bold block">Direktor<input id="sc-director" value="${esc(e.director || '')}" class="${input} w-full mt-1"></label>
        <label class="font-bold block">Manzil<input id="sc-address" value="${esc(e.address || '')}" class="${input} w-full mt-1"></label>
        <div class="flex gap-2 pt-1">
          <button onclick="crmSaveSchool()" class="${btn('[#F2642A]')}">💾 Saqlash</button>
          ${editingSchool ? `<button onclick="crmEditSchool(null)" class="${btn('slate-400')}">Bekor</button>` : ''}
        </div>
      </div>` : '<div class="text-xs text-slate-500">Maktab qo‘shish va tahrirlash faqat admin uchun.</div>'}
    `)}
    <div class="lg:col-span-2">
      ${card(`
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 class="text-lg font-black text-slate-900">🏫 Maktablar (${schools.length})</h2>
          <span class="text-[11px] text-slate-500">Faol maktab: <b class="text-[#F2642A]">${esc(crm().schoolName)}</b> — yuqoridagi tanlagich orqali ham almashtiriladi</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          ${schools.map(x => {
            const s2 = st[x.id] || { students: 0, classes: 0 };
            const active = x.id === crm().schoolId;
            return `
            <div class="p-4 rounded-2xl border ${active ? 'border-[#F2642A] bg-orange-50' : 'border-slate-200 bg-slate-50'} space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="font-black text-slate-900 text-sm">🏫 ${esc(x.name || x.id)} ${active ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-[#F2642A] text-white align-middle">FAOL</span>' : ''}</div>
                  <div class="text-[11px] text-slate-500">${esc([x.city, x.address].filter(Boolean).join(', '))}</div>
                  ${x.director || x.phone ? `<div class="text-[11px] text-slate-500">${esc(x.director || '')} ${esc(x.phone || '')}</div>` : ''}
                </div>
              </div>
              <div class="flex gap-2 text-[11px] font-black">
                <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200">🎓 ${s2.students} o‘quvchi</span>
                <span class="px-2.5 py-1 rounded-lg bg-white border border-slate-200">🗂️ ${s2.classes} sinf</span>
              </div>
              ${active && (state.classes || []).length ? `<div class="flex flex-wrap gap-1">${[...state.classes].sort((p, q) => p.name.localeCompare(q.name, 'uz', { numeric: true })).map(c => `<button onclick="openClassInside('${esc(c.name)}')" class="px-2 py-0.5 rounded-md bg-white border border-orange-200 text-[10px] font-black text-slate-700 hover:bg-orange-100">${esc(c.name)}</button>`).join('')}</div>` : ''}
              <div class="flex gap-1.5 flex-wrap">
                ${active ? `<button onclick="switchTab('classes')" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-black">🗂️ Sinflarni ochish</button>`
                         : (crm().role !== 'teacher' ? `<button onclick="crmUseSchool('${esc(x.id)}')" class="px-3 py-1.5 rounded-lg bg-[#F2642A] text-white text-[11px] font-black">✅ Tanlash</button>` : '')}
                ${canWrite() ? `<button onclick="crmAddClassToSchool('${esc(x.id)}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black">➕ Sinf qo‘shish</button>` : ''}
                ${isAdmin() ? `<button onclick="crmEditSchool('${esc(x.id)}')" class="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold">✏️ Tahrirlash</button>` : ''}
                ${isAdmin() && x.id !== '12-maktab' ? `<button onclick="crmDeleteSchool('${esc(x.id)}', ${Number(s2.students)}, ${Number(s2.classes)})" class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-bold">🗑 O‘chirish</button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>
        <p class="text-[11px] text-slate-500 mt-3">💡 Yangi maktabni tanlagach: <b>🗂️ Sinflari → ➕ Yangi sinf qo‘shish</b>, so‘ng sinf ichida <b>➕ O‘quvchini qo‘shish</b> yoki <b>📥 HTML/Excel import</b>.</p>
      `)}
    </div>
  </div>`;
}

window.crmEditSchool = id => {
  editingSchool = id ? { ...(state.schools || []).find(x => x.id === id) } : null;
  renderSchoolsTab();
};

window.crmUseSchool = async id => { await crm().switchSchool(id); switchTab('classes'); };

window.crmSaveSchool = () => {
  const v = id => document.getElementById(id).value.trim();
  const name = v('sc-name');
  if (!name) return showToast('Maktab nomini kiriting', '⚠️');
  state.schools = state.schools || [];
  if (editingSchool) {
    const x = state.schools.find(s => s.id === editingSchool.id);
    Object.assign(x, { name, shortName: name, city: v('sc-city'), director: v('sc-director'), phone: v('sc-phone'), address: v('sc-address') });
  } else {
    let id = slugify(name) || 'maktab';
    let n = 2;
    while (state.schools.some(s => s.id === id)) id = `${slugify(name)}-${n++}`;
    if (state.schools.some(s => (s.name || '').toLowerCase() === name.toLowerCase())) return showToast('Bu nomli maktab allaqachon bor', '⚠️');
    state.schools.push({ id, name, shortName: name, city: v('sc-city'), director: v('sc-director'), phone: v('sc-phone'), address: v('sc-address'), createdAt: new Date().toISOString() });
  }
  editingSchool = null;
  saveState();
  crm().applySchoolLabels();
  if (crm().schoolId && state.schools.some(s => s.id === crm().schoolId)) {
    crm().schoolName = state.schools.find(s => s.id === crm().schoolId).name;
    crm().applySchoolLabels();
  }
  showToast(`🏫 ${name} saqlandi`);
  setTimeout(renderSchoolsTab, 600);
};

window.crmDeleteSchool = (id, students, classes) => {
  if (students || classes) return showToast(`Avval maktabdagi ${classes} sinf va ${students} o‘quvchini o‘chiring yoki ko‘chiring`, '⚠️');
  if (id === crm().schoolId) return showToast('Faol maktabni o‘chirib bo‘lmaydi — avval boshqa maktabni tanlang', '⚠️');
  if (!confirm('Maktabni o‘chirasizmi?')) return;
  state.schools = (state.schools || []).filter(s => s.id !== id);
  saveState();
  crm().applySchoolLabels();
  setTimeout(renderSchoolsTab, 600);
};


// =========================================================
// ➡️ CRM -> EDUTIZIM (o'qishga kelgan o'quvchini bitta tugma bilan lid qilish)
// =========================================================
async function loadEduPushes() {
  if (!canWrite()) return;
  const { data } = await sb().from('crm_edu_pushes').select('crm_student_id,ok,message,created_at').eq('ok', true).order('created_at', { ascending: false }).limit(5000);
  crm().eduPushed = {};
  (data || []).forEach(r => { if (r.crm_student_id && !crm().eduPushed[r.crm_student_id]) crm().eduPushed[r.crm_student_id] = r; });
}

window.crmPushToEdu = async (id, force = false) => {
  const st = state.students.find(x => x.id === id);
  if (!st) return;
  if (!force && !confirm(`${st.fullName} (${st.className}) Edutizimga yangi lid sifatida yuborilsinmi?\nTelefon: ${st.phone || '— (yo‘q)'}`)) return;
  showToast('Edutizimga yuborilmoqda…', '⏳');
  const r = await invoke('edutizim-sync', { action: 'pushLead', force, students: [{ crmId: st.id, fullName: st.fullName, phone: st.phone, schoolId: crm().schoolId }] });
  if (!r.ok) return showToast('Edutizim: ' + (r.error || 'xato'), '⚠️');
  const res = r.results?.[0] || {};
  if (res.skipped && !force) {
    if (confirm(`${res.message}.\nBaribir yangi lid yaratilsinmi?`)) return window.crmPushToEdu(id, true);
    return;
  }
  if (!res.ok) return showToast('Edutizim xatosi: ' + res.message, '⚠️');
  crm().eduPushed = crm().eduPushed || {};
  crm().eduPushed[id] = { ok: true, created_at: new Date().toISOString(), message: res.message };
  showToast(`${st.fullName} Edutizimga lid sifatida qo‘shildi ✅`, '➡️');
  renderCurrentTab();
};

// =========================================================
// 🗂️ SINF VA O'QUVCHI BOSHQARUVI (maktab → sinf → o'quvchi, sinf rahbari)
// =========================================================
async function loadStaff() {
  if (!['admin', 'operator'].includes(crm().role)) { crm().staff = []; return []; }
  const { data } = await sb().rpc('crm_staff_list');
  crm().staff = data || [];
  return crm().staff;
}
const staffLabel = p => `${p.full_name || p.email}${p.role === 'teacher' ? ' 👩‍🏫' : p.role === 'admin' ? ' 👑' : p.role === 'operator' ? ' 🎧' : ' ⏳'}`;
function homeroomOf(cls) {
  const staff = crm().staff || [];
  return staff.find(p => p.school_id === crm().schoolId && p.class_name === cls.name) ||
         (cls.teacherUserId ? staff.find(p => p.id === cls.teacherUserId) : null) || null;
}
function staffOptions(selectedId) {
  return (crm().staff || []).filter(p => p.id !== crm().KIOSK_ID && (p.role !== 'pending' || isAdmin()))
    .map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(staffLabel(p))}${p.class_name ? ` — hozir ${esc(p.class_name)}` : ''}</option>`).join('');
}

// --- Sinf qo'shish oynasi ---
const origOpenAddClass = window.openAddClassModal;
window.openAddClassModal = async function () {
  origOpenAddClass();
  ['new-class-name', 'new-class-teacher', 'new-class-phone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const exp = document.getElementById('new-class-expected'); if (exp) exp.value = 30;
  const sel = document.getElementById('new-class-teacher-user');
  if (sel && isAdmin()) {
    await loadStaff();
    sel.innerHTML = `<option value="">— Hisobsiz (faqat ism) —</option>${staffOptions('')}`;
  }
  setTimeout(() => document.getElementById('new-class-name')?.focus(), 50);
};
window.crmFillTeacherFromStaff = id => {
  const p = (crm().staff || []).find(x => x.id === id);
  if (p) document.getElementById('new-class-teacher').value = p.full_name || p.email;
};
window.saveNewClass = async function () {
  const name = document.getElementById('new-class-name').value.trim().toUpperCase().replace(/\s+/g, '');
  const teacher = document.getElementById('new-class-teacher').value.trim();
  const phone = document.getElementById('new-class-phone').value.trim();
  const expected = Number(document.getElementById('new-class-expected')?.value) || 30;
  const userId = document.getElementById('new-class-teacher-user')?.value || '';
  if (!name) return showToast('Sinf nomini kiriting (masalan 5-A)', '⚠️');
  if (state.classes.some(c => c.name === name)) return showToast(`${name} sinfi bu maktabda allaqachon bor`, '⚠️');
  state.classes.push({ name, teacher: teacher || `${name} Sinf Rahbari`, phone, expected, schoolId: crm().schoolId, ...(userId ? { teacherUserId: userId } : {}) });
  saveState();
  if (userId && isAdmin()) {
    const { error } = await sb().rpc('crm_assign_homeroom', { p_user: userId, p_school: crm().schoolId, p_class: name });
    if (error) showToast('Rahbar biriktirilmadi: ' + error.message, '⚠️');
    await loadStaff();
  }
  closeAddClassModal();
  showToast(`${name} sinfi ${crm().schoolName} ga qo‘shildi — endi o‘quvchilarni qo‘shing`);
  openClassInside(name);
};

// --- Sinf ichki oynasini kengaytirish ---
const origRenderClasses = window.renderClassesTab;
window.renderClassesTab = function () {
  origRenderClasses();
  if (openedClassName) enhanceClassInside();
};

let staffLoadedFor = null;
function enhanceClassInside() {
  const el = document.getElementById('tab-classes');
  const cls = (state.classes || []).find(c => c.name === openedClassName);
  if (!cls) return;
  if (['admin', 'operator'].includes(crm().role) && staffLoadedFor !== crm().schoolId + openedClassName) {
    staffLoadedFor = crm().schoolId + openedClassName;
    Promise.all([loadStaff(), loadEduPushes()]).then(() => { if (openedClassName === cls.name && currentTab === 'classes') window.renderClassesTab(); });
  }
  const own = crm().role === 'teacher' && crm().profile?.class_name === cls.name;

  // 1) Sarlavhaga: nomini o'zgartirish / o'chirish
  const backBtn = el.querySelector('button[onclick^="openedClassName=null"]');
  if (backBtn && canWrite()) {
    backBtn.parentElement.insertAdjacentHTML('beforeend', `
      <button onclick="crmRenameClass('${esc(cls.name)}')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold">✏️ Nomini o‘zgartirish</button>
      ${isAdmin() ? `<button onclick="crmDeleteClass('${esc(cls.name)}')" class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold">🗑 Sinfni o‘chirish</button>` : ''}`);
  }

  // 2) Sinf rahbari: xodim hisobini biriktirish
  const tInp = document.getElementById('cls-teacher-inp');
  if (tInp) {
    const hr = homeroomOf(cls);
    tInp.parentElement.insertAdjacentHTML('afterbegin', `
      <div class="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2">
        <div class="font-black text-indigo-900">👩‍🏫 Sinf rahbari (tizim hisobi)</div>
        <div class="text-[11px] text-indigo-800">${hr ? `<b>${esc(hr.full_name || hr.email)}</b> · ${esc(hr.email || '')}` : 'Hisob biriktirilmagan — rahbar tizimga kira olmaydi.'}</div>
        ${isAdmin() ? `
          <select id="cls-teacher-user" class="w-full px-3 py-2 rounded-xl border border-indigo-200 font-semibold bg-white">
            <option value="">— Xodimni tanlang —</option>${staffOptions(hr?.id || '')}
          </select>
          <div class="flex gap-2">
            <button onclick="crmAssignHomeroom('${esc(cls.name)}')" class="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold">🔗 Biriktirish</button>
            ${hr ? `<button onclick="crmUnassignHomeroom('${esc(cls.name)}')" class="px-3 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-800 font-bold">✕ Olib tashlash</button>` : ''}
          </div>
          <div class="text-[10px] text-indigo-700">Xodim ro‘yxatda yo‘q bo‘lsa — u login sahifasida ro‘yxatdan o‘tsin.</div>` : '<div class="text-[10px] text-indigo-700">Hisob biriktirishni admin bajaradi.</div>'}
      </div>`);
  }

  // 3) O'quvchilar jadvaliga tahrirlash tugmasi
  el.querySelectorAll('button[onclick^="deleteStudentById("]').forEach(b => {
    const id = Number(b.getAttribute('onclick').match(/\d+/)[0]);
    if (canWrite()) {
      const done = crm().eduPushed?.[id];
      b.insertAdjacentHTML('beforebegin', done
        ? `<span title="Edutizimga yuborilgan" class="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-black mr-1">✅ Edu</span>`
        : `<button onclick="crmPushToEdu(${id})" title="O‘qishga keldi — Edutizimga lid qilib yuborish" class="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black mr-1">➡️ Edu</button>`);
    }
    if (canWrite() || own) b.insertAdjacentHTML('beforebegin', `<button onclick="crmEditStudent(${id})" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold mr-1">✏️</button>`);
    if (!isAdmin()) b.remove();
  });
}

window.crmAssignHomeroom = async className => {
  const userId = document.getElementById('cls-teacher-user')?.value;
  if (!userId) return showToast('Xodimni tanlang', '⚠️');
  const { error } = await sb().rpc('crm_assign_homeroom', { p_user: userId, p_school: crm().schoolId, p_class: className });
  if (error) return showToast(error.message, '⚠️');
  await loadStaff();
  const p = crm().staff.find(x => x.id === userId);
  const cls = state.classes.find(c => c.name === className);
  if (cls && p) { cls.teacher = p.full_name || p.email; cls.teacherUserId = userId; saveState(); }
  showToast(`${p?.full_name || 'Xodim'} ${className} sinfiga rahbar etib biriktirildi`, '👩‍🏫');
  window.renderClassesTab();
};
window.crmUnassignHomeroom = async className => {
  if (!confirm('Sinf rahbarining tizim hisobini bu sinfdan olib tashlaysizmi?')) return;
  const { error } = await sb().rpc('crm_assign_homeroom', { p_user: null, p_school: crm().schoolId, p_class: className });
  if (error) return showToast(error.message, '⚠️');
  const cls = state.classes.find(c => c.name === className);
  if (cls) { delete cls.teacherUserId; saveState(); }
  await loadStaff();
  window.renderClassesTab();
};

window.crmRenameClass = async oldName => {
  const nn = (prompt(`${oldName} sinfining yangi nomi:`, oldName) || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!nn || nn === oldName) return;
  if (state.classes.some(c => c.name === nn)) return showToast(`${nn} sinfi allaqachon bor`, '⚠️');
  const cls = state.classes.find(c => c.name === oldName);
  cls.name = nn;
  state.students.forEach(st => { if (st.className === oldName) st.className = nn; });
  openedClassName = nn;
  saveState();
  const hr = homeroomOf({ name: oldName, teacherUserId: cls.teacherUserId });
  if (hr && isAdmin()) { await sb().rpc('crm_assign_homeroom', { p_user: hr.id, p_school: crm().schoolId, p_class: nn }); await loadStaff(); }
  window.renderClassesTab();
  showToast(`${oldName} → ${nn} deb o‘zgartirildi`);
};

window.crmDeleteClass = async name => {
  const n = state.students.filter(st => st.className === name).length;
  if (!confirm(n ? `${name} sinfi va undagi ${n} nafar o‘quvchi o‘chiriladi. Davom etasizmi?` : `${name} sinfini o‘chirasizmi?`)) return;
  state.students = state.students.filter(st => st.className !== name);
  state.classes = state.classes.filter(c => c.name !== name);
  openedClassName = null;
  saveState();
  if (isAdmin()) { await sb().rpc('crm_assign_homeroom', { p_user: null, p_school: crm().schoolId, p_class: name }); }
  window.renderClassesTab();
  showToast(`${name} sinfi o‘chirildi`, '🗑️');
};

// --- O'quvchini tahrirlash / boshqa sinfga ko'chirish ---
window.crmEditStudent = id => {
  const st = state.students.find(x => x.id === id);
  if (!st) return;
  document.getElementById('crm-st-modal')?.remove();
  const classes = (state.classes || []).map(c => c.name);
  const lockClass = crm().role === 'teacher';
  document.body.insertAdjacentHTML('beforeend', `
    <div id="crm-st-modal" class="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-3 text-xs">
        <div class="flex items-center justify-between">
          <h3 class="font-black text-lg text-slate-900">✏️ O‘quvchini tahrirlash</h3>
          <button onclick="document.getElementById('crm-st-modal').remove()" class="w-8 h-8 rounded-full bg-slate-100 font-bold">✕</button>
        </div>
        <label class="font-bold block">F.I.Sh.<input id="ed-name" value="${esc(st.fullName)}" class="${input} w-full mt-1"></label>
        <label class="font-bold block">Ota-ona telefoni<input id="ed-phone" value="${esc(st.phone || '')}" class="${input} w-full mt-1"></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="font-bold">1-fan<input id="ed-q1" type="number" min="0" value="${Number(st.q1) || 0}" class="${input} w-full mt-1"></label>
          <label class="font-bold">2-fan<input id="ed-q2" type="number" min="0" value="${Number(st.q2) || 0}" class="${input} w-full mt-1"></label>
        </div>
        <label class="font-bold block">Sinf ${lockClass ? '' : '(boshqa sinfga ko‘chirish)'}
          <select id="ed-class" ${lockClass ? 'disabled' : ''} class="${input} w-full mt-1">${classes.map(c => `<option ${c === st.className ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="font-bold block">Izoh<input id="ed-note" value="${esc(st.note || '')}" class="${input} w-full mt-1"></label>
        <div class="flex justify-end gap-2 pt-1">
          ${canWrite() ? `<button onclick="document.getElementById('crm-st-modal').remove(); crmPushToEdu(${id})" class="mr-auto px-4 py-2 rounded-xl bg-indigo-600 text-white font-black">➡️ Edutizimga</button>` : ''}
          <button onclick="document.getElementById('crm-st-modal').remove()" class="px-4 py-2 rounded-xl bg-slate-100 font-bold">Bekor</button>
          <button onclick="crmSaveStudent(${id})" class="${btn('[#F2642A]')}">💾 Saqlash</button>
        </div>
      </div>
    </div>`);
};
window.crmSaveStudent = id => {
  const st = state.students.find(x => x.id === id);
  const v = k => document.getElementById(k).value;
  const name = v('ed-name').trim();
  if (!name) return showToast('F.I.Sh. bo‘sh bo‘lmasin', '⚠️');
  const oldClass = st.className;
  st.fullName = name;
  st.phone = v('ed-phone').trim();
  st.q1 = Number(v('ed-q1')) || 0;
  st.q2 = Number(v('ed-q2')) || 0;
  st.score = calcScore(st.q1, st.q2, state.schoolRules);
  st.note = v('ed-note').trim();
  if (crm().role !== 'teacher') st.className = v('ed-class');
  if (st.phone && st.callStatus === 'Raqamsiz') st.callStatus = 'Yangi';
  saveState();
  document.getElementById('crm-st-modal').remove();
  renderCurrentTab();
  showToast(oldClass !== st.className ? `${name} ${st.className} sinfiga ko‘chirildi` : `${name} saqlandi`);
};

// --- Maktab kartasidan sinf qo'shish ---
window.crmAddClassToSchool = async id => {
  if (id !== crm().schoolId) await crm().switchSchool(id);
  openedClassName = null;
  switchTab('classes');
  window.openAddClassModal();
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
          <label class="font-bold">Turi<select id="t-kind" onchange="crmTestKindChange()" class="${input} w-full mt-1">
            <option value="mock" ${t.kind === 'mock' ? 'selected' : ''}>Kids Mock</option>
            <option value="school" ${t.kind === 'school' ? 'selected' : ''}>Maktab testi</option></select></label>
        </div>
        <div id="t-variant-box" class="${t.kind === 'mock' ? '' : 'hidden'} space-y-1.5">
          <label class="font-bold block">Kids Mock varianti (1-fan · daraja + 2-fan)
            <select id="t-variant" class="${input} w-full mt-1">
              <option value="">— variantsiz (umumiy) —</option>
              ${MOCK_VARIANTS.map(([v, l]) => `<option value="${v}" ${t.variant === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          <button type="button" onclick="crmKidsMockPreset()" class="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-800 border border-orange-200 font-black">🧒 Kids Mock shabloni: 40 + 40 savol, 1.5 / 1 ball</button>
          <div class="text-[10px] text-slate-500">Ariza bergan ota-ona varaqni tekshirganda, uning arizasidagi variantning kaliti avtomatik olinadi.</div>
        </div>
        <label class="font-bold block">Nomi<input id="t-title" value="${esc(t.title)}" placeholder="Kids Mock — Noyabr, ingliz tili" class="${input} w-full mt-1"></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="font-bold">Savollar soni<input id="t-n" type="number" min="1" max="100" value="${t.num_questions}" class="${input} w-full mt-1"></label>
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
        <label id="t-grades-box" class="font-bold block ${t.kind === 'school' ? '' : 'hidden'}">Qaysi sinflar uchun <span class="text-slate-400 font-semibold">(masalan: 2,3 — nazoratchi sinfni tanlaganda test avtomatik olinadi)</span>
          <input id="t-grades" value="${esc((t.grades || []).join(','))}" placeholder="2,3" class="${input} w-full mt-1"></label>
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
          <thead><tr class="text-left text-slate-500 border-b"><th class="py-2">Kod</th><th>Nomi</th><th>Savol</th><th>Turi</th><th>Holat</th><th>Asl test</th><th>Javoblar (bot)</th><th>Natija</th><th></th></tr></thead>
          <tbody>
          ${tests.map(x => `
            <tr class="border-b border-slate-100">
              <td class="py-2 font-black font-mono">${esc(x.code)}</td>
              <td class="font-bold">${esc(x.title)}<div class="text-[10px] text-slate-400">${esc(x.session || '')}</div></td>
              <td>${x.num_questions} × ${x.num_options}</td>
              <td>${x.kind === 'mock' ? '🧒 Mock' : '🏫 Maktab'}${x.grades?.length ? `<div class="text-[10px] font-black text-sky-700">${x.grades.join(', ')}-sinflar</div>` : ''}${x.variant ? `<div class="text-[10px] font-black text-orange-700">${esc((MOCK_VARIANTS.find(m => m[0] === x.variant)?.[1] || x.variant).replace(/^[^A-Za-zА-я]+/, ''))}</div>` : ''}</td>
              <td>${x.active ? '<span class="text-emerald-700 font-black">● Faol</span>' : '<span class="text-slate-400 font-bold">Yopiq</span>'}</td>
              <td class="min-w-[130px]">
                ${(x.files || []).map((f, i) => `<div class="flex items-center gap-1 mb-1">
                  <button onclick="crmOpenTestFile('${esc(x.code)}', ${i})" class="text-left text-sky-700 font-bold underline truncate max-w-[120px]" title="${esc(f.name)}">📄 ${esc(f.name)}</button>
                  ${canWrite() ? `<button onclick="crmDeleteTestFile('${esc(x.code)}', ${i})" class="text-rose-500 font-black" title="O‘chirish">✕</button>` : ''}</div>`).join('')}
                ${canWrite() ? `<label class="inline-block px-2 py-1 rounded-lg bg-sky-50 text-sky-800 font-bold cursor-pointer">📎 Yuklash
                  <input type="file" multiple accept=".pdf,.doc,.docx,image/*" class="hidden" onchange="crmUploadTestFile('${esc(x.code)}', this)"></label>` : ''}
              </td>
              <td>${canWrite()
                ? `<button onclick="crmToggleKey('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg font-bold ${x.answers_published ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}">${x.answers_published ? '🔓 E’lon qilingan' : '🔒 Yashirin'}</button>`
                : (x.answers_published ? '🔓' : '🔒')}</td>
              <td class="font-bold">${crm().submissions.filter(s => s.test_code === x.code).length}</td>
              <td class="text-right whitespace-nowrap">
                <button onclick="crmPrintSheet('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold">🖨️ Varaq</button>
                ${canWrite() ? `<button onclick="crmEditTest('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-slate-100 font-bold">✏️</button>
                <button onclick="crmToggleTest('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-slate-100 font-bold">${x.active ? '⏸' : '▶️'}</button>` : ''}
                ${isAdmin() ? `<button onclick="crmDeleteTest('${esc(x.code)}')" class="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">🗑</button>` : ''}
              </td>
            </tr>`).join('') || '<tr><td colspan="9" class="py-6 text-center text-slate-400 font-bold">Hali test yo‘q — chapdagi forma orqali qo‘shing.</td></tr>'}
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

window.crmTestKindChange = () => {
  document.getElementById('t-variant-box').classList.toggle('hidden', document.getElementById('t-kind').value !== 'mock');
  document.getElementById('t-grades-box').classList.toggle('hidden', document.getElementById('t-kind').value !== 'school');
};
// Kids Mock variantlari: 1-fan-daraja+2-fan-daraja (masalan MAT-OSON+ENG-QIYIN).
// "Faqat 1-fan bo'yicha" (MAT-OSON) — 2-fan va darajasidan qat'i nazar shu kalit ishlatiladi.
const MOCK_VARIANTS = (() => {
  const S1 = [['MAT', '📐 Matematika'], ['RUS', '🇷🇺 Rus tili']];
  const S2 = { MAT: [['ENG', 'Ingliz tili'], ['RUS', 'Rus tili']], RUS: [['ENG', 'Ingliz tili'], ['MAT', 'Matematika']] };
  const L = [['OSON', 'Oson'], ['QIYIN', 'Qiyin']];
  const out = [];
  S1.forEach(([c1, n1]) => L.forEach(([l1, ln1]) => {
    out.push([`${c1}-${l1}`, `${n1} · ${ln1} (2-fan har qanday)`]);
    S2[c1].forEach(([c2, n2]) => L.forEach(([l2, ln2]) => out.push([`${c1}-${l1}+${c2}-${l2}`, `${n1} · ${ln1} + ${n2} · ${ln2}`])));
  }));
  return out;
})();

window.crmKidsMockPreset = () => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); };
  set('t-n', 80); set('t-q1', 40); set('t-w1', 1.5); set('t-w2', 1);
  document.getElementById('t-o').value = '4';
  const vEl = document.getElementById('t-variant');
  const lbl = vEl.selectedOptions[0]?.textContent.replace(/^[^A-Za-zА-я]+/, '') || '';
  const title = document.getElementById('t-title');
  if (!title.value.trim()) title.value = `Kids Mock · ${lbl || 'Matematika · Oson + Ingliz tili'}`;
  showToast('Kids Mock shabloni qo‘llandi: 80 savol (1–40 1-fan × 1.5, 41–80 2-fan × 1)', '🧒');
};

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
    variant: v('t-kind') === 'mock' ? (v('t-variant') || null) : null,
    grades: v('t-kind') === 'school' ? [...new Set(v('t-grades').split(/[^0-9]+/).filter(Boolean).map(Number).filter(n => n >= 1 && n <= 11))] : null,
    active: document.getElementById('t-active').checked
  };
  if (!row.code || !row.title) return showToast('Kod va nomini kiriting', '⚠️');
  if (row.kind === 'school' && !(row.grades || []).length) return showToast('Maktab testi qaysi sinflar uchunligini kiriting (masalan 2,3)', '⚠️');
  if (row.answer_key.length !== row.num_questions || row.answer_key.includes('?')) {
    return showToast(`Javob kaliti ${row.num_questions} ta bo‘lishi kerak (hozir ${row.answer_key.length})`, '⚠️');
  }
  if ([...row.answer_key].some(c => 'ABCDE'.indexOf(c) >= row.num_options)) return showToast('Kalitda variantlar sonidan ortiq harf bor', '⚠️');
  if (row.variant && row.active && crm().tests.some(x => x.code !== row.code && x.active && x.variant === row.variant && (x.session || '') === (row.session || ''))) {
    if (!confirm('Shu sessiya uchun bu variantda boshqa faol test bor. Bot eng yangisini oladi. Davom etasizmi?')) return;
  }
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
// ---------- Testning asl fayllari (savollar kitobchasi) ----------
const TEST_BUCKET = 'crm-tests';
window.crmUploadTestFile = async (code, input) => {
  const t = crm().tests.find(x => x.code === code);
  const files = [...(input.files || [])];
  if (!t || !files.length) return;
  const big = files.find(f => f.size > 25 * 1024 * 1024);
  if (big) return showToast(`${big.name}: 25 MB dan katta`, '⚠️');
  showToast(`⏳ ${files.length} ta fayl yuklanmoqda…`, '📎');
  const added = [];
  for (const f of files) {
    const safe = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'fayl';
    const path = `${code}/${Date.now()}-${safe}`;
    const { error } = await sb().storage.from(TEST_BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (error) { showToast(`${f.name}: ${error.message}`, '⚠️'); continue; }
    added.push({ path, name: f.name, size: f.size, type: f.type, at: new Date().toISOString() });
  }
  input.value = '';
  if (!added.length) return;
  const next = [...(t.files || []), ...added];
  const { error } = await sb().from('crm_tests').update({ files: next }).eq('code', code);
  if (error) return showToast(error.message, '⚠️');
  t.files = next;
  renderTestsTab();
  showToast(`${added.length} ta fayl ${code} testiga biriktirildi`, '📄');
};
window.crmOpenTestFile = async (code, i) => {
  const f = (crm().tests.find(x => x.code === code)?.files || [])[i];
  if (!f) return;
  const w = window.open('', '_blank');
  const { data, error } = await sb().storage.from(TEST_BUCKET).createSignedUrl(f.path, 600);
  if (error || !data?.signedUrl) { w?.close(); return showToast(error?.message || 'Fayl topilmadi', '⚠️'); }
  if (w) w.location = data.signedUrl; else window.location.href = data.signedUrl;
};
window.crmDeleteTestFile = async (code, i) => {
  const t = crm().tests.find(x => x.code === code);
  const f = (t?.files || [])[i];
  if (!f || !confirm(`“${f.name}” faylini o‘chirasizmi?`)) return;
  await sb().storage.from(TEST_BUCKET).remove([f.path]);
  const next = t.files.filter((_, k) => k !== i);
  const { error } = await sb().from('crm_tests').update({ files: next }).eq('code', code);
  if (error) return showToast(error.message, '⚠️');
  t.files = next;
  renderTestsTab();
  showToast('Fayl o‘chirildi', '🗑');
};

window.crmToggleKey = async code => {
  const t = crm().tests.find(x => x.code === code);
  const next = !t.answers_published;
  if (next && !confirm(`${code} javoblari botda hammaga ochiladi (📚 Maktab imtihonlari javoblari → 🔑 Javoblar kaliti). Imtihon tugadimi?`)) return;
  const { error } = await sb().from('crm_tests').update({ answers_published: next }).eq('code', code);
  if (error) return showToast(error.message, '⚠️');
  t.answers_published = next;
  renderTestsTab();
  showToast(next ? `${code} javoblari botda e’lon qilindi` : `${code} javoblari yashirildi`, next ? '🔓' : '🔒');
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
            <thead class="sticky top-0 bg-white"><tr class="text-left text-slate-500 border-b"><th class="py-2">№</th><th>F.I.Sh.</th><th>Sinf</th><th>Fanlar · daraja</th><th>O‘qituvchi</th><th>Telefon</th><th>Sessiya</th><th>Xona</th><th>Holat</th><th>Vaqt</th><th></th></tr></thead>
            <tbody>
            ${list.map(r => `
              <tr class="border-b border-slate-100">
                <td class="py-2 font-mono text-slate-400">KM-${r.id}</td>
                <td class="font-black">${esc(r.full_name)}${r.tg_username ? `<div class="text-[10px] text-sky-600">@${esc(r.tg_username)}</div>` : ''}</td>
                <td>${esc(r.grade)}</td>
                <td class="whitespace-nowrap">${r.subject1 ? `${r.subject1 === 'Rus tili' ? '🇷🇺' : '📐'} ${esc(r.subject1)} · <b class="${r.level === 'Qiyin' ? 'text-rose-700' : 'text-emerald-700'}">${esc(r.level || '')}</b><div class="text-[10px] text-slate-500">+ ${esc(r.subject2 || 'Ingliz tili')} · <b class="${r.level2 === 'Qiyin' ? 'text-rose-700' : 'text-emerald-700'}">${esc(r.level2 || 'Oson')}</b></div>` : '<span class="text-slate-400">—</span>'}</td>
                <td class="text-[11px]">${esc(r.teacher || '—')}</td>
                <td class="font-mono">${esc(r.phone)}</td>
                <td class="text-[11px]">${esc(r.session)}</td>
                <td>${canWrite() ? `<select onchange="crmRegUpdate(${r.id},{room:this.value})" class="${input} py-1">${[...rooms.map(x => x.name), 'Navbatda'].map(n => `<option ${n === r.room ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : esc(r.room)}</td>
                <td>${canWrite() ? `<select onchange="crmRegUpdate(${r.id},{status:this.value})" class="${input} py-1">${REG_STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : esc(r.status)}${r.confirm ? `<div class="text-[10px] font-black ${r.confirm === 'Boraman' ? 'text-emerald-700' : 'text-rose-600'}">${r.confirm === 'Boraman' ? '✅ Boraman' : '❌ Bora olmayman'}</div>` : ''}</td>
                <td class="text-slate-500 whitespace-nowrap">${fmtDate(r.created_at)}</td>
                <td class="whitespace-nowrap">${canWrite() ? `<button onclick="crmRegToMock(${r.id})" class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold" title="Kids Mock natijalar ro‘yxatiga qo‘shish">➕ Mock</button>` : ''}</td>
              </tr>`).join('') || '<tr><td colspan="11" class="py-6 text-center text-slate-400 font-bold">Hali ariza yo‘q. Ota-onalar botdagi “🧒 Kids Mock ro‘yxatdan o‘tish” tugmasi orqali yoziladi.</td></tr>'}
            </tbody></table></div>
        `)}
      </div>
      ${card(`
        <h3 class="text-sm font-black text-slate-900 mb-2">⚙️ Bot sozlamalari</h3>
        <label class="text-xs font-bold block">Imtihon sessiyalari (har qatorda bittasi)
          <textarea id="reg-sessions" rows="3" ${isAdmin() ? '' : 'disabled'} class="${input} w-full mt-1">${esc(mockSessions.join('\n'))}</textarea></label>
        <label class="text-xs font-bold block mt-2">Xonalar va sig‘imi (masalan: 1-xona:30)
          <textarea id="reg-rooms" rows="4" ${isAdmin() ? '' : 'disabled'} class="${input} w-full mt-1 font-mono">${esc(rooms.map(r => `${r.name}:${r.capacity}`).join('\n'))}</textarea></label>
        <div class="text-xs font-black mt-3">⏰ Imtihon sanasi va vaqti</div>
        <p class="text-[10px] text-slate-500">Bot ota-onalarga 1 kun va 2 soat oldin eslatma yuboradi, “Boraman / Bora olmayman” tugmalari bilan.</p>
        ${mockSessions.map((ss, i) => { const sc = (state.mockSchedule || {})[ss] || {}; return `
          <div class="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200" data-sched="${i}">
            <div class="text-[11px] font-black truncate">${esc(ss)}</div>
            <div class="flex gap-1 mt-1"><input type="date" data-f="date" value="${esc(sc.date || '')}" ${isAdmin() ? '' : 'disabled'} class="${input} py-1 flex-1 min-w-0"><input type="time" data-f="time" value="${esc(sc.time || '09:00')}" ${isAdmin() ? '' : 'disabled'} class="${input} py-1 w-24"></div>
            <input data-f="place" value="${esc(sc.place || '')}" placeholder="Manzil (ixtiyoriy)" ${isAdmin() ? '' : 'disabled'} class="${input} py-1 w-full mt-1">
            ${canWrite() && sc.date ? `<button onclick="crmRemindNow(${i})" class="mt-1 w-full px-2 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold">⏰ Hozir eslatma yuborish</button>` : ''}
          </div>`; }).join('')}
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
  state.mockStudents.push({ id: crmNextId(), fullName: r.full_name, room: r.room, session: r.session || mockExamSession, q1: 0, q2: 0, score: 0, phone: r.phone, regId: id, subject1: r.subject1 || 'Matematika', level: r.level || 'Oson', subject2: r.subject2 || 'Ingliz tili', level2: r.level2 || 'Oson', teacher: r.teacher || '', source: 'telegram-reg' });
  saveState();
  showToast(`${r.full_name} Kids Mock ro‘yxatiga qo‘shildi`);
};
window.crmSaveRegSettings = () => {
  state.mockSessions = document.getElementById('reg-sessions').value.split('\n').map(s => s.trim()).filter(Boolean);
  state.mockRooms = document.getElementById('reg-rooms').value.split('\n').map(s => s.trim()).filter(Boolean).map(s => {
    const [name, cap] = s.split(':');
    return { name: name.trim(), capacity: Number(cap) || 30 };
  });
  const sched = {};
  const sess = state.mockSessions;
  document.querySelectorAll('[data-sched]').forEach(el => {
    const name = (state.mockSessions || [])[Number(el.dataset.sched)];
    const v = f => el.querySelector(`[data-f="${f}"]`).value.trim();
    if (name && v('date')) sched[name] = { date: v('date'), time: v('time') || '09:00', place: v('place') };
  });
  sess.forEach(n => { if (!sched[n] && (state.mockSchedule || {})[n]) sched[n] = state.mockSchedule[n]; });
  state.mockSchedule = sched;
  saveState();
  showToast('Bot sozlamalari saqlandi');
  renderRegsTab();
};
window.crmRemindNow = async i => {
  const session = (state.mockSessions || [])[i];
  if (!confirm(`“${session}” ishtirokchilariga hozir eslatma yuborilsinmi?`)) return;
  const r = await invoke('bot-jobs', { action: 'remind', session });
  if (!r.ok) return showToast(r.error || 'Xato', '⚠️');
  showToast(`Eslatma yuborildi: ${r.sent} ta${r.failed ? ` · ⚠️ ${r.failed}` : ''}`, '⏰');
};
window.crmExportRegs = () => {
  const rows = crm().registrations.map(r => ({ 'Ariza': `KM-${r.id}`, 'F.I.Sh.': r.full_name, Sinf: r.grade, '1-fan': r.subject1 || '', Daraja: r.level || '', '2-fan': r.subject2 || 'Ingliz tili', '2-fan darajasi': r.level2 || '', 'O‘qituvchi': r.teacher || '', Telefon: r.phone, Sessiya: r.session, Xona: r.room, Holat: r.status, Tasdiq: r.confirm || '', Telegram: r.tg_username ? '@' + r.tg_username : '', Vaqt: fmtDate(r.created_at) }));
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
let eduPushLog = [];

window.crmLoadEduMeta = async () => {
  const box = document.getElementById('edu-lead-meta');
  box.innerHTML = '⏳ Edutizimdan bosqich va kurslar olinmoqda…';
  const r = await invoke('edutizim-sync', { action: 'meta' });
  if (!r.ok) { box.innerHTML = `<div class="text-rose-600 font-bold">⚠️ ${esc(r.error)}</div>`; return; }
  const d = state.eduLeadDefaults || {};
  const defStatus = d.statusId || (r.statuses.find(x => x.position === 0) || {}).id;
  box.innerHTML = `
    <label class="font-bold block">Lid bosqichi
      <select id="edu-def-status" class="${input} w-full mt-1">${r.statuses.filter(x => x.position >= 0).map(x => `<option value="${esc(x.id)}" ${x.id === defStatus ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="font-bold block">Kurs (ixtiyoriy)
      <select id="edu-def-course" class="${input} w-full mt-1"><option value="">— tanlanmagan —</option>${r.courses.map(x => `<option value="${esc(x.id)}" ${x.id === d.courseId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    ${isAdmin() ? `<button onclick="crmSaveEduDefaults()" class="${btn('indigo-600')} w-full">💾 Saqlash</button>` : '<div class="text-slate-400">Saqlashni admin qiladi.</div>'}
    <div class="text-[10px] text-slate-400">Filial: ${esc(r.branch?.name || '')}</div>`;
};
window.crmSaveEduDefaults = () => {
  state.eduLeadDefaults = { statusId: document.getElementById('edu-def-status').value, courseId: document.getElementById('edu-def-course').value || null };
  saveState();
  showToast('Edutizim lid sozlamalari saqlandi', '➡️');
};

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
  if (canWrite()) {
    const { data: pl } = await sb().from('crm_edu_pushes').select('full_name,ok,message,created_at').order('created_at', { ascending: false }).limit(10);
    eduPushLog = pl || [];
  }
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
        ${canWrite() ? card(`
          <h3 class="text-sm font-black text-slate-900 mb-1">➡️ CRM → Edutizim (lid)</h3>
          <p class="text-[11px] text-slate-500 mb-2">O‘quvchi o‘qishga kelsa, sinf jadvalidagi <b>➡️ Edu</b> tugmasi uni Edutizimga yangi lid qilib qo‘shadi. Telefoni Edutizimda bor bo‘lsa, ogohlantiradi.</p>
          <div id="edu-lead-meta" class="space-y-2 text-xs"><button onclick="crmLoadEduMeta()" class="${btn('slate-700')}">⚙️ Lid bosqichi va kursni sozlash</button></div>
          <div class="mt-3 text-[11px] font-black text-slate-700">Oxirgi yuborishlar</div>
          <div class="space-y-1 text-[11px] mt-1">
            ${eduPushLog.map(l => `<div class="flex justify-between gap-2"><span class="${l.ok ? 'text-emerald-700' : 'text-rose-600'} font-bold">${l.ok ? '✓' : '✗'} ${esc(l.full_name)} — ${esc(l.message)}</span><span class="text-slate-400 whitespace-nowrap">${fmtDate(l.created_at)}</span></div>`).join('') || '<div class="text-slate-400">Hali yuborilmagan.</div>'}
          </div>
        `) : ''}
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
  const { data: allProfiles } = await sb().from('crm_profiles').select('*').order('created_at');
  const profiles = (allProfiles || []).filter(p => p.id !== crm().KIOSK_ID);
  const { data: access } = await sb().rpc('crm_access_info');
  const locked = access?.mode === 'locked';
  const classes = (state.classes || []).map(c => c.name);
  el.innerHTML = `<div class="max-w-4xl mx-auto space-y-5">
    ${isAdmin() ? card(`
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h2 class="text-lg font-black text-slate-900">🔒 Sayt kirish paroli</h2>
        <span class="px-3 py-1 rounded-full text-[11px] font-black ${locked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${locked ? '🔐 Parol bilan yopiq' : '🌐 Ochiq — loginsiz kiriladi'}</span>
      </div>
      <p class="text-[11px] text-slate-500 mt-1 mb-3">${locked
        ? 'Saytga kirishda faqat shu parol so‘raladi (email kerak emas). Parolni almashtirsangiz, boshqa qurilmalardagi umumiy seanslar yopiladi.'
        : '⚠️ Hozir saytni ochgan har kim barcha ma’lumotlarni ko‘radi va o‘zgartira oladi. Parol o‘rnatsangiz, sayt darhol yopiladi.'}</p>
      <div class="grid sm:grid-cols-3 gap-2 text-xs">
        <input id="site-pass-1" type="password" autocomplete="new-password" placeholder="Yangi parol (kamida 6 belgi)" class="${input}">
        <input id="site-pass-2" type="password" autocomplete="new-password" placeholder="Parolni takrorlang" class="${input}">
        <button onclick="crmSetSitePassword()" class="${btn('[#F2642A]')}">${locked ? '🔁 Parolni almashtirish' : '🔐 Parol o‘rnatish va yopish'}</button>
      </div>
      ${locked ? `<button onclick="crmOpenSite()" class="mt-2 text-[11px] font-bold text-rose-600 underline">Parolni olib tashlash (saytni ochiq qilish)</button>` : ''}
    `) : ''}
    ${canWrite() ? card(`
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div><h2 class="text-lg font-black text-slate-900">👮 Nazoratchilar va ustozlar</h2>
        <p class="text-[11px] text-slate-500">Maktab testi natijalarini yuboradiganlar ro‘yxati alohida bo‘limda.</p></div>
        <button onclick="switchTab('proctors')" class="${btn('[#F2642A]')}">👮 Nazoratchilar bo‘limiga o‘tish</button>
      </div>
    `) : ''}
    ${card(`
      <h2 class="text-lg font-black text-slate-900">👥 Xodimlar va rollar</h2>
      <p class="text-[11px] text-slate-500 mb-3">Yangi xodim login sahifasida “ro‘yxatdan o‘tish” qiladi, so‘ng admin unga rol beradi.
        <b>Admin</b> — hammasi · <b>Operator</b> — o‘quvchi/qo‘ng‘iroq/kassa/test (o‘chirishsiz) · <b>O‘qituvchi</b> — ko‘rish va faqat o‘z sinfi ballarini tahrirlash.</p>
      ${isAdmin() ? `
      <div class="overflow-x-auto"><table class="w-full text-xs">
        <thead><tr class="text-left text-slate-500 border-b"><th class="py-2">F.I.Sh.</th><th>Email</th><th>Rol</th><th>Maktab</th><th>Sinf (o‘qituvchi)</th><th>Qo‘shilgan</th><th></th></tr></thead>
        <tbody>${(profiles || []).map(p => `
          <tr class="border-b border-slate-100 ${p.role === 'pending' ? 'bg-amber-50' : ''}">
            <td class="py-2 font-black">${esc(p.full_name)}</td>
            <td class="font-mono text-[11px]">${esc(p.email)}</td>
            <td><select ${p.id === crm().user.id ? 'disabled' : ''} onchange="crmSetRole('${p.id}',{role:this.value})" class="${input} py-1">
              ${['pending', 'operator', 'teacher', 'admin'].map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${{ pending: '⏳ Kutilmoqda', operator: '🎧 Operator', teacher: '👩‍🏫 O‘qituvchi', admin: '👑 Admin' }[r]}</option>`).join('')}</select></td>
            <td><select onchange="crmSetRole('${p.id}',{school_id:this.value||null})" class="${input} py-1"><option value="">—</option>${(state.schools || []).map(sc => `<option value="${esc(sc.id)}" ${sc.id === p.school_id ? 'selected' : ''}>${esc(sc.name)}</option>`).join('')}</select></td>
            <td><input list="crm-class-list" value="${esc(p.class_name || '')}" placeholder="5-A" onchange="crmSetRole('${p.id}',{class_name:this.value.trim()||null})" class="${input} py-1 w-24"></td>
            <td class="text-slate-400">${fmtDate(p.created_at)}</td>
            <td>${p.id !== crm().user.id ? `<button onclick="crmDelProfile('${p.id}')" class="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">🗑</button>` : ''}</td>
          </tr>`).join('')}</tbody></table><datalist id="crm-class-list">${classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>` : `<div class="text-xs">Sizning rolingiz: <b>${esc(crm().role)}</b>. Rollarni faqat admin boshqaradi.</div>`}
    `)}
    ${card(`
      <h3 class="text-sm font-black text-slate-900 mb-1">☁️ Bulutli baza</h3>
      <div class="text-xs text-slate-600">Barcha ma’lumotlar Supabase (PostgreSQL) da saqlanadi va barcha kompyuterlarda real vaqtda yangilanadi. Holat: <b id="cloud-inline">${esc(document.getElementById('cloud-status-badge')?.textContent || '')}</b></div>
      <div class="text-[11px] text-slate-400 mt-1">Ota-onalar uchun ochiq sahifa: <a class="text-indigo-700 font-bold" href="parent.html" target="_blank">parent.html</a></div>
    `)}
  </div>`;
}
window.crmSetSitePassword = async () => {
  const a = document.getElementById('site-pass-1').value;
  const b = document.getElementById('site-pass-2').value;
  if (a.length < 6) return showToast('Parol kamida 6 belgi bo‘lsin', '⚠️');
  if (a !== b) return showToast('Parollar bir xil emas', '⚠️');
  const { error } = await sb().rpc('crm_set_site_password', { p_password: a });
  if (error) return showToast(error.message, '⚠️');
  showToast('Parol o‘rnatildi — sayt endi parol bilan ochiladi', '🔐');
  renderStaffTab();
};
window.crmOpenSite = async () => {
  if (!confirm('Parolni olib tashlab, saytni hammaga ochiq qilasizmi? Saytni ochgan har kim ma’lumotlarni ko‘radi va o‘zgartiradi.')) return;
  const { error } = await sb().rpc('crm_open_site');
  if (error) return showToast(error.message, '⚠️');
  showToast('Sayt ochiq rejimga o‘tdi', '🌐');
  renderStaffTab();
};

// =========================================================
// 👮 NAZORATCHILAR (maktab testlari natijasini yuboradiganlar)
// =========================================================
async function renderProctorsTab() {
  const el = document.getElementById('tab-proctors');
  if (!el) return;
  if (!canWrite()) { el.innerHTML = card('<div class="text-center text-slate-500 font-bold py-6">Bu bo‘lim faqat admin va operatorlar uchun.</div>'); return; }
  const [{ data: proctors }, { data: subs }] = await Promise.all([
    sb().from('crm_proctors').select('*').order('created_at'),
    sb().from('crm_omr_submissions').select('id,proctor_id,student_name,class_name,school_id,test_code,correct,score,source,created_at').not('proctor_id', 'is', null).order('created_at', { ascending: false }).limit(100)
  ]);
  const schoolName = id => ((state.schools || []).find(x => x.id === id) || {}).name || id;
  const byP = {};
  (subs || []).forEach(x => { byP[x.proctor_id] = (byP[x.proctor_id] || 0) + 1; });
  const pName = id => (proctors || []).find(p => p.id === id)?.full_name || '—';
  const schoolOpts = sel => `<option value="">Barcha maktablar</option>${(state.schools || []).map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  el.innerHTML = `<div class="max-w-5xl mx-auto space-y-5">
    ${card(`
      <h2 class="text-lg font-black text-slate-900">👮 Nazoratchilar va ustozlar (${(proctors || []).length})</h2>
      <p class="text-[11px] text-slate-500 mb-3">Faqat shu ro‘yxatdagilar botdagi <b>“👮 Nazoratchilar”</b> bo‘limi va Mini App’dagi <b>“🏫 Maktab”</b> tabi orqali maktab testi natijalarini kiritadi (ballar yoki varaq rasmi).
        Ular Telegram’da bir marta <b>“📱 Raqamni yuborish”</b> tugmasini bosadi — parol kerak emas, raqam shu yerdagi bilan mos kelishi kifoya.</p>
      ${isAdmin() ? `
      <div class="grid sm:grid-cols-6 gap-2 text-xs mb-4 p-3 rounded-2xl bg-orange-50 border border-orange-100">
        <input id="pr-name" placeholder="F.I.Sh." class="${input} sm:col-span-2">
        <input id="pr-phone" placeholder="+998 90 123 45 67" inputmode="tel" class="${input}">
        <select id="pr-role" class="${input}"><option value="nazoratchi">👮 Nazoratchi</option><option value="ustoz">👩‍🏫 Ustoz</option></select>
        <select id="pr-school" class="${input}">${schoolOpts('')}</select>
        <button onclick="crmAddProctor()" class="${btn('[#F2642A]')}">➕ Qo‘shish</button>
      </div>` : ''}
      <div class="overflow-x-auto"><table class="w-full text-xs">
        <thead><tr class="text-left text-slate-500 border-b"><th class="py-2">F.I.Sh.</th><th>Telefon</th><th>Rol</th><th>Maktab</th><th>Telegram</th><th>Natijalar</th><th>Holat</th><th></th></tr></thead>
        <tbody>${(proctors || []).map(p => `
          <tr class="border-b border-slate-100 ${p.active ? '' : 'opacity-50'}">
            <td class="py-2 font-black">${esc(p.full_name)}</td>
            <td class="font-mono">${esc(p.phone)}</td>
            <td>${isAdmin() ? `<select onchange="crmUpdateProctor(${p.id}, {role: this.value})" class="${input} py-1"><option value="nazoratchi" ${p.role !== 'ustoz' ? 'selected' : ''}>👮 Nazoratchi</option><option value="ustoz" ${p.role === 'ustoz' ? 'selected' : ''}>👩‍🏫 Ustoz</option></select>` : (p.role === 'ustoz' ? '👩‍🏫 Ustoz' : '👮 Nazoratchi')}</td>
            <td>${isAdmin() ? `<select onchange="crmUpdateProctor(${p.id}, {school_id: this.value || null})" class="${input} py-1">${schoolOpts(p.school_id)}</select>` : (p.school_id ? esc(schoolName(p.school_id)) : 'Barchasi')}</td>
            <td>${p.tg_user_id ? `<span class="text-emerald-700 font-bold">✅ ${p.tg_username ? '@' + esc(p.tg_username) : 'bog‘langan'}</span>` : '<span class="text-amber-700 font-bold">⏳ hali kirmagan</span>'}</td>
            <td class="font-black">${byP[p.id] || 0}</td>
            <td>${isAdmin() ? `<button onclick="crmToggleProctor(${p.id}, ${!p.active})" class="px-2 py-1 rounded-lg ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'} font-bold">${p.active ? 'Faol' : 'O‘chiq'}</button>` : (p.active ? 'Faol' : 'O‘chiq')}</td>
            <td>${isAdmin() ? `<button onclick="crmDeleteProctor(${p.id})" class="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">🗑</button>` : ''}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="py-6 text-center text-slate-400 font-bold">Hali nazoratchi qo‘shilmagan. Yuqoridagi forma orqali qo‘shing.</td></tr>'}</tbody>
      </table></div>
    `)}
    ${card(`
      <h2 class="text-lg font-black text-slate-900 mb-3">📝 Nazoratchilar kiritgan oxirgi natijalar</h2>
      <div class="overflow-x-auto max-h-[520px]"><table class="w-full text-xs">
        <thead class="sticky top-0 bg-white"><tr class="text-left text-slate-500 border-b"><th class="py-2">Vaqt</th><th>Nazoratchi</th><th>O‘quvchi</th><th>Sinf</th><th>Test</th><th>To‘g‘ri</th><th>Ball</th><th>Usul</th></tr></thead>
        <tbody>${(subs || []).map(x => `
          <tr class="border-b border-slate-100">
            <td class="py-2 whitespace-nowrap text-slate-500">${fmtDate(x.created_at)}</td>
            <td class="font-bold">${esc(pName(x.proctor_id))}</td>
            <td class="font-black">${esc(x.student_name)}</td>
            <td>${esc(x.class_name || '')}<div class="text-[10px] text-slate-400">${esc(schoolName(x.school_id || ''))}</div></td>
            <td class="font-mono">${esc(x.test_code)}</td>
            <td>${x.correct ?? ''}</td>
            <td class="font-black text-[#F2642A]">${x.score ?? ''}</td>
            <td>${/manual/.test(x.source || '') ? '✍️ Qo‘lda' : '📸 Varaq'}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="py-6 text-center text-slate-400 font-bold">Hali natija kiritilmagan.</td></tr>'}</tbody>
      </table></div>
    `)}
  </div>`;
}
window.crmUpdateProctor = async (id, patch) => {
  const { error } = await sb().from('crm_proctors').update(patch).eq('id', id);
  if (error) return showToast(error.message, '⚠️');
  showToast('Nazoratchi ma’lumoti yangilandi', '👮');
};

window.crmAddProctor = async () => {
  const name = document.getElementById('pr-name').value.trim();
  const digits = document.getElementById('pr-phone').value.replace(/\D/g, '');
  if (name.length < 3) return showToast('F.I.Sh.ni kiriting', '⚠️');
  if (digits.length < 9) return showToast('Telefon raqamini to‘liq kiriting', '⚠️');
  const { error } = await sb().from('crm_proctors').insert({
    full_name: name, phone: '+998' + digits.slice(-9),
    role: document.getElementById('pr-role').value, school_id: document.getElementById('pr-school').value || null, active: true
  });
  if (error) return showToast(/duplicate|unique/i.test(error.message) ? 'Bu raqam allaqachon ro‘yxatda' : error.message, '⚠️');
  showToast(`${name} nazoratchilar ro‘yxatiga qo‘shildi`, '👮');
  renderProctorsTab();
};
window.crmToggleProctor = async (id, active) => {
  const { error } = await sb().from('crm_proctors').update({ active }).eq('id', id);
  if (error) return showToast(error.message, '⚠️');
  renderProctorsTab();
};
window.crmDeleteProctor = async id => {
  if (!confirm('Nazoratchini ro‘yxatdan o‘chirasizmi?')) return;
  const { error } = await sb().from('crm_proctors').delete().eq('id', id);
  if (error) return showToast(error.message, '⚠️');
  renderProctorsTab();
};

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
    ${isAdmin() ? card(`
      <div class="flex items-center justify-between gap-2 mb-2"><h3 class="text-lg font-black text-slate-900">📣 Ommaviy xabar</h3><span id="bc-count" class="text-xs font-black text-sky-700"></span></div>
      <div class="grid sm:grid-cols-2 gap-2 text-xs">
        <label class="font-bold">Kimga
          <select id="bc-aud" onchange="crmBcAud()" class="${input} w-full mt-1">
            <option value="all">👥 Botning barcha foydalanuvchilari</option>
            <option value="mock">🧒 Kids Mock ishtirokchilari</option>
            <option value="proctors">👮 Nazoratchi va ustozlar</option>
          </select></label>
        <div id="bc-mock" class="hidden grid grid-cols-3 gap-1">
          <label class="font-bold col-span-3 sm:col-span-1">Sessiya<select id="bc-session" onchange="crmBcCount()" class="${input} w-full mt-1 py-1"><option value="">Hammasi</option>${(state.mockSessions || []).map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
          <label class="font-bold">Xona<select id="bc-room" onchange="crmBcCount()" class="${input} w-full mt-1 py-1"><option value="">Hammasi</option>${(state.mockRooms || []).map(x => `<option>${esc(x.name)}</option>`).join('')}<option>Navbatda</option></select></label>
          <label class="font-bold">Tasdiq<select id="bc-confirm" onchange="crmBcCount()" class="${input} w-full mt-1 py-1"><option value="">Hammasi</option><option>Boraman</option><option>Bora olmayman</option><option value="none">Javob bermagan</option></select></label>
        </div>
      </div>
      <textarea id="bc-text" rows="5" maxlength="4000" placeholder="Hurmatli ota-onalar! ..." class="${input} w-full mt-2 text-sm"></textarea>
      <div class="grid sm:grid-cols-3 gap-2 mt-2 text-xs">
        <label class="font-bold">🖼 Rasm (ixtiyoriy)<input id="bc-photo" type="file" accept="image/jpeg,image/png,image/webp" class="block w-full mt-1 text-[11px]"></label>
        <label class="font-bold">Tugma matni<input id="bc-btn-text" placeholder="Batafsil" class="${input} w-full mt-1"></label>
        <label class="font-bold">Tugma havolasi<input id="bc-btn-url" placeholder="https://..." class="${input} w-full mt-1"></label>
      </div>
      <div class="flex flex-wrap gap-2 mt-3">
        <button onclick="crmBroadcast(true)" class="${btn('slate-500')}">🧪 Avval admin chatga sinov</button>
        <button onclick="crmBroadcast(false)" class="${btn('[#F2642A]')}">📣 Yuborish</button>
      </div>
      <div id="bc-history" class="mt-4 space-y-1.5"></div>
    `) : ''}
    ${card(`
      <div class="text-sm font-black text-slate-800 mb-2">⌨️ Bot buyruqlari</div>
      <div class="grid sm:grid-cols-2 gap-1.5 text-xs">
        ${[
          ['/start', 'Bosh menyu: 📚 Javoblar · 🧒 Kids Mock · 📊 Natijalar'],
          ['/javoblar', 'E’lon qilingan imtihon javoblari kaliti'],
          ['/top', 'Maktab → parallel bo‘yicha TOP-3 sovrindorlar'],
          ['/natija', 'Farzand balli va parallel TOP-3 o‘rni (ism yoki telefon)'],
          ['/karta', 'Yutuqli karta rasmi — telefon tasdiqlangan TOP-3 ota-onasiga'],
          ['/tekshir', 'Javoblar varaqasi rasmini tekshirish (OMR)'],
          ['/royxat', 'Kids Mock imtihoniga yozilish'],
          ['/mening', 'Arizalar va tekshirilgan varaqlar tarixi'],
          ['/aloqa', 'Markaz ma’lumoti (pastdagi matn)'],
          ['/hisobot', 'Kunlik statistika — faqat admin chat/guruhda'],
          ['/id', 'Chat ID ni ko‘rish (admin guruhini sozlash uchun)']
        ].map(([c, d]) => `<div class="p-2 rounded-xl bg-slate-50 border border-slate-200"><code class="font-black text-sky-700">${c}</code> — ${d}</div>`).join('')}
      </div>
    `)}
    ${isAdmin() ? card(`
      <h3 class="text-lg font-black text-slate-900">🛠 Edutizim boti (xodimlar uchun)</h3>
      <p class="text-[11px] text-slate-500 mb-2">Alohida bot: Edutizim kassasiga <b>kirim/chiqim</b>, o‘quvchi balansi, qarzdorlar, lid qo‘shish, hisobot va sinxron. Faqat quyidagi Telegram ID egalariga ochiladi.</p>
      <div id="edu-bot-status" class="text-xs p-3 rounded-2xl bg-slate-50 border border-slate-200">⏳ Tekshirilmoqda…</div>
      <div class="flex flex-wrap gap-2 mt-2 text-xs">
        <input id="edu-bot-token" type="password" autocomplete="off" placeholder="Yangi token (BotFather)" class="${input} flex-1 min-w-[200px] font-mono">
        <button onclick="crmEduBotConnect()" class="${btn('sky-600')}">💾 Saqlash va ulash</button>
      </div>
      <label class="text-xs font-bold block mt-3">Bot adminlari — Telegram ID (har qatorda bittasi, izoh mumkin: <code>123456789 Maqsud</code>)
        <textarea id="tg-bot-admins" rows="3" class="${input} w-full font-mono mt-1" placeholder="123456789 Maqsud">${esc((state.botAdmins || []).join('\n'))}</textarea></label>
      <p class="text-[10px] text-slate-400">ID’ni bilish: ruxsatsiz odam botga /start yozsa, bot uning ID’sini ko‘rsatadi. Admin chat ID egasi ham avtomatik admin.</p>
      <button onclick="crmSaveBotAdmins()" class="${btn('[#F2642A]')} mt-2">💾 Adminlarni saqlash</button>
    `) : ''}
    ${card(`
      <div class="text-sm font-black text-slate-800 mb-1">📞 /aloqa matni</div>
      <p class="text-[11px] text-slate-500 mb-2">Ota-onalar /aloqa yoki “📞 Aloqa” tugmasini bosganda shu matn yuboriladi.</p>
      <textarea id="tg-center-info" rows="6" ${isAdmin() ? '' : 'disabled'} placeholder="📍 Registan LC o‘quv markazi
🏠 Manzil: Qarshi sh., ...
📞 +998 ...
🕘 Ish vaqti: Du–Sha 08:00–20:00
✈️ Admin: @..." class="${input} w-full">${esc(state.centerInfo || '')}</textarea>
      ${isAdmin() ? `<button onclick="crmSaveCenterInfo()" class="${btn('sky-600')} mt-2">💾 Saqlash</button>` : ''}
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
  if (isAdmin()) { crmBcCount(); crmBcHistory(); crmEduBotStatus(); }
}
window.renderTelegramTab = renderTelegramTab;

// ---------- 📣 Ommaviy xabar ----------
const bcFilter = () => ({
  audience: document.getElementById('bc-aud').value,
  filter: { session: document.getElementById('bc-session').value, room: document.getElementById('bc-room').value, confirm: document.getElementById('bc-confirm').value }
});
window.crmBcAud = () => { document.getElementById('bc-mock').classList.toggle('hidden', document.getElementById('bc-aud').value !== 'mock'); crmBcCount(); };
window.crmBcCount = async () => {
  const el = document.getElementById('bc-count');
  if (!el) return;
  el.textContent = '…';
  const r = await invoke('bot-jobs', { action: 'count', ...bcFilter() });
  el.textContent = r.ok ? `👥 ${r.count} ta qabul qiluvchi` : '';
};
const BC_AUD = { all: '👥 Barchaga', mock: '🧒 Kids Mock', proctors: '👮 Nazoratchilar', test: '🧪 Sinov' };
let bcTimer = null;
window.crmBcHistory = async () => {
  const box = document.getElementById('bc-history');
  if (!box) return;
  const { data } = await sb().from('crm_broadcasts').select('id,created_at,audience,text,status,total,sent,failed,error').order('id', { ascending: false }).limit(8);
  box.innerHTML = (data || []).length ? '<div class="text-[11px] font-black text-slate-500">Oxirgi xabarlar</div>' + data.map(b => {
    const pct = b.total ? Math.round(((b.sent + b.failed) / b.total) * 100) : 0;
    const st = { queued: '⏳ navbatda', sending: `📤 ${pct}%`, done: '✅ yuborildi', cancelled: '⛔ to‘xtatildi', error: '⚠️ ' + (b.error || 'xato') }[b.status] || b.status;
    return `<div class="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px]">
      <div class="flex justify-between gap-2"><b>#${b.id} · ${BC_AUD[b.audience] || b.audience}</b><span class="text-slate-500">${fmtDate(b.created_at)}</span></div>
      <div class="truncate text-slate-600">${esc(b.text || '🖼 rasm')}</div>
      <div class="flex justify-between gap-2 mt-0.5"><span>${st} · ✅ ${b.sent} · ⚠️ ${b.failed} / ${b.total}</span>${['queued', 'sending'].includes(b.status) ? `<button onclick="crmBcCancel(${b.id})" class="text-rose-600 font-black">To‘xtatish</button>` : ''}</div>
      ${b.status === 'sending' ? `<div class="h-1 bg-slate-200 rounded mt-1"><div class="h-1 bg-[#F2642A] rounded" style="width:${pct}%"></div></div>` : ''}
    </div>`;
  }).join('') : '';
  clearTimeout(bcTimer);
  if ((data || []).some(b => ['queued', 'sending'].includes(b.status))) bcTimer = setTimeout(crmBcHistory, 3000);
};
window.crmBcCancel = async id => { await invoke('bot-jobs', { action: 'cancel', id }); crmBcHistory(); };
window.crmBroadcast = async test => {
  const text = document.getElementById('bc-text').value.trim();
  const file = document.getElementById('bc-photo').files[0];
  if (!text && !file) return showToast('Matn yoki rasm kiriting', '⚠️');
  const f = bcFilter();
  if (!test) {
    const n = document.getElementById('bc-count').textContent;
    if (!confirm(`Xabar yuborilsinmi?\n${BC_AUD[f.audience]} · ${n}`)) return;
  }
  let photoPath = null;
  if (file) {
    if (file.size > 10 * 1024 * 1024) return showToast('Rasm 10 MB dan katta', '⚠️');
    photoPath = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const { error } = await sb().storage.from('crm-broadcast').upload(photoPath, file, { contentType: file.type });
    if (error) return showToast('Rasm yuklanmadi: ' + error.message, '⚠️');
  }
  const r = await invoke('bot-jobs', {
    action: 'broadcast', text, photoPath, audience: test ? 'test' : f.audience, filter: f.filter,
    button: { text: document.getElementById('bc-btn-text').value.trim(), url: document.getElementById('bc-btn-url').value.trim() }
  });
  if (!r.ok) return showToast(r.error || 'Xato', '⚠️');
  showToast(test ? 'Sinov xabari admin chatga yuborildi' : `Yuborilmoqda: ${r.total} ta qabul qiluvchi`, '📣');
  crmBcHistory();
};

window.crmEduBotStatus = async () => {
  const box = document.getElementById('edu-bot-status');
  if (!box) return;
  const r = await invoke('tg-admin', { action: 'eduStatus' });
  if (!r.ok) { box.innerHTML = `<span class="text-rose-600 font-bold">⚠️ ${esc(r.error || 'Ulanmagan')}</span>`; return; }
  const ok = (r.webhook?.url || '').includes('/functions/v1/edu-bot');
  box.innerHTML = `<div class="font-black text-slate-900">@${esc(r.bot?.username)} · ${esc(r.bot?.first_name)}</div>
    <div>Webhook: ${ok ? '<b class="text-emerald-700">✅ ulangan</b>' : '<b class="text-rose-600">✗ ulanmagan — “Saqlash va ulash”ni bosing</b>'}</div>
    ${r.webhook?.last_error_message ? `<div class="text-rose-600">Oxirgi xato: ${esc(r.webhook.last_error_message)}</div>` : ''}
    <a class="text-sky-700 font-bold" href="https://t.me/${esc(r.bot?.username)}" target="_blank">t.me/${esc(r.bot?.username)} ↗</a>`;
};
window.crmEduBotConnect = async () => {
  const token = document.getElementById('edu-bot-token').value.trim();
  try { if (token) await setSecret('edu_bot_token', token); } catch (e) { return showToast(e.message, '⚠️'); }
  const r = await invoke('tg-admin', { action: 'setEduWebhook' });
  showToast(r.ok ? 'Edutizim boti ulandi' : 'Xato: ' + r.error, r.ok ? '🛠' : '⚠️');
  document.getElementById('edu-bot-token').value = '';
  crmEduBotStatus();
};
window.crmSaveBotAdmins = () => {
  state.botAdmins = document.getElementById('tg-bot-admins').value.split('\n').map(l => (l.match(/\d{5,15}/) || [])[0]).filter(Boolean);
  saveState();
  showToast(`Bot adminlari: ${state.botAdmins.length} ta`, '🛠');
  renderTelegramTab();
};
window.crmSaveCenterInfo = () => {
  state.centerInfo = document.getElementById('tg-center-info').value.trim();
  saveState();
  showToast('/aloqa matni saqlandi — bot darhol shuni yuboradi', '📞');
};

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
