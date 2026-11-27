// Registan.edutizim.uz bilan sinxronlash (login/parol orqali)
// Edutizim frontend API: https://backend.edutizim.uz/moderator-web-api
//   POST /sign-with-password {phoneNumber, password}      -> data.token, data.branches[]
//   POST /student-list/students-pagin {page, limit}       -> data.{total, data[]}
//   POST /group-pagin {page, limit}                       -> data.{total, data[]}
// Tashkilot `Origin` (subdomen) orqali, filial `branch` sarlavhasi orqali aniqlanadi.
//   GET  /statuses, POST /courses-pagin                    -> lid bosqichlari, kurslar
//   POST /order {statusId, courseId, studentParams{firstName,lastName,phoneNumber}} -> yangi lid
// Chaqirish: CRM xodimi JWT bilan yoki `x-cron-secret` (crm_secrets.cron_secret) bilan (avtomatik sinxron).
import { admin, callerRole, cors, getSecret, getSetting, json } from '../_shared/common.ts';

const DEFAULT_BASE = 'https://backend.edutizim.uz/moderator-web-api';
const DEFAULT_SITE = 'https://registan.edutizim.uz';

function baseHeaders(site: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Accept: 'application/json', Origin: site, Referer: site + '/' };
}

async function login(base: string, site: string, phone: string, password: string) {
  const digits = phone.replace(/\D/g, '');
  const variants = [...new Set(['+998' + digits.slice(-9), phone.trim()])];
  let last = '';
  for (const phoneNumber of variants) {
    const res = await fetch(`${base}/sign-with-password`, {
      method: 'POST',
      headers: baseHeaders(site),
      body: JSON.stringify({ phoneNumber, password })
    });
    const body = await res.json().catch(() => ({}));
    const token = body?.data?.token;
    if (token) return { token, branches: (body?.data?.branches || []) as any[] };
    if (body?.data?.isTwoStepVerificationEnabled) {
      throw new Error('Edutizim hisobida 2 bosqichli tasdiqlash yoqilgan — integratsiya uchun 2FA siz hisob kerak.');
    }
    last = `${res.status} ${body?.message || body?.code || ''}`;
  }
  throw new Error('Edutizimga kirib bo‘lmadi (telefon/parolni tekshiring): ' + last);
}

