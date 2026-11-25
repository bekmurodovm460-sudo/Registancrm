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
async function kassaCancel(base: string, headers: Record<string, string>, b: any) {
  if (!b.transactionId) return { ok: false, error: 'transactionId kerak' };
  const res = await fetch(`${base}/cashbox/transaction/cancel`, { method: 'POST', headers, body: JSON.stringify({ transactionId: b.transactionId }) });
  const out = await res.json().catch(() => ({}));
  const ok = res.ok && (!out?.code || out.code === 0);
  await admin.from('crm_sync_log').insert({ source: 'edutizim-kassa', ok, message: `bekor ${b.transactionId}`, stats: { by: b.by || null, response: ok ? null : out } });
  return ok ? { ok: true } : { ok: false, error: `${res.status} ${out?.message || ''}`.trim() };
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
    const auth = await login(base, site, phone, password);
    const branches = auth.branches.map((b: any) => ({ id: String(b._id), name: b.name }));
    if (body.action === 'test') return json({ ok: true, branches });
    // 'cron' roli = ichki chaqiruv (pg_cron yoki Telegram bot admin bo'limi, x-cron-secret bilan)
    if (['meta', 'pushLead', 'kassaMeta', 'kassaPay', 'kassaCancel'].includes(body.action)) {
      const br = body.branchId ? branches.find(b => b.id === body.branchId) : branches[0];
      if (!br) throw new Error('Filial topilmadi');
      const headers = { ...baseHeaders(site), Authorization: `Bearer ${auth.token}`, branch: br.id };
      if (body.action === 'meta') return json({ ok: true, branch: br, ...(await eduMeta(base, headers)), defaults: await getSetting('eduLeadDefaults', {}) });
      if (body.action === 'kassaMeta') return json({ ok: true, branch: br, ...(await kassaMeta(base, headers, !!body.raw)) });
      if (body.action === 'kassaPay') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        return json(await kassaPay(base, headers, body));
      }
      if (body.action === 'kassaCancel') {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        return json(await kassaCancel(base, headers, body));
      }
      let userId: string | null = null;
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
      if (jwt) { const { data: u } = await admin.auth.getUser(jwt); userId = u?.user?.id || null; }
      return json(await pushLeads(base, headers, body, userId));
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
    const stats = { students: sRows.length, groups: gRows.length, branches: targets.map(b => b.name), ms: Date.now() - started, by: role };
    await admin.from('crm_sync_log').insert({ source: 'edutizim', ok: true, message: `${sRows.length} o‘quvchi, ${gRows.length} guruh (${targets.map(b => b.name).join(', ')})`, stats });
    return json({ ok: true, ...stats });
  } catch (e) {
    const message = String((e as Error).message || e);
    await admin.from('crm_sync_log').insert({ source: 'edutizim', ok: false, message });
    return json({ ok: false, error: message });
  }
});
