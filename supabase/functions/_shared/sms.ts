// =========================================================
// 📱 Rahbarga SMS — Eskiz.uz (notify.eskiz.uz)
// Kirish: crm_secrets.eskiz_email / eskiz_password; token crm_secrets.eskiz_token'da keshlanadi (~30 kun).
// Raqamlar: crm_settings.directorSmsPhones. Eskiz faqat tasdiqlangan shablonga mos matnni yuboradi.
// =========================================================
import { admin, getSecret, getSetting } from './common.ts';

const ESKIZ = 'https://notify.eskiz.uz/api';

async function login(): Promise<string> {
  const email = await getSecret('eskiz_email'), password = await getSecret('eskiz_password');
  if (!email || !password) throw new Error('Eskiz login/parol kiritilmagan (CRM → Rahbarga SMS)');
  const fd = new FormData(); fd.append('email', email); fd.append('password', password);
  const r = await fetch(`${ESKIZ}/auth/login`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  const token = j?.data?.token;
  if (!r.ok || !token) throw new Error(`Eskiz login: ${j?.message || r.status}`);
  await admin.from('crm_secrets').upsert({ key: 'eskiz_token', value: JSON.stringify({ token, at: Date.now() }), updated_at: new Date().toISOString() });
  return token;
}
async function token(force = false): Promise<string> {
  if (!force) {
    try { const c = JSON.parse(await getSecret('eskiz_token') || '{}'); if (c.token && Date.now() - c.at < 25 * 86400_000) return c.token; } catch { /* yangisini olamiz */ }
  }
  return await login();
}

/** SMS matni: lotin, oddiy belgilar (‘ ’ → '), 160 belgigacha bitta SMS */
export const smsText = (s: string) => String(s).replace(/[‘’ʻʼ`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\n]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, 450);

export async function sendSms(phone: string, text: string) {
  const mobile = String(phone).replace(/\D/g, '').replace(/^(\d{9})$/, '998$1');
  if (!/^998\d{9}$/.test(mobile)) return { ok: false, error: 'Noto‘g‘ri raqam' };
  const message = smsText(text);
  const send = async (tok: string) => {
    const fd = new FormData();
    fd.append('mobile_phone', mobile); fd.append('message', message); fd.append('from', (await getSetting<string>('eskizFrom', '4546')) || '4546');
    const r = await fetch(`${ESKIZ}/message/sms/send`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
    return { r, j: await r.json().catch(() => ({})) };
  };
  try {
    let { r, j } = await send(await token());
    if (r.status === 401) ({ r, j } = await send(await token(true)));
    const ok = r.ok && !j?.error && (j?.status === 'waiting' || j?.status === 'success' || !!j?.id);
    await admin.from('crm_sync_log').insert({ source: 'eskiz-sms', ok, message: `${mobile} · ${message.slice(0, 120)}`, stats: { response: j } });
    return ok ? { ok: true, id: j?.id } : { ok: false, error: String(j?.message || j?.error || r.status) };
  } catch (e) {
    const error = String((e as Error).message || e);
    await admin.from('crm_sync_log').insert({ source: 'eskiz-sms', ok: false, message: `${mobile} · ${error}`.slice(0, 300) });
    return { ok: false, error };
  }
}

/** Rahbar(lar) raqamlariga SMS (sozlama bo'lmasa — hech narsa qilmaydi) */
export async function smsDirectors(text: string) {
  const phones = ((await getSetting<string[]>('directorSmsPhones', [])) || []).filter(Boolean);
  if (!phones.length) return { skipped: 'no phones' };
  if (!(await getSecret('eskiz_email'))) return { skipped: 'no eskiz' };
  const res = [];
  for (const p of phones) res.push({ phone: p, ...(await sendSms(p, text)) });
  return { sent: res.filter(r => r.ok).length, results: res };
}
