// =========================================================
// Bot fon ishlari:
//  • 📣 Ommaviy xabar (CRM → Telegram): count / broadcast / continue
//  • ⏰ Kids Mock eslatmalari: imtihondan 1 kun va 2 soat oldin (+ kelishni tasdiqlash tugmalari)
// Chaqirish: CRM xodimi JWT bilan yoki pg_cron (`x-cron-secret`) har 10 daqiqada.
// =========================================================
import { admin, callerRole, cors, getSecret, getSetting, json, SUPABASE_URL, tg } from '../_shared/common.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const TZ = '+05:00';

type Filter = { session?: string; room?: string; confirm?: string; photo_file_id?: string };
type Sched = Record<string, { date?: string; time?: string; place?: string }>;

// ---------------------------------------------------------
// Qabul qiluvchilar
// ---------------------------------------------------------
async function recipients(audience: string, f: Filter): Promise<number[]> {
  const ids = new Set<number>();
  if (audience === 'all') {
    for (let from = 0; ; from += 1000) {
      const { data } = await admin.from('crm_bot_sessions').select('chat_id').gt('chat_id', 0).is('blocked_at', null).range(from, from + 999);
      (data || []).forEach(r => ids.add(Number(r.chat_id)));
      if (!data || data.length < 1000) break;
    }
  } else if (audience === 'mock') {
    let q = admin.from('crm_mock_registrations').select('chat_id').not('chat_id', 'is', null).not('status', 'in', '("Bekor")');
    if (f.session) q = q.eq('session', f.session);
    if (f.room) q = q.eq('room', f.room);
    if (f.confirm === 'none') q = q.is('confirm', null);
    else if (f.confirm) q = q.eq('confirm', f.confirm);
    const { data } = await q.limit(5000);
    (data || []).forEach(r => ids.add(Number(r.chat_id)));
  } else if (audience === 'proctors') {
    const { data } = await admin.from('crm_proctors').select('tg_user_id').eq('active', true).not('tg_user_id', 'is', null);
    (data || []).forEach(r => ids.add(Number(r.tg_user_id)));
  } else if (audience === 'test') {
    const chat = Number(await getSecret('telegram_admin_chat_id'));
    if (chat) ids.add(chat);
  }
  if (audience !== 'test' && audience !== 'all' && ids.size) {
    // Botni bloklaganlarni chiqarib tashlash
    const { data } = await admin.from('crm_bot_sessions').select('chat_id').in('chat_id', [...ids]).not('blocked_at', 'is', null);
    (data || []).forEach(r => ids.delete(Number(r.chat_id)));
  }
  return [...ids].filter(Boolean);
}

// ---------------------------------------------------------
// Bitta xabarni yuborish
// ---------------------------------------------------------
async function sendOne(token: string, chatId: number, b: any, photo: { bytes?: Uint8Array; name?: string; fileId?: string }) {
  const text = esc(b.text || '');
  const markup = b.button?.text && b.button?.url ? { inline_keyboard: [[{ text: String(b.button.text).slice(0, 60), url: b.button.url }]] } : undefined;
  if (photo.fileId || photo.bytes) {
    const capFits = text.length <= 1024;
    let r: any;
    if (photo.fileId) {
      r = await tg(token, 'sendPhoto', { chat_id: chatId, photo: photo.fileId, caption: capFits ? text : undefined, parse_mode: 'HTML', reply_markup: capFits ? markup : undefined });
    } else {
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('photo', new Blob([new Uint8Array(photo.bytes!)]), photo.name || 'rasm.jpg');
      if (capFits && text) { form.append('caption', text); form.append('parse_mode', 'HTML'); }
      if (capFits && markup) form.append('reply_markup', JSON.stringify(markup));
      r = await tg(token, 'sendPhoto', form);
      if (r?.ok) photo.fileId = r.result.photo?.[r.result.photo.length - 1]?.file_id;
    }
    if (!r?.ok || capFits) return r;
  }
  return tg(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: false });
}

