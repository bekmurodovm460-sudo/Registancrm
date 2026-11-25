// Registan.edutizim.uz bilan sinxronlash (login/parol orqali)
// Edutizim frontend API: https://backend.edutizim.uz/moderator-web-api
//   POST /sign-with-password {phoneNumber, password} -> data.token, data.branches[]
//   GET  /student-list/students-pagin, /group-pagin  (Authorization: Bearer, branch: <id>)
import { admin, callerRole, cors, getSecret, json } from '../_shared/common.ts';

const DEFAULT_BASE = 'https://backend.edutizim.uz/moderator-web-api';

async function login(base: string, phone: string, password: string) {
  const digits = phone.replace(/\D/g, '');
  const variants = [...new Set([phone.trim(), '+998' + digits.slice(-9), '998' + digits.slice(-9)])];
  let last = '';
  for (const phoneNumber of variants) {
    const res = await fetch(`${base}/sign-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phoneNumber, password })
    });
    const body = await res.json().catch(() => ({}));
    const token = body?.data?.token;
    if (token) {
      const branches = body?.data?.branches || [];
      return { token, branches, phoneNumber };
    }
    if (body?.data?.isTwoStepVerificationEnabled) {
      throw new Error('Edutizim hisobida 2 bosqichli tasdiqlash (SMS kod) yoqilgan — integratsiya uchun alohida xodim hisobini 2FA siz oching.');
    }
    last = `${res.status} ${body?.message || body?.code || ''}`;
  }
  throw new Error('Edutizimga kirib bo‘lmadi: ' + last);
}

function listFrom(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.data)) return body.data.data;
  if (Array.isArray(body?.data?.docs)) return body.data.docs;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body)) return body;
  return [];
}

async function fetchAll(base: string, path: string, headers: Record<string, string>, extra = '') {
  const seen = new Map<string, any>();
  const limit = 100;
  for (let page = 1; page <= 200; page++) {
    const res = await fetch(`${base}${path}?page=${page}&limit=${limit}&size=${limit}&perPage=${limit}${extra}`, { headers });
    if (res.status === 401) throw new Error('Edutizim sessiyasi rad etildi (401)');
    const body = await res.json().catch(() => ({}));
    const items = listFrom(body);
    let fresh = 0;
    for (const it of items) {
      const id = String(it?._id ?? it?.id ?? it?.uuid ?? '');
      if (id && !seen.has(id)) { seen.set(id, it); fresh++; }
    }
    if (!items.length || !fresh) break;
  }
  return [...seen.values()];
}

const nameOf = (s: any) =>
  s?.fullName || s?.name || [s?.lastName, s?.firstName, s?.middleName].filter(Boolean).join(' ').trim() || s?.firstName || '';
const phoneOf = (s: any) => s?.phoneNumber || s?.phone || s?.parentPhoneNumber || s?.parents?.[0]?.phoneNumber || '';
const groupsOf = (s: any) => {
  const g = s?.groups || s?.group || s?.studentGroups || [];
  const arr = Array.isArray(g) ? g : [g];
  return arr.map((x: any) => x?.name || x?.group?.name || '').filter(Boolean).join(', ');
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const role = await callerRole(req);
  if (!['admin', 'operator'].includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
  const body = await req.json().catch(() => ({}));

  const base = (await getSecret('edutizim_base_url')) || DEFAULT_BASE;
  const phone = await getSecret('edutizim_login');
  const password = await getSecret('edutizim_password');
  if (!phone || !password) return json({ ok: false, error: 'Edutizim login (telefon) va parol kiritilmagan' });

  const started = Date.now();
  try {
    const auth = await login(base, phone, password);
    const branchId = String(body.branchId || auth.branches?.[0]?._id || '');
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${auth.token}` };
    if (branchId) headers.branch = branchId;

    if (body.action === 'test') {
      return json({ ok: true, branches: (auth.branches || []).map((b: any) => ({ id: b._id, name: b.name })) });
    }

    const students = await fetchAll(base, '/student-list/students-pagin', headers);
    const groups = await fetchAll(base, '/group-pagin', headers).catch(() => []);
    const now = new Date().toISOString();

    const sRows = students.map(s => ({
      id: String(s._id ?? s.id ?? s.uuid),
      full_name: nameOf(s),
      phone: phoneOf(s),
      groups: groupsOf(s),
      data: s,
      synced_at: now
    }));
    const gRows = groups.map(g => ({ id: String(g._id ?? g.id), name: g.name || '', data: g, synced_at: now }));
    for (let i = 0; i < sRows.length; i += 500) {
      const { error } = await admin.from('crm_edu_students').upsert(sRows.slice(i, i + 500));
      if (error) throw error;
    }
    for (let i = 0; i < gRows.length; i += 500) {
      const { error } = await admin.from('crm_edu_groups').upsert(gRows.slice(i, i + 500));
      if (error) throw error;
    }
    const stats = {
      students: sRows.length,
      groups: gRows.length,
      branch: branchId,
      ms: Date.now() - started,
      sampleKeys: students[0] ? Object.keys(students[0]).slice(0, 40) : []
    };
    await admin.from('crm_sync_log').insert({ source: 'edutizim', ok: true, message: `${sRows.length} o‘quvchi, ${gRows.length} guruh`, stats });
    return json({ ok: true, ...stats });
  } catch (e) {
    const message = String((e as Error).message || e);
    await admin.from('crm_sync_log').insert({ source: 'edutizim', ok: false, message });
    return json({ ok: false, error: message });
  }
});
