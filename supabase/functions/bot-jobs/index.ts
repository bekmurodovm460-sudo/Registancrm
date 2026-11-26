// =========================================================
// Bot fon ishlari:
//  • 📣 Ommaviy xabar (CRM → Telegram): count / broadcast / continue
//  • ⏰ Kids Mock eslatmalari: imtihondan 1 kun va 2 soat oldin (+ kelishni tasdiqlash tugmalari)
// Chaqirish: CRM xodimi JWT bilan yoki pg_cron (`x-cron-secret`) har 10 daqiqada.
// =========================================================
import { admin, callerRole, cors, getSecret, getSetting, json, SUPABASE_URL, tg } from '../_shared/common.ts';
import { inkassaReport } from '../_shared/inkassa.ts';

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
// 📋 Edutizim boti: o'qituvchi vazifalari — har 4 soatda eslatma, muddat nazorati
// ---------------------------------------------------------
async function eduTopIds(): Promise<string[]> {
  const [ids, chat, { data }] = await Promise.all([
    getSetting<any[]>('botAdmins', []), getSecret('telegram_admin_chat_id'),
    admin.from('crm_edu_bot_users').select('tg_id').eq('role', 'top')
  ]);
  return [...new Set([...(ids || []).map(String), String(chat || ''), ...(data || []).map(r => String(r.tg_id))].filter(Boolean))];
}
async function taskReminders() {
  const token = await getSecret('edu_bot_token');
  if (!token) return { skipped: 'no token' };
  const now = Date.now();
  const hour = new Date(now + 5 * 3600_000).getUTCHours();
  const quiet = hour >= 22 || hour < 8;
  const { data: tasks } = await admin.from('crm_edu_tasks').select('*').in('status', ['open', 'overdue']).limit(200);
  let reminded = 0, overdue = 0;
  const fmt = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5 * 3600_000); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  for (const t of tasks || []) {
    const items = t.items || [];
    const done = items.filter((x: any) => x.doneAt).length;
    const kb = { inline_keyboard: [[{ text: '📋 Vazifani ochish', callback_data: `tk:${t.id}` }]] };
    if (t.status === 'open' && new Date(t.deadline).getTime() < now) {
      await admin.from('crm_edu_tasks').update({ status: 'overdue' }).eq('id', t.id);
      overdue++;
      await tg(token, 'sendMessage', { chat_id: t.teacher_tg, parse_mode: 'HTML', reply_markup: kb, text: `🔴 <b>Vazifa muddati o‘tdi!</b>\n${esc(t.title)}\nBajarildi: <b>${done}/${items.length}</b>\nIltimos, bugunoq yakunlang.` }).catch(() => {});
      for (const id of await eduTopIds()) await tg(token, 'sendMessage', { chat_id: id, parse_mode: 'HTML', reply_markup: kb, text: `🔴 <b>Muddat o‘tdi:</b> ${esc(t.teacher_name)} — ${esc(t.title)}\nBajarildi: ${done}/${items.length}` }).catch(() => {});
    }
    const last = t.last_reminded_at ? new Date(t.last_reminded_at).getTime() : 0;
    if (quiet || now - last < 4 * 3600_000 - 60_000) continue;
    const ms = new Date(t.deadline).getTime() - now;
    const leftTxt = ms <= 0 ? '🔴 muddat o‘tgan' : ms < 86400_000 ? `⏳ ${Math.floor(ms / 3600_000)} soat qoldi` : `⏳ ${Math.floor(ms / 86400_000)} kun qoldi`;
    await tg(token, 'sendMessage', { chat_id: t.teacher_tg, parse_mode: 'HTML', reply_markup: kb,
      text: `⏰ <b>Eslatma: arxiv o‘quvchilaringiz bilan ishlang</b>\n${esc(t.title)}\n\n✅ Bajarildi: <b>${done}/${items.length}</b> · qoldi: <b>${items.length - done}</b>\n📅 Muddat: ${fmt(t.deadline)} · ${leftTxt}\n\nQo‘ng‘iroq qilib, natijani botda izoh qilib yozing.` }).catch(() => {});
    await admin.from('crm_edu_tasks').update({ last_reminded_at: new Date().toISOString() }).eq('id', t.id);
    reminded++;
  }
  return { reminded, overdue, quiet };
}