// ---------------------------------------------------------
// Ommaviy xabar ishchisi (vaqt tugasa o'zini qayta chaqiradi)
// ---------------------------------------------------------
async function work(id: number) {
  const started = Date.now();
  const token = await getSecret('telegram_bot_token');
  const { data: b } = await admin.from('crm_broadcasts').select('*').eq('id', id).maybeSingle();
  if (!b || b.status === 'done' || b.status === 'cancelled') return;
  if (!token) { await admin.from('crm_broadcasts').update({ status: 'error', error: 'Bot tokeni yo‘q' }).eq('id', id); return; }
  const filter: Filter = b.filter || {};
  const photo: { bytes?: Uint8Array; name?: string; fileId?: string } = { fileId: filter.photo_file_id };
  if (b.photo_path && !photo.fileId) {
    const { data: blob, error } = await admin.storage.from('crm-broadcast').download(b.photo_path);
    if (error || !blob) { await admin.from('crm_broadcasts').update({ status: 'error', error: 'Rasm topilmadi' }).eq('id', id); return; }
    photo.bytes = new Uint8Array(await blob.arrayBuffer());
    photo.name = b.photo_path.split('/').pop();
  }
  let { cursor, sent, failed } = b as { cursor: number; sent: number; failed: number };
  const list: number[] = (b.recipients || []).map(Number);
  await admin.from('crm_broadcasts').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', id);
  const save = (extra: Record<string, unknown> = {}) => admin.from('crm_broadcasts').update({
    cursor, sent, failed, updated_at: new Date().toISOString(),
    filter: photo.fileId ? { ...filter, photo_file_id: photo.fileId } : filter, ...extra
  }).eq('id', id);

  while (cursor < list.length) {
    if (Date.now() - started > 100_000) {
      await save();
      // Davomi yangi chaqiruvda (edge function vaqt chegarasi)
      const secret = await getSecret('cron_secret');
      await fetch(`${SUPABASE_URL}/functions/v1/bot-jobs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action: 'continue', id })
      }).catch(() => {});
      return;
    }
    const chatId = list[cursor];
    const r: any = await sendOne(token, chatId, b, photo).catch(e => ({ ok: false, description: String(e) }));
    if (r?.ok) sent++;
    else if (r?.error_code === 429) { await sleep(((r.parameters?.retry_after) || 3) * 1000); continue; }
    else {
      failed++;
      if (r?.error_code === 403) await admin.from('crm_bot_sessions').upsert({ chat_id: chatId, blocked_at: new Date().toISOString() });
    }
    cursor++;
    if (cursor % 20 === 0) {
      await save();
      const { data: st } = await admin.from('crm_broadcasts').select('status').eq('id', id).maybeSingle();
      if (st?.status === 'cancelled') return;
    }
    await sleep(45); // ~20 xabar/soniya (Telegram chegarasi 30)
  }
  await save({ status: 'done', finished_at: new Date().toISOString() });
  const adminChat = await getSecret('telegram_admin_chat_id');
  if (adminChat && b.audience !== 'test') {
    await tg(token, 'sendMessage', { chat_id: adminChat, text: `📣 Ommaviy xabar #${id} yuborildi: ✅ ${sent} · ⚠️ ${failed}`, parse_mode: 'HTML' }).catch(() => {});
  }
}

// ---------------------------------------------------------
// ⏰ Kids Mock eslatmalari
// ---------------------------------------------------------
const startOf = (s: { date?: string; time?: string }) => s.date ? new Date(`${s.date}T${(s.time || '09:00').padStart(5, '0')}:00${TZ}`) : null;
const fmtDay = (s: { date?: string; time?: string }) => {
  const d = startOf(s)!;
  return d.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }) + ', soat ' + (s.time || '09:00');
};

function reminderText(kind: '1d' | '2h' | 'manual', r: any, s: { date?: string; time?: string; place?: string }) {
  const head = kind === '2h' ? '⏰ <b>2 soatdan so‘ng Kids Mock imtihoni boshlanadi!</b>'
    : kind === '1d' ? '⏰ <b>Eslatma: ertaga Kids Mock imtihoni!</b>'
    : '⏰ <b>Kids Mock imtihoni haqida eslatma</b>';
  return `${head}\n\n👤 ${esc(r.full_name)}\n🗓 ${esc(fmtDay(s))}\n🚪 Xona: <b>${esc(r.room || '—')}</b>${s.place ? `\n📍 ${esc(s.place)}` : ''}\n🔖 Ariza: <b>KM-${r.id}</b>\n\n` +
    (kind === '2h' ? '✏️ Qalam/ruchka olishni unutmang, 15 daqiqa oldin keling.' : '✏️ Qalam/ruchka olib, 15 daqiqa oldin keling.') +
    (r.confirm ? `\n\nSiz: <b>${r.confirm === 'Boraman' ? '✅ Boraman' : '❌ Bora olmayman'}</b>` : '\n\nKelishingizni tasdiqlang 👇');
}
const confirmKb = (r: any) => r.confirm ? undefined : { inline_keyboard: [[{ text: '✅ Boraman', callback_data: `att:y:${r.id}` }, { text: '❌ Bora olmayman', callback_data: `att:n:${r.id}` }]] };

async function sendReminders(kind: '1d' | '2h' | 'manual', session: string, s: any, token: string) {
  const col = kind === '2h' ? 'reminded_2h_at' : 'reminded_1d_at';
  let q = admin.from('crm_mock_registrations').select('id,chat_id,full_name,room,confirm,status').eq('session', session).not('chat_id', 'is', null).not('status', 'in', '("Bekor","Kelmadi")');
  if (kind !== 'manual') q = q.is(col, null);
  if (kind === '2h') q = q.or('confirm.is.null,confirm.neq."Bora olmayman"');
  const { data: regs } = await q.limit(3000);
  let sent = 0, failed = 0;
  for (const r of regs || []) {
    const res: any = await tg(token, 'sendMessage', { chat_id: r.chat_id, text: reminderText(kind, r, s), parse_mode: 'HTML', reply_markup: confirmKb(r) }).catch(() => null);
    if (res?.ok) sent++;
    else { failed++; if (res?.error_code === 403) await admin.from('crm_bot_sessions').upsert({ chat_id: r.chat_id, blocked_at: new Date().toISOString() }); }
    const patch: Record<string, string> = { [col]: new Date().toISOString() };
    if (kind === '2h') patch.reminded_1d_at = patch[col]; // kech yozilganlarga 1 kunlik kerak emas
    await admin.from('crm_mock_registrations').update(patch).eq('id', r.id);
    await sleep(45);
  }
  return { sent, failed, total: (regs || []).length };
}