async function fetchPage(base: string, path: string, headers: Record<string, string>, page: number, limit: number) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify({ page, limit }) });
  if (res.status === 401) throw new Error('Edutizim sessiyasi rad etildi (401)');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body?.message || ''}`);
  const d = body?.data;
  const items: any[] = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
  return { items, total: typeof d?.total === 'number' ? d.total : null };
}

// 1-sahifadan jami sonni bilib, qolgan sahifalarni 8 tadan parallel olamiz
async function fetchAll(base: string, path: string, headers: Record<string, string>) {
  const seen = new Map<string, any>();
  const add = (items: any[]) => items.forEach(it => {
    const id = String(it?._id ?? it?.id ?? it?.uuid ?? '');
    if (id && !seen.has(id)) seen.set(id, it);
  });
  const first = await fetchPage(base, path, headers, 1, 100);
  add(first.items);
  const limit = first.items.length || 100;
  const pages = first.total ? Math.min(300, Math.ceil(first.total / limit)) : 1;
  for (let p = 2; p <= pages; p += 8) {
    const batch = [];
    for (let q = p; q < p + 8 && q <= pages; q++) batch.push(fetchPage(base, path, headers, q, limit));
    (await Promise.all(batch)).forEach(r => add(r.items));
  }
  return [...seen.values()];
}

const nameOf = (s: any) =>
  (s?.fullName || '').trim() || [s?.lastName, s?.firstName].filter(Boolean).join(' ').trim() || s?.name || '';
const phoneOf = (s: any) =>
  s?.phoneNumber || s?.parent?.motherPhoneNumber || s?.parent?.fatherPhoneNumber || '';
const groupsOf = (s: any) => {
  const list = Array.isArray(s?.groupsList) ? s.groupsList : [];
  const names = list.map((x: any) => x?.name || x?.group?.name || '').filter(Boolean);
  if (!names.length && s?.groupName) names.push(s.groupName);
  return names.join(', ');
};


// ---------------------------------------------------------
// CRM -> Edutizim: o'quvchini lid (order) sifatida yuborish
// ---------------------------------------------------------
const last9 = (p: string) => String(p || '').replace(/\D/g, '').slice(-9);

function splitName(full: string) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  // CRM formati: "Familiya Ism [Otasining ismi]"
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
}

async function eduMeta(base: string, headers: Record<string, string>) {
  const st = await fetch(`${base}/statuses`, { headers }).then(r => r.json()).catch(() => ({}));
  const cr = await fetch(`${base}/courses-pagin`, { method: 'POST', headers, body: JSON.stringify({ page: 1, limit: 100 }) }).then(r => r.json()).catch(() => ({}));
  const statuses = (Array.isArray(st?.data) ? st.data : []).map((x: any) => ({ id: x._id, name: x.name, position: x.position ?? 0 }))
    .sort((a: any, b: any) => a.position - b.position);
  const courses = (Array.isArray(cr?.data?.data) ? cr.data.data : []).map((x: any) => ({ id: x._id, name: x.name }));
  return { statuses, courses };
}

async function pushLeads(base: string, headers: Record<string, string>, body: any, userId: string | null) {
  const list: any[] = Array.isArray(body.students) ? body.students.slice(0, 50) : [];
  if (!list.length) return { ok: false, error: 'O‘quvchi tanlanmagan' };
  const defaults = await getSetting<any>('eduLeadDefaults', {});
  let statusId = body.statusId || defaults.statusId;
  const courseId = body.courseId || defaults.courseId || undefined;
  if (!statusId) {
    const meta = await eduMeta(base, headers);
    statusId = (meta.statuses.find((s: any) => s.position === 0) || meta.statuses.find((s: any) => s.position >= 0))?.id;
  }
  const results = [];
  for (const st of list) {
    const phone9 = last9(st.phone);
    const name = String(st.fullName || '').trim();
    const row: any = { crm_student_id: st.crmId || null, school_id: st.schoolId || null, full_name: name, phone: phone9 ? '+998' + phone9 : '', created_by: userId };
    try {
      if (!name) throw new Error('Ism yo‘q');
      // Mavjud Edutizim o'quvchisiga buyurtma (yangi o'quvchi yaratilmaydi) — Edutizim saytining o'zi ham shunday yuboradi
      if (st.eduStudentId) {
        const sid = String(st.eduStudentId);
        row.edu_student_id = sid;
        if (!body.force) {
          const { data: rec } = await admin.from('crm_edu_pushes').select('created_at,message').eq('edu_student_id', sid).eq('ok', true)
            .gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(1);
          if (rec?.length) { results.push({ ok: true, skipped: 'recent', message: `Oxirgi 14 kunda buyurtma ochilgan (${String(rec[0].created_at).slice(0, 10)})` }); continue; }
        }
        const { firstName, lastName } = splitName(name);
        const payload = {
          statusId, courseId, referredByStudentId: null, customFields: [], studentId: sid,
          studentParams: { _id: sid, firstName, lastName, phoneNumber: phone9 ? '+998' + phone9 : '', customFields: [] }
        };
        const res = await fetch(`${base}/order`, { method: 'POST', headers, body: JSON.stringify(payload) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || (out?.code && out.code !== 0)) throw new Error(`${res.status} ${out?.message || out?.messages?.uz || ''}`.trim());
        row.edu_order_id = out?.data?._id || null;
        row.ok = true;
        row.message = 'Buyurtma (mavjud o‘quvchi)';
        results.push({ ok: true, orderId: row.edu_order_id, message: row.message });
        await admin.from('crm_edu_pushes').insert(row);
        continue;
      }
      // Takroriy yuborishning oldini olish
      const { data: prev } = await admin.from('crm_edu_pushes').select('id,created_at').eq('crm_student_id', st.crmId).eq('ok', true).limit(1);
      if (st.crmId && prev?.length && !body.force) { results.push({ crmId: st.crmId, ok: true, skipped: 'already_pushed', message: 'Avval yuborilgan' }); continue; }
      if (phone9) {
        const { data: ex } = await admin.from('crm_edu_students').select('id,full_name').eq('phone_digits', phone9).limit(1);
        if (ex?.length && !body.force) { results.push({ crmId: st.crmId, ok: true, skipped: 'exists', message: `Edutizimda bor: ${ex[0].full_name}` }); continue; }
      }
      const { firstName, lastName } = splitName(name);
      const payload = {
        statusId, courseId, referredByStudentId: null, customFields: [],
        studentParams: { firstName, lastName, phoneNumber: phone9 ? '+998' + phone9 : '', customFields: [] }
      };
      const res = await fetch(`${base}/order`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || (out?.code && out.code !== 0)) throw new Error(`${res.status} ${out?.message || out?.messages?.uz || ''}`.trim());
      row.edu_order_id = out?.data?._id || null;
      row.edu_student_id = out?.data?.studentId || out?.data?.student?._id || null;
      row.ok = true;
      row.message = 'Lid yaratildi';
      results.push({ crmId: st.crmId, ok: true, orderId: row.edu_order_id, message: row.message });
    } catch (e) {
      row.ok = false;
      row.message = String((e as Error).message || e).slice(0, 300);
      results.push({ crmId: st.crmId, ok: false, message: row.message });
    }
    await admin.from('crm_edu_pushes').insert(row);
  }
  return { ok: true, results, statusId, courseId: courseId || null };
}

// ---------------------------------------------------------
// 💰 Kassa: kirim / chiqim (Edutizim → Moliya → Kassa)
//   GET  /cashboxes, GET /payment-transactions (type payIn|payOut), GET /settings/payment-methods
//   POST /cashbox/payment {cashboxId, amount, paymentTransactionId, paymentMethodId, studentId?, comment, actualDate}
// ---------------------------------------------------------
const listOf = (b: any) => (Array.isArray(b?.data) ? b.data : Array.isArray(b?.data?.data) ? b.data.data : Array.isArray(b) ? b : []);
async function getJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers });
  return r.json().catch(() => ({}));
}
async function kassaMeta(base: string, headers: Record<string, string>, raw = false) {
  const [cb, pt, pm] = await Promise.all([
    getJson(`${base}/cashboxes`, headers),
    getJson(`${base}/payment-transactions`, headers),
    getJson(`${base}/settings/payment-methods`, headers)
  ]);
  const cashboxes = listOf(cb).map((x: any) => ({ id: x._id, name: x.name, main: !!x.isMain, frozen: !!x.isFrozen, cash: x.cash || 0, card: x.card || 0, terminal: x.terminal || 0, transfer: x.transfer || 0 }));
  const types = listOf(pt).map((x: any) => ({ id: x._id, name: x.name, type: x.type, subtype: x.subtype || 'other', min: x.minAmount || 0, max: x.maxAmount || 0 }));
  const methods = listOf(pm).map((x: any) => ({ id: x._id, name: x.name }));
  const out: any = { cashboxes, types, methods };
  if (raw) out.raw = { cb: JSON.stringify(cb).slice(0, 1500), pt: JSON.stringify(pt).slice(0, 1500), pm: JSON.stringify(pm).slice(0, 800) };
  return out;
}
async function kassaPay(base: string, headers: Record<string, string>, b: any) {
  const amount = Math.round(Number(b.amount) || 0);
  if (!b.cashboxId || !b.paymentTransactionId || !b.paymentMethodId || amount <= 0) return { ok: false, error: 'Kassa, tur, to‘lov usuli va summa kerak' };
  const payload: Record<string, unknown> = {
    cashboxId: b.cashboxId, amount, paymentTransactionId: b.paymentTransactionId, paymentMethodId: b.paymentMethodId,
    studentId: b.studentId || undefined, comment: b.comment || null, actualDate: new Date().toISOString()
  };
  const res = await fetch(`${base}/cashbox/payment`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const out = await res.json().catch(() => ({}));
  const ok = res.ok && (!out?.code || out.code === 0);
  await admin.from('crm_sync_log').insert({ source: 'edutizim-kassa', ok, message: `${b.kind || ''} ${amount} · ${b.comment || ''}`.slice(0, 300), stats: { payload, by: b.by || null, response: ok ? { id: out?.data?._id } : out } });
  if (!ok) return { ok: false, error: `${res.status} ${out?.message || out?.messages?.uz || ''}`.trim() };
  return { ok: true, id: out?.data?._id || null };
}
// Kassa tarixi: POST /cashbox/payments-pagin {page, limit, cashboxId, dateFrom, dateTo, type?}
async function kassaTx(base: string, headers: Record<string, string>, b: any) {
  const filter: Record<string, unknown> = { cashboxId: b.cashboxId, dateFrom: b.dateFrom, dateTo: b.dateTo, type: b.type || undefined };
  const items: any[] = [];
  let total: number | null = null;
  let rawSample = '';
  for (let page = 1; page <= 60; page++) {
    const res = await fetch(`${base}/cashbox/payments-pagin`, { method: 'POST', headers, body: JSON.stringify({ page, limit: 100, ...filter }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status} ${body?.message || ''}`.trim() };
    if (page === 1 && b.raw) rawSample = JSON.stringify(body).slice(0, 2500);
    const d = body?.data;
    const list: any[] = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    if (typeof d?.total === 'number') total = d.total;
    items.push(...list);
    if (list.length < 100 || (total !== null && items.length >= total)) break;
  }
  const tx = items.map((x: any) => ({
    id: x._id, amount: Number(x.amount) || 0, type: x.type || x.shiftTransaction?.type || '',
    category: x.shiftTransaction?.name || x.paymentTransaction?.name || '—', categoryId: x.paymentTransactionId || null,
    subtype: x.shiftTransaction?.subtype || '', method: x.paymentMethod?.name || '', date: x.actualDate || x.createdAt,
    studentId: x.studentId || x.student?._id || null,
    comment: x.comment || '', person: [x.employee?.firstName, x.employee?.lastName].filter(Boolean).join(' ') || [x.student?.firstName, x.student?.lastName].filter(Boolean).join(' '),
    cancelled: !!(x.cancelledAt || x.isCancelled || x.cancelled || x.state === 'cancelled')
  }));
  return { ok: true, total: total ?? tx.length, count: tx.length, tx, ...(b.raw ? { raw: rawSample } : {}) };
}