// ---------------------------------------------------------
// 🌙 Kechki hisobot (har kuni 20:00 dan keyin bir marta): davomat, izohlar, xavf, vazifalar
// ---------------------------------------------------------
async function eduCall(action: string, body: Record<string, unknown> = {}): Promise<any> {
  const secret = await getSecret('cron_secret');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/edutizim-sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action, ...body }) });
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
}
const normName = (s: string) => String(s || '').toLowerCase().replace(/[ʻʼ‘’'`]/g, '').replace(/\s+/g, ' ').trim();

// edu-bot ichki amali (rahbarga SMS, haftalik/oylik hisobot)
async function eduBotInternal(body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/edu-bot`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': await getSecret('cron_secret') }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, status: r.status }));
}

// 🏦 Juma ertalab (09:00 dan keyin, bir marta) — top menejerlarga bankka topshiriladigan naqd inkassa
async function fridayInkassa(force = false) {
  const token = await getSecret('edu_bot_token');
  if (!token) return { skipped: 'no token' };
  const tz = 5 * 3600_000, now = Date.now(), local = new Date(now + tz);
  const today = local.toISOString().slice(0, 10);
  if (!force) {
    if (local.getUTCDay() !== 5) return { skipped: 'not friday' };
    if (local.getUTCHours() < 9) return { skipped: 'early' };
    if ((await getSetting<string>('eduInkassaSent', '')) === today) return { skipped: 'sent' };
  }
  await admin.from('crm_settings').upsert({ key: 'eduInkassaSent', value: today });
  const report = await inkassaReport(eduCall, 'cur', now, true);
  const text = `🏦 <b>Bugun Juma — naqd inkassani bankka topshirish kuni</b>\n\n${report}\n\n<i>Kun davomida yana to‘lov tushsa, summa o‘zgaradi. Batafsil: 💵 Naqd inkassa</i>`;
  const [ids, chat, { data: users }] = await Promise.all([
    getSetting<any[]>('botAdmins', []), getSecret('telegram_admin_chat_id'),
    admin.from('crm_edu_bot_users').select('tg_id').in('role', ['top', 'director'])
  ]);
  const grp = await getSetting<number | null>('reportsChatId', null);
  const tops = new Set<string>([...(ids || []).map(String), String(chat || ''), ...(users || []).map(u => String(u.tg_id)), grp ? String(grp) : ''].filter(Boolean));
  for (const id of tops) await tg(token, 'sendMessage', { chat_id: id, text, parse_mode: 'HTML', ...(String(id) === String(grp) ? {} : { reply_markup: { inline_keyboard: [[{ text: '💵 Batafsil', callback_data: 'ink:cur' }]] } }) }).catch(() => {});
  const sms = await eduBotInternal({ action: 'smsReport', kind: 'inkassa' }).catch(e => ({ error: String(e) }));
  return { sent: tops.size, sms };
}

// 📅 Dushanba va 🗓 oyning 1-sanasi 09:00 dan keyin — rahbarga (va topga) haftalik/oylik yakun (edu-bot yasaydi)
async function periodicReports(force?: 'week' | 'month') {
  const tz = 5 * 3600_000, local = new Date(Date.now() + tz);
  const today = local.toISOString().slice(0, 10);
  const out: Record<string, unknown> = {};
  const call = async (kind: 'week' | 'month') => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/edu-bot`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': await getSecret('cron_secret') }, body: JSON.stringify({ action: 'autoReport', kind }) });
    return await r.json().catch(() => ({ ok: false, status: r.status }));
  };
  for (const kind of ['week', 'month'] as const) {
    const due = force === kind || (!force && local.getUTCHours() >= 9 && (kind === 'week' ? local.getUTCDay() === 1 : local.getUTCDate() === 1));
    if (!due) continue;
    const key = kind === 'week' ? 'eduWeeklySent' : 'eduMonthlySent';
    if (!force && (await getSetting<string>(key, '')) === today) continue;
    await admin.from('crm_settings').upsert({ key, value: today });
    out[kind] = await call(kind);
  }
  return out;
}

async function dailyReport(force = false) {
  const token = await getSecret('edu_bot_token');
  if (!token) return { skipped: 'no token' };
  const tz = 5 * 3600_000, now = Date.now();
  const local = new Date(now + tz);
  const today = local.toISOString().slice(0, 10);
  const hour = local.getUTCHours();
  if (!force) {
    if (hour < 20) return { skipped: 'early' };
    const sent = await getSetting<string>('eduDailyReportSent', '');
    if (sent === today) return { skipped: 'sent' };
  }
  await admin.from('crm_settings').upsert({ key: 'eduDailyReportSent', value: today });
  const d0 = Math.floor((now + tz) / 86400_000) * 86400_000 - tz;
  const [abs, risk, tasksRes] = await Promise.all([
    eduCall('absences', { fromDate: `${today}T00:00:00.000Z`, toDate: `${today}T23:59:59.999Z` }),
    eduCall('absenceRisk', { days: 21 }),
    admin.from('crm_edu_tasks').select('teacher_name,items,status,deadline').in('status', ['open', 'overdue'])
  ]);
  if (!abs.ok) return { error: abs.error };
  const seen = new Set<string>();
  // Edutizim sana filtri kun bo'yicha keng — faqat bugungi dars kuni (lessonDate)
  const rows = (abs.rows || []).filter((x: any) => !x.lessonDate || String(x.lessonDate).slice(0, 10) === today).filter((x: any) => { const k = `${x.studentId}|${x.groupId}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const cm = rows.length ? await eduCall('commentsFor', { studentIds: rows.map((x: any) => x.studentId) }) : { comments: {} };
  const has = (sid: string) => (cm.comments?.[sid] || []).some((c: any) => new Date(c.at).getTime() >= d0);
  const done = rows.filter((x: any) => has(x.studentId)).length;
  const unr = rows.filter((x: any) => x.state === 'unreasonable').length;
  const byMgr = new Map<string, { n: number; done: number; pending: any[] }>();
  rows.forEach((x: any) => {
    const k = x.manager || '—';
    const v = byMgr.get(k) || { n: 0, done: 0, pending: [] };
    v.n++; if (has(x.studentId)) v.done++; else v.pending.push(x);
    byMgr.set(k, v);
  });
  const riskRows = risk.ok ? risk.rows || [] : [];
  const red = riskRows.filter((x: any) => x.streak >= 3).length;
  const tasks = tasksRes.data || [];
  const dd = `${String(local.getUTCDate()).padStart(2, '0')}.${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 100;
  const mgrLines = [...byMgr.entries()].sort((a, b) => (b[1].n - b[1].done) - (a[1].n - a[1].done))
    .map(([k, v]) => `${v.done === v.n ? '✅' : '⏳'} ${esc(k)}: ${v.done}/${v.n}${v.pending.length ? ` · qoldi ${v.pending.length}` : ''}`).join('\n');
  const taskLines = tasks.map((t: any) => { const n = (t.items || []).length, d = (t.items || []).filter((x: any) => x.doneAt).length; return `${t.status === 'overdue' ? '🔴' : '⏳'} ${esc(t.teacher_name)}: ${d}/${n}`; }).join('\n');
  const text = `🌙 <b>Kunlik hisobot · ${dd}</b>\n\n` +
    `📅 <b>Davomat</b>\n❌ Kelmaganlar: <b>${rows.length}</b> (🔴 sababsiz ${unr} · 🟡 sababli ${rows.length - unr})\n📞 Izoh yozilgan: <b>${done}/${rows.length}</b> (${pct}%) ${pct === 100 ? '✅' : '⚠️'}\n` +
    (mgrLines ? `\n<b>Menejerlar:</b>\n${mgrLines}\n` : '') +
    `\n⚠️ <b>Notcoming xavfi:</b> ${riskRows.length} ta (🔴 3+ dars: ${red} · 🟠 2 dars: ${riskRows.length - red})\n` +
    (tasks.length ? `\n📋 <b>Ustozlar vazifalari (ochiq):</b>\n${taskLines}\n` : '') +
    `\nBatafsil: 📅 Davomat · ⚠️ Xavf ostida`;
  const [ids, chat, { data: users }] = await Promise.all([
    getSetting<any[]>('botAdmins', []), getSecret('telegram_admin_chat_id'),
    admin.from('crm_edu_bot_users').select('tg_id,role,full_name').in('role', ['top', 'senior', 'service', 'director'])
  ]);
  const grp = await getSetting<number | null>('reportsChatId', null);
  const tops = new Set<string>([...(ids || []).map(String), String(chat || ''), ...(users || []).filter(u => u.role === 'top' || u.role === 'senior' || u.role === 'director').map(u => String(u.tg_id)), grp ? String(grp) : ''].filter(Boolean));
  const stk = (await getSetting<Record<string, string>>('eduStickerIds', {}))?.hisobot || 'https://raw.githubusercontent.com/bekmurodovm460-sudo/Registancrm/refs/heads/claude/html-site-web-platform-pltyl0/brand/stickers/hisobot.webp';
  for (const id of tops) {
    await tg(token, 'sendSticker', { chat_id: id, sticker: stk }).catch(() => {});
    await tg(token, 'sendMessage', { chat_id: id, text, parse_mode: 'HTML' }).catch(() => {});
  }
  // Servis menejerlarga — faqat o'zida izohsiz qolganlar (Edutizim'dagi mas'ul menejer ismi bo'yicha)
  let serviceSent = 0;
  for (const u of (users || []).filter(u => u.role === 'service')) {
    const mine = [...byMgr.entries()].find(([k]) => normName(k) && normName(k) === normName(u.full_name));
    if (!mine) continue;
    const v = mine[1];
    const body = v.pending.length
      ? `🌙 <b>Bugungi davomat · ${dd}</b>\n\nSizga biriktirilgan kelmaganlar: ${v.n} · izoh yozilgan: ${v.done}\n⚠️ <b>Izohsiz qolganlar (${v.pending.length}):</b>\n${v.pending.slice(0, 40).map((x: any, i: number) => `${i + 1}. ${esc(x.name)} · ${esc(x.phone)} · ${esc(x.group)}`).join('\n')}\n\nQo‘ng‘iroq qilib, 📅 Davomat bo‘limida izoh yozing.`
      : `🌙 <b>Bugungi davomat · ${dd}</b>\n\n✅ Barcha ${v.n} ta o‘quvchiga izoh yozilgan. Rahmat!`;
    await tg(token, 'sendMessage', { chat_id: u.tg_id, text: body, parse_mode: 'HTML' }).catch(() => {});
    serviceSent++;
  }
  const sms = await eduBotInternal({ action: 'smsReport', kind: 'day' }).catch(e => ({ error: String(e) }));
  return { sent: tops.size, serviceSent, absent: rows.length, done, risk: riskRows.length, sms };
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
        const tasks = await taskReminders().catch(e => ({ error: String(e) }));
        const daily = await dailyReport().catch(e => ({ error: String(e) }));
        const inkassa = await fridayInkassa().catch(e => ({ error: String(e) }));
        const periodic = await periodicReports().catch(e => ({ error: String(e) }));
        // To'xtab qolgan ommaviy xabarlarni davom ettirish
        const stale = new Date(Date.now() - 3 * 60_000).toISOString();
        const { data: stuck } = await admin.from('crm_broadcasts').select('id').in('status', ['queued', 'sending']).lt('updated_at', stale).limit(3);
        for (const b of stuck || []) EdgeRuntime.waitUntil(work(Number(b.id)));
        return json({ ok: true, reminders, tasks, daily, inkassa, periodic, resumed: (stuck || []).length });
      }
      case 'periodic': {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        return json({ ok: true, ...(await periodicReports(body.kind === 'month' ? 'month' : 'week')) });
      }
      case 'inkassa': {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        return json({ ok: true, ...(await fridayInkassa(true)) });
      }
      case 'daily': {
        if (role !== 'cron' && role !== 'admin') return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        return json({ ok: true, ...(await dailyReport(true)) });
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