async function cronReminders() {
  const token = await getSecret('telegram_bot_token');
  if (!token) return [];
  const sched = await getSetting<Sched>('mockSchedule', {});
  const now = Date.now();
  const out: any[] = [];
  for (const [session, s] of Object.entries(sched || {})) {
    const st = startOf(s || {});
    if (!st) continue;
    const diff = st.getTime() - now;
    if (diff <= 0) continue;
    const kind = diff <= 2.25 * 3600_000 ? '2h' : diff <= 24 * 3600_000 ? '1d' : null;
    if (!kind) continue;
    const r = await sendReminders(kind, session, s, token);
    if (r.total) out.push({ session, kind, ...r });
  }
  if (out.length) {
    const adminChat = await getSecret('telegram_admin_chat_id');
    if (adminChat) await tg(token, 'sendMessage', { chat_id: adminChat, parse_mode: 'HTML', text: '⏰ Eslatmalar yuborildi:\n' + out.map(o => `• ${esc(o.session)} (${o.kind === '2h' ? '2 soat' : '1 kun'} oldin): ✅ ${o.sent} · ⚠️ ${o.failed}`).join('\n') }).catch(() => {});
  }
  return out;
}

// ---------------------------------------------------------
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const cronSecret = await getSecret('cron_secret');
  const viaCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  const role = viaCron ? 'cron' : await callerRole(req);
  if (!['admin', 'operator', 'cron'].includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
  const body = await req.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'cron': {
        if (role !== 'cron') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        const reminders = await cronReminders();
        // To'xtab qolgan ommaviy xabarlarni davom ettirish
        const stale = new Date(Date.now() - 3 * 60_000).toISOString();
        const { data: stuck } = await admin.from('crm_broadcasts').select('id').in('status', ['queued', 'sending']).lt('updated_at', stale).limit(3);
        for (const b of stuck || []) EdgeRuntime.waitUntil(work(Number(b.id)));
        return json({ ok: true, reminders, resumed: (stuck || []).length });
      }
      case 'continue': {
        if (role !== 'cron') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        EdgeRuntime.waitUntil(work(Number(body.id)));
        return json({ ok: true });
      }
      case 'count': {
        const list = await recipients(String(body.audience || 'all'), body.filter || {});
        return json({ ok: true, count: list.length });
      }
      case 'broadcast': {
        if (role !== 'admin') return json({ ok: false, error: 'Faqat admin ommaviy xabar yuboradi' }, 403);
        const text = String(body.text || '').trim().slice(0, 4000);
        if (!text && !body.photoPath) return json({ ok: false, error: 'Matn yoki rasm kerak' });
        const audience = ['all', 'mock', 'proctors', 'test'].includes(body.audience) ? body.audience : 'all';
        const filter: Filter = { session: body.filter?.session || undefined, room: body.filter?.room || undefined, confirm: body.filter?.confirm || undefined };
        const list = await recipients(audience, filter);
        if (!list.length) return json({ ok: false, error: audience === 'test' ? 'Admin chat ID kiritilmagan' : 'Qabul qiluvchi topilmadi' });
        const button = body.button?.text && /^https?:\/\//.test(body.button?.url || '') ? { text: String(body.button.text), url: String(body.button.url) } : null;
        const { data: row, error } = await admin.from('crm_broadcasts').insert({
          audience, filter, text, photo_path: body.photoPath || null, button, recipients: list, total: list.length, created_by: null
        }).select('id').single();
        if (error) return json({ ok: false, error: error.message });
        EdgeRuntime.waitUntil(work(Number(row.id)));
        return json({ ok: true, id: row.id, total: list.length });
      }
      case 'cancel': {
        if (role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        await admin.from('crm_broadcasts').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', Number(body.id)).in('status', ['queued', 'sending']);
        return json({ ok: true });
      }
      case 'remind': {
        // CRM'dan qo'lda: tanlangan sessiya ishtirokchilariga hozir eslatma
        const token = await getSecret('telegram_bot_token');
        if (!token) return json({ ok: false, error: 'Bot tokeni yo‘q' });
        const session = String(body.session || '');
        const sched = await getSetting<Sched>('mockSchedule', {});
        const s = sched?.[session];
        if (!s?.date) return json({ ok: false, error: 'Bu sessiya uchun sana kiritilmagan' });
        const r = await sendReminders('manual', session, s, token);
        return json({ ok: true, ...r });
      }
      default:
        return json({ ok: false, error: 'Noma’lum amal' }, 400);
    }
  } catch (e) {
    console.error('bot-jobs', e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
