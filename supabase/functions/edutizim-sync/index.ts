// Registan.edutizim.uz bilan sinxronlash (login/parol orqali)
// Edutizim frontend API: https://backend.edutizim.uz/moderator-web-api
//   POST /sign-with-password {phoneNumber, password}      -> data.token, data.branches[]
//   POST /student-list/students-pagin {page, limit}       -> data.{total, data[]}
//   POST /group-pagin {page, limit}                       -> data.{total, data[]}
// Tashkilot `Origin` (subdomen) orqali, filial `branch` sarlavhasi orqali aniqlanadi.
// Chaqirish: CRM xodimi JWT bilan yoki `x-cron-secret` (crm_secrets.cron_secret) bilan (avtomatik sinxron).
import { admin, callerRole, cors, getSecret, json } from '../_shared/common.ts';

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