// Faqat o'qish: ruxsat etilgan ro'yxat endpointlari (davomat, izohlar, o'qituvchi analitikasi...)
const READ_PATHS = new Set([
  '/attendance-histoy-pagin', '/comments-pagin', '/analitics/student/teacher', '/analitics/teacher/students',
  '/teacher-students-pagin', '/hr/employees-pagin', '/group-pagin', '/shift-bells-pagin', '/student-list/students-pagin',
  '/courses-pagin', '/reasons/attendance', '/analitics/headcount', '/student/transactions-pagin'
]);
async function eduRead(base: string, headers: Record<string, string>, b: any) {
  const path = String(b.path || '');
  if (!READ_PATHS.has(path)) return { ok: false, error: 'Ruxsat etilmagan yo‘l' };
  const limit = Math.min(Number(b.limit) || 100, 200);
  const maxPages = Math.min(Number(b.pages) || 1, 60);
  const items: any[] = [];
  let total: number | null = null, raw = '', extra: any = null;
  for (let page = Number(b.page) || 1, n = 0; n < maxPages; page++, n++) {
    const res = await fetch(`${base}${path}`, { method: b.method === 'get' ? 'GET' : 'POST', headers, body: b.method === 'get' ? undefined : JSON.stringify({ ...(b.body || {}), page, limit }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: `${res.status} ${body?.message || ''}`.trim(), raw: JSON.stringify(body).slice(0, 600) };
    if (n === 0 && b.raw) raw = JSON.stringify(body).slice(0, Number(b.raw) > 1 ? Number(b.raw) : 3000);
    const d = body?.data;
    const list: any[] = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    if (typeof d?.total === 'number') total = d.total;
    if (n === 0 && d && !Array.isArray(d)) { const { data: _x, ...rest } = d; extra = rest; }
    items.push(...list);
    if (list.length < limit || (total !== null && items.length >= total)) break;
  }
  return { ok: true, total: total ?? items.length, count: items.length, items: b.noItems ? undefined : items, extra, ...(b.raw ? { raw } : {}) };
}


// =========================================================
// 👥 Xodimlar, 📅 davomat, ⚠️ notcoming xavfi, 💬 izohlar, 👩‍🏫 o'qituvchi hisoboti
// =========================================================
async function postJson(base: string, headers: Record<string, string>, path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${out?.message || ''}`.trim());
  return out;
}
// Ro'yxatni to'liq olish: 1-sahifadan jami son, keyin 6 tadan parallel
async function pageAll(base: string, headers: Record<string, string>, path: string, body: Record<string, unknown>, limit = 200, maxPages = 40) {
  const listOfData = (o: any) => { const d = o?.data; return { list: (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []) as any[], total: typeof d?.total === 'number' ? d.total : null }; };
  const first = listOfData(await postJson(base, headers, path, { ...body, page: 1, limit }));
  const items = [...first.list];
  const pages = first.total ? Math.min(maxPages, Math.ceil(first.total / limit)) : 1;
  for (let p = 2; p <= pages; p += 6) {
    const batch = [];
    for (let q = p; q < p + 6 && q <= pages; q++) batch.push(postJson(base, headers, path, { ...body, page: q, limit }).then(listOfData));
    (await Promise.all(batch)).forEach(r => items.push(...r.list));
  }
  return items;
}
const fullName = (o: any) => [o?.firstName, o?.lastName].filter(Boolean).join(' ').trim() || o?.fullName || '';

async function employees(base: string, headers: Record<string, string>) {
  const list = await pageAll(base, headers, '/hr/employees-pagin', {}, 100, 10);
  return list.map((e: any) => ({ id: e._id, name: fullName(e), phone: e.phoneNumber || '', digits: String(e.phoneNumber || '').replace(/\D/g, '').slice(-9), roles: (e.roles || e.role ? [].concat(e.roles || e.role).map((r: any) => r?.name || r).filter(Boolean) : []), isTeacher: !!(e.isTeacher ?? (e.type === 'teacher')),
    role: e.role?.name || '', birthdate: e.birthdate ? String(e.birthdate).slice(0, 10) : null, activeGroups: Number(e.activeGroups) || 0, activeStudents: Number(e.activeStudents) || 0 }));
}

const mapAtt = (a: any) => ({
  id: a._id, studentId: a.studentId || a.student?._id, name: fullName(a.student), phone: a.student?.phoneNumber || '', balance: Number(a.student?.balance) || 0,
  groupId: a.groupId || a.group?._id, group: a.group?.name || '', teacherId: a.teacherId || a.teacher?._id, teacher: fullName(a.teacher),
  manager: fullName(a.moderator), managerId: a.moderator?._id || a.student?.moderatorId || null, lessonDate: a.lessonDate || a.date, state: a.state,
  reason: a.reason?.name || a.reason || '', teacherComment: a.comment || '', sgState: a.studentGroup?.state || '', status: a.student?.status?.name || ''
});
async function attendance(base: string, headers: Record<string, string>, states: string[], fromDate: string, toDate: string) {
  const res = await Promise.all(states.map(state => pageAll(base, headers, '/attendance-histoy-pagin', { state, fromDate, toDate }, 200, 30)));
  return res.flat().map(mapAtt);
}

// Ketma-ket qoldirilgan darslar: har o'quvchi+guruh bo'yicha oxirgi darslardan boshlab sanaladi
async function absenceRisk(base: string, headers: Record<string, string>, days = 21) {
  const to = new Date(), from = new Date(Date.now() - days * 86400_000);
  const rows = await attendance(base, headers, ['attended', 'reasonable', 'unreasonable'], from.toISOString(), to.toISOString());
  const by = new Map<string, any[]>();
  rows.forEach(r => { const k = `${r.studentId}|${r.groupId}`; (by.get(k) || by.set(k, []).get(k)!).push(r); });
  const out: any[] = [];
  for (const list of by.values()) {
    list.sort((a, b) => new Date(b.lessonDate).getTime() - new Date(a.lessonDate).getTime());
    if (list[0].sgState && list[0].sgState !== 'active') continue;
    let streak = 0, unr = 0;
    for (const r of list) { if (r.state === 'attended') break; streak++; if (r.state === 'unreasonable') unr++; }
    if (streak >= 2) out.push({ ...list[0], streak, unreasonable: unr, dates: list.slice(0, streak).map(r => r.lessonDate) });
  }
  return out.sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));
}

async function commentsFor(base: string, headers: Record<string, string>, ids: string[], limit = 5) {
  const out: Record<string, any[]> = {};
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 150);
  for (let i = 0; i < uniq.length; i += 8) {
    await Promise.all(uniq.slice(i, i + 8).map(async id => {
      try {
        const r = await postJson(base, headers, '/comments-pagin', { studentId: id, page: 1, limit });
        const list = Array.isArray(r?.data?.data) ? r.data.data : [];
        out[id] = list.map((c: any) => ({ text: c.text || '', by: fullName(c.moderator), at: c.createdAt || c.updatedAt }));
      } catch { out[id] = []; }
    }));
  }
  return out;
}

// O'qituvchi hisoboti: guruhlar, aktiv, kelgan, ketgan (arxiv), bitirgan, konversiya (sinov → guruh)
async function teacherReport(base: string, headers: Record<string, string>, b: any) {
  const from = new Date(b.fromDate).getTime(), to = new Date(b.toDate).getTime();
  const inP = (d: any) => { const t = d ? new Date(d).getTime() : NaN; return t >= from && t <= to; };
  const [ts, trials, emps] = await Promise.all([
    pageAll(base, headers, '/teacher-students-pagin', b.teacherId ? { teacherId: b.teacherId } : {}, 200, 40),
    pageAll(base, headers, '/attendance-histoy-pagin', { state: 'trial', fromDate: b.fromDate, toDate: b.toDate, ...(b.teacherId ? { teacherId: b.teacherId } : {}) }, 200, 20).catch(() => []),
    employees(base, headers).catch(() => [])
  ]);
  const T = new Map<string, any>();
  const get = (t: any) => {
    const id = t?._id || 'none';
    if (!T.has(id)) T.set(id, { teacherId: id, name: fullName(t) || '—', phone: t?.phoneNumber || '', groups: new Map<string, { name: string; active: number }>(), active: 0, joined: [], left: [], graduated: [], frozen: 0, trials: new Set<string>(), converted: new Set<string>(), startSet: new Set<string>(), endSet: new Set<string>(), stInfo: new Map<string, any>() });
    return T.get(id);
  };
  // Berilgan vaqtda guruhda aktiv bo'lganmi (qo'shilgan va hali chiqmagan)
  const endT = Math.min(to, Date.now());
  const ts0 = (d: any) => (d ? new Date(d).getTime() : NaN);
  const activeAt = (g: any, T: number) => {
    const j = ts0(g.joinedAt);
    if (!(j <= T)) return false;
    if (g.state === 'active') return true;
    if (g.state === 'frozen') return true;
    const end = ts0(g.leftAt || g.graduatedAt || g.archivedAt);
    return Number.isFinite(end) ? end > T : false;
  };
  const cStart = new Set<string>(), cEnd = new Set<string>(), cJoined = new Set<string>(), cLeft = new Set<string>(), cGrad = new Set<string>();
  for (const row of ts) {
    if (b.teacherId && row.teacher?._id !== b.teacherId) continue;
    const t = get(row.teacher);
    const st = { id: row.student?._id, name: fullName(row.student), phone: row.student?.phoneNumber || '', uuid: row.student?.uuid || '' };
    t.stInfo.set(st.id, st);
    let isActive = false;
    for (const g of row.groups || []) {
      if (activeAt(g, from)) { t.startSet.add(st.id); cStart.add(st.id); }
      if (activeAt(g, endT)) { t.endSet.add(st.id); cEnd.add(st.id); }
      if (inP(g.joinedAt)) cJoined.add(st.id);
      if ((g.state === 'left' || g.state === 'archive') && inP(g.leftAt || g.archivedAt)) cLeft.add(st.id);
      if (g.state === 'graduated' && inP(g.graduatedAt)) cGrad.add(st.id);
      const gname = g.group?.name || '—';
      const gi = t.groups.get(g.group?._id) || { name: gname, active: 0 };
      if (g.state === 'active') { gi.active++; isActive = true; }
      if (g.state === 'frozen') t.frozen++;
      t.groups.set(g.group?._id, gi);
      const leftAt = g.leftAt || g.archivedAt;
      if (inP(g.joinedAt)) t.joined.push({ ...st, group: gname, date: g.joinedAt, price: g.price || 0, state: g.state });
      if ((g.state === 'left' || g.state === 'archive') && inP(leftAt)) t.left.push({ ...st, group: gname, date: leftAt, price: g.price || 0, reason: g.reason || g.leftReason || '' });
      if (g.state === 'graduated' && inP(g.graduatedAt)) t.graduated.push({ ...st, group: gname, date: g.graduatedAt });
    }
    if (isActive) t.active++;
  }
  const joinedByTeacher = new Map<string, Set<string>>();
  const cTrials = new Set<string>(), cConv = new Set<string>();
  // O'quvchi → mas'ul menejer (soatlik sinxron nusxasidan)
  const modOf = new Map<string, { id: string; name: string }>();
  for (let fromRow = 0; fromRow < 20000; fromRow += 1000) {
    const { data } = await admin.from('crm_edu_students').select('id,mod:data->moderator').range(fromRow, fromRow + 999);
    (data || []).forEach((r: any) => { if (r.mod?._id) modOf.set(r.id, { id: r.mod._id, name: String(r.mod.fullName || fullName(r.mod)).trim() }); });
    if (!data || data.length < 1000) break;
  }
  const M = new Map<string, any>();
  const mgr = (m: { id: string; name: string } | undefined) => {
    const k = m?.id || 'none';
    if (!M.has(k)) M.set(k, { id: k, name: m?.name || '—', trials: new Set<string>(), converted: new Set<string>(), newStudents: 0, left: 0 });
    return M.get(k);
  };
  T.forEach((t, id) => joinedByTeacher.set(id, new Set(t.joined.map((j: any) => j.id))));
  for (const a of trials) {
    const tid = a.teacher?._id || a.teacherId;
    if (b.teacherId && tid !== b.teacherId) continue;
    const t = get(a.teacher || { _id: tid });
    const sid = a.student?._id || a.studentId;
    t.trials.add(sid); cTrials.add(sid);
    if (joinedByTeacher.get(tid)?.has(sid)) { t.converted.add(sid); cConv.add(sid); }
    const mm = mgr(a.moderator?._id ? { id: a.moderator._id, name: fullName(a.moderator) } : modOf.get(sid));
    mm.trials.add(sid);
    if (cJoined.has(sid)) mm.converted.add(sid);
  }
  const empPhone = new Map(emps.map((e: any) => [e.id, e.phone]));
  const teachers = [...T.values()].filter(t => t.teacherId !== 'none' && (t.active || t.joined.length || t.left.length || t.trials.size)).map(t => ({
    teacherId: t.teacherId, name: t.name, phone: t.phone || empPhone.get(t.teacherId) || '',
    groups: [...t.groups.values()].filter((g: any) => g.active > 0).map((g: any) => `${g.name} (${g.active})`),
    active: t.active, frozen: t.frozen, joined: t.joined, left: t.left, graduated: t.graduated,
    trials: t.trials.size, converted: t.converted.size, conversion: t.trials.size ? Math.round((t.converted.size / t.trials.size) * 100) : null,
    // Oy boshida → hozir (yoki davr oxirida)
    start: t.startSet.size, now: t.endSet.size, delta: t.endSet.size - t.startSet.size,
    leftActive: [...t.startSet].filter((id: string) => !t.endSet.has(id)).map((id: string) => t.stInfo.get(id)),
    newActive: [...t.endSet].filter((id: string) => !t.startSet.has(id)).length
  })).filter(t => t.start || t.now || t.joined.length || t.left.length || t.trials).sort((a, b) => b.now - a.now);
  // 🆕 Yangi talabalar: markazga birinchi marta shu davrda qo'shilganlar
  const first = new Map<string, any>();
  // Talabaning hozirgi holati — barcha guruhlari bo'yicha (guruh almashtirgan bo'lsa ham)
  const nowInfo = new Map<string, { active: boolean; group: string; teacher: string; leftAt: number; reason: string; leftGroup: string }>();
  for (const row of ts) for (const g of row.groups || []) {
    const sid = row.student?._id;
    if (!sid) continue;
    const ni = nowInfo.get(sid) || { active: false, group: '', teacher: '', leftAt: 0, reason: '', leftGroup: '' };
    if (g.state === 'active' || g.state === 'frozen') { ni.active = true; ni.group = g.group?.name || ni.group; ni.teacher = fullName(row.teacher) || ni.teacher; }
    const la = ts0(g.leftAt || g.graduatedAt);
    if (Number.isFinite(la) && la > ni.leftAt) { ni.leftAt = la; ni.reason = g.reason || ''; ni.leftGroup = g.group?.name || ''; }
    nowInfo.set(sid, ni);
  }
  for (const row of ts) for (const g of row.groups || []) {
    const sid = row.student?._id, j = ts0(g.joinedAt);
    if (!sid || !Number.isFinite(j)) continue;
    const cur = first.get(sid);
    if (!cur || j < cur.j) first.set(sid, { j, sid, name: fullName(row.student), phone: row.student?.phoneNumber || '', group: g.group?.name || '', teacher: fullName(row.teacher), price: g.price || 0, state: g.state });
  }
  const newStudents = [...first.values()].filter(x => x.j >= from && x.j <= to).sort((a, b) => b.j - a.j)
    .map(x => {
      const m = modOf.get(x.sid); mgr(m).newStudents++;
      const ni = nowInfo.get(x.sid);
      const active = !!ni?.active;
      return { id: x.sid, name: x.name, phone: x.phone, group: active && ni?.group ? ni.group : x.group, teacher: active && ni?.teacher ? ni.teacher : x.teacher, firstGroup: x.group,
        date: new Date(x.j).toISOString(), price: x.price, state: active ? 'active' : 'left', manager: m?.name || '—', managerId: m?.id || null,
        leftAt: !active && ni?.leftAt ? new Date(ni.leftAt).toISOString() : null, reason: !active ? ni?.reason || '' : '', leftGroup: !active ? ni?.leftGroup || '' : '' };
    });
  for (const id of cLeft) mgr(modOf.get(id)).left++;
  const managers = [...M.values()].filter(m => m.id !== 'none' && (m.trials.size || m.newStudents)).map(m => ({
    id: m.id, name: m.name, trials: m.trials.size, converted: m.converted.size, conversion: m.trials.size ? Math.round((m.converted.size / m.trials.size) * 100) : null, newStudents: m.newStudents, left: m.left
  })).sort((a, b) => b.newStudents - a.newStudents);
  const center = {
    newStudents: newStudents.length,
    start: cStart.size, now: cEnd.size, delta: cEnd.size - cStart.size,
    joined: cJoined.size, left: cLeft.size, graduated: cGrad.size,
    leftActive: [...cStart].filter(id => !cEnd.has(id)).length, newActive: [...cEnd].filter(id => !cStart.has(id)).length,
    trials: cTrials.size, converted: cConv.size, conversion: cTrials.size ? Math.round((cConv.size / cTrials.size) * 100) : null,
    teachers: teachers.length
  };
  return { ok: true, fromDate: b.fromDate, toDate: b.toDate, endAt: new Date(endT).toISOString(), center, teachers, newStudents, managers };
}

// 📩 SMS: Edutizim integratsiyasi orqali (Eskiz va h.k.)
async function smsMeta(base: string, headers: Record<string, string>, raw = false) {
  const [integ, dev, tpl] = await Promise.all([
    postJson(base, headers, '/integrations', { isActive: true, service: 'sms' }).catch(e => ({ error: String(e) })),
    postJson(base, headers, '/sms-devices', { state: 'active' }).catch(e => ({ error: String(e) })),
    postJson(base, headers, '/sms-templates-pagin', { page: 1, limit: 50 }).catch(e => ({ error: String(e) }))
  ]);
  const L = (o: any) => (Array.isArray(o?.data) ? o.data : Array.isArray(o?.data?.data) ? o.data.data : []);
  return {
    integrations: L(integ).map((x: any) => ({ id: x._id, name: x.name || x.type || x.provider || 'SMS', type: x.type || x.provider || '' })),
    devices: L(dev).map((x: any) => ({ id: x._id, name: x.name || x.phoneNumber || 'Qurilma' })),
    templates: L(tpl).map((x: any) => ({ id: x._id, name: x.name || x.title || '', content: x.content || x.text || '' })),
    ...(raw ? { raw: { integ: JSON.stringify(integ).slice(0, 800), dev: JSON.stringify(dev).slice(0, 500), tpl: JSON.stringify(tpl).slice(0, 1200) } } : {})
  };
}
// Bir xil matn — bitta so'rov; shaxsiy matn (ism/qarz) — har biriga alohida
async function sendSms(base: string, headers: Record<string, string>, b: any) {
  const target = { toStudent: b.to !== 'parent', toParent: b.to === 'parent' || b.to === 'both' };
  const common = { integrationId: b.integrationId || null, ...(b.smsDeviceIds?.length ? { smsDeviceIds: b.smsDeviceIds } : {}), ...target };
  const msgs: { ids: string[]; content: string }[] = Array.isArray(b.messages) ? b.messages.map((m: any) => ({ ids: [m.studentId], content: String(m.content || '').slice(0, 900) }))
    : [{ ids: (b.studentIds || []).slice(0, 500), content: String(b.content || '').slice(0, 900) }];
  let sent = 0, failed = 0; const errors: string[] = [];
  for (let i = 0; i < msgs.length; i += 5) {
    await Promise.all(msgs.slice(i, i + 5).map(async m => {
      if (!m.ids.length || !m.content) return;
      try { const r = await postJson(base, headers, '/sms', { ...common, studentIds: m.ids, content: m.content }); if (r?.code && r.code !== 0) throw new Error(r.message); sent += m.ids.length; }
      catch (e) { failed += m.ids.length; if (errors.length < 3) errors.push(String((e as Error).message || e).slice(0, 160)); }
    }));
  }
  await admin.from('crm_sync_log').insert({ source: 'edutizim-sms', ok: failed === 0, message: `SMS: ${sent} yuborildi, ${failed} xato · ${b.by || ''}`.slice(0, 300), stats: { sent, failed, errors, to: b.to, sample: msgs[0]?.content?.slice(0, 200) } });
  return { ok: sent > 0 && failed === 0, sent, failed, errors };
}

// 🔔 Kassa qo'ng'iroqchalari (shift-bells): guruhdan chiqqan yoki narxi o'zgargan o'quvchilar
async function bells(base: string, headers: Record<string, string>) {
  const list = await pageAll(base, headers, '/shift-bells-pagin', {}, 100, 10);
  return list.map((b: any) => ({
    id: b._id, type: b.oldPrice !== undefined || b.newPrice !== undefined ? 'price' : 'left',
    studentId: b.student?._id, name: fullName(b.student), phone: b.student?.phoneNumber || '', groupId: b.group?._id, group: b.group?.name || '',
    oldPrice: b.oldPrice ?? null, newPrice: b.newPrice ?? null, leftAt: b.leftAt || null, joinedAt: b.joinedAt || null, reason: b.leftReason || b.reason || ''
  }));
}
// 💲 Narx nazorati: guruhdoshlari to'laydigan narxdan (guruh me'yori) farq qiladigan aktiv o'quvchilar
async function priceAudit(base: string, headers: Record<string, string>, branchId: string) {
  const [ts, courses, groups] = await Promise.all([
    pageAll(base, headers, '/teacher-students-pagin', {}, 200, 40),
    pageAll(base, headers, '/courses-pagin', {}, 100, 5).catch(() => []),
    pageAll(base, headers, '/group-pagin', {}, 100, 10).catch(() => [])
  ]);
  const coursePrice = new Map<string, { name: string; price: number | null }>();
  courses.forEach((c: any) => coursePrice.set(c._id, { name: c.name, price: (c.branches || []).find((b: any) => b.branchId === branchId)?.price ?? null }));
  const groupCourse = new Map<string, string>();
  groups.forEach((g: any) => groupCourse.set(g._id, g.courseId || g.course?._id));
  const byGroup = new Map<string, any[]>();
  for (const row of ts) for (const g of row.groups || []) {
    if (g.state !== 'active') continue;
    const gid = g.group?._id;
    (byGroup.get(gid) || byGroup.set(gid, []).get(gid)!).push({ studentId: row.student?._id, name: fullName(row.student), phone: row.student?.phoneNumber || '', teacher: fullName(row.teacher), groupId: gid, group: g.group?.name || '', price: Number(g.price) || 0, joinedAt: g.joinedAt });
  }
  const out: any[] = [];
  for (const [gid, list] of byGroup) {
    const freq = new Map<number, number>();
    list.forEach(x => freq.set(x.price, (freq.get(x.price) || 0) + 1));
    const [norm, normCount] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];
    const course = coursePrice.get(groupCourse.get(gid) || '');
    const expected = normCount >= 2 ? norm : (course?.price ?? norm);
    for (const x of list) if (x.price !== expected) out.push({ ...x, expected, coursePrice: course?.price ?? null, course: course?.name || '', groupSize: list.length, normCount, discount: /\d+\s*%|chegirma|aka-?uka|opa-?singil/i.test(x.name) });
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}
async function deleteBell(base: string, headers: Record<string, string>, id: string) {
  const res = await fetch(`${base}/shift-bell/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
  const out = await res.json().catch(() => ({}));
  return res.ok && (!out?.code || out.code === 0) ? { ok: true } : { ok: false, error: `${res.status} ${out?.message || ''}`.trim() };
}

async function kassaCancel(base: string, headers: Record<string, string>, b: any) {
  if (!b.transactionId) return { ok: false, error: 'transactionId kerak' };
  const res = await fetch(`${base}/cashbox/transaction/cancel`, { method: 'POST', headers, body: JSON.stringify({ transactionId: b.transactionId }) });
  const out = await res.json().catch(() => ({}));
  const ok = res.ok && (!out?.code || out.code === 0);
  await admin.from('crm_sync_log').insert({ source: 'edutizim-kassa', ok, message: `bekor ${b.transactionId}`, stats: { by: b.by || null, response: ok ? null : out } });
  return ok ? { ok: true } : { ok: false, error: `${res.status} ${out?.message || ''}`.trim() };
}

// =========================================================
// 📅 "To'lov sanasi" (paymentDate): balans 0 ga tushgan kun (qarzdor/0) yoki pul tugaydigan kun (musbat balans)
//   GET /student/transactions-pagin {studentId}  — beforeAmount/afterAmount bilan balans tarixi
//   GET /student-list/student/:id → PUT /student-list/student (Edutizim saytining tahrirlash formasi kabi to'liq karta)
// =========================================================
const TZH = 5 * 3600_000;
const localDay = (iso: string | number | Date) => new Date(new Date(iso).getTime() + TZH).toISOString().slice(0, 10);
const dayIso = (d: string) => new Date(`${d}T00:00:00+05:00`).toISOString(); // Edutizim formasi saqlagandek (mahalliy yarim tun)

function pastZeroDay(tx: any[]) {
  const list = [...tx].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  let cand: any = null;
  list.forEach((t, i) => {
    const before = Number(t.beforeAmount), after = Number(t.afterAmount);
    if (!Number.isFinite(after)) return;
    if (after <= 0 && (before > 0 || i === 0)) cand = t;
  });
  if (!cand) return null;
  return cand.lesson?.date ? String(cand.lesson.date).slice(0, 10) : localDay(cand.actualDate || cand.createdAt);
}

function futureZeroDay(balance: number, groups: { price: number; days: number[]; endsAt?: string | null; chargedToday: boolean }[], today: string) {
  const g = groups.filter(x => x.price > 0 && x.days.length);
  if (!g.length) return null;
  let b = balance;
  const t0 = new Date(`${today}T00:00:00Z`).getTime();
  for (let i = 0; i < 400; i++) {
    const d = new Date(t0 + i * 86400_000), ds = d.toISOString().slice(0, 10), wd = d.getUTCDay() + 1; // 1 = yakshanba
    for (const x of g) {
      if (!x.days.includes(wd) || (i === 0 && x.chargedToday) || (x.endsAt && ds > String(x.endsAt).slice(0, 10))) continue;
      b -= x.price;
      if (b <= 0) return ds;
    }
  }
  return null;
}

function studentPutPayload(s: any, paymentDate: string | null) {
  const a = s.additional || {}, p = s.parent || {};
  const idOf = (v: any) => (v && typeof v === 'object' ? v._id ?? v.value ?? null : v ?? null);
  return {
    customFields: (Array.isArray(s.customFields) ? s.customFields : []).filter((x: any) => x?._id && x.value !== undefined).map((x: any) => ({ _id: x._id, value: x.value })),
    _id: s._id, firstName: s.firstName ?? null, lastName: s.lastName ?? null, email: s.email ?? null,
    birthdate: s.birthdate ?? null, paymentDate, phoneNumber: s.phoneNumber ?? null,
    phoneVerified: true, skipPhoneVerify: true,
    moderatorId: idOf(s.moderator) ?? s.moderatorId ?? null, lessonType: idOf(s.lessonType), categoryId: idOf(s.category) ?? s.categoryId ?? null,
    language: idOf(s.language), surveyId: idOf(s.survey) ?? s.surveyId ?? null,
    additional: { homeAddress: a.homeAddress ?? null, targetUniversity: a.targetUniversity ?? null, organization: a.organization ?? null, comment: a.comment ?? null },
    parent: { fatherName: p.fatherName ?? null, fatherPhoneNumber: p.fatherPhoneNumber ?? null, fatherJob: p.fatherJob ?? null, motherName: p.motherName ?? null, motherPhoneNumber: p.motherPhoneNumber ?? null, motherJob: p.motherJob ?? null },
    tagIds: (s.tags || s.tagIds || []).map((t: any) => idOf(t)).filter(Boolean)
  };
}

async function getStudent(base: string, headers: Record<string, string>, id: string) {
  const r = await fetch(`${base}/student-list/student/${encodeURIComponent(id)}`, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?._id) throw new Error(`student ${r.status} ${j?.message || ''}`.trim());
  return j.data;
}

// 💳 To'lov rejasi: har bir o'quvchining faol guruhlari, 1 dars narxi va dars kunlari (bot "oy oxirigacha" hisobi uchun)
async function savePayPlan(base: string, headers: Record<string, string>) {
  const ts = await pageAll(base, headers, '/teacher-students-pagin', {}, 200, 40);
  const { data: grs } = await admin.from('crm_edu_groups').select('id,name,days:data->courseDay->days,endsAt:data->endsAt');
  const gmap = new Map((grs || []).map((g: any) => [g.id, g]));
  const plan = new Map<string, any[]>();
  for (const row of ts) for (const g of row.groups || []) {
    const sid = row.student?._id, gid = g.group?._id;
    if (!sid || !gid || g.state !== 'active') continue;
    const gr: any = gmap.get(gid) || {};
    const list = plan.get(sid) || plan.set(sid, []).get(sid)!;
    if (!list.some(x => x.gid === gid)) list.push({ gid, name: g.group?.name || gr.name || '', price: Number(g.price) || 0, days: Array.isArray(gr.days) ? gr.days.map(Number) : [], endsAt: gr.endsAt || null });
  }
  const now = new Date().toISOString();
  const rows = [...plan].map(([student_id, groups]) => ({ student_id, groups, updated_at: now }));
  for (let i = 0; i < rows.length; i += 500) await admin.from('crm_edu_pay_plan').upsert(rows.slice(i, i + 500));
  // Endi hech qaysi faol guruhda bo'lmaganlar — rejasi bo'shatiladi
  if (rows.length) await admin.from('crm_edu_pay_plan').update({ groups: [], updated_at: now }).lt('updated_at', now);
  return rows.length;
}

async function paymentDates(base: string, headers: Record<string, string>, b: any) {
  const today = localDay(Date.now());
  const runId = String(b.runId || `pd-${today}`);
  // Faqat faol guruhda o'qiyotganlar (groupsCount eskirgan bo'lishi mumkin — groupsList holatiga qaraymiz)
  let q = admin.from('crm_edu_students').select('id,full_name,data').gt('data->>groupsCount', '0').order('id').limit(5000);
  if (Array.isArray(b.ids) && b.ids.length) q = q.in('id', b.ids.map(String));
  const { data: all, error } = await q;
  if (error) throw error;
  const act = (all || []).filter((x: any) => (x.data?.groupsList || []).some((g: any) => g?.state === 'active'));
  const off = Number(b.offset) || 0;
  const studs = b.ids?.length ? act : act.slice(off, off + Math.min(Number(b.limit) || 20, 60));
  // Guruh narxi (1 dars) va holati — /teacher-students-pagin; dars kunlari — CRM'dagi guruh nusxasi
  const ts = await pageAll(base, headers, '/teacher-students-pagin', {}, 200, 40);
  const price = new Map<string, { gid: string; price: number; state: string }[]>();
  for (const row of ts) for (const g of row.groups || []) {
    const sid = row.student?._id; if (!sid) continue;
    (price.get(sid) || price.set(sid, []).get(sid)!).push({ gid: g.group?._id, price: Number(g.price) || 0, state: g.state });
  }
  const { data: grs } = await admin.from('crm_edu_groups').select('id,days:data->courseDay->days,endsAt:data->endsAt,state:data->state');
  const gmap = new Map((grs || []).map((g: any) => [g.id, g]));
  const out: any[] = [];
  for (const st of studs || []) {
    const sid = String(st.id), bal = Number(st.data?.balance) || 0, old = st.data?.paymentDate || null;
    const row: any = { run_id: runId, student_id: sid, full_name: st.full_name, balance: bal, old_date: old };
    try {
      const tx = await pageAll(base, headers, '/student/transactions-pagin', { studentId: sid }, 200, 30);
      let day: string | null;
      if (bal <= 0) { row.kind = 'past'; day = pastZeroDay(tx); }
      else {
        row.kind = 'future';
        const charged = new Set(tx.filter((t: any) => t.type === 'attendance' && t.lesson?.date && String(t.lesson.date).slice(0, 10) === today).map((t: any) => t.group?._id));
        const gs = (price.get(sid) || []).filter(x => x.state === 'active').map(x => {
          const g: any = gmap.get(x.gid) || {};
          // Narx 0 bo'lsa — shu guruh uchun oxirgi dars yechimi
          const last = [...tx].reverse().find((t: any) => t.type === 'attendance' && t.group?._id === x.gid && Number(t.amount) < 0);
          return { price: x.price || Math.abs(Number(last?.amount) || 0), days: Array.isArray(g.days) ? g.days.map(Number) : [], endsAt: g.endsAt || null, chargedToday: charged.has(x.gid) };
        });
        day = futureZeroDay(bal, gs, today);
      }
      row.new_date = day;
      if (!day) { row.ok = false; row.error = 'sanani aniqlab bo‘lmadi'; }
      else if (old && localDay(old) === day) { row.ok = true; row.error = 'o‘zgarmagan'; }
      else if (b.write) {
        const cur = await getStudent(base, headers, sid);
        const payload = studentPutPayload(cur, dayIso(day));
        const r = await fetch(`${base}/student-list/student`, { method: 'PUT', headers, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        row.ok = r.ok && (!j?.code || j.code === 0);
        if (!row.ok) row.error = `${r.status} ${j?.message || JSON.stringify(j).slice(0, 200)}`.trim();
        if (b.verify) { row._before = cur; row._after = await getStudent(base, headers, sid); row._payload = payload; }
      } else row.ok = null;
    } catch (e) { row.ok = false; row.error = String((e as Error).message || e).slice(0, 300); }
    const { _before, _after, _payload, ...log } = row;
    if (b.write) await admin.from('crm_edu_paydate_log').insert(log);
    out.push(b.verify ? row : log);
  }
  return { ok: true, runId, today, total: act.length, count: out.length, written: out.filter(r => r.ok && !r.error).length, rows: out };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const cronSecret = await getSecret('cron_secret');
  const viaCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  const role = viaCron ? 'cron' : await callerRole(req);
  if (!['admin', 'operator', 'cron'].includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
  const body = await req.json().catch(() => ({}));

  const base = (await getSecret('edutizim_base_url')) || DEFAULT_BASE;
  const site = (await getSecret('edutizim_site_url')) || DEFAULT_SITE;
  const phone = await getSecret('edutizim_login');
  const password = await getSecret('edutizim_password');
  if (!phone || !password) return json({ ok: false, error: 'Edutizim login (telefon) va parol kiritilmagan' });

  const started = Date.now();
  try {
    // Yozuvchi amallar xodimning shaxsiy Edutizim akkaunti orqali (bo'lsa) — Edutizim'da uning nomi bilan tushadi
    const WRITE = new Set(['comment', 'kassaPay', 'kassaCancel', 'sendSms', 'changePrice', 'bellDelete', 'pushLead']);
    let personalAcc: any = null, personalErr = '';
    if (role === 'cron' && WRITE.has(body.action) && (body.asTg || body.asPhone)) {
      let digits = body.asPhone ? String(body.asPhone).replace(/\D/g, '').slice(-9) : '';
      if (!digits && body.asTg) {
        const { data: u } = await admin.from('crm_edu_bot_users').select('phone').eq('tg_id', Number(body.asTg)).maybeSingle();
        digits = String(u?.phone || '').replace(/\D/g, '').slice(-9);
      }
      if (digits) { const { data: a } = await admin.from('crm_edu_accounts').select('*').eq('phone_digits', digits).maybeSingle(); personalAcc = a; }
    }
    if (body.action === 'linkAccount') {
      if (role !== 'cron') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
      const digits = String(body.phone || '').replace(/\D/g, '').slice(-9);
      if (digits.length !== 9 || !body.password) return json({ ok: false, error: 'Telefon va parol kerak' });
      try { await login(base, site, '+998' + digits, String(body.password)); }
      catch (e) { return json({ ok: false, error: String((e as Error).message || e) }); }
      await admin.from('crm_edu_accounts').upsert({ phone_digits: digits, phone: '+998' + digits, password: String(body.password), tg_id: body.tgId || null, full_name: body.name || null, ok: true, checked_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (body.action === 'unlinkAccount') {
      if (role !== 'cron') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
      const digits = String(body.phone || '').replace(/\D/g, '').slice(-9);
      await admin.from('crm_edu_accounts').delete().eq('phone_digits', digits);
      return json({ ok: true });
    }
    if (body.action === 'accountStatus') {
      const digits = String(body.phone || '').replace(/\D/g, '').slice(-9);
      const { data: a } = await admin.from('crm_edu_accounts').select('phone,ok,checked_at').eq('phone_digits', digits).maybeSingle();
      return json({ ok: true, linked: !!a, phone: a?.phone || null, checkedAt: a?.checked_at || null });
    }
    let auth: any = null;
    if (personalAcc) {
      try { auth = await login(base, site, personalAcc.phone, personalAcc.password); }
      catch (e) { personalErr = String((e as Error).message || e); await admin.from('crm_edu_accounts').update({ ok: false, checked_at: new Date().toISOString() }).eq('phone_digits', personalAcc.phone_digits); }
    }
    const personal = !!auth;
    // "Menejer nomidan yozilsin" — shaxsiy akkaunt bo'lmasa umumiy akkauntga o'tmaymiz, hech narsa yozilmaydi
    if (body.requirePersonal && WRITE.has(body.action) && !personal) {
      return json({ ok: false, needAccount: true, error: personalErr ? `Shaxsiy Edutizim akkauntiga kirib bo‘lmadi: ${personalErr}` : 'Shaxsiy Edutizim akkaunti ulanmagan' });
    }
    if (!auth) auth = await login(base, site, phone, password);
    const branches: { id: string; name: string }[] = auth.branches.map((b: any) => ({ id: String(b._id), name: b.name }));
    if (body.action === 'test') return json({ ok: true, branches });
    // 'cron' roli = ichki chaqiruv (pg_cron yoki Telegram bot admin bo'limi, x-cron-secret bilan)
    if (['meta', 'pushLead', 'kassaMeta', 'kassaPay', 'kassaCancel', 'kassaTx', 'read', 'employees', 'absences', 'absenceRisk', 'commentsFor', 'comment', 'teacherReport', 'smsMeta', 'sendSms', 'bells', 'bellDelete', 'priceAudit', 'changePrice', 'paymentDates'].includes(body.action)) {
      const br = body.branchId ? branches.find(b => b.id === body.branchId) : branches[0];
      if (!br) throw new Error('Filial topilmadi');
      const headers = { ...baseHeaders(site), Authorization: `Bearer ${auth.token}`, branch: br.id };
      if (body.action === 'meta') return json({ ok: true, branch: br, ...(await eduMeta(base, headers)), defaults: await getSetting('eduLeadDefaults', {}) });
      if (body.action === 'kassaMeta') return json({ ok: true, branch: br, ...(await kassaMeta(base, headers, !!body.raw)) });
      if (body.action === 'kassaPay') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        return json(await kassaPay(base, headers, body));
      }
      if (body.action === 'kassaTx') return json(await kassaTx(base, headers, body));
      if (body.action === 'read') return json(await eduRead(base, headers, body));
      if (body.action === 'employees') return json({ ok: true, employees: await employees(base, headers) });
      if (body.action === 'absences') return json({ ok: true, rows: await attendance(base, headers, ['reasonable', 'unreasonable'], body.fromDate, body.toDate) });
      if (body.action === 'absenceRisk') return json({ ok: true, rows: await absenceRisk(base, headers, Number(body.days) || 21) });
      if (body.action === 'commentsFor') return json({ ok: true, comments: await commentsFor(base, headers, body.studentIds || [], Math.min(Number(body.limit) || 5, 20)) });
      if (body.action === 'teacherReport') return json(await teacherReport(base, headers, body));
      if (body.action === 'bells') return json({ ok: true, bells: await bells(base, headers) });
      if (body.action === 'priceAudit') return json({ ok: true, rows: await priceAudit(base, headers, br.id) });
      if (body.action === 'bellDelete' || body.action === 'changePrice') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        let r: any;
        if (body.action === 'bellDelete') r = await deleteBell(base, headers, String(body.id || ''));
        else {
          const price = Math.round(Number(body.price) || 0);
          if (!body.studentId || !body.groupId || price <= 0) return json({ ok: false, error: 'studentId, groupId va narx kerak' });
          const out = await postJson(base, headers, '/group-student-change-price', { studentId: body.studentId, groupId: body.groupId, price });
          r = { ok: !out?.code || out.code === 0 };
        }
        await admin.from('crm_sync_log').insert({ source: 'edutizim-fix', ok: !!r.ok, message: `${body.action} ${body.id || body.studentId || ''} ${body.price || ''} · ${body.by || ''}`.slice(0, 300) });
        return json(r);
      }
      if (body.action === 'paymentDates') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        return json(await paymentDates(base, headers, body));
      }
      if (body.action === 'smsMeta') return json({ ok: true, ...(await smsMeta(base, headers, !!body.raw)) });
      if (body.action === 'sendSms') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        return json(await sendSms(base, headers, body));
      }
      if (body.action === 'comment') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        const raw = String(body.text || '').trim().slice(0, 1000);
        if (!body.studentId || !raw) return json({ ok: false, error: 'studentId va matn kerak' });
        const text = personal ? raw : `${body.prefix || ''}${raw}`.slice(0, 1000);
        const r = await postJson(base, headers, '/comment', { studentId: body.studentId, text });
        return json({ ok: !r?.code, id: r?.data?._id || null, personal, personalErr: personalErr || undefined });
      }
      if (body.action === 'kassaCancel') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        return json(await kassaCancel(base, headers, body));
      }
      let userId: string | null = null;
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
      if (jwt) { const { data: u } = await admin.auth.getUser(jwt); userId = u?.user?.id || null; }
      return json({ ...(await pushLeads(base, headers, body, userId)), personal });
    }
    if (!branches.length) throw new Error('Hisobga filial biriktirilmagan');

    const sRows: any[] = [];
    const gRows: any[] = [];
    const now = new Date().toISOString();
    const targets = body.branchId ? branches.filter(b => b.id === body.branchId) : branches;
    for (const br of targets) {
      const headers = { ...baseHeaders(site), Authorization: `Bearer ${auth.token}`, branch: br.id };
      const students = await fetchAll(base, '/student-list/students-pagin', headers);
      const groups = await fetchAll(base, '/group-pagin', headers).catch(() => []);
      students.forEach(s => sRows.push({
        id: String(s._id ?? s.uuid),
        full_name: nameOf(s),
        phone: phoneOf(s),
        groups: groupsOf(s),
        data: { ...s, _branch: br },
        synced_at: now
      }));
      groups.forEach(g => gRows.push({ id: String(g._id), name: g.name || '', data: { ...g, _branch: br }, synced_at: now }));
    }
    for (let i = 0; i < sRows.length; i += 500) {
      const { error } = await admin.from('crm_edu_students').upsert(sRows.slice(i, i + 500));
      if (error) throw error;
    }
    for (let i = 0; i < gRows.length; i += 500) {
      const { error } = await admin.from('crm_edu_groups').upsert(gRows.slice(i, i + 500));
      if (error) throw error;
    }
    let payPlan: number | string = 0;
    try { payPlan = await savePayPlan(base, { ...baseHeaders(site), Authorization: `Bearer ${auth.token}`, branch: targets[0].id }); } catch (e) { payPlan = String((e as Error).message || e).slice(0, 120); }
    const stats = { students: sRows.length, groups: gRows.length, payPlan, branches: targets.map(b => b.name), ms: Date.now() - started, by: role };
    await admin.from('crm_sync_log').insert({ source: 'edutizim', ok: true, message: `${sRows.length} o‘quvchi, ${gRows.length} guruh (${targets.map(b => b.name).join(', ')})`, stats });
    return json({ ok: true, ...stats });
  } catch (e) {
    const message = String((e as Error).message || e);
    await admin.from('crm_sync_log').insert({ source: 'edutizim', ok: false, message });
    return json({ ok: false, error: message });
  }
});
