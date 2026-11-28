// =========================================================
// REGISTAN · EDUTIZIM boti (alohida, faqat xodimlar uchun)
//  ➕ Lid · 🔍 O'quvchi · 🔴 Qarzdorlar · 💰 Kirim · 💸 Chiqim · 📊 Hisobot · 🔄 Sinxron
// Kirish: CRM → 🤖 Telegram Bot → "Bot adminlari" (Telegram ID) yoki admin chat ID.
// Edutizim bilan ishlash edutizim-sync funksiyasi orqali (x-cron-secret, ichki chaqiruv).
// =========================================================
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { betaTool } from 'npm:@anthropic-ai/sdk@1.8.0/helpers/beta/json-schema';
import { daysLabel, schedulePdf, toLessons } from '../_shared/schedule.ts';
import { cycleOf, inkassaReport, inkTx, isMoveOut, P_INK, type InkP } from '../_shared/inkassa.ts';
import { smsDirectors } from '../_shared/sms.ts';
import { admin, getSecret, getSetting, SUPABASE_URL, tg, webhookSecret } from '../_shared/common.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as XLSX from 'npm:xlsx@0.18.5';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const B_LEAD = '➕ Lid qo‘shish';
const B_ORDER = '📝 O‘quvchiga buyurtma';
const B_LREQ = '📥 Lid so‘rovlari';
const B_VOUCH = '🎟 Vaucherlar';
const B_FIND = '🔍 O‘quvchi';
const B_DEBT = '🔴 Qarzdorlar';
const B_IN = '💰 Kirim';
const B_OUT = '💸 Chiqim';
const B_REPORT = '📊 Hisobot';
const B_SYNC = '🔄 Sinxron';
const B_STATS = '📈 Statistika';
const B_EXP = '🧾 Xarajatlar';
const B_INK = '💵 Naqd inkassa';
const B_SCHED = '🗓 Dars jadvali';
const B_PHONES = '📞 Kerakli raqamlar';
const B_BOOK = '📚 Kitob buyurtma';
const B_BOOKS = '📚 Kitob buyurtmalari';
const B_STOCK = '📦 Kitoblar ombori';
const B_PUB = '🏪 Nashriyotlar';
const B_MEDIA = '🎬 Video montaj';
const B_AI = '🤖 AI yordamchi';
const B_REPORTS = '📑 Hisobotlar';
const B_ATT = '📅 Davomat';
const B_RISK = '⚠️ Xavf ostida';
const B_TEACH = '👩‍🏫 O‘qituvchilar';
const B_TASKS = '📋 Vazifalar';
const B_ADMIN = '⚙️ Boshqaruv';
const B_MY = '📊 Mening natijam';
const B_MYTASK = '📋 Vazifalarim';
const B_MYDEBT = '🔴 Qarzdor o‘quvchilarim';
const B_BELL = '🔔 Qo‘ng‘iroqchalar';
const B_PRICE = '💲 Narx nazorati';
const B_NEW = '🆕 Yangi talabalar';
const B_MGR = '🎧 Menejerlar';
const B_CANCEL = '❌ Bekor qilish';
const B_SKIP = '⏭ O‘tkazib yuborish';

const kb = (rows: string[][]) => ({ keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true });
const persist = (rows: string[][], ph = 'Bo‘limni tanlang…') => ({ ...kb(rows), is_persistent: true, input_field_placeholder: ph });
const MENU = persist([[B_IN, B_OUT], [B_INK, B_EXP], [B_BELL, B_PRICE], [B_NEW, B_MGR], [B_ATT, B_RISK], [B_STATS, B_SCHED], [B_BOOK, B_BOOKS], [B_PUB, B_STOCK], [B_MEDIA, B_AI], [B_REPORTS, B_PHONES], [B_DEBT, B_FIND], [B_TEACH, B_TASKS], [B_LEAD, B_ORDER], [B_LREQ, B_VOUCH], [B_ADMIN]]);
const MENU_SENIOR = persist([[B_ATT, B_RISK], [B_NEW, B_MGR], [B_STATS, B_EXP], [B_INK, B_SCHED], [B_STOCK, B_MEDIA], [B_AI, B_REPORTS], [B_PHONES], [B_BELL, B_PRICE], [B_DEBT, B_FIND], [B_TEACH, B_TASKS], [B_LEAD, B_ORDER], [B_LREQ, B_VOUCH]]);
const MENU_SERVICE = persist([[B_ATT, B_RISK], [B_NEW, B_MY], [B_FIND, B_DEBT], [B_LEAD, B_ORDER], [B_LREQ, B_SCHED], [B_AI, B_PHONES]]);
const MENU_TEACHER = persist([[B_MY, B_MYTASK], [B_MYDEBT], [B_SCHED, B_PHONES], [B_AI]]);
const MENU_DIRECTOR = persist([[B_REPORTS], [B_STATS, B_EXP], [B_INK, B_ATT], [B_TEACH, B_NEW], [B_RISK, B_STOCK], [B_SCHED, B_AI], [B_PHONES]]);
const MENU_MEDIA = persist([[B_MEDIA, B_AI], [B_SCHED, B_PHONES]]);
const MENU_TEACHER_BOOK = persist([[B_MY, B_MYTASK], [B_MYDEBT, B_BOOK], [B_SCHED, B_PHONES], [B_AI]]);
// Bosh sahifadagi bosib tanlanadigan (inline) bo'limlar — rolga qarab
const GO: Record<string, string> = { kirim: B_IN, chiqim: B_OUT, davomat: B_ATT, xavf: B_RISK, stat: B_STATS, xarajat: B_EXP, inkassa: B_INK, jadval: B_SCHED, raqam: B_PHONES, kitob: B_BOOK, kitoblar: B_BOOKS, nashriyot: B_PUB, ombor: B_STOCK, montaj: B_MEDIA, ai: B_AI, hisobot: B_REPORTS, qarz: B_DEBT, qidir: B_FIND, ustoz: B_TEACH, vazifa: B_TASKS, lid: B_LEAD, buyurtma: B_ORDER, lidsorov: B_LREQ, vaucher: B_VOUCH, admin: B_ADMIN, natijam: B_MY, myvazifa: B_MYTASK, myqarz: B_MYDEBT, bell: B_BELL, narx: B_PRICE, yangi: B_NEW, mgr: B_MGR };
const GO_ROWS: Record<string, string[][]> = {
  top: [['kirim', 'chiqim'], ['inkassa', 'xarajat'], ['bell', 'narx'], ['yangi', 'mgr'], ['davomat', 'xavf'], ['stat', 'jadval'], ['kitob', 'kitoblar'], ['nashriyot', 'ombor'], ['montaj', 'ai'], ['hisobot', 'raqam'], ['qarz', 'qidir'], ['ustoz', 'vazifa'], ['lid', 'buyurtma'], ['lidsorov', 'vaucher'], ['admin']],
  senior: [['davomat', 'xavf'], ['yangi', 'mgr'], ['stat', 'xarajat'], ['inkassa', 'jadval'], ['ombor', 'montaj'], ['ai', 'hisobot'], ['raqam'], ['bell', 'narx'], ['qarz', 'qidir'], ['ustoz', 'vazifa'], ['lid', 'buyurtma'], ['lidsorov', 'vaucher']],
  service: [['davomat', 'xavf'], ['yangi', 'natijam'], ['qidir', 'qarz'], ['lid', 'buyurtma'], ['lidsorov', 'jadval'], ['ai', 'raqam']],
  teacher: [['natijam', 'myvazifa'], ['myqarz'], ['jadval', 'raqam'], ['ai']],
  media: [['montaj', 'ai'], ['jadval', 'raqam']],
  director: [['hisobot'], ['stat', 'xarajat'], ['inkassa', 'davomat'], ['ustoz', 'yangi'], ['xavf', 'ombor'], ['jadval', 'ai'], ['raqam']],
  teacherBook: [['natijam', 'myvazifa'], ['myqarz', 'kitob'], ['jadval', 'raqam'], ['ai']]
};
const homeKb = (r: string, withAcc = false) => ({ inline_keyboard: [...(GO_ROWS[r] || []).map(row => row.map(k => ({ text: GO[k], callback_data: `go:${k}` }))), ...(withAcc ? [[{ text: '🔑 Edutizim akkauntim', callback_data: 'acc' }]] : [])] });
type Role = 'top' | 'senior' | 'director' | 'service' | 'teacher' | 'media' | 'pending' | 'blocked' | 'none';
type Ctx = { role: Role; user: any; menu: any; from: any; book?: boolean };
const als = new AsyncLocalStorage<Ctx>();
const menu = () => als.getStore()?.menu ?? MENU;
const role = (): Role => als.getStore()?.role ?? 'none';
const me = () => als.getStore()?.user;
const menuFor = (r: Role) => (r === 'director' ? MENU_DIRECTOR : r === 'top' ? MENU : r === 'senior' ? MENU_SENIOR : r === 'service' ? MENU_SERVICE : r === 'teacher' ? MENU_TEACHER : r === 'media' ? MENU_MEDIA : { remove_keyboard: true });
const ROLE_NAME: Record<string, string> = { top: '👑 Top menejer', senior: '🧭 Katta menejer', service: '🎧 Servis menejer', teacher: '👩‍🏫 O‘qituvchi', media: '🎬 Media', director: '👔 Rahbar', pending: '⏳ Kutilmoqda', blocked: '⛔ Bloklangan' };
const CANCEL_KB = kb([[B_CANCEL]]);
const SKIP_KB = kb([[B_SKIP], [B_CANCEL]]);
const BANNER = 'https://raw.githubusercontent.com/bekmurodovm460-sudo/Registancrm/refs/heads/claude/html-site-web-platform-pltyl0/brand/edu-bot-tavsif-1280x720.png';
const ib = (text: string, data: string) => ({ text, callback_data: data });
const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
const sum = (n: number) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';
const normPhone = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? '+998' + d.slice(-9) : null; };
const parseAmount = (t: string) => {
  const s = String(t || '').toLowerCase().replace(/so.?m/g, '').trim();
  const k = /(\d+(?:[.,]\d+)?)\s*(k|ming)$/.exec(s);
  if (k) return Math.round(Number(k[1].replace(',', '.')) * 1000);
  const m = /(\d+(?:[.,]\d+)?)\s*(mln|m)$/.exec(s);
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 1_000_000);
  return Number(s.replace(/\D/g, '')) || 0;
};

let TOKEN = '';
let tokenAt = 0;
async function token() {
  if (!TOKEN || Date.now() - tokenAt > 600_000) { TOKEN = await getSecret('edu_bot_token'); tokenAt = Date.now(); }
  return TOKEN;
}
const cache = new Map<string, { v: unknown; at: number }>();
async function cached<T>(key: string, fallback: T, ttl = 60_000): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ttl) return c.v as T;
  const v = await getSetting<T>(key, fallback);
  cache.set(key, { v, at: Date.now() });
  return v;
}

type Session = { step: string | null; data: Record<string, any> };
async function getSession(chatId: number): Promise<Session> {
  const { data } = await admin.from('crm_edu_bot_sessions').select('step,data').eq('chat_id', chatId).maybeSingle();
  return { step: data?.step ?? null, data: (data?.data as Record<string, any>) || {} };
}
async function setSession(chatId: number, step: string | null, data: Record<string, any> = {}) {
  await admin.from('crm_edu_bot_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() });
}
async function send(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  const r = await tg(await token(), 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  if (!r?.ok) console.error('edu-bot send fail', chatId, r?.error_code, r?.description);
  return r;
}
const typing = async (chatId: number) => tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

async function adminIds(): Promise<string[]> {
  const [ids, chat] = await Promise.all([cached<any[]>('botAdmins', []), getSecret('telegram_admin_chat_id')]);
  return [...new Set([...(ids || []).map(x => String(x).trim()), String(chat || '').trim()].filter(Boolean))];
}
async function isAdmin(userId?: number) { return !!userId && (await adminIds()).includes(String(userId)); }
// Boshqa adminlarga xabar (amalni bajargan o'zidan tashqari)
async function notifyOthers(text: string, exceptId?: number) {
  for (const id of await topIds()) if (id !== String(exceptId)) await send(id, text).catch(() => {});
}

async function edu(action: string, body: Record<string, unknown> = {}): Promise<any> {
  const secret = await getSecret('cron_secret');
  // Edutizim bir vaqtdagi ko'p kirishni rad etadi — kirish xatosida biroz kutib qayta urinamiz
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/edutizim-sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action, ...body })
    });
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    if (j?.ok === false && /kirib bo/i.test(String(j.error || '')) && attempt < 2) { await new Promise(ok => setTimeout(ok, 1200 + attempt * 1500)); continue; }
    return j;
  }
}

// ---------------------------------------------------------
// 🔍 O'quvchilar (CRM'dagi Edutizim nusxasi, har soatda yangilanadi)
// ---------------------------------------------------------
const toStudent = (s: any) => ({
  id: s.id as string, name: s.full_name as string, phone: s.phone as string, groups: s.groups as string,
  balance: Number(s.data?.balance ?? s.balance) || 0, status: s.data?.status?.name || '',
  active: Number(s.data?.groupsCount ?? s.gc) > 0
});
async function eduFind(q: string) {
  const digits = q.replace(/\D/g, '');
  let query = admin.from('crm_edu_students').select('id,full_name,phone,groups,data').limit(8);
  if (digits.length >= 7) query = query.ilike('phone_digits', `%${digits.slice(-9)}%`);
  else for (const w of q.trim().split(/\s+/).filter(w => w.length >= 2).slice(0, 3)) query = query.ilike('full_name', `%${w.replace(/[%_]/g, '')}%`);
  const { data } = await query;
  return withMonthDue((data || []).map(toStudent));
}

// 📆 Oy oxirigacha: qolgan darslar × 1 dars narxi − joriy balans (qarz bo'lsa qo'shiladi)
function monthDue(groups: any[], balance: number, nowMs = Date.now()) {
  const local = new Date(nowMs + 5 * 3600_000);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  // Dars yechimi dars tugagach tushadi — 19:00 dan keyin bugungi dars hisoblangan deb olamiz
  const from = local.getUTCHours() < 19 ? local.getUTCDate() : local.getUTCDate() + 1;
  let lessons = 0, total = 0, unknown = false;
  for (const g of groups || []) {
    if (!g.price) { unknown = true; continue; }
    for (let d = from; d <= last; d++) {
      const dt = new Date(Date.UTC(y, m, d)), ds = dt.toISOString().slice(0, 10);
      if (!(g.days || []).includes(dt.getUTCDay() + 1) || (g.endsAt && ds > String(g.endsAt).slice(0, 10))) continue;
      lessons++; total += g.price;
    }
  }
  return { lessons, total, due: Math.max(0, total - balance), until: `${String(last).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}`, unknown, groups: (groups || []).length };
}
async function withMonthDue<T extends { id: string; balance: number }>(list: T[]): Promise<(T & { month?: any })[]> {
  if (!list.length) return list;
  const { data } = await admin.from('crm_edu_pay_plan').select('student_id,groups').in('student_id', list.map(x => x.id));
  const plan = new Map((data || []).map((p: any) => [p.student_id, p.groups || []]));
  return list.map(x => plan.has(x.id) && (plan.get(x.id) as any[]).length ? { ...x, month: monthDue(plan.get(x.id) as any[], x.balance) } : x);
}
const monthLine = (mo: any) => !mo ? '' : `\n   📆 Oy oxirigacha (${mo.until}): ${mo.lessons} dars · ${sum(mo.total)} → <b>to‘lashi kerak: ${mo.due ? sum(mo.due) : '0 (yetadi ✅)'}</b>${mo.unknown ? ' <i>(ba’zi guruh narxi noma’lum)</i>' : ''}`;
const line = (s: any, i?: number) =>
  `${i !== undefined ? `<b>${i + 1}.</b> ` : ''}👤 <b>${esc(s.name)}</b>${s.phone ? ` · ${esc(s.phone)}` : ''}\n` +
  `   💳 Balans: <b>${s.balance < 0 ? '🔴 ' : ''}${sum(s.balance)}</b>${s.groups ? `\n   👥 ${esc(String(s.groups).slice(0, 80))}` : ''}${s.status ? ` · ${esc(s.status)}` : ''}${monthLine(s.month)}`;

async function allBalances() {
  const out: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await admin.from('crm_edu_students').select('id,full_name,phone,groups,balance:data->balance,gc:data->groupsCount').range(from, from + 999);
    (data || []).forEach((r: any) => out.push(toStudent(r)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function findAnswer(chatId: number, q: string) {
  if (q.trim().length < 3) return void send(chatId, 'Kamida 3 harf yoki telefon raqamini yozing.');
  const list = await eduFind(q);
  if (!list.length) return void send(chatId, '😕 Topilmadi. Boshqacha yozib ko‘ring (ma’lumot har soatda yangilanadi, “🔄 Sinxron” bilan darhol yangilash mumkin).');
  await setSession(chatId, 'find', { found: list });
  const cm = (await edu('commentsFor', { studentIds: list.map(x => x.id), limit: 2 })).comments || {};
  const body = list.map((x, i) => line(x, i) + ((cm[x.id] || []).length ? '\n   ' + cm[x.id].map((c: any) => noteLine(c, 90)).join('\n   ') : '\n   💬 izoh yo‘q')).join('\n\n');
  const rows = list.map((s, i) => role() === 'top'
    ? [ib(`💰 ${i + 1}. To‘lov`, `pay:${i}`), ib('💬', `ch:${i}`), ib('✍️', `fn:${i}`), ib('📩 SMS', `sm1:${i}`)]
    : [ib(`💬 ${i + 1}. ${s.name.slice(0, 18)} — izohlar`, `ch:${i}`), ib('✍️ Yozish', `fn:${i}`)]);
  await send(chatId, `🔍 Topildi (${list.length}):\n\n${body}\n\nYana qidirish uchun ism yoki raqam yozing.`.slice(0, 4000), { reply_markup: { inline_keyboard: rows } });
}

async function debtors(chatId: number, scope: 'active' | 'all' = 'active') {
  await typing(chatId);
  const list = (await allBalances()).filter(s => s.balance < 0 && (scope === 'all' || s.active)).sort((a, b) => a.balance - b.balance);
  if (!list.length) return void send(chatId, '✅ Qarzdorlar yo‘q.', { reply_markup: menu() });
  const top = list.slice(0, 20);
  await setSession(chatId, 'find', { found: top });
  const total = list.reduce((a, b) => a + b.balance, 0);
  const rows = top.slice(0, 10).map((s, i) => [ib(`💰 ${i + 1}. ${s.name.slice(0, 30)} — to‘lov`, `pay:${i}`)]);
  rows.push([ib('👩‍🏫 Ustozlar bo‘yicha', 'dbt:t')]);
  rows.push([scope === 'active' ? ib('📋 Barcha qarzdorlar (ketganlar bilan)', 'dbt:all') : ib('✅ Faqat aktiv qarzdorlar', 'dbt:active')]);
  if (role() === 'top') rows.push([ib('📩 Qarzdorlarga SMS yuborish', 'sms')]);
  await send(chatId, `🔴 <b>${scope === 'active' ? 'Aktiv o‘quvchilar qarzi' : 'Barcha qarzdorlar'}: ${list.length}</b> · jami <b>${sum(-total)}</b>\nEng katta 20 tasi:\n\n${top.map((s, i) => `<b>${i + 1}.</b> ${esc(s.name)} — <b>${sum(-s.balance)}</b>${s.active ? '' : ' · <i>guruhda emas</i>'}${s.phone ? ` · ${esc(s.phone)}` : ''}`).join('\n')}`, {
    reply_markup: { inline_keyboard: rows }
  });
}

// ---------------------------------------------------------
// 👩‍🏫 Qarzdorlar ustozlar kesimida (Edutizim: o'quvchining faol guruhlari → guruh ustozi)
// ---------------------------------------------------------
const tName = (t: any) => [t?.firstName, t?.lastName].filter(Boolean).join(' ').trim() || 'Ustoz';
async function debtByTeacher() {
  const studs: any[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await admin.from('crm_edu_students').select('id,full_name,phone,data').lt('data->balance', 0).range(from, from + 999);
    studs.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { data: grs } = await admin.from('crm_edu_groups').select('id,name,data');
  const gmap = new Map((grs || []).map((g: any) => [String(g.id), g]));
  const teachers = new Map<string, { id: string; name: string; list: any[] }>();
  const loose: any[] = [];
  for (const s of studs) {
    const bal = Number(s.data?.balance) || 0;
    if (bal >= 0 || !(Number(s.data?.groupsCount) > 0)) continue;
    const st = { id: String(s.id), name: s.full_name, phone: s.phone || '', balance: bal, groups: s.data?.groups || '', active: true, status: '' };
    const act = (s.data?.groupsList || []).filter((g: any) => g?.state === 'active');
    if (!act.length) { loose.push(st); continue; }
    for (const g of act) {
      const gr: any = gmap.get(String(g._id)) || {};
      const tid = String(gr.data?.teacherId || gr.data?.teacher?._id || 'none');
      const t = teachers.get(tid) || teachers.set(tid, { id: tid, name: tid === 'none' ? 'Ustoz biriktirilmagan' : tName(gr.data?.teacher), list: [] }).get(tid)!;
      t.list.push({ ...st, group: String(gr.data?.name || g.name || '') });
    }
  }
  const list = [...teachers.values()].map(t => ({ ...t, total: t.list.reduce((a, x) => a + x.balance, 0) })).sort((a, b) => a.total - b.total);
  return { list, loose, unique: new Set([...list.flatMap(t => t.list.map(x => x.id)), ...loose.map(x => x.id)]).size };
}
// Ustoz foizi — Edutizimdagi ustoz profilidan (percent: { name: "35" | "30%lik" }), 10 daqiqa kesh
let tPctCache: { at: number; map: Record<string, { pct: number | null; label: string }> } | null = null;
async function teacherPercents(ids: string[]) {
  const map = tPctCache && Date.now() - tPctCache.at < 600_000 ? { ...tPctCache.map } : {};
  const need = ids.filter(id => id && id !== 'none' && id !== 'loose' && !(id in map));
  if (need.length) {
    const r = await edu('employeeGet', { ids: need });
    for (const [id, e] of Object.entries<any>(r?.employees || {})) {
      const label = String(e?.percent?.name || '').trim();
      const m = label.match(/\d+(?:[.,]\d+)?/);
      map[id] = { pct: m ? Number(m[0].replace(',', '.')) : null, label };
    }
    tPctCache = { at: Date.now(), map };
  }
  return map;
}
const share = (amount: number, pct: number | null) => pct ? Math.round(amount * pct / 100) : 0;

async function debtTeachers(chatId: number) {
  await typing(chatId);
  const { list, loose, unique } = await debtByTeacher();
  if (!list.length && !loose.length) return void send(chatId, '✅ Aktiv qarzdorlar yo‘q.', { reply_markup: menu() });
  const total = list.reduce((a, t) => a + t.total, 0) + loose.reduce((a, x) => a + x.balance, 0);
  const pcts = await teacherPercents(list.map(t => t.id));
  const lines = list.map((t, i) => { const p = pcts[t.id]?.pct ?? null; return `<b>${i + 1}.</b> ${esc(t.name)} — <b>${t.list.length}</b> ta · ${sum(-t.total)}${p ? `\n    👩‍🏫 ustoz ${p}% → <b>${sum(share(-t.total, p))}</b>` : '\n    👩‍🏫 foiz Edutizimda ko‘rsatilmagan'}`; });
  if (loose.length) lines.push(`• <i>Faol guruhda emas</i> — <b>${loose.length}</b> ta · ${sum(-loose.reduce((a, x) => a + x.balance, 0))}`);
  const rows: any[] = list.slice(0, 40).map(t => [ib(`👩‍🏫 ${t.name.slice(0, 24)} · ${t.list.length} ta`, `dbt:t:${t.id}`)]);
  if (loose.length) rows.push([ib(`👤 Faol guruhda emas · ${loose.length} ta`, 'dbt:t:loose')]);
  rows.push([ib('⬅️ Qarzdorlar', 'dbt:active')]);
  await sendLong(chatId, `👩‍🏫 <b>Qarzdorlar ustozlar bo‘yicha</b>\n${unique} ta aktiv qarzdor · jami <b>${sum(-total)}</b>\n<i>Ikki ustozda o‘qiydigan o‘quvchi ikkalasida ham ko‘rinadi. Ustoz foizi — Edutizimdagi ustoz profilidan; “→” qarz to‘lansa ustozga tegadigan summa.</i>\n\n${lines.join('\n')}`, { reply_markup: { inline_keyboard: rows } });
}
async function debtTeacher(chatId: number, tid: string, own = false) {
  await typing(chatId);
  const { list, loose } = await debtByTeacher();
  const t = tid === 'loose' ? { name: 'Faol guruhda emas', list: loose } : list.find(x => x.id === tid);
  if (!t && own) return void send(chatId, '✅ Guruhlaringizda qarzdor o‘quvchi yo‘q.', { reply_markup: menu() });
  if (!t) return debtTeachers(chatId);
  const L = [...t.list].sort((a, b) => a.balance - b.balance);
  const total = L.reduce((a, x) => a + x.balance, 0);
  // Edutizim kartasidagi "To'lanish kerak" (bitta kirishda)
  const mp = await edu('mustPayMany', { ids: L.map(x => x.id) });
  const must: Record<string, any> = mp?.ok ? mp.must || {} : {};
  const mustTotal = L.reduce((a, x) => a + (Number(must[x.id]?.mustPay) || 0), 0);
  const pc = tid === 'loose' ? null : ((await teacherPercents([tid]))[tid] || null);
  const p = pc?.pct ?? null;
  // To'lov tugmalari uchun (top menejer) — mavjud “find” oqimi
  await setSession(chatId, 'find', { found: L.slice(0, 20) });
  const body = L.map((x, i) => `<b>${i + 1}. ${esc(x.name)}</b> — qarz <b>${sum(-x.balance)}</b>${must[x.id] ? `\n   💳 To‘lanishi kerak: <b>${sum(must[x.id].mustPay)}</b>${p ? ` · ustozga ${sum(share(must[x.id].mustPay, p))}` : ''}` : ''}${x.group ? `\n   👥 ${esc(String(x.group).slice(0, 40))}` : ''}${x.phone ? `\n   📱 <code>${esc(x.phone)}</code>` : ''}`).join('\n');
  const rows: any[] = role() === 'top' ? L.slice(0, 10).map((x, i) => [ib(`💰 ${i + 1}. ${x.name.slice(0, 26)} — to‘lov`, `pay:${i}`)]) : [];
  if (!own) rows.push([ib('⬅️ Ustozlar', 'dbt:t')]);
  const pctLine = tid === 'loose' ? '' : p ? `\n👩‍🏫 Ustoz foizi: <b>${p}%</b>${pc?.label && pc.label !== String(p) ? ` (${esc(pc.label)})` : ''} → qarzdan <b>${sum(share(-total, p))}</b>${mp?.ok ? ` · to‘lanishi kerakdan <b>${sum(share(mustTotal, p))}</b>` : ''}` : '\n👩‍🏫 Ustoz foizi Edutizim profilida ko‘rsatilmagan';
  const text = `${own ? '🔴 <b>Qarzdor o‘quvchilarim</b>\n' : ''}👩‍🏫 <b>${esc(t.name)}</b> — qarzdorlar: <b>${L.length}</b> ta\n🔴 Jami qarz: <b>${sum(-total)}</b>\n💳 To‘lanishi kerak (Edutizim): <b>${mp?.ok ? sum(mustTotal) : '—'}</b>${pctLine}${mp?.ok ? '' : `\n<i>⚠️ Edutizimdan “To‘lanishi kerak” olinmadi: ${esc(mp?.error || 'javob yo‘q')}</i>`}\n\n${body}`;
  await sendLong(chatId, text, rows.length ? { reply_markup: { inline_keyboard: rows } } : { reply_markup: menu() });
}
// 🔴 Ustoz: o'z guruhlaridagi qarzdorlar (Edutizim ustoz profili bo'yicha)
async function myDebtors(chatId: number) {
  const empId = me()?.employee_id;
  if (!empId) return void send(chatId, '⚠️ Profilingiz Edutizimdagi ustozga bog‘lanmagan — top menejerga ayting.', { reply_markup: menu() });
  return debtTeacher(chatId, String(empId), true);
}

// ---------------------------------------------------------
// 📈 Statistika: aktiv o'quvchilar va qarzdorlik
// ---------------------------------------------------------
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const mln = (n: number) => (Math.abs(n) >= 1_000_000 ? (Math.round(n / 100_000) / 10).toString().replace('.', ',') + ' mln so‘m' : sum(n));
async function stats(chatId: number) {
  await typing(chatId);
  const [all, lastSync] = await Promise.all([
    allBalances(),
    admin.from('crm_edu_students').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  const active = all.filter(s => s.active);
  const inactive = all.filter(s => !s.active);
  const aDebt = active.filter(s => s.balance < 0);
  const iDebt = inactive.filter(s => s.balance < 0);
  const aPrepaid = active.filter(s => s.balance > 0);
  const total = (l: any[]) => -l.reduce((x, s) => x + s.balance, 0);
  const aDebtSum = total(aDebt), iDebtSum = total(iDebt);
  const buckets = [
    ['🟢 200 ming gacha', (b: number) => b <= 200_000],
    ['🟡 200–500 ming', (b: number) => b > 200_000 && b <= 500_000],
    ['🟠 500 ming – 1 mln', (b: number) => b > 500_000 && b <= 1_000_000],
    ['🔴 1 mln dan ko‘p', (b: number) => b > 1_000_000]
  ] as const;
  const bLines = buckets.map(([label, f]) => {
    const l = aDebt.filter(s => f(-s.balance));
    return `${label}: <b>${l.length}</b> ta · ${mln(total(l))}`;
  }).join('\n');
  // Guruhlar bo'yicha (aktiv qarzdorlar, birinchi guruh nomi)
  const byGroup = new Map<string, { n: number; sum: number }>();
  aDebt.forEach(s => {
    const g = String(s.groups || '').split(',')[0].trim() || '—';
    const v = byGroup.get(g) || { n: 0, sum: 0 };
    v.n++; v.sum += -s.balance; byGroup.set(g, v);
  });
  const topGroups = [...byGroup.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 7)
    .map(([g, v], i) => `${i + 1}. ${esc(g.slice(0, 40))} — <b>${v.n}</b> ta · ${mln(v.sum)}`).join('\n');
  const t = lastSync.data?.synced_at ? new Date(lastSync.data.synced_at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  await send(chatId,
    `📈 <b>Statistika</b>\n\n` +
    `👥 Bazada jami: <b>${all.length}</b>\n` +
    `✅ <b>Aktiv o‘quvchilar</b> (guruhda o‘qiyotgan): <b>${active.length}</b>\n` +
    `💤 Guruhda emas (ketgan / lid): <b>${inactive.length}</b>\n\n` +
    `🔴 <b>Aktivlar qarzi</b>\n` +
    `Qarzdor: <b>${aDebt.length}</b> ta (${pct(aDebt.length, active.length)}% aktivlarning)\n` +
    `Jami qarz: <b>${mln(aDebtSum)}</b> · o‘rtacha: ${sum(aDebt.length ? aDebtSum / aDebt.length : 0)}\n` +
    `💚 Oldindan to‘lagan: <b>${aPrepaid.length}</b> ta · ${mln(-total(aPrepaid))}\n\n` +
    `<b>Qarz miqdori bo‘yicha:</b>\n${bLines}\n\n` +
    (topGroups ? `<b>Eng ko‘p qarzli guruhlar:</b>\n${topGroups}\n\n` : '') +
    `🟤 <b>Ketganlar qarzi</b> (guruhda emas): <b>${iDebt.length}</b> ta · ${mln(iDebtSum)}\n` +
    `💰 <b>Umumiy qarz:</b> ${mln(aDebtSum + iDebtSum)}\n\n` +
    `<i>🔄 Ma’lumot: ${t} holatiga (har soatda yangilanadi)</i>`,
    { reply_markup: { inline_keyboard: [[ib('🔴 Aktiv qarzdorlar ro‘yxati', 'dbt:active')], [ib('📋 Barcha qarzdorlar', 'dbt:all'), ib('🔄 Yangilash', 'st:sync')], ...(role() === 'top' ? [[ib('📩 Qarzdorlarga SMS', 'sms')]] : []), [ib('🏫 Oy boshi → hozir (markaz va ustozlar)', 'trp:m')]] } });
}

// ---------------------------------------------------------
// 🧾 Xarajatlar statistikasi (kategoriya bo'yicha, haftalik / oylik)
// ---------------------------------------------------------
const TZ = 5 * 3600_000; // Asia/Tashkent
const DAY = 86400_000;
const dayStart = (ms: number) => Math.floor((ms + TZ) / DAY) * DAY - TZ;
type Period = 'today' | 'week' | 'pweek' | 'month' | 'pmonth';
const P_LABEL: Record<Period, string> = { today: 'Bugun', week: 'Bu hafta', pweek: 'O‘tgan hafta', month: 'Bu oy', pmonth: 'O‘tgan oy' };
function range(p: Period, now = Date.now()): { from: number; to: number; prev: { from: number; to: number } } {
  const d0 = dayStart(now);
  const dow = (new Date(d0 + TZ).getUTCDay() + 6) % 7; // Dushanba = 0
  const w0 = d0 - dow * DAY;
  const t = new Date(now + TZ);
  const m0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TZ;
  const pm0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1) - TZ;
  const ppm0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 2, 1) - TZ;
  switch (p) {
    case 'today': return { from: d0, to: now, prev: { from: d0 - DAY, to: d0 - 1 } };
    case 'week': return { from: w0, to: now, prev: { from: w0 - 7 * DAY, to: w0 - 1 } };
    case 'pweek': return { from: w0 - 7 * DAY, to: w0 - 1, prev: { from: w0 - 14 * DAY, to: w0 - 7 * DAY - 1 } };
    case 'month': return { from: m0, to: now, prev: { from: pm0, to: m0 - 1 } };
    case 'pmonth': return { from: pm0, to: m0 - 1, prev: { from: ppm0, to: pm0 - 1 } };
  }
}
const dmy = (ms: number) => { const d = new Date(ms + TZ); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const bar = (part: number, whole: number) => { const n = whole ? Math.round((part / whole) * 10) : 0; return '▰'.repeat(n) + '▱'.repeat(10 - n); };
const delta = (cur: number, prev: number) => !prev ? '' : cur >= prev ? ` · ▲ ${pct(cur - prev, prev)}%` : ` · ▼ ${pct(prev - cur, prev)}%`;

async function txFor(type: 'payIn' | 'payOut', from: number, to: number, cashboxes: any[]) {
  const res = await Promise.all(cashboxes.map(c => edu('kassaTx', { cashboxId: c.id, type, dateFrom: new Date(from).toISOString(), dateTo: new Date(to).toISOString() })));
  const err = res.find(r => !r.ok);
  if (err) throw new Error(err.error || 'Edutizim xatosi');
  return res.flatMap(r => r.tx || []).filter((t: any) => !t.cancelled && t.type === type);
}

async function expenses(chatId: number, p: Period = 'week') {
  await typing(chatId);
  const meta = await edu('kassaMeta');
  if (!meta.ok) return void send(chatId, `⚠️ Edutizim kassasi: ${esc(meta.error)}`, { reply_markup: menu() });
  const r = range(p);
  let cur: any[], prev: any[], inc: any[];
  try {
    [cur, prev, inc] = await Promise.all([
      txFor('payOut', r.from, r.to, meta.cashboxes || []),
      txFor('payOut', r.prev.from, r.prev.to, meta.cashboxes || []).then(x => x.filter(t => !isMoveOut(t))),
      txFor('payIn', r.from, r.to, meta.cashboxes || [])
    ]);
  } catch (e) { return void send(chatId, `⚠️ Kassa tarixini olib bo‘lmadi: ${esc((e as Error).message)}`, { reply_markup: menu() }); }
  const movesOut = cur.filter(isMoveOut);
  cur = cur.filter(t => !isMoveOut(t));
  const total = cur.reduce((a, t) => a + t.amount, 0);
  const prevTotal = prev.reduce((a, t) => a + t.amount, 0);
  const incTotal = inc.reduce((a, t) => a + t.amount, 0);
  const cats = new Map<string, { sum: number; n: number; prev: number; tx: any[] }>();
  cur.forEach(t => { const c = cats.get(t.category) || { sum: 0, n: 0, prev: 0, tx: [] }; c.sum += t.amount; c.n++; c.tx.push(t); cats.set(t.category, c); });
  prev.forEach(t => { const c = cats.get(t.category); if (c) c.prev += t.amount; });
  const list = [...cats.entries()].sort((a, b) => b[1].sum - a[1].sum);
  const salary = cur.filter(t => t.subtype === 'employee' || /oylik|avans|bonus/i.test(t.category)).reduce((a, t) => a + t.amount, 0);
  const label = `${P_LABEL[p]} (${dmy(r.from)}–${dmy(r.to)})`;
  // Kategoriya tafsiloti uchun sessiyaga (har kategoriyadan 15 ta eng katta amal)
  await setSession(chatId, 'exp', { p, label, cats: list.slice(0, 20).map(([name, c]) => ({ name, sum: c.sum, n: c.n, tx: c.tx.sort((a: any, b: any) => b.amount - a.amount).slice(0, 15).map((t: any) => ({ a: t.amount, d: t.date, c: String(t.comment || '').slice(0, 80), w: t.person || '', m: t.method })) })) });
  const catLines = list.slice(0, 15).map(([name, c], i) =>
    `<b>${i + 1}. ${esc(name)}</b> — ${mln(c.sum)} · ${pct(c.sum, total)}%${c.prev ? delta(c.sum, c.prev) : ''}\n   ${bar(c.sum, total)} ${c.n} ta`).join('\n');
  const biggest = [...cur].sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map(t => `• ${dmy(new Date(t.date).getTime())} · ${esc(t.category)} — <b>${sum(t.amount)}</b>${t.comment ? `\n   <i>${esc(String(t.comment).slice(0, 70))}</i>` : ''}`).join('\n');
  const text = !cur.length ? `🧾 <b>Xarajatlar · ${label}</b>\n\nBu davrda chiqim yo‘q.` :
    `🧾 <b>Xarajatlar · ${label}</b>\n\n` +
    `💸 Jami: <b>${mln(total)}</b> · ${cur.length} ta amal\n` +
    `↔️ Oldingi davr: ${mln(prevTotal)}${delta(total, prevTotal)}\n` +
    `👥 Ish haqi (oylik/avans/bonus): ${mln(salary)} · 🏢 Boshqa: ${mln(total - salary)}\n` +
    `💰 Kirim: ${mln(incTotal)} · 📊 Sof (kirim − chiqim): <b>${mln(incTotal - total)}</b>\n` +
    (movesOut.length ? `🔁 Naqd Inkassa’ga ko‘chirma: ${mln(movesOut.reduce((a, t) => a + t.amount, 0))} · ${movesOut.length} marta <i>(xarajatga qo‘shilmadi)</i>\n` : '') + '\n' +
    `<b>Kategoriyalar:</b>\n${catLines}${list.length > 15 ? `\n… yana ${list.length - 15} ta` : ''}\n\n` +
    `<b>Eng katta 5 xarajat:</b>\n${biggest}`;
  const periods: Period[] = ['today', 'week', 'pweek', 'month', 'pmonth'];
  const rows: any[] = [
    periods.slice(0, 3).map(x => ib((x === p ? '• ' : '') + P_LABEL[x], `ex:${x}`)),
    periods.slice(3).map(x => ib((x === p ? '• ' : '') + P_LABEL[x], `ex:${x}`))
  ];
  const catBtns = list.slice(0, 8).map(([name], i) => ib(`🔎 ${name.slice(0, 26)}`, `exc:${i}`));
  for (let i = 0; i < catBtns.length; i += 2) rows.push(catBtns.slice(i, i + 2));
  await send(chatId, text.slice(0, 4000), { reply_markup: { inline_keyboard: rows } });
}

// =========================================================
// 📞 Kerakli raqamlar — barcha xodimlar ko'radi, top menejer qo'shadi/o'chiradi
// =========================================================
type Contact = { name: string; role: string; phone: string };
const fmtPhone = (p: string) => { const d = String(p).replace(/\D/g, '').slice(-9); return d.length === 9 ? `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : p; };
async function contacts(): Promise<Contact[]> { return (await getSetting<Contact[]>('eduContacts', [])) || []; }
async function saveContacts(list: Contact[]) { await admin.from('crm_settings').upsert({ key: 'eduContacts', value: list }); }
// 👩‍🏫/🧑‍💼 Edutizimdagi ustoz va xodimlar: telefon, lavozim, tug'ilgan kun (Edutizimdan o'qiladi, 10 daqiqa kesh)
const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
function bdInfo(bd: string | null, nowMs = Date.now()) {
  if (!bd || !/^\d{4}-\d{2}-\d{2}/.test(bd)) return null;
  const [y, m, d] = bd.slice(0, 10).split('-').map(Number);
  const t = new Date(nowMs + 5 * 3600_000), ty = t.getUTCFullYear(), today = Date.UTC(ty, t.getUTCMonth(), t.getUTCDate());
  let next = Date.UTC(ty, m - 1, d);
  if (next < today) next = Date.UTC(ty + 1, m - 1, d);
  const inDays = Math.round((next - today) / 86400_000), age = new Date(next).getUTCFullYear() - y;
  return { label: `${d} ${MONTHS_UZ[m - 1]}`, inDays, age: y > 1900 ? age : null };
}
const bdText = (b: any) => !b ? '🎂 —' : `🎂 ${b.label}${b.inDays === 0 ? ' — <b>bugun! 🎉</b>' : b.inDays <= 7 ? ` — ${b.inDays} kundan keyin` : ''}${b.age ? ` (${b.age} yosh${b.inDays === 0 ? '' : 'ga to‘ladi'})` : ''}`;
async function staffList(kind: 't' | 's' | 'all') {
  const all = (await employeesList()).filter((e: any) => e.name);
  const list = kind === 'all' ? all : all.filter((e: any) => kind === 't' ? e.isTeacher : !e.isTeacher);
  return list.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
}
async function staffDirectory(chatId: number, data: string) {
  await typing(chatId);
  if (data.startsWith('ph:k:')) {
    const [, , kind, idx] = data.split(':');
    const e: any = (await staffList(kind as any))[Number(idx)];
    if (!e?.phone) return void send(chatId, 'Raqam topilmadi.');
    return void tg(await token(), 'sendContact', { chat_id: chatId, phone_number: fmtPhone(e.phone).replace(/\s/g, ''), first_name: String(e.name).slice(0, 60), last_name: e.role ? `(${String(e.role).slice(0, 40)})` : undefined });
  }
  if (data === 'ph:b') {
    const list = (await staffList('all')).map((e: any) => ({ ...e, b: bdInfo(e.birthdate) })).filter((e: any) => e.b).sort((a: any, b: any) => a.b.inDays - b.b.inDays);
    const none = (await staffList('all')).length - list.length;
    const text = list.length
      ? `🎂 <b>Tug‘ilgan kunlar</b> (eng yaqinidan)\n\n${list.map((e: any) => `${e.b.inDays === 0 ? '🎉' : e.b.inDays <= 7 ? '🔔' : '•'} <b>${esc(e.name)}</b>${e.role ? ` — ${esc(e.role)}` : ''}\n    ${bdText(e.b)}`).join('\n')}${none ? `\n\n<i>${none} kishida tug‘ilgan kun Edutizimda kiritilmagan.</i>` : ''}`
      : '🎂 Edutizimda tug‘ilgan kunlar kiritilmagan.';
    return void send(chatId, text.slice(0, 4000), { reply_markup: { inline_keyboard: [[ib('👩‍🏫 Ustozlar', 'ph:e:t'), ib('🧑‍💼 Xodimlar', 'ph:e:s')], [ib('⬅️ Kerakli raqamlar', 'ph:v')]] } });
  }
  const kind = data.slice(5) === 't' ? 't' : 's';
  const list = await staffList(kind);
  if (!list.length) return void send(chatId, '⚠️ Edutizimdan ro‘yxat olinmadi. Birozdan keyin qayta urinib ko‘ring.');
  const title = kind === 't' ? '👩‍🏫 <b>Ustozlar</b>' : '🧑‍💼 <b>Xodimlar</b>';
  const lines = list.map((e: any, i: number) => `${i + 1}. <b>${esc(e.name)}</b>${e.role && kind === 's' ? ` — ${esc(e.role)}` : ''}${kind === 't' && e.activeGroups ? ` · ${e.activeGroups} guruh, ${e.activeStudents} o‘quvchi` : ''}\n    📱 ${e.phone ? esc(fmtPhone(e.phone)) : '—'} · ${bdText(bdInfo(e.birthdate))}`);
  const btns = list.slice(0, 40).map((e: any, i: number) => ib(`📲 ${String(e.name).slice(0, 22)}`, `ph:k:${kind}:${i}`));
  const rows: any[] = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([ib(kind === 't' ? '🧑‍💼 Xodimlar' : '👩‍🏫 Ustozlar', kind === 't' ? 'ph:e:s' : 'ph:e:t'), ib('🎂 Tug‘ilgan kunlar', 'ph:b')]);
  await send(chatId, `${title} · ${list.length} ta <i>(Edutizimdan)</i>\n\n${lines.join('\n\n')}`.slice(0, 4000), { reply_markup: { inline_keyboard: rows } });
}

async function phonesView(chatId: number) {
  const list = await contacts();
  const isTop = role() === 'top';
  const text = list.length
    ? `📞 <b>Kerakli raqamlar</b>\n\n${list.map((c, i) => `${i + 1}. <b>${esc(c.name)}</b>${c.role ? ` — ${esc(c.role)}` : ''}\n    📱 ${esc(fmtPhone(c.phone))}`).join('\n\n')}\n\n<i>Raqamni bosib qo‘ng‘iroq qiling yoki pastdagi tugma orqali kontaktni oling.</i>`
    : `📞 <b>Kerakli raqamlar</b>\n\nHozircha raqam kiritilmagan.${isTop ? ' “➕ Qo‘shish” tugmasini bosing.' : ' Top menejer qo‘shadi.'}`;
  const rows: any[] = [[ib('👩‍🏫 Ustozlar', 'ph:e:t'), ib('🧑‍💼 Xodimlar', 'ph:e:s')], [ib('🎂 Tug‘ilgan kunlar', 'ph:b')]];
  const cbtn = list.slice(0, 20).map((c, i) => ib(`📲 ${c.name.slice(0, 24)}`, `ph:c:${i}`));
  for (let i = 0; i < cbtn.length; i += 2) rows.push(cbtn.slice(i, i + 2));
  if (isTop) rows.push([ib('➕ Qo‘shish', 'ph:add'), ...(list.length ? [ib('🗑 O‘chirish', 'ph:del')] : [])]);
  await send(chatId, text, { reply_markup: { inline_keyboard: rows } });
}
async function phonesCallback(chatId: number, data: string) {
  const list = await contacts();
  if (data.startsWith('ph:c:')) {
    const c = list[Number(data.slice(5))];
    if (!c) return phonesView(chatId);
    return void tg(await token(), 'sendContact', { chat_id: chatId, phone_number: fmtPhone(c.phone).replace(/\s/g, ''), first_name: c.name.slice(0, 60), last_name: c.role ? `(${c.role.slice(0, 40)})` : undefined });
  }
  if (data.startsWith('ph:e:') || data === 'ph:b' || data.startsWith('ph:k:')) return staffDirectory(chatId, data);
  if (data === 'ph:v') return phonesView(chatId);
  if (role() !== 'top') return void send(chatId, '⛔ Raqamlarni faqat top menejer o‘zgartiradi.', { reply_markup: menu() });
  if (data === 'ph:add') {
    await setSession(chatId, 'ph_name', {});
    return void send(chatId, '👤 Ism va lavozimini yozing.\nMasalan: <b>Aziz Karimov — direktor</b>', { reply_markup: CANCEL_KB });
  }
  if (data === 'ph:del') return void send(chatId, '🗑 Qaysi raqamni o‘chiramiz?', { reply_markup: { inline_keyboard: [...list.map((c, i) => [ib(`❌ ${c.name.slice(0, 30)}${c.role ? ' — ' + c.role.slice(0, 20) : ''}`, `ph:d:${i}`)]), [ib('⬅️ Orqaga', 'ph:v')]] } });
  if (data.startsWith('ph:d:')) {
    const i = Number(data.slice(5));
    if (!list[i]) return phonesView(chatId);
    const [gone] = list.splice(i, 1);
    await saveContacts(list);
    await send(chatId, `🗑 O‘chirildi: ${esc(gone.name)}`);
    return phonesView(chatId);
  }
  return phonesView(chatId);
}

// =========================================================
// 📚 Kitob olish — har bir ustoz o'z guruhi faniga qarab (markazdagi qoldiq ko'rinadi), top menejer tasdiqlaydi
// =========================================================
// Fan nomi Edutizim kursidan: "Ingliz tili (IELTS kurslari)" → "Ingliz tili"
const subjectOf = (course: string) => String(course || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'Boshqa';
const SUBJ_ICONS: [RegExp, string][] = [[/ingliz/i, '🇬🇧'], [/rus/i, '🇷🇺'], [/nemis/i, '🇩🇪'], [/turk/i, '🇹🇷'], [/matem/i, '📐'], [/kimyo/i, '🧪'], [/biolog/i, '🧬'], [/tarix/i, '🏛'], [/ona tili/i, '📖']];
const subjIcon = (s: string) => SUBJ_ICONS.find(([re]) => re.test(s))?.[1] || '📗';
type BookGroup = { id: string; subject: string; group: string; students: number };
const bookCache = new Map<string, { at: number; v: BookGroup[] }>();
async function bookGroups(empId?: string | null) {
  if (!empId) return [];
  const c = bookCache.get(empId);
  if (c && Date.now() - c.at < 600_000) return c.v;
  const { data } = await admin.from('crm_edu_groups').select('id,name,data').eq('data->>teacherId', empId);
  const v = (data || []).filter((g: any) => (g.data?.state || 'active') === 'active').map((g: any) => {
    const subject = g.data?.course?.name ? subjectOf(g.data.course.name) : '';
    return subject ? { id: String(g.id), subject, group: String(g.data?.name || g.name || '').replace(/\s+/g, ' ').trim(), students: Number(g.data?.students) || 0 } : null;
  }).filter(Boolean) as BookGroup[];
  if (v.length) bookCache.set(empId, { at: Date.now(), v });
  return v;
}
const ORDER_ST: Record<string, string> = { pending: '⏳ Kutilmoqda', approved: '✅ Tasdiqlandi', rejected: '❌ Rad etildi', ready: '📦 Tayyor — olib keting' };
async function bookList(subject: string): Promise<string[]> {
  const [lib, { data: st }] = await Promise.all([getSetting<Record<string, string[]>>('eduBooks', {}), admin.from('crm_edu_book_stock').select('title').eq('subject', subject).order('title')]);
  return [...new Set([...((lib || {})[subject] || []), ...(st || []).map((x: any) => x.title)])];
}
async function stockOf(subject: string, title: string) {
  const { data } = await admin.from('crm_edu_book_stock').select('*').eq('subject', subject).ilike('title', title.replace(/[%_]/g, '')).limit(1);
  return (data || [])[0] || null;
}
const orderLine = (o: any, full = false) => `<b>#${o.id}</b> · ${esc(o.book)} — <b>${o.qty} ta</b>\n   ${esc(o.subject)}${o.group_name ? ' · ' + esc(o.group_name) : ''} · ${esc(o.teacher_name)}` +
  (full && (o.students || []).length ? `\n   👥 ${(o.students || []).map((x: any) => esc(x.name)).join(', ')}` : '') +
  (o.note ? `\n   💬 <i>${esc(o.note)}</i>` : '') +
  (o.unit_price && !o.out_tx ? `\n   ${priceLine(o.qty, o.unit_price)}` : '') +
  (o.supplier ? `\n   🏪 @${esc(o.supplier)}` : '') +
  `\n   ${ORDER_ST[o.status] || o.status} · ${dmy(new Date(o.created_at).getTime())}` +
  (o.out_tx ? `\n   💸 Edutizim’dan chiqim: ${sum(o.out_amount)} (${o.qty} × ${sum(o.unit_price)})` : '');

// 📘 Narxli katalog (ustoz tanlaydi → @MarsKitob ga narxi bilan → top menejer tasdiqlasa Edutizim kassasidan chiqim)
// teachers: Edutizim employee_id yoki ism bo'lagi; bo'sh — shu fanning hamma ustozlari. Setting `eduBookCatalog` bilan almashtiriladi.
type CatKit = { name: string; price: number };
type CatItem = { subject: string; title: string; levels: string[]; kits: CatKit[]; teachers?: string[]; supplier?: string };
const LV5 = ['A1', 'A2', 'B1', 'B2', 'C1'];
const BOOK_CATALOG: CatItem[] = [
  { subject: 'nemis', title: 'Netzwerk neu', levels: ['A1', 'A2', 'B1', 'B2'], kits: [{ name: 'Katta komplekt', price: 50000 }, { name: 'Kichik komplekt', price: 30000 }] },
  { subject: 'turk', title: 'Yedi İklim', levels: LV5, kits: [{ name: 'Kichik komplekt', price: 15000 }, { name: 'Katta komplekt', price: 25000 }], teachers: ['6a5712c322d19974688bf631', 'jasmina'] },
  { subject: 'turk', title: 'Yeni İstanbul', levels: LV5, kits: [{ name: 'Komplekt', price: 25000 }], teachers: ['6887244438c8ebe29c4e899a', 'aziza xidirova'] }
];
async function catalogFor(subject: string, empId?: string | null, name?: string | null, list?: CatItem[]): Promise<CatItem[]> {
  const cat = list || await getCatalog();
  const subj = String(subject || '').toLowerCase(), nm = String(name || '').toLowerCase();
  return (Array.isArray(cat) ? cat : BOOK_CATALOG).filter(c => subj.includes(String(c.subject).toLowerCase()) &&
    (!c.teachers?.length || c.teachers.some(t => (empId && t === String(empId)) || (!/^[0-9a-f]{24}$/.test(t) && nm.includes(t.toLowerCase())))));
}
const priceLine = (qty: number, unit?: number | null) => unit ? `💰 ${qty} × ${sum(unit)} = <b>${sum(qty * unit)}</b>` : '';
// Kitob yetkazuvchilar (@MarsKitob, @zomaxcom): har biri o'z kitoblari va buyurtmalarini ko'radi; botga /start bossa chat_id saqlanadi
const SUPPLIER_DEFAULT = 'MarsKitob';
const SUPPLIERS_DEFAULT = ['MarsKitob', 'zomaxcom'];
const supKey = (u: unknown) => String(u || '').replace(/^@/, '').trim().toLowerCase();
async function supplierList(): Promise<string[]> {
  const v = await getSetting<string[]>('bookSuppliers', SUPPLIERS_DEFAULT);
  return (Array.isArray(v) && v.length ? v : SUPPLIERS_DEFAULT).map(x => String(x).replace(/^@/, '').trim()).filter(Boolean);
}
async function supplierName(u?: string | null) { const L = await supplierList(); return L.find(x => supKey(x) === supKey(u || SUPPLIER_DEFAULT)) || String(u || L[0] || SUPPLIER_DEFAULT); }
const itemSup = (c: { supplier?: string }) => c.supplier || SUPPLIER_DEFAULT;
const sameSup = (a?: string | null, b?: string | null) => supKey(a || SUPPLIER_DEFAULT) === supKey(b || SUPPLIER_DEFAULT);
async function supplierChats(): Promise<Record<string, number>> {
  const v = { ...((await getSetting<Record<string, number>>('bookSupplierChats', {})) || {}) };
  const old = await getSetting<any>('bookSupplierChat', null);
  if (old?.id && !v[supKey(old.username || SUPPLIER_DEFAULT)]) v[supKey(old.username || SUPPLIER_DEFAULT)] = Number(old.id);
  return v;
}
async function notifySupplier(sup: string | null | undefined, text: string): Promise<boolean> {
  const id = (await supplierChats())[supKey(sup || SUPPLIER_DEFAULT)];
  if (!id) return false;
  try { await send(id, text); return true; } catch { return false; }
}
const supplierText = (o: any) => `📚 <b>Registan LC — kitob buyurtmasi #${o.id}</b>\n\n📘 ${esc(o.book)}\n📦 Soni: <b>${o.qty} ta</b>\n${priceLine(o.qty, o.unit_price)}\n👩‍🏫 Ustoz: ${esc(o.teacher_name)}${o.group_name ? `\n👥 Guruh: ${esc(o.group_name)}` : ''}${o.note ? `\n💬 ${esc(o.note)}` : ''}`;

// =========================================================
// 🏪 Kitob yetkazuvchi (@MarsKitob) profili: buyurtmalar, “tayyor”, hisob-kitob, kitoblar va narxlar (katalog)
// =========================================================
const B_SUP_ORD = '📚 Buyurtmalar';
const B_SUP_ALL = '🗂 Barcha buyurtmalar';
const B_SUP_SUM = '💰 Hisob-kitob';
const B_SUP_CAT = '📘 Kitoblar va narxlar';
const MENU_SUPPLIER = persist([[B_SUP_ORD, B_SUP_ALL], [B_SUP_CAT, B_SUP_SUM]]);
const CAT_SUBJ = ['Nemis tili', 'Turk tili', 'Ingliz tili', 'Rus tili'];
async function isSupplier(from: any): Promise<string | null> {
  if (!from?.id) return null;
  const L = await supplierList();
  const byName = from.username ? L.find(x => supKey(x) === supKey(from.username)) : null;
  if (byName) return byName;
  const ch = await supplierChats();
  const k = Object.keys(ch).find(k => Number(ch[k]) === Number(from.id));
  return k ? L.find(x => supKey(x) === k) || null : null;
}
async function getCatalog(): Promise<CatItem[]> {
  const c = await getSetting<CatItem[]>('eduBookCatalog', BOOK_CATALOG);
  // nusxa: tahrir paytida standart ro'yxat (BOOK_CATALOG) xotirada o'zgarib qolmasin
  return (JSON.parse(JSON.stringify(Array.isArray(c) ? c : BOOK_CATALOG)) as CatItem[]).map(x => ({ ...x, levels: x.levels || [], kits: x.kits || [] }));
}
async function saveCatalog(cat: CatItem[], change: string, from: any) {
  await admin.from('crm_settings').upsert({ key: 'eduBookCatalog', value: cat });
  const who = from?.username ? '@' + from.username : (from?.first_name || '');
  if (!(await isTopId(from?.id))) await notifyTops(`📘 <b>Kitob katalogi o‘zgardi</b> (${esc(who)})\n${change}`).catch(() => {});
}
async function isTopId(id: any) { return id ? (await topIds()).includes(String(id)) : false; }
const subjLabel = (c: CatItem) => CAT_SUBJ.find(x => x.toLowerCase().includes(String(c.subject).toLowerCase())) || c.subject;
const catLine = (c: CatItem, i: number, showSup = false) => `<b>${i + 1}. ${esc(c.title)}</b> · ${subjIcon(subjLabel(c))} ${esc(subjLabel(c))}${showSup ? ` · 🏪 @${esc(itemSup(c))}` : ''}${c.levels.length ? ` · ${c.levels.join(', ')}` : ''}${c.teachers?.length ? ' · <i>faqat ayrim ustozlar</i>' : ''}\n${c.kits.map(k => `   • ${esc(k.name)} — <b>${sum(k.price)}</b>`).join('\n') || '   <i>komplekt yo‘q</i>'}`;
async function catalogView(chatId: number, sup?: string | null) {
  const all = (await getCatalog()).map((c, i) => ({ c, i }));
  const mine = sup ? all.filter(x => sameSup(itemSup(x.c), sup)) : all;
  await send(chatId, `📘 <b>Kitoblar va narxlar</b>${sup ? ` · 🏪 @${esc(sup)}` : ''}\nUstozlar buyurtmada shu ro‘yxatdan tanlaydi.\n\n${mine.map(x => catLine(x.c, x.i, !sup)).join('\n\n') || '<i>Hali kitob yo‘q — “➕ Yangi kitob” bosing.</i>'}`.slice(0, 4000), {
    reply_markup: { inline_keyboard: [...mine.slice(0, 30).map(x => [ib(`✏️ ${x.i + 1}. ${x.c.title}`.slice(0, 60), `sup:e:${x.i}`)]), [ib('➕ Yangi kitob', 'sup:new')]] }
  });
}
async function catalogEntry(chatId: number, i: number, sup?: string | null) {
  const c = (await getCatalog())[i];
  if (!c || (sup && !sameSup(itemSup(c), sup))) return catalogView(chatId, sup);
  await send(chatId, `📘 ${catLine(c, i, !sup)}`, { reply_markup: { inline_keyboard: [
    ...c.kits.map((k, j) => [ib(`💲 ${k.name}: narxni o‘zgartirish`.slice(0, 60), `sup:p:${i}:${j}`), ib('🗑', `sup:kd:${i}:${j}`)]),
    [ib('➕ Komplekt qo‘shish', `sup:ka:${i}`), ib('🔤 Darajalar', `sup:lv:${i}`)],
    [ib('🗑 Kitobni o‘chirish', `sup:del:${i}`), ib('⬅️ Ro‘yxat', 'sup:cat')]] } });
}
// "Katta komplekt 50000" / "Komplekt - 25 000" / "kichik 30k"
function parseKits(text: string): CatKit[] {
  return String(text).split(/\n|;/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.*?)[\s:—–-]*([\d\s.,]+\s*(k|ming|000)?)\s*(so.?m|сум)?\s*$/i);
    if (!m) return null;
    const price = parseAmount(m[2]);
    const name = m[1].replace(/[\s:—–-]+$/, '').trim() || 'Komplekt';
    return price && price >= 1000 ? { name: name.slice(0, 40), price } : null;
  }).filter(Boolean) as CatKit[];
}
const parseLevels = (t: string) => /^[-–—0]$|^yo.?q$/i.test(t.trim()) ? [] : [...new Set(t.split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(x => x && x.length <= 12))].slice(0, 12);

async function catalogCallback(chatId: number, data: string, s: any, from: any, sup?: string | null) {
  const p = data.split(':');
  const cat = await getCatalog();
  const i = Number(p[2]), j = Number(p[3]);
  const subjKb = { inline_keyboard: [...CAT_SUBJ.map((x, k) => [ib(`${subjIcon(x)} ${x}`, `sup:ns:${k}`)]), [ib('✍️ Boshqa fan (yozaman)', 'sup:ns:-1')]] };
  if (data === 'sup:cat') return catalogView(chatId, sup);
  if (p[1] === 'e') return catalogEntry(chatId, i, sup);
  if (p[1] === 'new') {
    if (sup) { await setSession(chatId, 'sp_new', { supplier: sup }); return void send(chatId, '➕ <b>Yangi kitob</b>\nQaysi fan uchun?', { reply_markup: subjKb }); }
    const L = await supplierList();
    await setSession(chatId, 'sp_new', { sups: L });
    return void send(chatId, '➕ <b>Yangi kitob</b>\nQaysi yetkazuvchi kitobi?', { reply_markup: { inline_keyboard: L.map((x, k) => [ib(`🏪 @${x}`, `sup:nw:${k}`)]) } });
  }
  if (p[1] === 'nw') {
    const x = s?.data?.sups?.[i];
    if (!x) return catalogView(chatId, sup);
    await setSession(chatId, 'sp_new', { supplier: x });
    return void send(chatId, `➕ <b>Yangi kitob</b> · 🏪 @${esc(x)}\nQaysi fan uchun?`, { reply_markup: subjKb });
  }
  if (p[1] === 'ns') {
    const supplier = sup || s?.data?.supplier || SUPPLIER_DEFAULT;
    if (i < 0) { await setSession(chatId, 'sp_subj', { supplier }); return void send(chatId, '✍️ Fan nomini yozing (masalan: Arab tili):', { reply_markup: CANCEL_KB }); }
    await setSession(chatId, 'sp_title', { subject: CAT_SUBJ[i], supplier });
    return void send(chatId, `${subjIcon(CAT_SUBJ[i])} ${CAT_SUBJ[i]}\n\n📘 Kitob nomini yozing (masalan: Netzwerk neu):`, { reply_markup: CANCEL_KB });
  }
  const c = cat[i];
  if (!c || (sup && !sameSup(itemSup(c), sup))) return catalogView(chatId, sup);
  if (p[1] === 'p') { await setSession(chatId, 'sp_price', { i, j }); return void send(chatId, `💲 <b>${esc(c.title)} · ${esc(c.kits[j]?.name || '')}</b>\nHozir: ${sum(c.kits[j]?.price || 0)}\n\nYangi narxni yozing (so‘m):`, { reply_markup: CANCEL_KB }); }
  if (p[1] === 'ka') { await setSession(chatId, 'sp_addkit', { i }); return void send(chatId, `➕ <b>${esc(c.title)}</b> — komplekt nomi va narxi:\n<i>Katta komplekt 50000</i>\n(bir nechta bo‘lsa — har biri yangi qatorda)`, { reply_markup: CANCEL_KB }); }
  if (p[1] === 'lv') { await setSession(chatId, 'sp_lv', { i }); return void send(chatId, `🔤 <b>${esc(c.title)}</b> darajalari: ${c.levels.join(', ') || '—'}\n\nYangi darajalarni yozing: <i>A1, A2, B1, B2</i>\nDarajasiz bo‘lsa: <b>-</b>`, { reply_markup: CANCEL_KB }); }
  if (p[1] === 'kd') {
    if (c.kits.length <= 1) return void send(chatId, '⚠️ Kamida bitta komplekt qolishi kerak. Kitobni butunlay o‘chirish uchun “🗑 Kitobni o‘chirish”.');
    const k = c.kits.splice(j, 1)[0];
    await saveCatalog(cat, `🗑 ${esc(c.title)} · ${esc(k?.name || '')}`, from);
    return catalogEntry(chatId, i, sup);
  }
  if (p[1] === 'del') return void send(chatId, `🗑 <b>${esc(c.title)}</b> katalogdan o‘chirilsinmi?`, { reply_markup: { inline_keyboard: [[ib('✅ Ha, o‘chirish', `sup:dely:${i}`), ib('❌ Yo‘q', `sup:e:${i}`)]] } });
  if (p[1] === 'dely') { cat.splice(i, 1); await saveCatalog(cat, `🗑 Kitob o‘chirildi: ${esc(c.title)} (@${esc(itemSup(c))})`, from); return catalogView(chatId, sup); }
}
// Katalog matn qadamlari (yetkazuvchi va top menejer); qayta ishlansa true
async function catalogStep(chatId: number, s: any, text: string, from: any, sup?: string | null): Promise<boolean> {
  if (!String(s.step || '').startsWith('sp_')) return false;
  const cat = await getCatalog();
  const d = s.data || {};
  const back = (m: string) => send(chatId, m, { reply_markup: menu() });
  switch (s.step) {
    case 'sp_subj':
      if (text.length < 2) { await send(chatId, 'Fan nomini yozing.'); return true; }
      await setSession(chatId, 'sp_title', { ...d, subject: text.slice(0, 40) });
      await send(chatId, '📘 Kitob nomini yozing:', { reply_markup: CANCEL_KB });
      return true;
    case 'sp_title':
      if (text.length < 2) { await send(chatId, 'Kitob nomini yozing.'); return true; }
      await setSession(chatId, 'sp_levels', { ...d, title: text.replace(/\s+/g, ' ').slice(0, 60) });
      await send(chatId, '🔤 Darajalarni yozing: <i>A1, A2, B1, B2</i>\nDarajasiz bo‘lsa: <b>-</b>', { reply_markup: CANCEL_KB });
      return true;
    case 'sp_levels':
      await setSession(chatId, 'sp_kits', { ...d, levels: parseLevels(text) });
      await send(chatId, '💲 Komplektlar va narxlari (har biri yangi qatorda):\n<i>Katta komplekt 50000\nKichik komplekt 30000</i>\n\nBitta narx bo‘lsa: <i>Komplekt 25000</i>', { reply_markup: CANCEL_KB });
      return true;
    case 'sp_kits': {
      const kits = parseKits(text);
      if (!kits.length) { await send(chatId, '⚠️ Narx topilmadi. Masalan: <i>Katta komplekt 50000</i>'); return true; }
      const subj = String(d.subject || '').toLowerCase().replace(/\s*tili\s*$/, '').trim() || String(d.subject || '').toLowerCase();
      const item: CatItem = { subject: subj, title: d.title, levels: d.levels || [], kits, supplier: sup || d.supplier || SUPPLIER_DEFAULT };
      cat.push(item);
      await setSession(chatId, null);
      await saveCatalog(cat, `➕ ${catLine(item, cat.length - 1, true)}`, from);
      await back(`✅ Qo‘shildi:\n\n${catLine(item, cat.length - 1, !sup)}`);
      await catalogView(chatId, sup);
      return true;
    }
    case 'sp_price': {
      const c0 = cat[d.i], c = c0 && (!sup || sameSup(itemSup(c0), sup)) ? c0 : undefined, k = c?.kits[d.j];
      const price = parseAmount(text);
      if (!c || !k) { await setSession(chatId, null); await back('Kitob topilmadi.'); return true; }
      if (!price || price < 1000) { await send(chatId, 'Narxni so‘mda yozing, masalan: 45000 yoki 45k'); return true; }
      const old = k.price; k.price = price;
      await setSession(chatId, null);
      await saveCatalog(cat, `💲 ${esc(c.title)} · ${esc(k.name)}: ${sum(old)} → <b>${sum(price)}</b>`, from);
      await back(`✅ ${esc(c.title)} · ${esc(k.name)} — <b>${sum(price)}</b>`);
      await catalogEntry(chatId, d.i, sup);
      return true;
    }
    case 'sp_addkit': {
      const c = cat[d.i] && (!sup || sameSup(itemSup(cat[d.i]), sup)) ? cat[d.i] : undefined;
      const kits = parseKits(text);
      if (!c) { await setSession(chatId, null); await back('Kitob topilmadi.'); return true; }
      if (!kits.length) { await send(chatId, '⚠️ Masalan: <i>Kichik komplekt 30000</i>'); return true; }
      c.kits.push(...kits);
      await setSession(chatId, null);
      await saveCatalog(cat, `➕ ${esc(c.title)}: ${kits.map(k => `${esc(k.name)} ${sum(k.price)}`).join(', ')}`, from);
      await back('✅ Qo‘shildi.');
      await catalogEntry(chatId, d.i, sup);
      return true;
    }
    case 'sp_lv': {
      const c = cat[d.i] && (!sup || sameSup(itemSup(cat[d.i]), sup)) ? cat[d.i] : undefined;
      if (!c) { await setSession(chatId, null); await back('Kitob topilmadi.'); return true; }
      c.levels = parseLevels(text);
      await setSession(chatId, null);
      await saveCatalog(cat, `🔤 ${esc(c.title)}: ${c.levels.join(', ') || 'darajasiz'}`, from);
      await back('✅ Saqlandi.');
      await catalogEntry(chatId, d.i, sup);
      return true;
    }
  }
  return false;
}
const supFilter = (q: any, sup: string) => supKey(sup) === supKey(SUPPLIER_DEFAULT) ? q.or(`supplier.eq.${sup},supplier.is.null`) : q.eq('supplier', sup);
async function supplierOrders(chatId: number, sup: string, all = false) {
  let q = supFilter(admin.from('crm_edu_book_orders').select('*').not('unit_price', 'is', null), sup).order('created_at', { ascending: false }).limit(25);
  if (!all) q = q.in('status', ['pending', 'approved']);
  const { data } = await q;
  const list: any[] = data || [];
  const line = (o: any) => `<b>#${o.id}</b> · ${esc(o.book)} — <b>${o.qty} ta</b>\n   ${priceLine(o.qty, o.unit_price)}\n   👩‍🏫 ${esc(o.teacher_name)}${o.group_name ? ' · ' + esc(o.group_name) : ''}${o.note ? `\n   💬 <i>${esc(o.note)}</i>` : ''}\n   ${o.status === 'pending' ? '⏳ Top menejer tasdig‘i kutilmoqda' : ORDER_ST[o.status] || o.status} · ${dmy(new Date(o.created_at).getTime())}`;
  const rows: any[] = list.filter(o => o.status === 'approved').slice(0, 15).map(o => [ib(`📦 #${o.id} tayyor`, `sup:d:${o.id}`)]);
  rows.push([ib(all ? '⏳ Faollari' : '🗂 Hammasi', all ? 'sup:list' : 'sup:all')]);
  await send(chatId, list.length ? `📚 <b>${all ? 'Barcha buyurtmalar' : 'Faol buyurtmalar'}</b>\n\n${list.map(line).join('\n\n')}`.slice(0, 4000) : '📚 Faol buyurtma yo‘q.', { reply_markup: { inline_keyboard: rows } });
}
async function supplierSummary(chatId: number, sup: string) {
  const now = new Date(Date.now() + 5 * 3600_000);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5 * 3600_000).toISOString();
  const { data } = await supFilter(admin.from('crm_edu_book_orders').select('*').not('unit_price', 'is', null), sup).gte('created_at', from).neq('status', 'rejected');
  const L: any[] = data || [];
  const tot = (f: (o: any) => boolean) => L.filter(f).reduce((a, o) => a + o.qty * o.unit_price, 0);
  const cnt = (f: (o: any) => boolean) => L.filter(f).reduce((a, o) => a + o.qty, 0);
  const byBook = new Map<string, { n: number; s: number }>();
  L.filter(o => o.status !== 'pending').forEach(o => { const b = byBook.get(o.book) || { n: 0, s: 0 }; b.n += o.qty; b.s += o.qty * o.unit_price; byBook.set(o.book, b); });
  await send(chatId, `💰 <b>Hisob-kitob · shu oy</b>\n\n✅ Tasdiqlangan: <b>${cnt(o => o.status === 'approved')} ta</b> · ${sum(tot(o => o.status === 'approved'))}\n📦 Tayyor/berilgan: <b>${cnt(o => o.status === 'ready')} ta</b> · ${sum(tot(o => o.status === 'ready'))}\n⏳ Tasdiq kutilmoqda: ${cnt(o => o.status === 'pending')} ta · ${sum(tot(o => o.status === 'pending'))}\n💸 Edutizim kassasidan chiqim qilingan: <b>${sum(L.filter(o => o.out_tx).reduce((a, o) => a + (Number(o.out_amount) || 0), 0))}</b>${byBook.size ? `\n\n<b>Kitoblar bo‘yicha:</b>\n${[...byBook.entries()].map(([b, x]) => `• ${esc(b)} — ${x.n} ta · ${sum(x.s)}`).join('\n')}` : ''}`, { reply_markup: menu() });
}
async function supplierReady(chatId: number, id: number, sup?: string | null) {
  const { data: cur } = await admin.from('crm_edu_book_orders').select('supplier').eq('id', id).maybeSingle();
  if (sup && cur && !sameSup(cur.supplier, sup)) return void send(chatId, '⛔ Bu buyurtma sizga tegishli emas.');
  const { data: o } = await admin.from('crm_edu_book_orders').update({ status: 'ready', decided_at: new Date().toISOString() }).eq('id', id).eq('status', 'approved').not('unit_price', 'is', null).select('*').maybeSingle();
  if (!o) return void send(chatId, `ℹ️ #${id} — tasdiqlanmagan yoki allaqachon tayyor.`);
  await send(chatId, `📦 #${o.id} tayyor deb belgilandi. Ustoz va top menejerga xabar berildi.`);
  await send(o.teacher_tg, `📦 Kitob buyurtmangiz <b>#${o.id}</b> tayyor — olib ketishingiz mumkin.\n📘 ${esc(o.book)} — ${o.qty} ta`).catch(() => {});
  await notifyTops(`📦 <b>@${esc(await supplierName(o.supplier))}: buyurtma #${o.id} tayyor</b>\n📘 ${esc(o.book)} — ${o.qty} ta · ${esc(o.teacher_name)}`).catch(() => {});
}
// 🏪 Nashriyotlar (top menejer): ro'yxat, ulanganmi, kitoblari, buyurtmalari, hisob, qo'shish/o'chirish
async function pubStats() {
  const now = new Date(Date.now() + 5 * 3600_000);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5 * 3600_000).toISOString();
  const [L, chats, cat, { data: ords }] = await Promise.all([supplierList(), supplierChats(), getCatalog(),
    admin.from('crm_edu_book_orders').select('supplier,qty,unit_price,status,created_at').not('unit_price', 'is', null).neq('status', 'rejected').gte('created_at', from)]);
  return L.map(name => {
    const os = (ords || []).filter((o: any) => sameSup(o.supplier, name));
    return { name, chat: chats[supKey(name)] || null, books: cat.filter(c => sameSup(itemSup(c), name)).length,
      orders: os.length, pending: os.filter((o: any) => o.status === 'pending').length, approved: os.filter((o: any) => o.status === 'approved').length,
      qty: os.reduce((a: number, o: any) => a + o.qty, 0), total: os.reduce((a: number, o: any) => a + o.qty * o.unit_price, 0) };
  });
}
async function pubsView(chatId: number) {
  const st = await pubStats();
  const lines = st.map((p, i) => `<b>${i + 1}. @${esc(p.name)}</b> · ${p.chat ? '✅ botga ulangan' : '⚠️ /start bosmagan'}\n   📘 ${p.books} ta kitob · 📚 shu oy ${p.orders} ta buyurtma (${p.qty} dona) · <b>${sum(p.total)}</b>${p.pending ? `\n   ⏳ ${p.pending} ta tasdiq kutilmoqda` : ''}${p.approved ? ` · 📦 ${p.approved} ta tayyorlanmoqda` : ''}`);
  await send(chatId, `🏪 <b>Nashriyotlar</b>\nUstoz buyurtmada nashriyotni tanlaydi va uning qo‘shgan kitoblaridan oladi.\n\n${lines.join('\n\n') || '<i>Nashriyot yo‘q</i>'}`, {
    reply_markup: { inline_keyboard: [...st.map((p, i) => [ib(`🏪 @${p.name}`, `pub:v:${i}`)]), [ib('➕ Nashriyot qo‘shish', 'pub:add')]] }
  });
}
async function pubCallback(chatId: number, data: string, s: any) {
  const p = data.split(':');
  const L = await supplierList();
  if (data === 'pub:list') return pubsView(chatId);
  if (data === 'pub:add') { await setSession(chatId, 'pub_add', {}); return void send(chatId, '➕ Nashriyotning Telegram username’ini yozing (masalan: <b>@zomaxcom</b>):', { reply_markup: CANCEL_KB }); }
  const name = L[Number(p[2])];
  if (!name) return pubsView(chatId);
  const i = Number(p[2]);
  if (p[1] === 'v') {
    const st = (await pubStats()).find(x => x.name === name)!;
    return void send(chatId, `🏪 <b>@${esc(name)}</b>\n${st.chat ? '✅ Botga ulangan — buyurtmalar unga avtomatik boradi' : `⚠️ Hali botga /start bosmagan — buyurtmalar unga yetmaydi.\nUnga bot havolasini yuboring.`}\n\n📘 Kitoblari: <b>${st.books}</b> ta\n📚 Shu oy: <b>${st.orders}</b> ta buyurtma · ${st.qty} dona · <b>${sum(st.total)}</b>\n⏳ Tasdiq kutilmoqda: ${st.pending} · 📦 Tayyorlanmoqda: ${st.approved}`, {
      reply_markup: { inline_keyboard: [
        [ib('📘 Kitoblari va narxlari', `pub:c:${i}`), ib('📚 Buyurtmalari', `pub:o:${i}`)],
        [ib('💰 Hisob-kitob (shu oy)', `pub:s:${i}`), { text: `💬 @${name}`, url: `https://t.me/${name}` }],
        [ib('🗑 Nashriyotni o‘chirish', `pub:del:${i}`), ib('⬅️ Nashriyotlar', 'pub:list')]] } });
  }
  if (p[1] === 'c') return catalogView(chatId, name);
  if (p[1] === 'o') return supplierOrders(chatId, name, true);
  if (p[1] === 's') return supplierSummary(chatId, name);
  if (p[1] === 'del') {
    const books = (await getCatalog()).filter(c => sameSup(itemSup(c), name)).length;
    return void send(chatId, `🗑 <b>@${esc(name)}</b> nashriyotlar ro‘yxatidan o‘chirilsinmi?${books ? `\n⚠️ Uning ${books} ta kitobi ustozlarga ko‘rinmay qoladi (katalogda saqlanadi, qayta qo‘shsangiz tiklanadi).` : ''}`, { reply_markup: { inline_keyboard: [[ib('✅ Ha, o‘chirish', `pub:dely:${i}`), ib('❌ Yo‘q', `pub:v:${i}`)]] } });
  }
  if (p[1] === 'dely') {
    await admin.from('crm_settings').upsert({ key: 'bookSuppliers', value: L.filter(x => x !== name) });
    await send(chatId, `🗑 @${esc(name)} o‘chirildi.`);
    return pubsView(chatId);
  }
}
async function supplierUpdate(update: any, sup: string) {
  const from = update.message?.from || update.callback_query?.from;
  const chatId = Number(update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? from.id);
  const chats = await supplierChats();
  if (Number(chats[supKey(sup)]) !== Number(from.id)) await admin.from('crm_settings').upsert({ key: 'bookSupplierChats', value: { ...chats, [supKey(sup)]: Number(from.id) } });
  if (update.callback_query) {
    const q = update.callback_query, data = String(q.data || '');
    tg(await token(), 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    if (data === 'sup:list') return supplierOrders(chatId, sup);
    if (data === 'sup:all') return supplierOrders(chatId, sup, true);
    if (data.startsWith('sup:d:')) return supplierReady(chatId, Number(data.slice(6)), sup);
    if (data.startsWith('sup:')) return catalogCallback(chatId, data, await getSession(chatId), from, sup);
    if (data === 'x') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: menu() }); }
    return;
  }
  const m = update.message;
  if (m.chat?.type !== 'private') return;
  const text = String(m.text || '').trim();
  if (text === '/start' || text === '/menu') {
    await setSession(chatId, null);
    await send(chatId, `🏪 <b>Kitob yetkazuvchi profili</b> · @${esc(sup)} · Registan LC\n\nBu yerda:\n• ${B_SUP_ORD} — ustozlarning buyurtmalari (narxi bilan); tayyor bo‘lsa “📦 tayyor” bosasiz\n• ${B_SUP_CAT} — kitob qo‘shish, narxni o‘zgartirish\n• ${B_SUP_SUM} — shu oy hisob-kitob\n\nYangi buyurtma kelsa — shu yerga xabar keladi.`, { reply_markup: MENU_SUPPLIER });
    return supplierOrders(chatId, sup);
  }
  if (text === B_CANCEL || text === '/cancel') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: MENU_SUPPLIER }); }
  if (text === B_SUP_ORD) return supplierOrders(chatId, sup);
  if (text === B_SUP_ALL) return supplierOrders(chatId, sup, true);
  if (text === B_SUP_SUM) return supplierSummary(chatId, sup);
  if (text === B_SUP_CAT) { await setSession(chatId, null); return catalogView(chatId, sup); }
  const s = await getSession(chatId);
  if (await catalogStep(chatId, s, text, from, sup)) return;
  await send(chatId, 'Pastdagi tugmalardan tanlang.', { reply_markup: MENU_SUPPLIER });
}

// Yangi (oxirgi 30 kun) va to'lov qilgan o'quvchilar; avval kitob buyurtma qilinganlar chiqariladi
const NEW_DAYS = 30;
async function newPaidStudents(empId: string, groupId: string) {
  const r = await edu('read', { path: '/teacher-students-pagin', body: { teacherId: empId }, limit: 200, pages: 10 });
  if (!r.ok) throw new Error(r.error || 'Edutizim');
  const since = Date.now() - NEW_DAYS * DAY;
  const fresh: { id: string; name: string; joinedAt: number }[] = [];
  for (const it of r.items || []) {
    const g = (it.groups || []).find((x: any) => (x.group?._id || x.groupId) === groupId && x.state === 'active');
    const j = g?.joinedAt ? new Date(g.joinedAt).getTime() : 0;
    if (g && j >= since && it.student?._id) fresh.push({ id: String(it.student._id), name: [it.student.firstName, it.student.lastName].filter(Boolean).join(' ').trim(), joinedAt: j });
  }
  if (!fresh.length) return { paid: [], unpaid: [], done: [] };
  const from = Math.min(...fresh.map(x => x.joinedAt)) - 14 * DAY;
  const meta = await edu('kassaMeta');
  if (!meta.ok) throw new Error(meta.error || 'Edutizim kassasi');
  const txs = (await Promise.all((meta.cashboxes || []).map((c: any) => edu('kassaTx', { cashboxId: c.id, type: 'payIn', dateFrom: new Date(from).toISOString(), dateTo: new Date().toISOString() }))))
    .flatMap((x: any) => x.tx || []).filter((t: any) => !t.cancelled && t.type === 'payIn' && t.amount > 0 && t.studentId);
  const paidAt = new Map<string, number>();
  txs.forEach((t: any) => { const tm = new Date(t.date).getTime(); paidAt.set(t.studentId, Math.max(paidAt.get(t.studentId) || 0, tm)); });
  const { data: prev } = await admin.from('crm_edu_book_orders').select('students').eq('group_id', groupId).neq('status', 'rejected');
  const ordered = new Set((prev || []).flatMap((o: any) => (o.students || []).map((x: any) => x.id)));
  const done = fresh.filter(x => ordered.has(x.id));
  const rest = fresh.filter(x => !ordered.has(x.id));
  return {
    paid: rest.filter(x => (paidAt.get(x.id) || 0) >= x.joinedAt - 14 * DAY),
    unpaid: rest.filter(x => !((paidAt.get(x.id) || 0) >= x.joinedAt - 14 * DAY)),
    done
  };
}

// Top menejer: qaysi ustoz nomidan buyurtma (Edutizimdagi aktiv guruhli ustozlar; katalogdagi fanlar birinchi)
async function bookPickTeacher(chatId: number) {
  const { data } = await admin.from('crm_edu_groups').select('data');
  const cat = await getCatalog();
  const m = new Map<string, { id: string; name: string; subj: Set<string> }>();
  for (const g of data || []) {
    const d = g.data || {};
    if ((d.state || 'active') !== 'active' || !d.teacherId || !d.course?.name) continue;
    const t = m.get(d.teacherId) || m.set(d.teacherId, { id: String(d.teacherId), name: tName(d.teacher), subj: new Set() }).get(d.teacherId)!;
    t.subj.add(subjectOf(d.course.name));
  }
  const inCat = (t: any) => [...t.subj].some((x: string) => cat.some(c => x.toLowerCase().includes(String(c.subject).toLowerCase())));
  const list = [...m.values()].sort((a, b) => Number(inCat(b)) - Number(inCat(a)) || a.name.localeCompare(b.name)).slice(0, 60)
    .map(t => ({ id: t.id, name: t.name, subj: [...t.subj].join(', ') }));
  if (!list.length) return void send(chatId, '📚 Edutizim’da aktiv guruhli ustoz topilmadi.', { reply_markup: menu() });
  await setSession(chatId, 'bk_tp', { teachers: list });
  await send(chatId, '📚 <b>Kitob buyurtma (top menejer)</b>\nQaysi ustoz guruhi uchun?', { reply_markup: { inline_keyboard: [...list.map((t, i) => [ib(`${subjIcon(t.subj)} ${t.name} · ${t.subj}`.slice(0, 60), `bkt:tp:${i}`)]), [ib('📋 Buyurtmalarim', 'bkt:my')]] } });
}
async function bookStart(chatId: number, forT?: { id: string; name: string }) {
  const groups = await bookGroups(forT?.id || me()?.employee_id);
  if (!groups.length) return void send(chatId, forT ? `📚 ${esc(forT.name)} — aktiv guruh topilmadi.` : '📚 Edutizim’da sizning aktiv guruhingiz topilmadi. Guruh yaqinda ochilgan bo‘lsa, ma’lumotlar har soatda yangilanadi.', { reply_markup: menu() });
  await setSession(chatId, 'bk', { groups, ...(forT ? { forEmp: forT.id, forName: forT.name } : {}) });
  await send(chatId, `📚 <b>Kitob buyurtma</b>${forT ? ` · 👩‍🏫 ${esc(forT.name)}` : ''}\n\nKitob faqat <b>to‘lov qilgan yangi o‘quvchilar</b> (oxirgi ${NEW_DAYS} kunda guruhga qo‘shilgan) uchun buyurtma qilinadi.\n\nQaysi guruh?`, {
    reply_markup: { inline_keyboard: [...groups.map((g, i) => [ib(`${subjIcon(g.subject)} ${g.group.slice(0, 40)} · ${g.students} o‘q.`, `bkt:g:${i}`)]), [ib('📋 Buyurtmalarim', 'bkt:my')]] }
  });
}
async function bookPickStudents(chatId: number, d: any) {
  const sel = new Set<string>(d.sel || []);
  const paid = d.paid || [];
  const lines = [
    `📚 ${esc(d.subject)} · ${esc(d.group)}`, '',
    `✅ <b>To‘lov qilgan yangi o‘quvchilar (${paid.length}):</b>`,
    ...(paid.length ? paid.map((x: any) => `   ${sel.has(x.id) ? '☑️' : '⬜'} ${esc(x.name)} · ${dmy(x.joinedAt)} qo‘shilgan`) : ['   —'])
  ];
  if (d.unpaid?.length) lines.push('', `⛔ <b>Hali to‘lov qilmagan (${d.unpaid.length})</b> — kitob berilmaydi:`, ...d.unpaid.map((x: any) => `   • ${esc(x.name)}`));
  if (d.done?.length) lines.push('', `📦 <b>Avval buyurtma qilingan (${d.done.length}):</b>`, ...d.done.map((x: any) => `   • ${esc(x.name)}`));
  const rows: any[] = paid.slice(0, 30).map((x: any, i: number) => [ib(`${sel.has(x.id) ? '☑️' : '⬜'} ${x.name.slice(0, 40)}`, `bkt:t:${i}`)]);
  if (paid.length) rows.push([ib('☑️ Hammasi', 'bkt:t:all'), ib(`➡️ Davom etish (${sel.size} ta)`, 'bkt:n')]);
  else lines.push('', 'Bu guruhda kitob buyurtma qilish mumkin bo‘lgan o‘quvchi yo‘q.');
  rows.push([ib('⬅️ Guruhlar', 'bkt:new')]);
  await send(chatId, lines.join('\n').slice(0, 4000), { reply_markup: { inline_keyboard: rows } });
}
async function bookAskBook(chatId: number, d: any) {
  // 1) Nashriyot (yetkazuvchi) tanlanadi → 2) uning qo'shgan kitoblari (shu fan/ustozga mosi; mos kelmasa — hammasi)
  const all = await getCatalog();
  const pubs = (await supplierList()).filter(x => all.some(c => sameSup(itemSup(c), x)));
  if (pubs.length > 1 && !d.pub) {
    const fit = await catalogFor(d.subject, d.forEmp || me()?.employee_id, d.forName || me()?.full_name, all);
    await setSession(chatId, 'bk_book', { ...d, books: [], pubs });
    return void send(chatId, `📚 ${subjIcon(d.subject)} ${esc(d.subject)}${d.group ? ' · ' + esc(d.group) : ''} · <b>${d.qty} ta</b> kerak\n\n🏪 <b>Qaysi nashriyotdan?</b>`, { reply_markup: { inline_keyboard: [
      ...pubs.map((x, i) => { const n = all.filter(c => sameSup(itemSup(c), x)).length, f = fit.filter(c => sameSup(itemSup(c), x)).length; return [ib(`🏪 @${x} · ${n} ta kitob${f ? ` (${f} tasi sizning faningizga)` : ''}`.slice(0, 60), `bkt:pub:${i}`)]; }),
      [ib('✍️ Boshqa kitob (yozaman)', 'bkt:b:-1')]] } });
  }
  const pub = d.pub || (pubs.length === 1 ? pubs[0] : null);
  let cat: CatItem[] = [];
  if (pub) {
    const mine = all.filter(c => sameSup(itemSup(c), pub));
    const fit = await catalogFor(d.subject, d.forEmp || me()?.employee_id, d.forName || me()?.full_name, mine);
    cat = fit.length ? fit : d.pub ? mine : [];
  }
  if (cat.length) {
    await setSession(chatId, 'bk_book', { ...d, books: [], cat });
    const txt = cat.map(c => `📘 <b>${esc(c.title)}</b>${c.levels.length ? ` (${c.levels.join(', ')})` : ''} · 🏪 @${esc(itemSup(c))}\n${c.kits.map(k => `   • ${esc(k.name)} — <b>${sum(k.price)}</b>`).join('\n')}`).join('\n\n');
    const rows: any[] = [];
    cat.forEach((c, ci) => { const lv = c.levels.length ? c.levels : ['']; for (let i = 0; i < lv.length; i += 3) rows.push(lv.slice(i, i + 3).map((l, j) => ib(`📘 ${c.title} ${l}`.trim(), `bkt:c:${ci}:${i + j}`))); });
    rows.push(pubs.length > 1 ? [ib('⬅️ Nashriyotlar', 'bkt:pubs'), ib('✍️ Boshqa kitob', 'bkt:b:-1')] : [ib('✍️ Boshqa kitob (yozaman)', 'bkt:b:-1')]);
    return void send(chatId, `${pub && pubs.length > 1 ? `🏪 <b>@${esc(pub)}</b> kitoblari\n` : ''}📚 ${subjIcon(d.subject)} ${esc(d.subject)}${d.group ? ' · ' + esc(d.group) : ''} · <b>${d.qty} ta</b> kerak\n\n${txt}\n\nKitob va darajani tanlang:`, { reply_markup: { inline_keyboard: rows } });
  }
  const books = await bookList(d.subject);
  const { data: st } = await admin.from('crm_edu_book_stock').select('title,qty').eq('subject', d.subject);
  const cnt = new Map((st || []).map((x: any) => [String(x.title).toLowerCase(), Number(x.qty) || 0]));
  const lbl = (b: string) => { const n = cnt.get(b.toLowerCase()); return n === undefined ? 'omborda yo‘q' : n === 0 ? '❌ tugagan' : `omborda ${n} ta${n < d.qty ? ' ⚠️' : ''}`; };
  await setSession(chatId, 'bk_book', { ...d, books });
  await send(chatId, `📚 ${subjIcon(d.subject)} ${esc(d.subject)}${d.group ? ' · ' + esc(d.group) : ''} · <b>${d.qty} ta</b> kerak\n\n<b>Markazdagi kitoblar:</b>\n${books.length ? books.slice(0, 20).map(b => `📘 ${esc(b)} — ${lbl(b)}`).join('\n') : '<i>Bu fan uchun omborda kitob yo‘q — nomini yozing.</i>'}\n\nQaysi kitob?`, {
    reply_markup: { inline_keyboard: [...books.slice(0, 20).map((b, i) => [ib(`📘 ${b.slice(0, 34)} · ${lbl(b)}`, `bkt:b:${i}`)]), [ib('✍️ Boshqa kitob (yozaman)', 'bkt:b:-1')]] }
  });
  if (!books.length) await send(chatId, '✍️ Kitob nomini yozing:', { reply_markup: CANCEL_KB });
}
async function bookAskNote(chatId: number, d: any) {
  await setSession(chatId, 'bk_note', d);
  await send(chatId, `💬 Izoh (ixtiyoriy): daraja, nashr, muddat…\nYoki “${B_SKIP}”.`, { reply_markup: SKIP_KB });
}
async function bookConfirm(chatId: number, d: any) {
  await setSession(chatId, 'bk_ok', d);
  await send(chatId, `🧾 <b>Buyurtmani tekshiring</b>\n\n📚 ${esc(d.subject)}${d.group ? ' · ' + esc(d.group) : ''}\n📘 ${esc(d.book)} — <b>${d.qty} ta</b>${d.unitPrice ? `\n${priceLine(d.qty, d.unitPrice)}` : ''}\n👥 ${(d.students || []).map((x: any) => esc(x.name)).join(', ')}${d.note ? `\n💬 ${esc(d.note)}` : ''}${d.unitPrice ? `\n\n📤 Buyurtma @${esc(await supplierName(d.supplier))} ga va top menejerga boradi.` : ''}`, {
    reply_markup: { inline_keyboard: [[ib('✅ Yuborish', 'bkt:ok'), ib('❌ Bekor', 'x')]] }
  });
}
async function bookSubmit(chatId: number, d: any, from: any) {
  const u = me();
  const { data: o, error } = await admin.from('crm_edu_book_orders').insert({
    teacher_tg: from.id, teacher_name: d.forName || u?.full_name || from.first_name || 'Ustoz', employee_id: d.forEmp || u?.employee_id || null,
    subject: d.subject, group_name: d.group || null, group_id: d.groupId || null, book: d.book, qty: d.qty, note: [d.forName ? `Top menejer buyurtmasi: ${u?.full_name || from.first_name || ''}` : '', d.note || ''].filter(Boolean).join(' · ') || null, unit_price: d.unitPrice || null, supplier: d.unitPrice ? await supplierName(d.supplier) : null,
    students: (d.students || []).map((x: any) => ({ id: x.id, name: x.name }))
  }).select('*').single();
  await setSession(chatId, null);
  if (error || !o) return void send(chatId, `⚠️ Saqlab bo‘lmadi: ${esc(error?.message || '')}`, { reply_markup: menu() });
  let supLine = '';
  if (o.unit_price) {
    const sup = await supplierName(o.supplier);
    const okSup = await notifySupplier(sup, supplierText(o) + '\n\n⏳ Top menejer tasdiqlashi kutilmoqda.');
    supLine = okSup ? `\n📤 @${esc(sup)} ga yuborildi ✅` : `\n⚠️ @${esc(sup)} hali botga /start bosmagan — xabar unga yetmadi`;
    await send(chatId, `✅ Buyurtma <b>#${o.id}</b> yuborildi.\n${priceLine(o.qty, o.unit_price)}${okSup ? `\n📤 @${esc(sup)} ga yetkazildi.` : ''}\nTop menejer tasdiqlagach javob shu yerga keladi.`, { reply_markup: menu() });
    if (!okSup) await send(chatId, `📤 @${esc(sup)} ga o‘zingiz ham yuborishingiz mumkin — matnni nusxalang:\n\n<code>${esc(supplierText(o).replace(/<[^>]+>/g, ''))}</code>`, { reply_markup: { inline_keyboard: [[{ text: `💬 @${sup} ni ochish`, url: `https://t.me/${sup}` }]] } });
  } else await send(chatId, `✅ Buyurtma <b>#${o.id}</b> top menejerga yuborildi. Javob shu yerga keladi.`, { reply_markup: menu() });
  const stN = await stockOf(o.subject, o.book);
  const stLine = o.unit_price ? '' : !stN ? '\n📦 Omborda bu kitob yo‘q — sotib olish kerak' : stN.qty >= o.qty ? `\n📦 Omborda: ${stN.qty} ta ✅ yetadi` : `\n📦 Omborda: ${stN.qty} ta — ⚠️ ${o.qty - stN.qty} ta yetishmaydi`;
  const okBtn = o.unit_price ? ib(`✅ Tasdiqlash + chiqim ${sum(o.qty * o.unit_price)}`, `bko:a:${o.id}`) : ib('✅ Tasdiqlash', `bko:a:${o.id}`);
  await notifyTops(`📚 <b>Yangi kitob buyurtmasi</b>\n<i>Faqat to‘lov qilgan yangi o‘quvchilar uchun</i>\n\n${orderLine(o, true)}${stLine}${supLine}${o.unit_price ? '\n\n<i>Tasdiqlasangiz shu summa Edutizim kassasidan “Kitob” chiqimi bo‘lib yoziladi.</i>' : ''}`, { reply_markup: { inline_keyboard: [[okBtn], [ib('❌ Rad etish', `bko:r:${o.id}`)]] } });
}
async function myBookOrders(chatId: number, tgId: number) {
  const { data } = await admin.from('crm_edu_book_orders').select('*').eq('teacher_tg', tgId).order('created_at', { ascending: false }).limit(15);
  await send(chatId, data?.length ? `📋 <b>Buyurtmalarim</b>\n\n${data.map((o: any) => orderLine(o, true)).join('\n\n')}` : '📋 Hali buyurtma yo‘q.', { reply_markup: { inline_keyboard: [[ib('➕ Yangi buyurtma', 'bkt:new')]] } });
}
async function bookTeacherCallback(chatId: number, data: string, s: any, from: any) {
  if (data === 'bkt:my') return myBookOrders(chatId, from.id);
  if (data === 'bkt:new') return role() === 'top' ? bookPickTeacher(chatId) : bookStart(chatId);
  if (data === 'bkt:tp') return bookPickTeacher(chatId);
  if (data.startsWith('bkt:tp:')) {
    const t = s.step === 'bk_tp' ? s.data.teachers?.[Number(data.slice(7))] : null;
    return t ? bookStart(chatId, t) : bookPickTeacher(chatId);
  }
  if (data.startsWith('bkt:g:')) {
    const g = s.step === 'bk' ? s.data.groups?.[Number(data.slice(6))] : null;
    if (!g) return bookStart(chatId);
    await typing(chatId);
    let r;
    try { r = await newPaidStudents(s.data.forEmp || me()?.employee_id, g.id); } catch (e) { return void send(chatId, `⚠️ Edutizim’dan o‘quvchilarni olib bo‘lmadi: ${esc((e as Error).message)}`, { reply_markup: menu() }); }
    const d = { forEmp: s.data.forEmp, forName: s.data.forName, subject: g.subject, group: g.group, groupId: g.id, paid: r.paid, unpaid: r.unpaid, done: r.done, sel: r.paid.map(x => x.id) };
    await setSession(chatId, 'bk_st', d);
    return bookPickStudents(chatId, d);
  }
  if (data.startsWith('bkt:t:')) {
    if (s.step !== 'bk_st') return bookStart(chatId);
    const sel = new Set<string>(s.data.sel || []);
    const k = data.slice(6);
    if (k === 'all') (s.data.paid || []).forEach((x: any) => sel.add(x.id));
    else { const x = s.data.paid?.[Number(k)]; if (x) sel.has(x.id) ? sel.delete(x.id) : sel.add(x.id); }
    const d = { ...s.data, sel: [...sel] };
    await setSession(chatId, 'bk_st', d);
    return bookPickStudents(chatId, d);
  }
  if (data === 'bkt:n') {
    if (s.step !== 'bk_st') return bookStart(chatId);
    const students = (s.data.paid || []).filter((x: any) => (s.data.sel || []).includes(x.id));
    if (!students.length) return void send(chatId, 'Kamida bitta to‘lov qilgan o‘quvchini belgilang.');
    const { paid: _p, unpaid: _u, done: _d, sel: _s, ...rest } = s.data;
    return bookAskBook(chatId, { ...rest, students, qty: students.length });
  }
  if (data.startsWith('bkt:c:') || data.startsWith('bkt:k:')) {
    if (s.step !== 'bk_book' || !s.data.cat) return bookStart(chatId);
    const [, k, ci, li, ki] = data.split(':');
    const c: CatItem | undefined = s.data.cat[Number(ci)];
    const lv = c ? (c.levels.length ? c.levels[Number(li)] : '') : undefined;
    if (!c || lv === undefined) return bookAskBook(chatId, s.data);
    const kit = k === 'k' ? c.kits[Number(ki)] : c.kits.length === 1 ? c.kits[0] : null;
    if (!kit) return void send(chatId, `📘 <b>${esc(`${c.title} ${lv}`.trim())}</b> — qaysi komplekt? (${s.data.qty} ta)`, {
      reply_markup: { inline_keyboard: [...c.kits.map((x, i) => [ib(`${x.name} — ${sum(x.price)} × ${s.data.qty} = ${sum(x.price * s.data.qty)}`, `bkt:k:${ci}:${li}:${i}`)]), [ib('⬅️ Kitoblar', 'bkt:cb')]] } });
    const { books: _b, cat: _c, pubs: _ps, pub: _p, ...rest } = s.data;
    return bookAskNote(chatId, { ...rest, book: `${`${c.title} ${lv}`.trim()} · ${kit.name}`, unitPrice: kit.price, supplier: itemSup(c) });
  }
  if (data.startsWith('bkt:pub:') || data === 'bkt:pubs') {
    if (s.step !== 'bk_book') return bookStart(chatId);
    const { books: _b, cat: _c, pubs, pub: _p, ...rest } = s.data;
    const pub = data === 'bkt:pubs' ? undefined : pubs?.[Number(data.slice(8))];
    return bookAskBook(chatId, pub ? { ...rest, pub } : rest);
  }
  if (data === 'bkt:cb') {
    if (s.step !== 'bk_book') return bookStart(chatId);
    const { books: _b, cat: _c, pubs: _ps, ...rest } = s.data;
    return bookAskBook(chatId, rest);
  }
  if (data.startsWith('bkt:b:')) {
    if (s.step !== 'bk_book') return bookStart(chatId);
    const i = Number(data.slice(6));
    if (i < 0) { await setSession(chatId, 'bk_book', s.data); return void send(chatId, '✍️ Kitob nomini yozing:', { reply_markup: CANCEL_KB }); }
    const book = s.data.books?.[i];
    if (!book) return bookAskBook(chatId, s.data);
    const { books: _b, ...rest } = s.data;
    return bookAskNote(chatId, { ...rest, book });
  }
  if (data === 'bkt:ok') {
    if (s.step !== 'bk_ok') return void send(chatId, 'Buyurtma eskirgan, qaytadan boshlang.', { reply_markup: menu() });
    return bookSubmit(chatId, s.data, from);
  }
}

// Top menejer: buyurtmalar ro'yxati va kitoblar ro'yxatini boshqarish
async function bookOrdersTop(chatId: number, all = false) {
  let q = admin.from('crm_edu_book_orders').select('*').order('created_at', { ascending: false }).limit(25);
  if (!all) q = q.in('status', ['pending', 'approved']);
  const { data } = await q;
  const list = data || [];
  const pend = list.filter(o => o.status === 'pending').length;
  const rows: any[] = [];
  list.filter(o => o.status === 'pending' || o.status === 'approved').slice(0, 12).forEach(o => rows.push(o.status === 'pending'
    ? [ib(`✅ #${o.id}`, `bko:a:${o.id}`), ib(`❌ #${o.id}`, `bko:r:${o.id}`)]
    : [...(o.out_tx ? [] : [ib(`💸 #${o.id} chiqim`, `bko:o:${o.id}`)]), ib(`📦 #${o.id} tayyor`, `bko:d:${o.id}`)]));
  rows.push([ib(all ? '⏳ Faqat faollari' : '🗂 Hammasi (oxirgi 25)', all ? 'bko:list' : 'bko:all'), ib('📦 Kitoblar ombori', 'om:v')]);
  rows.push([ib('📘 Kitoblar va narxlar (katalog)', 'sup:cat'), ib('➕ Buyurtma berish', 'bkt:tp')]);
  await send(chatId, list.length
    ? `📚 <b>Kitob buyurtmalari</b>${all ? '' : ` · faol (${pend} ta kutilmoqda)`}\n\n${list.map(o => orderLine(o, true)).join('\n\n')}`.slice(0, 4000)
    : '📚 Faol kitob buyurtmasi yo‘q.', { reply_markup: { inline_keyboard: rows } });
}
async function bookOrderAction(chatId: number, data: string, from: any) {
  const [, act, idRaw] = data.split(':');
  if (act === 'list') return bookOrdersTop(chatId);
  if (act === 'all') return bookOrdersTop(chatId, true);
  const id = Number(idRaw);
  if (act === 'o') {
    const { data: o } = await admin.from('crm_edu_book_orders').select('*').eq('id', id).maybeSingle();
    if (!o) return void send(chatId, 'Buyurtma topilmadi.');
    if (o.out_tx) return void send(chatId, `ℹ️ #${id} uchun chiqim allaqachon qilingan: ${sum(o.out_amount)}.`);
    if (!['approved', 'ready'].includes(o.status)) return void send(chatId, 'Avval buyurtmani tasdiqlang.');
    await setSession(chatId, 'bk_price', { id });
    return void send(chatId, `💸 <b>#${o.id} · ${esc(o.book)} — ${o.qty} ta</b>\n\nBitta kitob narxini yozing (so‘m):`, { reply_markup: CANCEL_KB });
  }
  if (act === 'y') return bookPayoutExecute(chatId, id, from);
  const status = act === 'a' ? 'approved' : act === 'r' ? 'rejected' : (act === 'd' || act === 'dn') ? 'ready' : '';
  if (!status) return;
  const allowedFrom = status === 'ready' ? ['approved', 'pending'] : ['pending'];
  const by = me()?.full_name || from.first_name || 'Top menejer';
  let stockNote = '';
  if (status === 'ready') {
    // 📦 Ombordan ayirish (bitta buyurtma — bir marta; “dn” — ombordan ayirmasdan)
    const { data: cur } = await admin.from('crm_edu_book_orders').select('*').eq('id', id).maybeSingle();
    if (!cur || !allowedFrom.includes(cur.status)) return void send(chatId, `ℹ️ #${id} buyurtma allaqachon ko‘rib chiqilgan.`);
    const st = act === 'd' ? await stockOf(cur.subject, cur.book) : null;
    if (st) {
      const { data: left, error } = await admin.rpc('crm_book_stock_move', { p_book: st.id, p_delta: -cur.qty, p_kind: 'order', p_order: cur.id, p_note: `Buyurtma #${cur.id} · ${cur.teacher_name}`, p_by: by });
      if (error) return void send(chatId, `⚠️ Omborda yetarli emas: <b>${esc(st.title)}</b> — ${st.qty} ta bor, ${cur.qty} ta kerak.`, { reply_markup: { inline_keyboard: [[ib('➕ Omborga kirim', `om:q:in:${st.id}`)], [ib('Baribir tayyor (ombordan ayirmasdan)', `bko:dn:${cur.id}`)]] } });
      stockNote = `\n📦 Ombordan ayirildi: ${cur.qty} ta · qoldiq: <b>${left}</b>${Number(left) <= st.min_qty ? ' ⚠️ kam qoldi' : ''}`;
      await stockAlert(st, Number(left), from?.id);
    } else if (act === 'd') stockNote = '\nℹ️ Bu kitob omborda ro‘yxatda yo‘q — qoldiqdan ayirilmadi.';
  }
  const { data: o } = await admin.from('crm_edu_book_orders').update({ status, decided_by: by, decided_at: new Date().toISOString() }).eq('id', id).in('status', allowedFrom).select('*').maybeSingle();
  if (!o) return void send(chatId, `ℹ️ #${id} buyurtma allaqachon ko‘rib chiqilgan.`);
  const stA = status === 'approved' ? await stockOf(o.subject, o.book) : null;
  if (status === 'approved' && !o.unit_price) stockNote = stA ? `\n📦 Omborda: <b>${stA.qty}</b> ta${stA.qty < o.qty ? ` — ⚠️ ${o.qty - stA.qty} ta yetishmaydi` : ' ✅ yetadi'}` : '\n📦 Omborda bu kitob yo‘q';
  await send(chatId, `${ORDER_ST[status]}: #${o.id} · ${esc(o.book)} — ${o.qty} ta (${esc(o.teacher_name)})${stockNote}`, status === 'approved' && !o.unit_price ? { reply_markup: { inline_keyboard: [[ib('💸 Edutizim’dan chiqim qilish', `bko:o:${o.id}`)], [ib('📦 Tayyor bo‘lganda bosing', `bko:d:${o.id}`)]] } } : {});
  if (o.unit_price && (status === 'approved' || status === 'rejected')) {
    await notifySupplier(o.supplier, status === 'approved' ? `✅ <b>Buyurtma #${o.id} tasdiqlandi</b>\n📘 ${esc(o.book)} — ${o.qty} ta\n${priceLine(o.qty, o.unit_price)}\nTayyorlashingiz mumkin.` : `❌ Buyurtma #${o.id} bekor qilindi (${esc(o.book)} — ${o.qty} ta).`);
  }
  const msg = status === 'approved' ? `✅ Kitob buyurtmangiz <b>#${o.id}</b> tasdiqlandi.\n📘 ${esc(o.book)} — ${o.qty} ta\nTayyor bo‘lganda xabar beramiz.`
    : status === 'rejected' ? `❌ Kitob buyurtmangiz <b>#${o.id}</b> rad etildi.\n📘 ${esc(o.book)} — ${o.qty} ta\nSavol bo‘lsa, top menejerga yozing.`
    : `📦 Kitob buyurtmangiz <b>#${o.id}</b> tayyor — olib ketishingiz mumkin.\n📘 ${esc(o.book)} — ${o.qty} ta`;
  await send(o.teacher_tg, msg).catch(() => {});
  // Narxli katalog buyurtmasi: tasdiq = Edutizim kassasidan chiqim
  if (status === 'approved' && o.unit_price && !o.out_tx) {
    await setSession(chatId, 'bk_pay', { id: o.id, price: o.unit_price, amount: o.unit_price * o.qty });
    await bookPayoutExecute(chatId, o.id, from);
  }
}
// 💸 Kitob puli — Edutizim kassasidan chiqim (top menejerning shaxsiy akkaunti bilan, bo'lmasa umumiy)
async function bookPayoutMeta() {
  const meta = await edu('kassaMeta');
  if (!meta.ok) throw new Error(meta.error || 'Edutizim kassasi');
  const out = (meta.types || []).filter((t: any) => t.type === 'payOut');
  const type = out.find((t: any) => /kitob/i.test(t.name)) || out.find((t: any) => /kanstovar/i.test(t.name));
  const method = (meta.methods || []).find((m: any) => /^\s*naqd\s*$/i.test(m.name)) || (meta.methods || [])[0];
  const cashbox = (meta.cashboxes || []).find((c: any) => !c.frozen);
  if (!type || !method || !cashbox) throw new Error('Kassa, “Kitob” chiqim turi yoki to‘lov usuli topilmadi');
  return { type, method, cashbox };
}
async function bookPayoutConfirm(chatId: number, id: number, price: number) {
  const { data: o } = await admin.from('crm_edu_book_orders').select('*').eq('id', id).maybeSingle();
  if (!o || o.out_tx) { await setSession(chatId, null); return void send(chatId, o ? 'Chiqim allaqachon qilingan.' : 'Buyurtma topilmadi.', { reply_markup: menu() }); }
  let m;
  try { m = await bookPayoutMeta(); } catch (e) { return void send(chatId, `⚠️ ${esc((e as Error).message)}`, { reply_markup: menu() }); }
  const amount = price * o.qty;
  await setSession(chatId, 'bk_pay', { id, price, amount });
  await send(chatId, '✅', { reply_markup: menu() });
  await send(chatId, `💸 <b>Edutizim’ga chiqim</b>\n\n🏦 Kassa: ${esc(m.cashbox.name)}\n📂 Tur: <b>${esc(m.type.name)}</b>\n💳 Usul: ${esc(m.method.name)}\n💰 Summa: <b>${sum(amount)}</b> (${o.qty} × ${sum(price)})\n💬 Izoh: Kitob #${o.id}: ${esc(o.book)} × ${o.qty} · ${esc(o.teacher_name)}\n\nTasdiqlaysizmi? Amal Edutizim kassasiga darhol yoziladi.`, {
    reply_markup: { inline_keyboard: [[ib('✅ Chiqim qilish', `bko:y:${id}`), ib('❌ Bekor', 'x')]] }
  });
}
async function bookPayoutExecute(chatId: number, id: number, from: any) {
  const s = await getSession(chatId);
  if (s.step !== 'bk_pay' || s.data.id !== id) return void send(chatId, 'Amal eskirgan — qaytadan “💸 Chiqim” ni bosing.', { reply_markup: menu() });
  await setSession(chatId, 'bk_busy', {});
  const { data: o } = await admin.from('crm_edu_book_orders').select('*').eq('id', id).maybeSingle();
  if (!o || o.out_tx) { await setSession(chatId, null); return void send(chatId, 'Chiqim allaqachon qilingan.', { reply_markup: menu() }); }
  let m;
  try { m = await bookPayoutMeta(); } catch (e) { await setSession(chatId, null); return void send(chatId, `⚠️ ${esc((e as Error).message)}`, { reply_markup: menu() }); }
  const by = from?.username ? '@' + from.username : (from?.first_name || '');
  const r = await edu('kassaPay', { asTg: chatId, kind: 'out', cashboxId: m.cashbox.id, paymentTransactionId: m.type.id, paymentMethodId: m.method.id,
    amount: s.data.amount, comment: `[Bot ${by}] Kitob #${o.id}: ${o.book} × ${o.qty} · ${o.teacher_name}`.slice(0, 200), by });
  await setSession(chatId, null);
  if (!r.ok) return void send(chatId, `⚠️ Kassaga yozilmadi: ${esc(r.error)}`, { reply_markup: menu() });
  await admin.from('crm_edu_book_orders').update({ unit_price: s.data.price, out_amount: s.data.amount, out_tx: r.id || 'ok', out_at: new Date().toISOString(), out_by: me()?.full_name || by }).eq('id', id);
  await sticker(chatId, 'bajarildi');
  const rows: any[] = [];
  if (r.id) rows.push([ib('↩️ Chiqimni bekor qilish', `kx:${r.id}`)]);
  if (o.status !== 'ready') rows.push([ib('📦 Kitob tayyor', `bko:d:${o.id}`)]);
  await send(chatId, `✅ <b>Edutizim kassasiga chiqim yozildi</b>\n#${o.id} · ${esc(o.book)} — ${o.qty} ta\n💰 ${sum(s.data.amount)} · ${esc(m.type.name)}`, { reply_markup: rows.length ? { inline_keyboard: rows } : menu() });
  await notifyOthers(`💸 Kitob chiqimi: #${o.id} · ${esc(o.book)} × ${o.qty} · <b>${sum(s.data.amount)}</b> · ${esc(by)}`, from?.id);
}

async function bookLibrary(chatId: number, data: string) {
  const books = (await getSetting<Record<string, string[]>>('eduBooks', {})) || {};
  const subj = data.endsWith(':N') ? 'Nemis tili' : data.endsWith(':T') ? 'Turk tili' : '';
  if (data === 'bkl:v') return stockView(chatId);
  if (data === 'bkl:old') {
    const txt = [['', 'Nemis tili'], ['', 'Turk tili']].map(([, s]) => `<b>${s}</b>\n${(books[s] || []).map((b, i) => `${i + 1}. ${esc(b)}`).join('\n') || '<i>bo‘sh</i>'}`).join('\n\n');
    return void send(chatId, `📚 <b>Kitoblar ro‘yxati</b> (ustozlar shundan tanlaydi)\n\n${txt}`, { reply_markup: { inline_keyboard: [
      [ib('➕ Nemis tili', 'bkl:add:N'), ib('➕ Turk tili', 'bkl:add:T')], [ib('🗑 Nemis tili', 'bkl:del:N'), ib('🗑 Turk tili', 'bkl:del:T')], [ib('⬅️ Buyurtmalar', 'bko:list')]] } });
  }
  if (data.startsWith('bkl:add:')) { await setSession(chatId, 'bk_lib', { subject: subj }); return void send(chatId, `➕ ${subj} uchun kitob nomini yozing (bir nechta bo‘lsa — har birini yangi qatorda):`, { reply_markup: CANCEL_KB }); }
  if (data.startsWith('bkl:del:')) return void send(chatId, `🗑 ${subj}: qaysi kitobni o‘chiramiz?`, { reply_markup: { inline_keyboard: [...(books[subj] || []).map((b, i) => [ib(`❌ ${b.slice(0, 45)}`, `bkl:rm:${subj === 'Nemis tili' ? 'N' : 'T'}:${i}`)]), [ib('⬅️ Orqaga', 'bkl:v')]] } });
  if (data.startsWith('bkl:rm:')) {
    const [, , c, i] = data.split(':');
    const s = c === 'N' ? 'Nemis tili' : 'Turk tili';
    const arr = [...(books[s] || [])]; arr.splice(Number(i), 1);
    await admin.from('crm_settings').upsert({ key: 'eduBooks', value: { ...books, [s]: arr } });
    return bookLibrary(chatId, 'bkl:v');
  }
}

// =========================================================
// 📦 Kitoblar ombori — qoldiq, kirim, chiqim, inventarizatsiya, tarix (top o'zgartiradi, katta menejer ko'radi)
// =========================================================
const OM_FLAG = new Proxy({} as Record<string, string>, { get: (_t, k) => subjIcon(String(k)) });
// ⚠️ Kitob tugasa yoki kam qolsa — top menejerlarga xabar
async function stockAlert(st: any, left: number, exceptId?: number) {
  if (left > (st.min_qty ?? 5)) return;
  await notifyTops(`${left === 0 ? '🚨 <b>Kitob tugadi</b>' : '⚠️ <b>Kitob kam qoldi</b>'}\n\n${subjIcon(st.subject)} ${esc(st.subject)} · <b>${esc(st.title)}</b>\nQoldiq: <b>${left}</b> ta (minimum ${st.min_qty ?? 5})\n\nYangi partiya kelganda: 📦 Kitoblar ombori → ➕ Kirim`, { reply_markup: { inline_keyboard: [[ib('➕ Kirim qilish', `om:q:in:${st.id}`), ib('📦 Ombor', 'om:v')]] } }, exceptId).catch(() => {});
}
// Fan ro'yxati: Edutizim guruhlari kurslari + ombordagi fanlar
async function stockSubjects(): Promise<string[]> {
  const [{ data: g }, { data: st }] = await Promise.all([admin.from('crm_edu_groups').select('data->course'), admin.from('crm_edu_book_stock').select('subject')]);
  return [...new Set([...(g || []).map((x: any) => { const c = x.course ?? x.data?.course; return c?.name ? subjectOf(c.name) : ''; }).filter(Boolean), ...(st || []).map((x: any) => x.subject)])].sort();
}
const OM_ACT: Record<string, string> = { in: '➕ Kirim', out: '➖ Chiqim', set: '✏️ Sanash (aniq qoldiq)' };
async function stockView(chatId: number) {
  const [{ data: items }, { data: pend }] = await Promise.all([
    admin.from('crm_edu_book_stock').select('*').order('subject').order('title'),
    admin.from('crm_edu_book_orders').select('subject,book,qty').in('status', ['pending', 'approved'])
  ]);
  const list = items || [];
  const reserved = new Map<string, number>();
  (pend || []).forEach((o: any) => { const k = `${o.subject}|${String(o.book).toLowerCase()}`; reserved.set(k, (reserved.get(k) || 0) + o.qty); });
  const bySubj = new Map<string, any[]>();
  list.forEach((b: any) => (bySubj.get(b.subject) || bySubj.set(b.subject, []).get(b.subject)!).push(b));
  const blocks = [...bySubj.entries()].map(([subj, bs]) => `<b>${OM_FLAG[subj] || '📗'} ${esc(subj)}</b>\n` + bs.map((b: any, i: number) => {
    const r = reserved.get(`${b.subject}|${b.title.toLowerCase()}`) || 0;
    return `${i + 1}. ${esc(b.title)} — <b>${b.qty} ta</b>${b.qty <= b.min_qty ? ' ⚠️ kam' : ''}${r ? ` · 📝 buyurtmada ${r}${r > b.qty ? ` (yetishmaydi ${r - b.qty})` : ''}` : ''}`;
  }).join('\n')).join('\n\n');
  const total = list.reduce((a: number, b: any) => a + b.qty, 0);
  const low = list.filter((b: any) => b.qty <= b.min_qty).length;
  const text = list.length
    ? `📦 <b>Kitoblar ombori</b>\n\n${blocks}\n\nJami: <b>${list.length}</b> nom · <b>${total}</b> dona${low ? ` · ⚠️ ${low} tasi kam (≤ min)` : ''}`
    : '📦 <b>Kitoblar ombori</b>\n\nHozircha bo‘sh. “🆕 Yangi kitob” bilan qo‘shing.';
  const rows: any[] = role() === 'top'
    ? [[ib('➕ Kirim', 'om:a:in'), ib('➖ Chiqim', 'om:a:out')], [ib('✏️ Sanash', 'om:a:set'), ib('🆕 Yangi kitob', 'om:new')], [ib('📜 Harakatlar tarixi', 'om:log'), ib('📚 Buyurtmalar', 'bko:list')]]
    : [[ib('📜 Harakatlar tarixi', 'om:log')]];
  await send(chatId, text.slice(0, 4000), { reply_markup: { inline_keyboard: rows } });
}
async function stockLog(chatId: number) {
  const { data } = await admin.from('crm_edu_book_moves').select('*, crm_edu_book_stock(title,subject)').order('created_at', { ascending: false }).limit(20);
  const K: Record<string, string> = { in: '➕', out: '➖', adjust: '✏️', order: '📚' };
  const lines = (data || []).map((m: any) => `${K[m.kind] || '•'} ${dmy(new Date(m.created_at).getTime())} ${hm(m.created_at)} · ${esc(m.crm_edu_book_stock?.title || '?')} <b>${m.delta > 0 ? '+' : ''}${m.delta}</b> → ${m.qty_after}${m.note ? ` · <i>${esc(m.note)}</i>` : ''}${m.by_name ? ` · ${esc(m.by_name)}` : ''}`);
  await send(chatId, lines.length ? `📜 <b>Ombor harakatlari (oxirgi 20)</b>\n\n${lines.join('\n')}` : '📜 Hali harakat yo‘q.', { reply_markup: { inline_keyboard: [[ib('⬅️ Ombor', 'om:v')]] } });
}
async function stockCallback(chatId: number, data: string) {
  const p = data.split(':');
  if (data === 'om:v') return stockView(chatId);
  if (data === 'om:log') return stockLog(chatId);
  if (role() !== 'top') return void send(chatId, '⛔ Omborni faqat top menejer o‘zgartiradi.', { reply_markup: menu() });
  if (p[1] === 'a') {
    const { data: items } = await admin.from('crm_edu_book_stock').select('id,subject,title,qty').order('subject').order('title').limit(40);
    if (!items?.length) return void send(chatId, 'Omborda kitob yo‘q. Avval “🆕 Yangi kitob” qo‘shing.', { reply_markup: { inline_keyboard: [[ib('🆕 Yangi kitob', 'om:new')]] } });
    return void send(chatId, `${OM_ACT[p[2]]} — qaysi kitob?`, { reply_markup: { inline_keyboard: [...items.map((b: any) => [ib(`${OM_FLAG[b.subject] || '📗'} ${b.title.slice(0, 38)} · ${b.qty}`, `om:q:${p[2]}:${b.id}`)]), [ib('⬅️ Ombor', 'om:v')]] } });
  }
  if (p[1] === 'q') {
    const { data: b } = await admin.from('crm_edu_book_stock').select('*').eq('id', Number(p[3])).maybeSingle();
    if (!b) return stockView(chatId);
    await setSession(chatId, 'om_qty', { act: p[2], id: b.id, title: b.title });
    return void send(chatId, `${OM_ACT[p[2]]}: <b>${esc(b.title)}</b> (hozir ${b.qty} ta)\n\n${p[2] === 'set' ? 'Omborda aslida nechta bor? Sonini yozing:' : 'Nechta? Sonini yozing (izoh qo‘shish mumkin: “20 yangi partiya”):'}`, { reply_markup: CANCEL_KB });
  }
  if (data === 'om:new') {
    const subs = [...new Set([...(await stockSubjects()), 'Boshqa'])];
    await setSession(chatId, 'om_new', { subs });
    const btn = subs.slice(0, 20).map((x, i) => ib(`${subjIcon(x)} ${x.slice(0, 24)}`, `om:ns:${i}`));
    const rows: any[] = []; for (let i = 0; i < btn.length; i += 2) rows.push(btn.slice(i, i + 2));
    return void send(chatId, '🆕 Qaysi fan kitobi?', { reply_markup: { inline_keyboard: rows } });
  }
  if (p[1] === 'ns') {
    const s = await getSession(chatId);
    const subject = (s.step === 'om_new' ? s.data.subs?.[Number(p[2])] : null) || 'Boshqa';
    await setSession(chatId, 'om_title', { subject });
    return void send(chatId, `🆕 ${subjIcon(subject)} ${esc(subject)}: kitob nomini yozing:`, { reply_markup: CANCEL_KB });
  }
}
async function stockApply(chatId: number, s: any, text: string) {
  const m = /^\s*(\d{1,4})\s*(.*)$/s.exec(text);
  if (!m) return void send(chatId, 'Sonini raqamda yozing, masalan: 20 yoki “20 yangi partiya”.');
  const n = Number(m[1]), note = m[2].trim().slice(0, 120) || null;
  if (s.data.act !== 'set' && n < 1) return void send(chatId, 'Kamida 1 ta.');
  const by = me()?.full_name || '';
  const args: any = { p_book: s.data.id, p_delta: s.data.act === 'out' ? -n : s.data.act === 'in' ? n : 0, p_kind: s.data.act === 'set' ? 'adjust' : s.data.act, p_note: note, p_by: by };
  if (s.data.act === 'set') args.p_set = n;
  const { data: left, error } = await admin.rpc('crm_book_stock_move', args);
  if (error) return void send(chatId, `⚠️ ${esc(error.message)}`);
  await setSession(chatId, null);
  if (s.data.act !== 'in') { const { data: st } = await admin.from('crm_edu_book_stock').select('*').eq('id', s.data.id).maybeSingle(); if (st) await stockAlert(st, Number(left)); }
  await send(chatId, `✅ ${OM_ACT[s.data.act]}: <b>${esc(s.data.title)}</b>${s.data.act === 'set' ? '' : ` ${s.data.act === 'out' ? '−' : '+'}${n}`} → qoldiq <b>${left}</b> ta`, { reply_markup: menu() });
  return stockView(chatId);
}

// =========================================================
// 🤖 AI yordamchi — Claude (Anthropic API). Faqat o'qiydigan vositalar (rolga qarab) +
// AI montaj: suhbatga yuborilgan rasm/videolardan montaj rejasi → 🎬 Mini App o'zi yig'adi
// =========================================================
const AI_MODEL = 'claude-opus-5-5';
let aiClient: Anthropic | null = null, aiKeyUsed = '';
async function aiClientGet() {
  const key = await getSecret('anthropic_api_key');
  if (!key) return null;
  if (!aiClient || key !== aiKeyUsed) { aiClient = new Anthropic({ apiKey: key, baseURL: 'https://api.anthropic.com', maxRetries: 2, timeout: 120_000 }); aiKeyUsed = key; }
  return aiClient;
}
const stripHtml = (t: string) => String(t || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const WD_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
function b64(bytes: Uint8Array) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
async function tgFileBytes(fileId: string): Promise<Uint8Array | null> {
  const t = await token();
  const f = await tg(t, 'getFile', { file_id: fileId });
  if (!f?.ok) return null;
  const r = await fetch(`https://api.telegram.org/file/bot${t}/${f.result.file_path}`);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}
async function pendingMedia(tgId: number) {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const { data } = await admin.from('crm_ai_media').select('*').eq('tg_id', tgId).gte('created_at', since).order('created_at', { ascending: true }).limit(20);
  return data || [];
}

const AI_SYSTEM = `Siz "Registan · Markaz" Telegram botidagi AI yordamchisiz. Registan LC (Qarshi, Globus filiali) o'quv markazi xodimlariga yordam berasiz: top va katta menejer, servis menejerlar, o'qituvchilar va media xodimlari.

Qoidalar:
- Foydalanuvchi qaysi tilda yozsa, o'sha tilda javob bering (odatda o'zbek tilida, lotin yozuvida).
- Javob Telegram'da oddiy matn sifatida ko'rinadi: markdown, jadval, ** yoki # ishlatmang. Qisqa qatorlar, kerak bo'lsa emoji va "•" ro'yxat.
- Raqamlar (o'quvchilar, qarz, kassa, davomat, ustozlar, kitoblar, jadval) faqat vositalardan olinadi — o'zingizdan to'qimang. Vosita xato bersa, shuni ochiq ayting.
- Vositalar faqat o'qiydi. Kassaga kirim/chiqim, SMS, narx o'zgartirish, rol berish kabi amallarni siz qila olmaysiz — bot menyusidagi tegishli tugmani ko'rsating.
- Shaxsiy ma'lumotlarni (telefon, qarz) faqat so'ralganda va kerakli qismini bering.
- Foydalanuvchiga vositada bo'lmagan bo'lim kerak bo'lsa, buni ochiq ayting va menyudagi tugmani tavsiya qiling.

Montaj (create_montage vositasi bor bo'lsa):
- Foydalanuvchi rasm/video yuborib reels, story, post yoki video so'rasa — create_montage chaqiring. Media raqamlari xabarda "[Media N]" bo'lib keladi, rasmlarni ko'rib mazmuniga mos tartib tanlang.
- Odatiy: 9:16 format, rasm 2.5–4 soniya, video bo'lagi 3–8 soniya, jami 15–45 soniya (so'ralmasa). Har klip matni 2–6 so'z, jozibali, xatosiz. Intro sarlavhasi qisqa; outro'da markaz shiori. O'tish: fade yoki slide.
- Post matni (caption) va 5–8 ta mos heshteg ham yozing.
- Vosita chaqirilgandan keyin video serverda avtomatik yasaladi va bir necha daqiqada shu chatga MP4 bo'lib keladi — foydalanuvchiga shuni qisqa ayting. O'zgartirmoqchi bo'lsa (musiqa va h.k.), "✏️ Qo'lda tahrirlash" tugmasi bor.
- Media yuborilmagan bo'lsa, avval rasm yoki video yuborishni so'rang.`;

function aiTools(r: Role, tgId: number, ctx: { project?: string; caption?: string }) {
  const u = me();
  const T: any[] = [];
  const mgr = r === 'top' || r === 'senior', staff = mgr || r === 'service';
  T.push(betaTool({
    name: 'dars_jadvali', description: 'Markazning dars jadvali: guruhlar, soat, xona, ustoz, o‘quvchilar soni. O‘qituvchiga faqat o‘z guruhlari qaytadi.',
    inputSchema: { type: 'object', properties: { kun: { type: 'string', description: 'bugun, ertaga yoki hafta kuni nomi (Dushanba…Shanba); bo‘sh bo‘lsa — butun hafta' } }, additionalProperties: false },
    run: async ({ kun }) => {
      const { data } = await admin.from('crm_edu_groups').select('id,name,data');
      let ls = toLessons(data || []);
      if (r === 'teacher') ls = ls.filter(l => l.teacherId === u?.employee_id);
      const now = new Date(Date.now() + TZ);
      const k = String(kun || '').toLowerCase();
      let wd = -1;
      if (k.startsWith('bugun')) wd = now.getUTCDay(); else if (k.startsWith('ertaga')) wd = (now.getUTCDay() + 1) % 7;
      else { const i = WD_UZ.findIndex(w => k && w.toLowerCase().startsWith(k.slice(0, 3))); if (i >= 0) wd = i; }
      if (wd >= 0) ls = ls.filter(l => l.days.includes(wd + 1));
      return JSON.stringify({ kun: wd >= 0 ? WD_UZ[wd] : 'butun hafta', guruhlar: ls.sort((a, b) => a.start.localeCompare(b.start)).map(l => ({ guruh: l.name, kunlar: daysLabel(l.days), soat: `${l.start}-${l.end}`, xona: l.room, ustoz: l.teacher, kurs: [l.course, l.sub].filter(Boolean).join(' · '), oquvchi: l.students })) });
    }
  }));
  if (staff) {
    T.push(betaTool({
      name: 'oquvchi_qidirish', description: 'Edutizim’dan o‘quvchini ism yoki telefon bo‘yicha topish: guruhlari, balans (manfiy — qarz).',
      inputSchema: { type: 'object', properties: { soz: { type: 'string', description: 'ism, familiya yoki telefon' } }, required: ['soz'], additionalProperties: false },
      run: async ({ soz }) => JSON.stringify((await eduFind(String(soz))).slice(0, 8).map((x: any) => ({ ism: x.name, telefon: x.phone, guruhlar: x.groups, balans: x.balance })))
    }));
    T.push(betaTool({
      name: 'davomat', description: 'Edutizim davomati: kelmagan o‘quvchilar (sababli/sababsiz), guruh, ustoz, mas’ul menejer.',
      inputSchema: { type: 'object', properties: { kun: { type: 'string', enum: ['bugun', 'kecha'] } }, required: ['kun'], additionalProperties: false },
      run: async ({ kun }) => {
        const d0 = dayStart(Date.now()) - (kun === 'kecha' ? DAY : 0);
        const ymd = new Date(d0 + TZ).toISOString().slice(0, 10);
        const res = await edu('absences', { fromDate: `${ymd}T00:00:00.000Z`, toDate: `${ymd}T23:59:59.999Z` });
        if (!res.ok) return JSON.stringify({ xato: res.error });
        const rows = (res.rows || []).filter((x: any) => !x.lessonDate || String(x.lessonDate).slice(0, 10) === ymd);
        return JSON.stringify({ sana: ymd, jami: rows.length, kelmaganlar: rows.slice(0, 80).map((x: any) => ({ ism: x.name, holat: x.state === 'unreasonable' ? 'sababsiz' : 'sababli', guruh: x.group, ustoz: x.teacher, menejer: x.manager, balans: x.balance })) });
      }
    }));
    T.push(betaTool({
      name: 'xavf_ostida', description: 'Ketma-ket 2-3+ dars qoldirgan (notcoming xavfi) o‘quvchilar.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => { const res = await edu('absenceRisk', { days: 21 }); return JSON.stringify(res.ok ? (res.rows || []).slice(0, 60).map((x: any) => ({ ism: x.name, ketma_ket: x.streak, guruh: x.group, ustoz: x.teacher, menejer: x.manager })) : { xato: res.error }); }
    }));
  }
  if (mgr) {
    T.push(betaTool({
      name: 'markaz_statistikasi', description: 'Aktiv o‘quvchilar soni, qarzdorlar soni va jami qarz, oldindan to‘laganlar.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => {
        const all = await allBalances(); const a = all.filter(s => s.active); const debt = a.filter(s => s.balance < 0);
        return JSON.stringify({ aktiv: a.length, aktiv_qarzdorlar: debt.length, aktiv_qarz_jami: -debt.reduce((x, s) => x + s.balance, 0), oldindan_tolagan: a.filter(s => s.balance > 0).length, nofaol_qarz_jami: -all.filter(s => !s.active && s.balance < 0).reduce((x, s) => x + s.balance, 0) });
      }
    }));
    T.push(betaTool({
      name: 'kassa_xarajatlari', description: 'Edutizim kassasi: davr bo‘yicha xarajatlar (kategoriyalar), kirim jami. Naqd inkassaga ko‘chirmalar xarajat emas.',
      inputSchema: { type: 'object', properties: { davr: { type: 'string', enum: ['today', 'week', 'pweek', 'month', 'pmonth'] } }, required: ['davr'], additionalProperties: false },
      run: async ({ davr }) => {
        const meta = await edu('kassaMeta'); if (!meta.ok) return JSON.stringify({ xato: meta.error });
        const rr = range(davr as Period);
        const [out, inc] = await Promise.all([txFor('payOut', rr.from, rr.to, meta.cashboxes || []), txFor('payIn', rr.from, rr.to, meta.cashboxes || [])]);
        const real = out.filter((t: any) => !isMoveOut(t));
        const cats = new Map<string, number>(); real.forEach((t: any) => cats.set(t.category, (cats.get(t.category) || 0) + t.amount));
        return JSON.stringify({ davr: `${dmy(rr.from)}–${dmy(rr.to)}`, xarajat_jami: real.reduce((a: number, t: any) => a + t.amount, 0), kirim_jami: inc.reduce((a: number, t: any) => a + t.amount, 0), kategoriyalar: [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ kategoriya: k, summa: v })) });
      }
    }));
    T.push(betaTool({
      name: 'naqd_inkassa', description: '“Naqd Inkassa” (Shanba–Juma davri, Juma kuni bankka): yig‘ilgan, to‘lovlar, naqddan ko‘chirma.',
      inputSchema: { type: 'object', properties: { davr: { type: 'string', enum: ['cur', 'prev', 'month', 'pmonth'] } }, required: ['davr'], additionalProperties: false },
      run: async ({ davr }) => stripHtml(await inkassaReport(edu, davr as InkP, Date.now(), true))
    }));
    T.push(betaTool({
      name: 'ustozlar_hisoboti', description: 'Oy bo‘yicha o‘qituvchilar va markaz: oy boshi→hozir aktiv, kelgan, ketgan, konversiya.',
      inputSchema: { type: 'object', properties: { oy: { type: 'string', enum: ['m', 'pm'], description: 'm — bu oy, pm — o‘tgan oy' } }, required: ['oy'], additionalProperties: false },
      run: async ({ oy }) => {
        const rep: any = await teacherReport(oy); if (!rep.ok) return JSON.stringify({ xato: rep.error });
        return JSON.stringify({ davr: rep.label, markaz: rep.center, ustozlar: (rep.teachers || []).map((t: any) => ({ ism: t.name, oy_boshi: t.start, hozir: t.now, kelgan: t.joined?.length, ketgan: t.left?.length, konversiya: t.conversion })) });
      }
    }));
    T.push(betaTool({
      name: 'kitoblar_ombori', description: 'Kitoblar ombori qoldig‘i va faol kitob buyurtmalari.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => {
        const [{ data: st }, { data: ord }] = await Promise.all([admin.from('crm_edu_book_stock').select('subject,title,qty,min_qty'), admin.from('crm_edu_book_orders').select('id,subject,book,qty,status,teacher_name').in('status', ['pending', 'approved'])]);
        return JSON.stringify({ ombor: st || [], faol_buyurtmalar: ord || [] });
      }
    }));
  }
  if (r === 'teacher' && u?.employee_id) {
    T.push(betaTool({
      name: 'mening_natijam', description: 'O‘qituvchining o‘z natijasi: aktiv, kelgan, ketgan, konversiya.',
      inputSchema: { type: 'object', properties: { oy: { type: 'string', enum: ['m', 'pm'] } }, required: ['oy'], additionalProperties: false },
      run: async ({ oy }) => { const rep: any = await teacherReport(oy, u.employee_id); const t = (rep.teachers || []).find((x: any) => x.teacherId === u.employee_id); return JSON.stringify(t ? { davr: rep.label, oy_boshi: t.start, hozir: t.now, kelgan: t.joined.length, ketgan: t.left.length, konversiya: t.conversion, guruhlar: t.groups } : { xato: 'ma’lumot topilmadi' }); }
    }));
  }
  if (['top', 'senior', 'media'].includes(r)) {
    T.push(betaTool({
      name: 'create_montage',
      description: 'Foydalanuvchi yuborgan media (rasm/video) dan video montaj loyihasini tuzadi. Mini App bu rejani o‘zi yig‘adi; foydalanuvchi ko‘rib chiqib eksport qiladi.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['916', '11', '169'], description: '916 — Reels/Stories, 11 — Post, 169 — YouTube' },
          transition: { type: 'string', enum: ['none', 'fade', 'slide', 'zoom'] },
          intro_title: { type: 'string', description: 'Intro sarlavhasi (bo‘sh — introsiz)' },
          intro_subtitle: { type: 'string' },
          outro_text: { type: 'string', description: 'Outro qo‘shimcha qatori: telefon yoki manzil (ixtiyoriy)' },
          outro: { type: 'boolean', description: 'Outro (logotip + shior) bo‘lsinmi' },
          clips: {
            type: 'array', minItems: 1, maxItems: 20,
            items: {
              type: 'object',
              properties: {
                media: { type: 'integer', description: '[Media N] raqami' },
                seconds: { type: 'number', description: 'Davomiylik, soniya' },
                trim_start: { type: 'number', description: 'Video uchun boshlanish soniyasi' },
                text: { type: 'string', description: 'Ekrandagi qisqa matn (ixtiyoriy)' },
                text_position: { type: 'string', enum: ['top', 'mid', 'bot'] },
                zoom: { type: 'boolean', description: 'Rasm uchun kattalashish effekti' }
              },
              required: ['media'], additionalProperties: false
            }
          },
          caption: { type: 'string', description: 'Post matni va heshteglar' }
        },
        required: ['format', 'clips'], additionalProperties: false
      },
      run: async (inp) => {
        const media = await pendingMedia(tgId);
        if (!media.length) return 'XATO: foydalanuvchi hali media yubormagan. Undan rasm yoki video yuborishni so‘rang.';
        const bad = inp.clips.filter((c: any) => !media[c.media - 1]);
        if (bad.length) return `XATO: mavjud media raqamlari 1–${media.length}. Noto‘g‘ri: ${bad.map((c: any) => c.media).join(', ')}`;
        const files = media.map((m: any) => ({ file_id: m.file_id, kind: m.kind, duration: m.duration, width: m.width, height: m.height }));
        const plan = { ...inp, clips: inp.clips.map((c: any) => ({ ...c, media: c.media - 1 })) };
        const { data, error } = await admin.from('crm_ai_projects').insert({ tg_id: tgId, plan, files, status: 'queued' }).select('id').single();
        if (error || !data) return 'XATO: loyiha saqlanmadi';
        ctx.project = data.id; ctx.caption = inp.caption || '';
        const total = inp.clips.reduce((a: number, c: any) => a + (Number(c.seconds) || 3), 0);
        return `Loyiha yaratildi va video yasash navbatiga qo‘yildi: ${inp.clips.length} klip, taxminan ${Math.round(total)} soniya. Tayyor MP4 bir necha daqiqada shu chatga avtomatik keladi; xohlasa “✏️ Qo‘lda tahrirlash” tugmasi bilan o‘zgartirishi mumkin.`;
      }
    }));
  }
  return T;
}

// GitHub Actions'dagi renderer'ni darhol ishga tushirish (kalit bo'lmasa — har 5 daqiqada o'zi tekshiradi)
async function renderDispatch(): Promise<boolean> {
  const tok = await getSecret('github_dispatch_token');
  if (!tok) return false;
  const r = await fetch('https://api.github.com/repos/bekmurodovm460-sudo/Registancrm/dispatches', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'registan-bot', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'render' })
  }).catch(() => null);
  if (!r?.ok) console.error('render dispatch', r?.status);
  return !!r?.ok;
}

async function aiStart(chatId: number) {
  const key = await getSecret('anthropic_api_key');
  await setSession(chatId, 'ai', {});
  const r = role();
  const ex = r === 'media' ? '• “Yangi guruh ochilgani haqida post yozib ber”\n• Rasm/video yuboring: “15 soniyalik reels qil”'
    : r === 'teacher' ? '• “Bugun qaysi darslarim bor?”\n• “Shu oy konversiyam qanday?”'
    : r === 'service' ? '• “Bugun kim kelmadi va sababi?”\n• “Ali Valiyevning balansi qancha?”'
    : '• “Bu hafta eng katta xarajatlar qaysi?”\n• “Juma kuni bankka qancha topshiriladi?”\n• “Qaysi ustozning konversiyasi past?”\n• Rasm/video yuboring: “Reels qil”';
  await send(chatId, `🤖 <b>AI yordamchi</b> (Claude)\n\nSavolingizni oddiy so‘z bilan yozing. Markaz ma’lumotlarini o‘zi tekshirib javob beradi.\n\n<b>Masalan:</b>\n${ex}${key ? '' : '\n\n⚠️ Claude API kaliti hali kiritilmagan — top menejer CRM → 🤖 Telegram Bot → “Claude AI yordamchi” bo‘limida kiritadi.'}\n\nChiqish: ❌ Bekor qilish yoki menyudagi istalgan tugma.`, {
    reply_markup: { inline_keyboard: [[ib('🧹 Yangi suhbat', 'ai:new')]] }
  });
  await send(chatId, '✍️ Savolingizni yozing…', { reply_markup: CANCEL_KB });
}

async function aiMedia(chatId: number, m: any) {
  const r = role();
  if (!['top', 'senior', 'media'].includes(r)) return void send(chatId, 'Media bilan montaj faqat top, katta menejer va media xodimlari uchun.');
  let row: any = null;
  if (m.photo?.length) {
    const big = m.photo[m.photo.length - 1];
    const vis = [...m.photo].reverse().find((p: any) => Math.max(p.width, p.height) <= 1280) || m.photo[0];
    row = { kind: 'photo', file_id: big.file_id, vision_file_id: vis.file_id, width: big.width, height: big.height, file_size: big.file_size || null };
  } else if (m.video || (m.document && /^video\//.test(m.document.mime_type || ''))) {
    const v = m.video || m.document;
    if ((v.file_size || 0) > 20 * 1024 * 1024) return void send(chatId, '⚠️ Video 20 MB dan katta — Telegram bot uni yuklab ololmaydi. Qisqaroq yoki siqilgan holda yuboring.');
    row = { kind: 'video', file_id: v.file_id, vision_file_id: v.thumbnail?.file_id || v.thumb?.file_id || null, width: v.width || null, height: v.height || null, duration: v.duration || null, file_size: v.file_size || null };
  } else if (m.document && /^image\//.test(m.document.mime_type || '')) {
    const d = m.document;
    if ((d.file_size || 0) > 20 * 1024 * 1024) return void send(chatId, '⚠️ Rasm 20 MB dan katta.');
    row = { kind: 'photo', file_id: d.file_id, vision_file_id: d.thumbnail?.file_id || d.file_id, file_size: d.file_size || null };
  }
  if (!row) return;
  const list = await pendingMedia(m.from.id);
  if (list.length >= 20) return void send(chatId, '⚠️ 20 tagacha media. “🧹 Yangi suhbat” bilan tozalang.');
  await admin.from('crm_ai_media').insert({ tg_id: m.from.id, ...row });
  if (m.caption) return aiAsk(chatId, m.caption, m.from);
  // Albom bo'lib kelsa — har biriga javob bermaslik uchun faqat birinchisiga
  if (!m.media_group_id || !list.some((x: any) => Date.now() - new Date(x.created_at).getTime() < 4000))
    await send(chatId, `📎 Qabul qilindi (${list.length + 1} ta media). Endi nima qilishni yozing, masalan: “20 soniyalik reels, mavzu — yangi IELTS guruhi”.`);
}

async function aiAsk(chatId: number, text: string, from: any) {
  const client = await aiClientGet();
  if (!client) return void send(chatId, '⚠️ Claude API kaliti kiritilmagan. Top menejer CRM → 🤖 Telegram Bot → “Claude AI yordamchi” bo‘limida kiritadi.', { reply_markup: menu() });
  const r = role();
  const today = new Date(Date.now() + TZ).toISOString().slice(0, 10);
  const limit = Number(await getSetting<number>('aiDailyLimit', 60)) || 60;
  const { data: chat } = await admin.from('crm_ai_chats').select('*').eq('tg_id', from.id).maybeSingle();
  const count = chat?.day === today ? chat.day_count : 0;
  if (count >= limit) return void send(chatId, `⏳ Bugungi AI so‘rovlar chegarasi tugadi (${limit} ta). Ertaga qayta urinib ko‘ring.`);
  const history: any[] = Array.isArray(chat?.history) ? chat.history : [];
  // Yangi xabar: sana/rol + media (rasmlar Claude'ga ko'rinadi) + matn
  const media = await pendingMedia(from.id);
  const content: any[] = [{ type: 'text', text: `[Bugun: ${today.split('-').reverse().join('.')}, ${WD_UZ[new Date(Date.now() + TZ).getUTCDay()]} · Foydalanuvchi: ${me()?.full_name || from.first_name || ''} · Rol: ${ROLE_NAME[r] || r}]` }];
  if (['top', 'senior', 'media'].includes(r) && media.length) {
    for (let i = 0; i < media.length; i++) {
      const mm = media[i];
      content.push({ type: 'text', text: `[Media ${i + 1}] ${mm.kind === 'video' ? `video${mm.duration ? `, ${mm.duration} s` : ''}` : 'rasm'}${mm.width ? `, ${mm.width}×${mm.height}` : ''}` });
      if (i < 10 && mm.vision_file_id) {
        const bytes = await tgFileBytes(mm.vision_file_id).catch(() => null);
        if (bytes && bytes.length < 4_500_000) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64(bytes) } });
      }
    }
  }
  content.push({ type: 'text', text });
  const messages: any[] = [...history.slice(-12), { role: 'user', content }];
  // "yozmoqda…" — javob tayyorlanguncha
  const typingTimer = setInterval(() => { typing(chatId).catch(() => {}); }, 4500);
  await typing(chatId);
  const ctx: { project?: string; caption?: string } = {};
  let reply = '';
  let usage = { input: 0, output: 0 };
  try {
    const final: any = await client.beta.messages.toolRunner({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: AI_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: aiTools(r, from.id, ctx),
      messages,
      max_iterations: 8
    }).runUntilDone();
    usage = { input: final.usage?.input_tokens || 0, output: final.usage?.output_tokens || 0 };
    reply = (final.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (final.stop_reason === 'refusal') reply = 'Kechirasiz, bu so‘rovga javob bera olmayman. Savolni boshqacha yozib ko‘ring.';
    if (!reply) reply = ctx.project ? '🎬 Montaj loyihasi tayyor.' : 'Javob bo‘sh qaytdi — savolni boshqacha yozib ko‘ring.';
  } catch (e) {
    clearInterval(typingTimer);
    const msg = e instanceof Anthropic.AuthenticationError ? 'Claude API kaliti noto‘g‘ri yoki bekor qilingan — CRM’da yangilang.'
      : e instanceof Anthropic.PermissionDeniedError ? 'Claude akkauntida bu modelga ruxsat yo‘q yoki balans yetarli emas.'
      : e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message) ? 'Claude akkauntida API balansi tugagan. Top menejer platform.claude.com → Plans & Billing bo‘limida balansni to‘ldirsin.'
      : e instanceof Anthropic.RateLimitError ? 'Claude hozir band (limit). Bir daqiqadan so‘ng qayta yozing.'
      : e instanceof Anthropic.APIError ? `Claude xatosi (${e.status}). Birozdan so‘ng urinib ko‘ring.`
      : 'Claude bilan bog‘lanib bo‘lmadi. Birozdan so‘ng urinib ko‘ring.';
    console.error('ai error', e);
    return void send(chatId, `⚠️ ${msg}`);
  }
  clearInterval(typingTimer);
  const newHist = [...history, { role: 'user', content: media.length && ['top', 'senior', 'media'].includes(r) ? `[${media.length} ta media yuborilgan] ${text}` : text }, { role: 'assistant', content: reply }].slice(-12);
  await admin.from('crm_ai_chats').upsert({ tg_id: from.id, history: newHist, day: today, day_count: count + 1, input_tokens: (chat?.input_tokens || 0) + usage.input, output_tokens: (chat?.output_tokens || 0) + usage.output, updated_at: new Date().toISOString() });
  const extra: any = {};
  if (ctx.project) {
    const url = await getSetting<string>('eduMontajAppUrl', '');
    if (url) extra.reply_markup = { inline_keyboard: [[{ text: '✏️ Qo‘lda tahrirlash', web_app: { url: `${url}?p=${ctx.project}` } }]] };
    const fast = await renderDispatch();
    reply += `\n\n🎬 Video yasalmoqda… ${fast ? '1–3 daqiqada' : '5–10 daqiqada'} tayyor MP4 shu chatga keladi.`;
  }
  const parts = reply.match(/[\s\S]{1,3900}(?=\n|$)|[\s\S]{1,3900}/g) || [reply];
  for (let i = 0; i < parts.length; i++) await tg(await token(), 'sendMessage', { chat_id: chatId, text: parts[i], ...(i === parts.length - 1 ? extra : {}) });
}

// =========================================================
// 📑 Hisobotlar — rahbar uchun yagona joy (avtomatik: kunlik 20:00, haftalik dushanba, oylik 1-sana, Juma inkassa)
// =========================================================
async function reportsHub(chatId: number) {
  await send(chatId,
    '📑 <b>Hisobotlar</b>\n\n<b>Avtomatik shu chatga keladi:</b>\n🌙 Har kuni 20:00 — kunlik hisobot (kassa, davomat, menejerlar izohi)\n📅 Dushanba 09:00 — o‘tgan hafta yakuni\n🗓 Har oy 1-sanasi 09:00 — o‘tgan oy yakuni\n🏦 Juma 09:00 — bankka topshiriladigan naqd inkassa\n\n<b>Hozir ko‘rish:</b>', {
      reply_markup: { inline_keyboard: [
        [ib('🌙 Bugun', 'rp:day'), ib('📅 Bu hafta', 'rp:week')],
        [ib('🗓 Bu oy', 'rp:month'), ib('🗓 O‘tgan oy', 'rp:pmonth')],
        [ib('💵 Naqd inkassa', 'ink:cur'), ib('🧾 Xarajatlar', 'ex:week')],
        [ib('📈 Statistika', 'go:stat'), ib('👩‍🏫 O‘qituvchilar', 'go:ustoz')],
        [ib('🎧 Menejerlar', 'go:mgr'), ib('⚠️ Xavf ostida', 'go:xavf')]
      ] }
    });
}

type RepP = 'day' | 'week' | 'month' | 'pmonth' | 'pweek' | 'hub';
/** Markaz yakuniy hisoboti (HTML). Faqat o'qiydi. */
async function summaryReport(p: RepP): Promise<string> {
  if (p === 'hub') return '📑 Hisobotlar: /hisobot';
  const per: Period = p === 'day' ? 'today' : (p as Period);
  const rr = range(per);
  const title = { day: '🌙 Kunlik hisobot', week: '📅 Haftalik hisobot', pweek: '📅 Haftalik yakun', month: '🗓 Oylik hisobot', pmonth: '🗓 Oylik yakun' }[p];
  const L: string[] = [`<b>${title}</b> · ${dmy(rr.from)}–${dmy(rr.to)}`, ''];
  // 💰 Kassa
  try {
    const meta = await edu('kassaMeta');
    if (!meta.ok) throw new Error(meta.error);
    const inc = await txFor('payIn', rr.from, rr.to, meta.cashboxes || []);
    const out = await txFor('payOut', rr.from, rr.to, meta.cashboxes || []);
    const pinc = await txFor('payIn', rr.prev.from, rr.prev.to, meta.cashboxes || []).catch(() => []);
    const realOut = out.filter((t: any) => !isMoveOut(t));
    const incIn = inc.filter((t: any) => !/inkassa/i.test(t.method || '') || t.category !== '—');
    const sIn = incIn.reduce((a: number, t: any) => a + t.amount, 0), sOut = realOut.reduce((a: number, t: any) => a + t.amount, 0);
    const sPrev = pinc.reduce((a: number, t: any) => a + t.amount, 0);
    const byM = new Map<string, number>(); incIn.forEach((t: any) => { const k = String(t.method || '—').replace(/\s*"\s*[\d.]+%\s*"\s*/g, '').trim(); byM.set(k, (byM.get(k) || 0) + t.amount); });
    const cats = new Map<string, number>(); realOut.forEach((t: any) => cats.set(t.category, (cats.get(t.category) || 0) + t.amount));
    L.push(`💰 <b>Kassa</b>\n   Kirim: <b>${mln(sIn)}</b>${delta(sIn, sPrev)} · ${incIn.length} ta to‘lov\n   ${[...byM.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${esc(k)} ${mln(v)}`).join(' · ')}\n   Xarajat: <b>${mln(sOut)}</b> · Sof: <b>${mln(sIn - sOut)}</b>` +
      (cats.size ? `\n   Eng katta xarajatlar: ${[...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${esc(k)} ${mln(v)}`).join(', ')}` : ''));
  } catch (e) { L.push(`💰 Kassa: ⚠️ ${esc((e as Error).message)}`); }
  // 💵 Inkassa (hafta / oy)
  if (p !== 'day') {
    try { const ink = stripHtml(await inkassaReport(edu, p === 'week' ? 'cur' : p === 'pweek' ? 'prev' : p as InkP, Date.now(), true)).split('\n').filter(x => /topshiriladigan|Jami yig|To‘g‘ridan|ko‘chirilgan/.test(x)).map(x => '   ' + x.trim()); if (ink.length) L.push('', '💵 <b>Naqd inkassa</b>', ...ink.map(esc)); } catch { /* ixtiyoriy */ }
  }
  // 👥 O'quvchilar va qarz
  try {
    const all = await allBalances(); const a = all.filter(s => s.active); const debt = a.filter(s => s.balance < 0);
    L.push('', `👥 <b>O‘quvchilar</b>\n   Aktiv: <b>${a.length}</b> · qarzdor: ${debt.length} (${mln(-debt.reduce((x, s) => x + s.balance, 0))})`);
  } catch { /* ixtiyoriy */ }
  // 🆕 Oy bo'yicha o'sish va konversiya (oy hisobotlarida)
  if (p === 'month' || p === 'pmonth') {
    const rep: any = await teacherReport(p === 'month' ? 'm' : 'pm').catch(() => null);
    const c = rep?.center;
    if (c) L.push(`   Oy boshida ${c.start} → ${p === 'month' ? 'hozir' : 'oy oxirida'} ${c.now} (${c.delta >= 0 ? '+' : ''}${c.delta})\n   ➕ Kelgan: ${c.joined} · ➖ Ketgan: ${c.left} · 🆕 Yangi: ${c.newStudents}\n   🔁 Konversiya: <b>${c.conversion ?? '—'}%</b> (${c.converted}/${c.trials})`);
  }
  // 📅 Davomat (kunlik)
  if (p === 'day') {
    try {
      const ymd = new Date(dayStart(Date.now()) + TZ).toISOString().slice(0, 10);
      const res = await edu('absences', { fromDate: `${ymd}T00:00:00.000Z`, toDate: `${ymd}T23:59:59.999Z` });
      const rows = (res.rows || []).filter((x: any) => !x.lessonDate || String(x.lessonDate).slice(0, 10) === ymd);
      L.push('', `📅 <b>Davomat</b>: kelmaganlar <b>${rows.length}</b> (🔴 sababsiz ${rows.filter((x: any) => x.state === 'unreasonable').length})`);
    } catch { /* ixtiyoriy */ }
  }
  // ⚠️ Xavf va 📦 ombor
  try { const rk = await edu('absenceRisk', { days: 21 }); if (rk.ok) L.push(`⚠️ Notcoming xavfi: <b>${(rk.rows || []).length}</b> ta (3+ dars: ${(rk.rows || []).filter((x: any) => x.streak >= 3).length})`); } catch { /* */ }
  try { const { data: st } = await admin.from('crm_edu_book_stock').select('title,qty,min_qty'); const low = (st || []).filter((b: any) => b.qty <= b.min_qty); if (low.length) L.push(`📦 Kam qolgan kitoblar: ${low.slice(0, 5).map((b: any) => `${esc(b.title)} (${b.qty})`).join(', ')}`); } catch { /* */ }
  L.push('', '<i>Batafsil: 📑 Hisobotlar · 💵 Naqd inkassa · 🧾 Xarajatlar · 👩‍🏫 O‘qituvchilar</i>');
  return L.join('\n').slice(0, 4000);
}
// 📱 Rahbarga SMS — qisqa, qat'iy shablonda (Eskiz shablon tasdig'i uchun)
const OY_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const smsM = (n: number) => `${(Math.round(n / 100_000) / 10).toString().replace('.', ',')} mln so'm`;
async function smsReportText(kind: 'day' | 'week' | 'month' | 'inkassa'): Promise<string> {
  if (kind === 'inkassa') {
    const c = cycleOf(Date.now());
    const tx = await inkTx(edu, c.from, Math.min(Date.now(), c.to));
    const total = tx.filter((t: any) => t.type === 'payIn').reduce((a: number, t: any) => a + t.amount, 0);
    return `Registan LC: ${dmy(c.bank)} Juma kuni bankka topshiriladigan naqd inkassa ${sum(total).replace('so‘m', "so'm")}.`;
  }
  const per: Period = kind === 'day' ? 'today' : kind === 'week' ? 'pweek' : 'pmonth';
  const rr = range(per);
  const meta = await edu('kassaMeta');
  let kirim = 0, xarajat = 0;
  if (meta.ok) {
    const inc = await txFor('payIn', rr.from, rr.to, meta.cashboxes || []).catch(() => []);
    const out = await txFor('payOut', rr.from, rr.to, meta.cashboxes || []).catch(() => []);
    kirim = inc.filter((t: any) => !/inkassa/i.test(t.method || '') || t.category !== '—').reduce((a: number, t: any) => a + t.amount, 0);
    xarajat = out.filter((t: any) => !isMoveOut(t)).reduce((a: number, t: any) => a + t.amount, 0);
  }
  const aktiv = (await allBalances().catch(() => [])).filter((s: any) => s.active).length;
  if (kind === 'day') {
    const ymd = new Date(dayStart(Date.now()) + TZ).toISOString().slice(0, 10);
    const res = await edu('absences', { fromDate: `${ymd}T00:00:00.000Z`, toDate: `${ymd}T23:59:59.999Z` });
    const k = (res.rows || []).filter((x: any) => !x.lessonDate || String(x.lessonDate).slice(0, 10) === ymd).length;
    return `Registan LC ${dmy(rr.from)}: kirim ${smsM(kirim)}, xarajat ${smsM(xarajat)}, kelmagan ${k} ta, aktiv o'quvchi ${aktiv} ta.`;
  }
  if (kind === 'week') return `Registan LC ${dmy(rr.from)}-${dmy(rr.to)} hafta: kirim ${smsM(kirim)}, xarajat ${smsM(xarajat)}, aktiv o'quvchi ${aktiv} ta.`;
  const c: any = (await teacherReport('pm').catch(() => null) as any)?.center || {};
  return `Registan LC ${OY_UZ[new Date(rr.from + TZ).getUTCMonth()]} oyi: kirim ${smsM(kirim)}, xarajat ${smsM(xarajat)}, o'quvchilar ${c.start ?? '-'}->${c.now ?? aktiv}, konversiya ${c.conversion ?? '-'}%.`;
}
async function smsReport(kind: 'day' | 'week' | 'month' | 'inkassa') {
  const text = await smsReportText(kind);
  return { text, ...(await smsDirectors(text)) };
}

/** Avtomatik hisobot: rahbar(lar) va top menejerlarning shaxsiy chatiga */
async function sendAutoReport(kind: 'week' | 'month') {
  const text = await summaryReport(kind === 'week' ? 'pweek' : 'pmonth');
  const { data: dirs } = await admin.from('crm_edu_bot_users').select('tg_id').eq('role', 'director');
  const grp = await getSetting<number | null>('reportsChatId', null);
  const ids = [...new Set([...(dirs || []).map((d: any) => String(d.tg_id)), ...(await topIds()), ...(grp ? [String(grp)] : [])])];
  let sent = 0;
  for (const id of ids) { const r = await send(id, text, { reply_markup: { inline_keyboard: [[ib('📑 Hisobotlar', 'rp:hub')]] } }).catch(() => null); if (r?.ok) sent++; }
  const sms = await smsReport(kind).catch(e => ({ error: String(e) }));
  return { sent, recipients: ids.length, sms };
}

// 🎬 Video montaj Mini App (telefonning o'zida montaj; tayyor video shu chatga keladi)
async function mediaOpen(chatId: number) {
  const url = await getSetting<string>('eduMontajAppUrl', '');
  if (!url) return void send(chatId, '⚠️ Video montaj ilovasi hali sozlanmagan.', { reply_markup: menu() });
  await send(chatId,
    '🎬 <b>Video montaj</b>\n\n1️⃣ Format: 9:16 Reels/Stories · 1:1 Post · 16:9\n2️⃣ Rasm va videolarni qo‘shing — videoni kesing, rasm davomiyligini tanlang\n3️⃣ Matn, o‘tish effekti, logotip, intro/outro, musiqa\n4️⃣ “Tayyorlash” — video shu chatga MP4 bo‘lib keladi\n\n<i>Tayyorlash video uzunligicha davom etadi (90 soniyagacha) — shu vaqt ilovani yopmang.</i>',
    { reply_markup: { inline_keyboard: [[{ text: '🎬 Montajni ochish', web_app: { url } }]] } });
}

// 🗓 Dars jadvali PDF — Edutizim guruhlaridan; "🔄 Yangilash" avval Edutizim'dan qayta o'qiydi
const WD_LONG = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
async function scheduleSend(chatId: number, refresh: boolean, all = false) {
  if (refresh) {
    await send(chatId, '⏳ Edutizim’dan guruhlar qayta o‘qilmoqda… (30–60 soniya)');
    const r = await edu('sync');
    if (!r.ok) await send(chatId, `⚠️ Yangilab bo‘lmadi: ${esc(r.error)}. Oxirgi saqlangan holat yuboriladi.`);
  }
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'upload_document' }).catch(() => {});
  const { data: rows, error } = await admin.from('crm_edu_groups').select('id,name,data,synced_at');
  if (error) return void send(chatId, `⚠️ ${esc(error.message)}`, { reply_markup: menu() });
  const lessons = toLessons(rows || []);
  const synced = Math.max(0, ...(rows || []).map((x: any) => new Date(x.synced_at).getTime() || 0));
  const d = new Date(synced + TZ);
  const stamp = synced ? `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} holatiga` : '';
  const u = me();
  const own = role() === 'teacher' && !all;
  if (own && !u?.employee_id) return void send(chatId, '⚠️ Edutizim’dagi o‘qituvchi profilingiz topilmadi. Top menejerga murojaat qiling.', { reply_markup: menu() });
  let pdf;
  try { pdf = await schedulePdf(lessons, { stamp, teacherId: own ? u.employee_id : undefined, title: own ? (u.full_name || '') : undefined }); }
  catch (e) { return void send(chatId, `⚠️ PDF tayyorlanmadi: ${esc((e as Error).message)}`, { reply_markup: menu() }); }
  // Bugungi kun: Edutizim'da 1 = Yakshanba
  const today = new Date(Date.now() + TZ).getUTCDay() + 1;
  const mine = own ? lessons.filter(l => l.teacherId === u.employee_id) : lessons;
  const todayN = mine.filter(l => l.days.includes(today)).length;
  const todayKind = today === 1 ? 'dam olish kuni' : [...new Set(mine.filter(l => l.days.includes(today)).map(l => daysLabel(l.days)))].map(k => k === 'Du·Ch·Ju' ? 'Toq kunlar' : k === 'Se·Pa·Sh' ? 'Juft kunlar' : k).join(', ');
  const caption = `🗓 Dars jadvali${own ? ' · ' + (u.full_name || '') : ''}\n${stamp ? '📌 ' + stamp + ' (Edutizim, har soatda yangilanadi)\n' : ''}` +
    `${pdf.groups} guruh · ${pdf.patterns} xil kun tartibi${pdf.conflicts ? ` · ⚠️ ${pdf.conflicts} ta xona to‘qnashuvi (qizil)` : ''}\n` +
    `Bugun (${WD_LONG[today - 1]}): ${todayN} ta dars${todayKind ? ' — ' + todayKind : ''}`;
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', new Blob([pdf.bytes as BlobPart], { type: 'application/pdf' }), `Dars_jadvali_${stamp.slice(0, 10).replace(/\./g, '-') || 'joriy'}.pdf`);
  form.append('caption', caption);
  const kb = [[{ text: '🔄 Yangilash (Edutizim’dan hozir)', callback_data: 'sch:r' }]];
  if (own) kb.push([{ text: '🏫 Butun markaz jadvali', callback_data: 'sch:a' }]);
  form.append('reply_markup', JSON.stringify({ inline_keyboard: kb }));
  const res = await tg(await token(), 'sendDocument', form);
  if (!res?.ok) await send(chatId, `⚠️ Fayl yuborilmadi: ${esc(res?.description || '')}`, { reply_markup: menu() });
}

// 💵 Naqd inkassa (Shanba–Juma davri, Juma kuni bankka) — hisob _shared/inkassa.ts da
async function inkassa(chatId: number, p0: string = 'cur') {
  const p = (({ week: 'cur', pweek: 'prev' } as Record<string, InkP>)[p0] || p0) as InkP;
  if (!P_INK[p]) return;
  await typing(chatId);
  let text: string;
  try { text = await inkassaReport(edu, p); } catch (e) { return void send(chatId, `⚠️ Kassa tarixini olib bo‘lmadi: ${esc((e as Error).message)}`, { reply_markup: menu() }); }
  const b = (x: InkP) => ib((x === p ? '• ' : '') + P_INK[x], `ink:${x}`);
  await send(chatId, text, { reply_markup: { inline_keyboard: [[b('cur'), b('prev')], [b('month'), b('pmonth')], [b('w8')]] } });
}

async function expenseCategory(chatId: number, idx: number) {
  const s = await getSession(chatId);
  const c = s.step === 'exp' ? (s.data.cats || [])[idx] : null;
  if (!c) return expenses(chatId, (s.data?.p as Period) || 'week');
  const lines = c.tx.map((t: any) => `• ${dmy(new Date(t.d).getTime())} — <b>${sum(t.a)}</b>${t.w ? ` · ${esc(t.w)}` : ''}${t.m ? ` · ${esc(t.m)}` : ''}${t.c ? `\n   <i>${esc(t.c)}</i>` : ''}`).join('\n');
  await send(chatId, `🔎 <b>${esc(c.name)}</b> · ${esc(s.data.label)}\nJami: <b>${mln(c.sum)}</b> · ${c.n} ta amal\n\n${lines}${c.n > c.tx.length ? `\n… eng katta ${c.tx.length} tasi ko‘rsatildi` : ''}`.slice(0, 4000), {
    reply_markup: { inline_keyboard: [[ib('⬅️ Kategoriyalarga qaytish', `ex:${s.data.p}`)]] }
  });
}

// ---------------------------------------------------------
// 🎟 Vaucherlar: Edutizimda ismi yoki izohida "vaucher" yozilgan o'quvchilar.
// Vaucher bitta fan narxidan: Edutizimdagi 1 dars narxi × 13 dars (bir oy); topilmasa ingliz tili 520 000, qolgani 455 000.
// Foizli vaucher: to'lov × foiz ÷ (100 − foiz) (= oylik narxning foizi); 100% — oylik narx; aniq summa — bir marta.
// Edutizimda vaucher "Student ga voucher" (studentBonus), to'lov "Student to'ladi" (income) bo'lib yoziladi.
// ---------------------------------------------------------
const VW = String.raw`\bv[ao]u?n?[cс]h?e?r\w*|в[ао]у?н?ч[еэ]р\w*`;
const VOUCH_RE = new RegExp(VW, 'i');
function parseVoucher(text: string) {
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!VOUCH_RE.test(t)) return null;
  const pct = t.match(/(\d{1,3})\s*(%|foiz\w*|фоиз\w*)/i);
  if (pct && Number(pct[1]) > 0 && Number(pct[1]) <= 100) return { kind: 'pct' as const, pct: Number(pct[1]) };
  const sum = t.match(/(\d[\d\s.,]{2,})\s*(so['‘’ʻ`]?m|som)/i);
  if (sum) { const v = Number(sum[1].replace(/\D/g, '')); if (v >= 1000) return { kind: 'sum' as const, sum: v }; }
  const bare = t.match(new RegExp(String.raw`(\d[\d\s.,]*)\s*(?:${VW})`, 'i'));
  if (bare) { const v = Number(bare[1].replace(/\D/g, '')); if (v > 0 && v <= 100) return { kind: 'pct' as const, pct: v, guess: true }; if (v >= 1000) return { kind: 'sum' as const, sum: v, guess: true }; }
  return { kind: 'unknown' as const };
}
const cleanName = (n: string) => String(n || '').replace(new RegExp(String.raw`\s*\d[\d\s.,]*\s*(%|foiz\w*|so['‘’ʻ\x60]?m|som)?\s*(${VW})`, 'ig'), ' ').replace(new RegExp(VW, 'ig'), ' ').replace(/\s\d{1,3}\s*(%|foiz\w*)(?=\s|$)/ig, ' ').replace(/\s+/g, ' ').trim();
async function voucherPrices() {
  return { english: 520000, math: 455000, kids: 455000, other: 455000, roundUp: 10000, ...((await getSetting<any>('eduVoucherPrices', {})) || {}) };
}
let vouchCache: { at: number; text: string } | null = null;
async function voucherView(chatId: number, refresh = false) {
  if (!refresh && vouchCache && Date.now() - vouchCache.at < 10 * 60_000) return sendLong(chatId, vouchCache.text, { reply_markup: { inline_keyboard: [[ib('🔄 Yangilash', 'vch:r')]] } });
  await typing(chatId);
  const wait = await send(chatId, '⏳ Vaucherlar Edutizimdan hisoblanmoqda…');
  const { data: all } = await admin.from('crm_edu_students').select('id,full_name,phone,data').gt('data->>groupsCount', '0').limit(5000);
  const list = (all || []).map((x: any) => {
    const src = `${x.full_name || ''} ${x.data?.additional?.comment || ''}`;
    const v = parseVoucher(src);
    const groups = (x.data?.groupsList || []).filter((g: any) => g?.state === 'active');
    const par = x.data?.parent || {};
    const phones = [...new Set([x.data?.phoneNumber, par.motherPhoneNumber, par.fatherPhoneNumber, x.phone].filter((p: any) => String(p || '').replace(/\D/g, '').length >= 9).map((p: string) => fmtPhone(p)))].slice(0, 2);
    const cfId = (x.data?.customFieldsData || []).find((f: any) => /chegirma/i.test(String(f?.name || '')))?._id;
    const cat0 = cfId ? String((x.data?.customFields || []).find((f: any) => f?._id === cfId)?.value ?? '').trim() : '';
    return v && groups.length ? { id: String(x.id), name: cleanName(x.full_name), raw: x.full_name, cat0, comment: x.data?.additional?.comment || '', phones, own: !!x.data?.phoneNumber, balance: Number(x.data?.balance) || 0, v, groups, fromComment: !VOUCH_RE.test(x.full_name || '') } : null;
  }).filter(Boolean) as any[];
  if (!list.length) return void send(chatId, '🎟 Faol guruhda vaucherli o‘quvchi topilmadi.\n\n<i>Edutizimda o‘quvchi ismiga yoki izohiga “vaucher” so‘zini foiz yoki summa bilan yozing: “20% vaucher”, “100 000 so‘m vaucher”.</i>');
  const prices = await voucherPrices();
  const gids = [...new Set(list.flatMap((x: any) => x.groups.map((g: any) => g._id)))];
  const [{ data: grs }, { data: plans }] = await Promise.all([
    admin.from('crm_edu_groups').select('id,name,data').in('id', gids),
    admin.from('crm_edu_pay_plan').select('student_id,groups').in('student_id', list.map((x: any) => x.id))
  ]);
  const gmap = new Map((grs || []).map((g: any) => [String(g.id), g]));
  const pmap = new Map((plans || []).map((p: any) => [p.student_id, p.groups || []]));
  const local = new Date(Date.now() + 5 * 3600_000), monthKey = local.toISOString().slice(0, 7);
  const monthName = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'][local.getUTCMonth()];
  const dm = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5 * 3600_000); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  // Hamma vaucherli o'quvchilar tarixi — Edutizimga bitta kirishda
  const txAll = await edu('studentTxMany', { ids: list.map((x: any) => x.id) });
  if (!txAll?.ok) {
    if (wait?.result?.message_id) await tg(await token(), 'deleteMessage', { chat_id: chatId, message_id: wait.result.message_id }).catch(() => {});
    return void send(chatId, `⚠️ Edutizimdan ma’lumot olinmadi: ${esc(txAll?.error || 'javob yo‘q')}. Birozdan keyin “🔄 Yangilash”ni bosing.`, { reply_markup: { inline_keyboard: [[ib('🔄 Yangilash', 'vch:r')]] } });
  }
  const txMap: Record<string, any[]> = txAll.tx || {};
  const mustMap: Record<string, any> = txAll.must || {};
  const rows: any[] = [];
  for (const st of list) {
    // Oylik narx — BITTA fan: Edutizimda shu o'quvchidan har darsda yechiladigan summa × 13 dars (bir oy).
    // Dars narxi topilmasa — jadval: ingliz tili 520 000, qolgani 455 000.
    let price = 0, estimate = false, lesson = 0;
    const subjs: string[] = [], gnames: string[] = [];
    for (const sg of st.groups) {
      const g: any = gmap.get(String(sg._id)) || {};
      const gname = String(g.data?.name || g.name || sg.name || ''), course = String(g.data?.course?.name || '');
      gnames.push(gname);
      const kids = /kids/i.test(gname) || /kids/i.test(course) || /(^|[^\d])[2-6]\s*-?\s*sinf/i.test(`${st.raw} ${st.comment || ''}`);
      subjs.push(subjectOf(course) + (kids ? ' · Kids' : ''));
      const pl = (pmap.get(st.id) || []).find((x: any) => x.gid === String(sg._id));
      const per = Number(pl?.price) || 0;
      const p1 = per ? per * 13 : (kids ? prices.kids : /ingliz/i.test(course) ? prices.english : /matem/i.test(course) ? prices.math : prices.other);
      if (p1 > price) { price = p1; lesson = per; estimate = !per; }
    }
    const gname = gnames.join(' + '), subj = subjs.join(' + ');
    // Edutizim: to'lovlar va vaucherlar
    const tx: any[] = (txMap[st.id] || []).filter((t: any) => t.type !== 'attendance');
    const isVoucher = (t: any) => t.type === 'studentBonus' || VOUCH_RE.test(t.paymentTransaction?.name || '');
    const isPay = (t: any) => t.type === 'income' && !isVoucher(t);
    const inMonth = (t: any) => new Date(new Date(t.createdAt).getTime() + 5 * 3600_000).toISOString().slice(0, 7) === monthKey;
    const paid = tx.filter(t => isPay(t) && inMonth(t)), given = tx.filter(t => isVoucher(t) && inMonth(t)), everGiven = tx.filter(isVoucher);
    const P = paid.reduce((a, t) => a + (Number(t.amount) || 0), 0), Vd = given.reduce((a, t) => a + (Number(t.amount) || 0), 0);
    let due = 0, monthly = 0, share = 0, note = '';
    if (st.v.kind === 'pct' && st.v.pct < 100) {
      monthly = Math.round(price * st.v.pct / 100); share = price - monthly;
      // Bir oylik vaucher (narx × foiz); quyida Edutizimdagi "To'lanish kerak" bilan cheklanadi
      due = Math.max(0, monthly - Vd);
    } else if (st.v.kind === 'pct') { monthly = price; share = 0; due = Math.max(0, price - Vd); }
    else if (st.v.kind === 'sum') { monthly = st.v.sum; due = everGiven.length ? 0 : st.v.sum; if (everGiven.length) note = `bir martalik — ${dm(everGiven[everGiven.length - 1].createdAt)} da kiritilgan`; }
    else note = 'foiz yoki summa yozilmagan';
    const m = mustMap[st.id];
    // Edutizimdagi "To'lanish kerak"dan ortiq vaucher kiritilmaydi; 0 bo'lsa — oy allaqachon yopilgan
    if (m && due > m.mustPay) { if (m.mustPay <= 0) note = 'oy allaqachon yopilgan (Edutizim: to‘lanish kerak 0)'; due = Math.max(0, m.mustPay); }
    // Oyni yopishga kam summa (≤ 10 000) yetmasa — shu farq ham vaucherga qo'shiladi
    let extra = 0;
    const roundUp = Number(prices.roundUp ?? 10000);
    if (m && due > 0 && m.mustPay - due > 0 && m.mustPay - due <= roundUp) { extra = m.mustPay - due; due = m.mustPay; }
    rows.push({ ...st, cat: String(m?.chegirma || st.cat0 || '').trim(), gname, subj, price, estimate, lesson, extra, P, Vd, due, monthly, share, note, lastPay: paid.length ? paid[paid.length - 1].createdAt : null, must: m ? m.mustPay : null, balance: m ? m.balance : st.balance });
  }
  rows.sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
  const totDue = rows.reduce((a, x) => a + x.due, 0), totGiven = rows.reduce((a, x) => a + x.Vd, 0), totPaid = rows.reduce((a, x) => a + x.P, 0);
  const vLabel = (x: any) => x.v.kind === 'pct' ? `${x.v.pct}%` : x.v.kind === 'sum' ? `${sum(x.v.sum)} (bir marta)` : 'vaucher';
  const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const phone = (x: any) => x.phones.length ? x.phones.map((p: string) => `<code>${esc(p)}</code>`).join(' · ') : '—';
  const need = rows.filter(x => x.due > 0);
  // Edutizim kartasidagi "To'lanish kerak" bilan solishtirish (qolgan darslar summasi − balans)
  const closes = (x: any) => {
    if (x.must === null || x.must === undefined) return '⚪ Edutizimdan “To‘lanish kerak” olinmadi';
    const rest = x.must - x.due;
    return rest <= 0 ? `✅ Oy yopiladi (Edutizim: to‘lanish kerak ${num(x.must)})` : `❗ O‘quvchi yana <b>${num(rest)} so‘m</b> to‘lashi kerak (Edutizim: ${num(x.must)})`;
  };
  const priceLine = (x: any) => x.lesson ? `📚 1 dars ${num(x.lesson)} × 13 = ${num(x.price)}${x.v.kind === 'pct' ? ` → ${x.v.pct}% = ${num(x.monthly)}` : ''}` : `📚 Oylik ${num(x.price)}${x.v.kind === 'pct' ? ` → ${x.v.pct}% = ${num(x.monthly)}` : ''}`;
  const card = (x: any) => `<b>${esc(x.name)}</b> — ${vLabel(x)}\n📱 ${phone(x)}\n${priceLine(x)}\n${x.P ? `To‘lagan ${num(x.P)} · ` : ''}Vaucher <b>${num(x.due)} so‘m</b>\n${closes(x)}`;
  // Vaucher kiritish kerak bo'lmaganlar — kategoriyasida bitta qatorda, holati bilan
  const unpaid = rows.filter(x => !x.due && (x.must || 0) > 0);
  const totPay = unpaid.reduce((a, x) => a + (x.must || 0), 0);
  const restLine = (x: any) => {
    const st = (x.must || 0) > 0 ? `💳 to‘lashi kerak <b>${num(x.must)}</b>` : x.Vd > 0 ? `✅ bu oy vaucher kiritilgan (${num(x.Vd)})` : '✅ oy yopilgan';
    return `• ${esc(x.name)} — ${vLabel(x)}: ${st}${x.note && !/oy allaqachon yopilgan/.test(x.note) ? ` <i>(${esc(x.note)})</i>` : ''}\n   📱 ${phone(x)}`;
  };
  const notClosed = need.filter(x => x.must !== null && x.must !== undefined && x.must - x.due > 0).length;
  // Kategoriyalar — Edutizim profilidagi "Chegirma turi" bo'yicha (yozilishi har xil bo'lsa ham bitta guruh); kategoriyaning HAMMA o'quvchisi
  const catKey = (c: string) => c.toLowerCase().replace(/[ʻʼ‘’'`]/g, '').replace(/iada|ida/g, 'iada').replace(/\s+/g, ' ').trim();
  const cats = new Map<string, { name: string; list: any[] }>();
  for (const x of rows) { const k = x.cat ? catKey(x.cat) : ''; if (!cats.has(k)) cats.set(k, { name: x.cat || '', list: [] }); cats.get(k)!.list.push(x); }
  const dueOf = (c: { list: any[] }) => c.list.reduce((s2, x) => s2 + x.due, 0);
  const catSorted = [...cats.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || dueOf(b[1]) - dueOf(a[1]) || b[1].list.length - a[1].list.length);
  const catBlocks = catSorted.map(([k, c]) => {
    const nd = c.list.filter(x => x.due > 0), rest = c.list.filter(x => !x.due);
    return `🏷 <b>${k ? esc(c.name) : 'Chegirma turi kiritilmagan'}</b> — ${c.list.length} ta · kiritish kerak ${sum(dueOf(c))}` +
      (nd.length ? `\n\n${nd.map(card).join('\n\n')}` : '') +
      (rest.length ? `\n\n<b>Vaucher kerak emas (${rest.length}):</b>\n${rest.map(restLine).join('\n')}` : '');
  });
  const catSummary = catSorted.map(([k, c]) => `• ${k ? esc(c.name) : '<i>kiritilmagan</i>'}: ${c.list.length} ta · ${sum(dueOf(c))}`).join('\n');
  let text = `🎟 <b>Vaucherlar · ${monthName}</b>\n` +
    `👥 Vaucherli o‘quvchilar: <b>${rows.length}</b>\n` +
    `🎟 Kiritish kerak: <b>${sum(totDue)}</b> (${need.length} ta)${notClosed ? ` · ❗ ${notClosed} tasida oy yopilmaydi` : ''}\n` +
    (unpaid.length ? `💳 To‘lov qilishi kerak: <b>${sum(totPay)}</b> (${unpaid.length} ta)\n` : '') +
    `\n${catSummary}\n\n${catBlocks.join('\n\n━━━━━━━━━━\n')}`;
  vouchCache = { at: Date.now(), text };
  if (wait?.result?.message_id) await tg(await token(), 'deleteMessage', { chat_id: chatId, message_id: wait.result.message_id }).catch(() => {});
  await sendLong(chatId, text, { reply_markup: { inline_keyboard: [[ib('🔄 Yangilash', 'vch:r')]] } });
}

// ---------------------------------------------------------
// ➕ Lid / 📝 O'quvchiga buyurtma → menejerga so'rov → menejer tasdiqlasa,
// Edutizimga MENEJERNING shaxsiy akkaunti nomidan yoziladi (umumiy akkauntga o'tilmaydi)
// ---------------------------------------------------------
const LR_KIND: Record<string, string> = { lead: '➕ Yangi lid', order: '📝 Buyurtma (mavjud o‘quvchi)' };
const isMgrRole = (r: string) => ['service', 'senior', 'top'].includes(r);

async function leadCourse(chatId: number, d: any) {
  await typing(chatId);
  const meta = await edu('meta');
  if (!meta.ok) { await setSession(chatId, null); return void send(chatId, `⚠️ Edutizim: ${esc(meta.error)}`, { reply_markup: menu() }); }
  const courses = (meta.courses || []).slice(0, 40).map((c: any) => ({ id: c.id, name: c.name }));
  await setSession(chatId, 'lead_course', { ...d, courses });
  const btns = courses.map((c: any, i: number) => ib(String(c.name).slice(0, 30), `lc:${i}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([ib('⏭ Kurssiz (standart)', 'lc:-')]);
  await send(chatId, '✅', { reply_markup: menu() });
  await send(chatId, `${LR_KIND[d.kind || 'lead']}\n👤 ${esc(d.name)}${d.phone ? ` · 📱 ${esc(d.phone)}` : ''}\n\n📚 Qaysi kursga?`, { reply_markup: { inline_keyboard: rows } });
}

// Lid telefoni Edutizimda bormi (CRM nusxasidan — Edutizimga hech narsa yozilmaydi)
async function leadCheckPhone(chatId: number, d: any) {
  const d9 = String(d.phone || '').replace(/\D/g, '').slice(-9);
  const { data: ex } = await admin.from('crm_edu_students').select('id,full_name,phone,groups').eq('phone_digits', d9).limit(3);
  if (ex?.length) {
    await setSession(chatId, 'lead_dup', { ...d, found: ex.map((x: any) => ({ id: x.id, name: x.full_name, phone: x.phone, groups: x.groups })) });
    return void send(chatId, `ℹ️ Bu raqam Edutizimda bor:\n${ex.map((x: any, i: number) => `<b>${i + 1}.</b> 👤 ${esc(x.full_name)}${x.groups ? ` · 👥 ${esc(String(x.groups).slice(0, 60))}` : ''}`).join('\n')}\n\nShu o‘quvchiga yangi kursga <b>buyurtma</b> ochilsinmi (takror o‘quvchi yaratilmaydi) yoki baribir yangi lid?`, {
      reply_markup: { inline_keyboard: [...ex.map((x: any, i: number) => [ib(`📝 ${i + 1}. ${String(x.full_name).slice(0, 28)} — buyurtma`, `lo:${i}`)]), [ib('➕ Baribir yangi lid', 'lf'), ib('❌ Bekor', 'x')]] }
    });
  }
  return leadCourse(chatId, { ...d, kind: 'lead' });
}

async function leadPickStudent(chatId: number, d: any, st: any) {
  if (!st) return void send(chatId, 'Topilmadi, qaytadan boshlang.', { reply_markup: menu() });
  const { data: rec } = await admin.from('crm_edu_pushes').select('created_at').eq('edu_student_id', st.id).eq('ok', true)
    .gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString()).limit(1);
  const warn = rec?.length ? `\n⚠️ Bu o‘quvchiga ${dmy(new Date(rec[0].created_at).getTime())} da buyurtma ochilgan — 14 kun ichida takror ochilmaydi.` : '';
  if (warn) { await setSession(chatId, null); return void send(chatId, `👤 ${esc(st.name)}${warn}`, { reply_markup: menu() }); }
  return leadCourse(chatId, { kind: 'order', name: st.name, phone: st.phone || '', eduStudentId: st.id, groups: st.groups || '' });
}

async function leadAskManager(chatId: number, d: any) {
  const { data: users } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,role,phone').in('role', ['service', 'senior', 'top']).order('full_name').limit(40);
  const digits = (users || []).map((u: any) => String(u.phone || '').replace(/\D/g, '').slice(-9)).filter(Boolean);
  const { data: accs } = digits.length ? await admin.from('crm_edu_accounts').select('phone_digits,ok').in('phone_digits', digits) : { data: [] };
  const linked = new Set((accs || []).filter((a: any) => a.ok !== false).map((a: any) => a.phone_digits));
  const order = { service: 0, senior: 1, top: 2 } as Record<string, number>;
  const list = (users || []).sort((a: any, b: any) => (order[a.role] - order[b.role]) || String(a.full_name).localeCompare(String(b.full_name)))
    .map((u: any) => ({ tg: Number(u.tg_id), name: u.full_name || String(u.tg_id), role: u.role, ok: linked.has(String(u.phone || '').replace(/\D/g, '').slice(-9)) }));
  if (!list.length) { await setSession(chatId, null); return void send(chatId, '⚠️ Botda menejer yo‘q. Avval ⚙️ Boshqaruv orqali menejer qo‘shing.', { reply_markup: menu() }); }
  await setSession(chatId, 'lead_mgr', { ...d, mgrs: list });
  await send(chatId, `${LR_KIND[d.kind || 'lead']}\n👤 <b>${esc(d.name)}</b>${d.phone ? ` · 📱 ${esc(d.phone)}` : ''}${d.courseName ? `\n📚 ${esc(d.courseName)}` : ''}\n\n🎧 Qaysi menejerga yuborilsin? U tasdiqlasa, Edutizimga <b>uning akkaunti nomidan</b> yoziladi.\n<i>✅ — Edutizim akkaunti ulangan · ⚠️ — ulanmagan (tasdiqlashdan oldin ulashi kerak)</i>`, {
    reply_markup: { inline_keyboard: [...list.map((u: any, i: number) => [ib(`${u.ok ? '✅' : '⚠️'} ${String(u.name).slice(0, 30)}${u.tg === chatId ? ' (o‘zim)' : ''}`, `lm:${i}`)]), [ib('❌ Bekor', 'x')]] }
  });
}

const lrLine = (o: any) => `${LR_KIND[o.kind] || o.kind} <b>#${o.id}</b>\n👤 <b>${esc(o.full_name)}</b>${o.phone ? ` · 📱 ${esc(o.phone)}` : ''}${o.course_name ? `\n📚 ${esc(o.course_name)}` : ''}${o.note ? `\n📝 ${esc(o.note)}` : ''}`;

async function leadSubmit(chatId: number, d: any, mgr: any, from: any) {
  if (!mgr) return void send(chatId, 'Menejer topilmadi, qaytadan tanlang.');
  const { data: o, error } = await admin.from('crm_edu_lead_requests').insert({
    kind: d.kind === 'order' ? 'order' : 'lead', status: 'pending', full_name: d.name, phone: d.phone || null, course_id: d.courseId || null, course_name: d.courseName || null,
    edu_student_id: d.eduStudentId || null, created_by: chatId, created_by_name: me()?.full_name || from?.first_name || '', manager_tg: mgr.tg, manager_name: mgr.name
  }).select('*').single();
  await setSession(chatId, null);
  if (error || !o) return void send(chatId, `⚠️ So‘rov saqlanmadi: ${esc(error?.message || '')}`, { reply_markup: menu() });
  const btns = { inline_keyboard: [[ib('✅ Tasdiqlash — Edutizimga yozish', `lq:a:${o.id}`)], [ib('❌ Rad etish', `lq:r:${o.id}`)]] };
  if (mgr.tg === chatId) {
    await send(chatId, `${lrLine(o)}\n\nO‘zingiz menejer sifatida tanladingiz — tasdiqlang:`, { reply_markup: btns });
    return;
  }
  const r = await send(mgr.tg, `📥 <b>Yangi so‘rov</b> · ${esc(o.created_by_name)} yubordi\n\n${lrLine(o)}\n\nTasdiqlasangiz, Edutizimga <b>sizning akkauntingiz</b> nomidan yoziladi.${mgr.ok ? '' : '\n⚠️ Edutizim akkauntingiz ulanmagan — avval “🔑 Edutizim akkauntim” orqali ulang.'}`, { reply_markup: btns });
  await send(chatId, r?.ok
    ? `📨 So‘rov <b>#${o.id}</b> menejer <b>${esc(mgr.name)}</b>ga yuborildi. Tasdiqlasa, xabar beraman.`
    : `⚠️ So‘rov #${o.id} saqlandi, lekin menejerga xabar bormadi (botni bloklagan bo‘lishi mumkin).`, { reply_markup: menu() });
}

async function leadDecide(chatId: number, data: string, from: any) {
  const [, act, idS] = data.split(':');
  const id = Number(idS);
  const { data: o } = await admin.from('crm_edu_lead_requests').select('*').eq('id', id).maybeSingle();
  if (!o) return void send(chatId, 'So‘rov topilmadi.');
  if (Number(o.manager_tg) !== chatId) return void send(chatId, `ℹ️ Bu so‘rov ${esc(o.manager_name)} uchun.`);
  if (o.status === 'done' || o.status === 'rejected' || o.status === 'writing') return void send(chatId, `ℹ️ #${id} allaqachon ko‘rib chiqilgan.`);
  const who = me()?.full_name || from?.first_name || '';
  if (act === 'r') {
    const { data: upd } = await admin.from('crm_edu_lead_requests').update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', id).in('status', ['pending', 'failed']).select('id');
    if (!upd?.length) return void send(chatId, `ℹ️ #${id} allaqachon ko‘rib chiqilgan.`);
    await send(chatId, `❌ #${id} rad etildi.`);
    if (Number(o.created_by) !== chatId) await send(o.created_by, `❌ Menejer <b>${esc(who)}</b> so‘rovni rad etdi:\n\n${lrLine(o)}`).catch(() => {});
    return;
  }
  // Bir marta yozish: pending/failed → writing (ikki marta bosilsa ham bitta yozuv)
  const { data: lock } = await admin.from('crm_edu_lead_requests').update({ status: 'writing' }).eq('id', id).in('status', ['pending', 'failed']).select('id');
  if (!lock?.length) return void send(chatId, `ℹ️ #${id} allaqachon ko‘rib chiqilmoqda.`);
  await typing(chatId);
  const r = await edu('pushLead', {
    asTg: chatId, requirePersonal: true, force: o.kind === 'lead',
    students: [{ fullName: o.full_name, phone: o.phone || '', eduStudentId: o.edu_student_id || undefined }], courseId: o.course_id || undefined
  });
  const res = r.results?.[0];
  const ok = !!(r.ok && res?.ok && !res.skipped && r.personal);
  const msg = !r.ok ? String(r.error || 'Xatolik') : res?.skipped ? String(res.message) : !res?.ok ? String(res?.message || 'Xatolik') : 'Yozildi';
  await admin.from('crm_edu_lead_requests').update({ status: ok ? 'done' : 'failed', result: msg.slice(0, 300), edu_order_id: res?.orderId || null, decided_at: new Date().toISOString() }).eq('id', id);
  if (!ok) {
    const fix = r.needAccount ? '\n\n🔑 Avval “Edutizim akkauntim” orqali akkauntingizni ulang, keyin qayta bosing.' : '';
    return void send(chatId, `⚠️ #${id} Edutizimga yozilmadi: ${esc(msg)}${fix}`, { reply_markup: { inline_keyboard: [[ib('🔁 Qayta urinish', `lq:a:${id}`), ib('❌ Rad etish', `lq:r:${id}`)], ...(r.needAccount ? [[ib('🔑 Edutizim akkauntim', 'acc')]] : [])] } });
  }
  await send(chatId, `✅ #${id} Edutizimga sizning nomingizdan yozildi.\n\n${lrLine(o)}`, { reply_markup: menu() });
  if (Number(o.created_by) !== chatId) await send(o.created_by, `✅ Menejer <b>${esc(who)}</b> tasdiqladi — Edutizimga uning nomidan yozildi:\n\n${lrLine(o)}`).catch(() => {});
  await notifyOthers(`${o.kind === 'order' ? '📝 Buyurtma' : '➕ Lid'}: <b>${esc(o.full_name)}</b>${o.phone ? ' · ' + esc(o.phone) : ''}${o.course_name ? ' · ' + esc(o.course_name) : ''} · kiritdi ${esc(o.created_by_name)}, tasdiqladi ${esc(who)}`, chatId);
}

// Menejerga kelgan, hali tasdiqlanmagan so'rovlar
async function leadInbox(chatId: number) {
  const { data } = await admin.from('crm_edu_lead_requests').select('*').eq('manager_tg', chatId).in('status', ['pending', 'failed']).order('created_at').limit(10);
  if (!data?.length) return void send(chatId, '📥 Sizga kelgan kutilayotgan so‘rov yo‘q.', { reply_markup: menu() });
  for (const o of data) await send(chatId, `${lrLine(o)}\n✍️ ${esc(o.created_by_name)}${o.status === 'failed' ? `\n⚠️ Oldingi urinish: ${esc(o.result)}` : ''}`, { reply_markup: { inline_keyboard: [[ib('✅ Tasdiqlash', `lq:a:${o.id}`), ib('❌ Rad etish', `lq:r:${o.id}`)]] } });
}

// ---------------------------------------------------------
// 📊 Hisobot / 🔄 Sinxron
// ---------------------------------------------------------
async function report(chatId: number) {
  await typing(chatId);
  const tz = 5 * 3600_000;
  const dayStart = new Date(Math.floor((Date.now() + tz) / 86400_000) * 86400_000 - tz).toISOString();
  const weekStart = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [all, groups, leadsDay, leadsWeek, lastSync, ops, meta] = await Promise.all([
    allBalances(),
    admin.from('crm_edu_groups').select('id', { count: 'exact', head: true }),
    admin.from('crm_edu_pushes').select('id', { count: 'exact', head: true }).eq('ok', true).gte('created_at', dayStart),
    admin.from('crm_edu_pushes').select('id', { count: 'exact', head: true }).eq('ok', true).gte('created_at', weekStart),
    admin.from('crm_sync_log').select('created_at,ok').eq('source', 'edutizim').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('crm_sync_log').select('stats').eq('source', 'edutizim-kassa').eq('ok', true).gte('created_at', dayStart),
    edu('kassaMeta')
  ]);
  const debt = all.filter(s => s.balance < 0);
  const t = (iso?: string) => iso ? new Date(iso).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const cbs = meta.ok ? (meta.cashboxes || []).map((c: any) => `🏦 <b>${esc(c.name)}</b>\n   💵 Naqd: ${sum(c.cash)}\n   💳 Karta: ${sum(c.card)}\n   🖲 Terminal: ${sum(c.terminal)}`).join('\n') : `⚠️ Kassa: ${esc(meta.error || '')}`;
  await send(chatId,
    `📊 <b>Edutizim hisoboti</b>${meta.branch ? ` · ${esc(meta.branch.name)}` : ''}\n\n` +
    `👥 O‘quvchilar: <b>${all.length}</b> · guruhlar: <b>${groups.count ?? 0}</b>\n` +
    `🔴 Qarzdorlar: <b>${debt.length}</b> · jami qarz: <b>${sum(-debt.reduce((a, b) => a + b.balance, 0))}</b>\n` +
    `➕ Lidlar (CRM/bot): bugun <b>${leadsDay.count ?? 0}</b> · 7 kun <b>${leadsWeek.count ?? 0}</b>\n` +
    `💰 Bot orqali kassa amallari bugun: <b>${(ops.data || []).length}</b>\n\n${cbs}\n\n` +
    `🔄 Oxirgi sinxron: ${t(lastSync.data?.created_at)} ${lastSync.data ? (lastSync.data.ok ? '✅' : '⚠️') : ''}`,
    { reply_markup: menu() });
}

async function sync(chatId: number) {
  await send(chatId, '⏳ Edutizim bilan sinxronlanmoqda… (30–60 soniya)');
  const r = await edu('sync');
  await send(chatId, r.ok ? `✅ Sinxron tugadi: <b>${r.students}</b> o‘quvchi, <b>${r.groups}</b> guruh (${Math.round((r.ms || 0) / 1000)} s)` : `⚠️ Sinxron xatosi: ${esc(r.error)}`, { reply_markup: menu() });
}

// ---------------------------------------------------------
// 💰 Kassa: kirim / chiqim
// ---------------------------------------------------------
async function kassaStart(chatId: number, kind: 'in' | 'out', student: any = null) {
  if (role() !== 'top') return void send(chatId, '⛔ Kassa amallari faqat top menejer uchun.', { reply_markup: menu() });
  await typing(chatId);
  const meta = await edu('kassaMeta');
  if (!meta.ok) return void send(chatId, `⚠️ Edutizim kassasi: ${esc(meta.error)}`, { reply_markup: menu() });
  const types = (meta.types || []).filter((t: any) => t.type === (kind === 'in' ? 'payIn' : 'payOut') && t.subtype !== 'employee' && (!student || t.subtype === 'student'));
  const cashboxes = (meta.cashboxes || []).filter((c: any) => !c.frozen);
  if (!types.length || !cashboxes.length) return void send(chatId, '⚠️ Edutizim’da mos kassa yoki kirim/chiqim turi topilmadi.', { reply_markup: menu() });
  const data = { kind, types, methods: meta.methods || [], cashboxes, student };
  if (student) {
    const t = types.find((x: any) => /student to.?ladi/i.test(x.name)) || types[0];
    await setSession(chatId, 'k_amount', { ...data, type: t });
    return void send(chatId, `💰 <b>Kirim</b> · ${esc(t.name)}\n${line(student)}\n\n💵 Summani yozing (masalan: <code>350000</code> yoki <code>350k</code>):`, { reply_markup: CANCEL_KB });
  }
  await setSession(chatId, 'k_type', data);
  const btns = types.map((t: any, i: number) => ib(String(t.name).slice(0, 32), `kt:${i}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  await send(chatId, kind === 'in' ? '💰 <b>Kassaga kirim</b> — turini tanlang:' : '💸 <b>Kassadan chiqim</b> — turini tanlang:', { reply_markup: { inline_keyboard: rows } });
}

const methodName = (m: any) => String(m?.name || '').replace(/\s+/g, ' ').trim();
function summary(d: any) {
  return `${d.kind === 'in' ? '💰 <b>KIRIM</b>' : '💸 <b>CHIQIM</b>'} · ${esc(d.type?.name)}\n` +
    (d.student ? `👤 ${esc(d.student.name)}${d.student.phone ? ' · ' + esc(d.student.phone) : ''}\n` : '') +
    `💵 <b>${sum(d.amount)}</b> · 💳 ${esc(methodName(d.method))}\n🏦 ${esc(d.cashbox?.name)}${d.comment ? `\n📝 ${esc(d.comment)}` : ''}`;
}
async function askMethod(chatId: number, d: any) {
  await setSession(chatId, 'k_method', d);
  const btns = (d.methods || []).map((m: any, i: number) => ib(methodName(m).slice(0, 30), `km:${i}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  await send(chatId, '✅', { reply_markup: menu() });
  await send(chatId, `💵 Summa: <b>${sum(d.amount)}</b>\n\n💳 To‘lov usuli:`, { reply_markup: { inline_keyboard: rows } });
}
async function askComment(chatId: number, d: any) {
  await setSession(chatId, 'k_comment', d);
  await send(chatId, '📝 Izoh yozing (masalan: “Noyabr to‘lovi”, “Qog‘oz, 5 pachka”) yoki o‘tkazib yuboring:', { reply_markup: SKIP_KB });
}
async function confirm(chatId: number, d: any) {
  await setSession(chatId, 'k_confirm', d);
  await send(chatId, '✅', { reply_markup: menu() });
  await send(chatId, `${summary(d)}\n\nTasdiqlaysizmi? Amal Edutizim kassasiga darhol yoziladi.`, { reply_markup: { inline_keyboard: [[ib('✅ Tasdiqlash', 'ok'), ib('❌ Bekor', 'x')]] } });
}
async function execute(chatId: number, d: any, from: any) {
  await setSession(chatId, 'k_busy', {});
  await typing(chatId);
  const by = from?.username ? '@' + from.username : (from?.first_name || '');
  const r = await edu('kassaPay', { asTg: chatId,
    kind: d.kind, cashboxId: d.cashbox?.id, paymentTransactionId: d.type?.id, paymentMethodId: d.method?.id,
    amount: d.amount, studentId: d.student?.id || undefined, comment: `[Bot ${by}] ${d.comment || d.type?.name || ''}`.trim(), by
  });
  await setSession(chatId, null);
  if (!r.ok) return void send(chatId, `⚠️ Kassaga yozilmadi: ${esc(r.error)}\n\n${summary(d)}`, { reply_markup: menu() });
  const rows: any[] = [];
  if (r.id) rows.push([ib('↩️ Bu amalni bekor qilish', `kx:${r.id}`)]);
  await sticker(chatId, 'bajarildi');
  await send(chatId, `✅ <b>Kassaga yozildi</b>\n\n${summary(d)}`, rows.length ? { reply_markup: { inline_keyboard: rows } } : { reply_markup: menu() });
  await notifyOthers(`${d.kind === 'in' ? '💰 Kirim' : '💸 Chiqim'}: ${esc(d.type?.name)} · <b>${sum(d.amount)}</b>${d.student ? ' · ' + esc(d.student.name) : ''}${d.comment ? ' · ' + esc(d.comment) : ''} · ${esc(by)}`, from?.id);
}

// ---------------------------------------------------------
// Router
// ---------------------------------------------------------
// =========================================================
// 👥 Foydalanuvchilar va rollar
// =========================================================
// 🎨 Bo'lim stikerlari (brand/stickers/*.webp), file_id keshlanadi
const STICKER_BASE = 'https://raw.githubusercontent.com/bekmurodovm460-sudo/Registancrm/refs/heads/claude/html-site-web-platform-pltyl0/brand/stickers/';
const stickerIds = new Map<string, string>();
async function sticker(chatId: number | string, key: string) {
  try {
    if (!stickerIds.size) { const saved = await cached<Record<string, string>>('eduStickerIds', {}, 600_000); Object.entries(saved || {}).forEach(([k, v]) => stickerIds.set(k, v)); }
    const r = await tg(await token(), 'sendSticker', { chat_id: chatId, sticker: stickerIds.get(key) || `${STICKER_BASE}${key}.webp` });
    const fid = r?.result?.sticker?.file_id;
    if (fid && stickerIds.get(key) !== fid) {
      stickerIds.set(key, fid);
      await admin.from('crm_settings').upsert({ key: 'eduStickerIds', value: Object.fromEntries(stickerIds) });
    }
  } catch { /* stiker ixtiyoriy */ }
}
const STICKER_OF: Record<string, string> = {
  [B_IN]: 'kirim', [B_OUT]: 'chiqim', [B_ATT]: 'davomat', [B_RISK]: 'xavf', [B_STATS]: 'statistika', [B_EXP]: 'xarajat', [B_INK]: 'hisobot', '/inkassa': 'hisobot',
  [B_DEBT]: 'qarz', [B_FIND]: 'qidir', [B_TEACH]: 'oqituvchi', [B_TASKS]: 'vazifa', [B_LEAD]: 'lid', [B_ORDER]: 'lid', [B_LREQ]: 'lid', [B_VOUCH]: 'statistika', [B_ADMIN]: 'boshqaruv',
  [B_MY]: 'natijam', [B_MYTASK]: 'vazifa', [B_MYDEBT]: 'qarz', [B_BELL]: 'qongiroq', [B_PRICE]: 'narx', [B_NEW]: 'lid', [B_MGR]: 'oqituvchi', '/qongiroq': 'qongiroq', '/narx': 'narx',
  '/kirim': 'kirim', '/chiqim': 'chiqim', '/davomat': 'davomat', '/xavf': 'xavf', '/statistika': 'statistika', '/xarajat': 'xarajat', '/xarajat_oy': 'xarajat',
  '/qarz': 'qarz', '/qidir': 'qidir', '/oqituvchilar': 'oqituvchi', '/vazifalar': 'vazifa', '/lid': 'lid', '/boshqaruv': 'boshqaruv', '/natijam': 'natijam', '/vazifalarim': 'vazifa'
};

// "Menu" tugmasidagi buyruqlar — rolga qarab, ikonkali
const C = (command: string, description: string) => ({ command, description });
const CMDS: Record<string, any[]> = {
  top: [C('start', '🏠 Bosh menyu'), C('davomat', '📅 Davomat — kelmaganlar va izohlar'), C('xavf', '⚠️ Xavf ostida — notcoming'),
    C('kirim', '💰 Kassaga kirim'), C('chiqim', '💸 Kassadan chiqim'), C('statistika', '📈 Aktiv o‘quvchilar va qarz'),
    C('xarajat', '🧾 Xarajatlar — haftalik'), C('xarajat_oy', '🗓 Xarajatlar — oylik'), C('inkassa', '💵 Naqd inkassa — Juma bankka'), C('jadval', '🗓 Dars jadvali (PDF)'), C('kitoblar', '📚 Kitob buyurtmalari'), C('ombor', '📦 Kitoblar ombori'), C('montaj', '🎬 Video montaj'), C('ai', '🤖 AI yordamchi'), C('raqamlar', '📞 Kerakli raqamlar'), C('qarz', '🔴 Qarzdorlar'),
    C('qidir', '🔍 O‘quvchini qidirish'), C('oqituvchilar', '👩‍🏫 O‘qituvchilar hisoboti va Excel'), C('yangilar', '🆕 Yangi talabalar'), C('menejerlar', '🎧 Menejerlar konversiyasi'), C('vazifalar', '📋 Ustozlar vazifalari'),
    C('lid', '➕ Yangi lid'), C('buyurtma', '📝 O‘quvchiga buyurtma'), C('lidsorov', '📥 Menga kelgan lid so‘rovlari'), C('vaucher', '🎟 Vaucherlar — kiritilishi kerak summa'), C('boshqaruv', '⚙️ Rollar, hisobot, sinxron'), C('akkaunt', '🔑 Edutizim akkauntim'), C('cancel', '❌ Bekor qilish')],
  senior: [C('start', '🏠 Bosh menyu'), C('davomat', '📅 Davomat — kelmaganlar va izohlar'), C('xavf', '⚠️ Xavf ostida — notcoming'),
    C('yangilar', '🆕 Yangi talabalar'), C('menejerlar', '🎧 Menejerlar konversiyasi'), C('statistika', '📈 Aktiv o‘quvchilar va qarz'),
    C('xarajat', '🧾 Xarajatlar — haftalik'), C('xarajat_oy', '🗓 Xarajatlar — oylik'), C('inkassa', '💵 Naqd inkassa — Juma bankka'), C('jadval', '🗓 Dars jadvali (PDF)'), C('ombor', '📦 Kitoblar ombori'), C('raqamlar', '📞 Kerakli raqamlar'), C('qongiroq', '🔔 Kassa qo‘ng‘iroqchalari'), C('narx', '💲 Narx nazorati'),
    C('qarz', '🔴 Qarzdorlar'), C('qidir', '🔍 O‘quvchini qidirish'), C('oqituvchilar', '👩‍🏫 O‘qituvchilar hisoboti va Excel'), C('vazifalar', '📋 Ustozlar vazifalari'),
    C('lid', '➕ Yangi lid'), C('buyurtma', '📝 O‘quvchiga buyurtma'), C('lidsorov', '📥 Menga kelgan lid so‘rovlari'), C('vaucher', '🎟 Vaucherlar — kiritilishi kerak summa'), C('akkaunt', '🔑 Edutizim akkauntim'), C('cancel', '❌ Bekor qilish')],
  service: [C('start', '🏠 Bosh menyu'), C('davomat', '📅 Davomat — kelmaganlar va izohlar'), C('xavf', '⚠️ Xavf ostida — notcoming'),
    C('yangilar', '🆕 Yangi talabalar'), C('natijam', '📊 Mening konversiyam'), C('jadval', '🗓 Dars jadvali (PDF)'), C('raqamlar', '📞 Kerakli raqamlar'), C('qidir', '🔍 O‘quvchini qidirish'), C('qarz', '🔴 Qarzdorlar'), C('lid', '➕ Yangi lid'), C('buyurtma', '📝 O‘quvchiga buyurtma'), C('lidsorov', '📥 Menga kelgan lid so‘rovlari'), C('akkaunt', '🔑 Edutizim akkauntim'), C('cancel', '❌ Bekor qilish')],
  teacher: [C('start', '🏠 Bosh menyu'), C('natijam', '📊 Mening natijam — konversiya'), C('vazifalarim', '📋 Vazifalarim'), C('jadval', '🗓 Dars jadvali (PDF)'), C('kitob', '📚 Kitob olish (guruh bo‘yicha)'), C('raqamlar', '📞 Kerakli raqamlar'), C('akkaunt', '🔑 Edutizim akkauntim'), C('cancel', '❌ Bekor qilish')],
  media: [C('start', '🏠 Bosh menyu'), C('ai', '🤖 AI yordamchi'), C('montaj', '🎬 Video montaj'), C('jadval', '🗓 Dars jadvali (PDF)'), C('raqamlar', '📞 Kerakli raqamlar'), C('cancel', '❌ Bekor qilish')],
  director: [C('start', '🏠 Bosh menyu'), C('hisobot', '📑 Hisobotlar'), C('statistika', '📈 Aktiv o‘quvchilar va qarz'), C('xarajat', '🧾 Xarajatlar'), C('inkassa', '💵 Naqd inkassa'), C('davomat', '📅 Davomat'), C('oqituvchilar', '👩‍🏫 O‘qituvchilar'), C('ai', '🤖 AI yordamchi'), C('cancel', '❌ Bekor qilish')],
  none: [C('start', '🚀 Boshlash — raqamni yuborish')]
};
async function syncCommands(chatId: number | string, r: Role) {
  await tg(await token(), 'setMyCommands', { commands: CMDS[r] || CMDS.none, scope: { type: 'chat', chat_id: Number(chatId) } }).catch(() => {});
  // Pastki chapdagi Mini App tugmasi: xodimlarga — 📊 Davomat, qolganlarga — buyruqlar
  const media = r === 'media';
  const url = media ? await getSetting<string>('eduMontajAppUrl', '') : ['top', 'senior', 'service', 'teacher'].includes(r) ? await getSetting<string>('eduAttendanceAppUrl', '') : '';
  await tg(await token(), 'setChatMenuButton', { chat_id: Number(chatId), menu_button: url ? { type: 'web_app', text: media ? '🎬 Montaj' : '📊 Davomat', web_app: { url } } : { type: 'commands' } }).catch(() => {});
}

async function resolveUser(from: any): Promise<{ role: Role; user: any }> {
  if (!from?.id) return { role: 'none', user: null };
  if ((await adminIds()).includes(String(from.id))) return { role: 'top', user: { tg_id: from.id, full_name: from.first_name || 'Owner', owner: true } };
  const { data } = await admin.from('crm_edu_bot_users').select('*').eq('tg_id', from.id).maybeSingle();
  // Rahbar: ruxsatlar katta menejer bilan bir xil (hammasini ko'radi, kassa/SMS o'zgartirmaydi), o'z menyusi va hisobotlari bilan
  if (data?.role === 'director') return { role: 'senior', user: { ...data, director: true } };
  return { role: (data?.role as Role) || 'none', user: data };
}
async function topIds(): Promise<string[]> {
  const { data } = await admin.from('crm_edu_bot_users').select('tg_id').eq('role', 'top');
  return [...new Set([...(await adminIds()), ...(data || []).map(r => String(r.tg_id))])];
}
async function notifyTops(text: string, extra: Record<string, unknown> = {}, exceptId?: number) {
  for (const id of await topIds()) if (id !== String(exceptId)) await send(id, text, extra).catch(() => {});
}
let empCache: { at: number; list: any[] } | null = null;
async function employeesList() {
  if (empCache && Date.now() - empCache.at < 600_000) return empCache.list;
  const r = await edu('employees');
  empCache = { at: Date.now(), list: r.ok ? r.employees : [] };
  return empCache.list;
}

async function askContact(chatId: number, first = '') {
  await sticker(chatId, 'welcome');
  await send(chatId, `👋 Assalomu alaykum${first ? ', <b>' + esc(first) + '</b>' : ''}!\n\n🏛 <b>Registan · Markaz</b> — xodimlar boti.\nKirish uchun <b>telefon raqamingizni</b> yuboring:\n• pastdagi <b>📱 Raqamni yuborish</b> tugmasini bosing (ko‘rinmasa — yozish joyi yonidagi ⌨️ belgisini bosing), yoki\n• raqamni yozing: <b>+998 90 123 45 67</b>\n\nTop menejer tasdiqlagach bot ochiladi.`, {
    reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }]], resize_keyboard: true, is_persistent: true, input_field_placeholder: '+998 90 123 45 67' }
  });
}

async function directorJoin(chatId: number, from: any, phone: string, emp: any = null) {
  const name = emp?.name || [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username;
  await admin.from('crm_edu_bot_users').upsert({ tg_id: from.id, role: 'director', full_name: name, phone: phone || null, employee_id: emp?.id || null, tg_username: from.username || null, updated_at: new Date().toISOString() });
  await syncCommands(from.id, 'director');
  await sticker(chatId, 'welcome');
  await send(chatId, `🎉 Xush kelibsiz, <b>${esc(name)}</b>!\nSiz <b>👔 Rahbar</b> sifatida ulandingiz — ro‘yxatdan o‘tish shart emas.\n\nKunlik (20:00), haftalik (dushanba) va oylik (1-sana) hisobotlar hamda Juma kungi inkassa shu chatga avtomatik keladi. Istalgan hisobotni “📑 Hisobotlar” bo‘limida ochishingiz mumkin.`, { reply_markup: MENU_DIRECTOR });
  await notifyTops(`👔 <b>Rahbar botga ulandi</b>: ${esc(name)}${from.username ? ' · @' + esc(from.username) : ''}${phone ? ' · ' + esc(phone) : ''}\nEndi barcha hisobotlar uning lichkasiga boradi.`, { reply_markup: { inline_keyboard: [[ib('⛔ Bloklash', `ua:${from.id}:blocked`)]] } });
}

async function register(chatId: number, m: any) {
  const c = m.contact;
  if (c && c.user_id !== m.from?.id) return void send(chatId, '📱 Faqat o‘zingizning raqamingizni yuboring.');
  // Tugma orqali — Telegram tasdiqlagan raqam; qo'lda yozilgan — tasdiqlanmagan (top baribir rolni tasdiqlaydi)
  const verified = !!c;
  const digits = String(c ? c.phone_number : normPhone(String(m.text || '')) || '').replace(/\D/g, '').slice(-9);
  if (digits.length !== 9) return askContact(chatId, m.from?.first_name);
  const emp = (await employeesList()).find((e: any) => e.digits === digits);
  const name = emp?.name || [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
  const dirNames = ((await getSetting<string[]>('directorUsernames', [])) || []).map(x => String(x).toLowerCase().replace(/^@/, ''));
  if (m.from.username && dirNames.includes(String(m.from.username).toLowerCase())) return directorJoin(chatId, m.from, '+998' + digits, emp);
  // Top oldindan qo'shgan raqam (faqat Telegram tasdiqlagan raqamda) — darhol shu rol
  const pre = (await getSetting<Record<string, string>>('eduPreApproved', {})) || {};
  if (verified && pre[digits]) {
    const role0 = pre[digits] as Role;
    const { [digits]: _used, ...rest } = pre;
    await admin.from('crm_settings').upsert({ key: 'eduPreApproved', value: rest });
    if (role0 === 'director') return directorJoin(chatId, m.from, '+998' + digits, emp);
    await admin.from('crm_edu_bot_users').upsert({ tg_id: m.from.id, role: role0, full_name: name, phone: '+998' + digits, employee_id: emp?.id || null, tg_username: m.from.username || null, updated_at: new Date().toISOString() });
    await syncCommands(m.from.id, role0);
    await sticker(chatId, 'welcome');
    await send(chatId, `🎉 Xush kelibsiz, <b>${esc(name)}</b>! Siz <b>${ROLE_NAME[role0]}</b> sifatida ulandingiz.\n\nPastdagi tugmalardan foydalaning 👇`, { reply_markup: menuFor(role0) });
    await notifyTops(`✅ Oldindan qo‘shilgan xodim botga kirdi: <b>${esc(name)}</b> · +998${digits} — ${ROLE_NAME[role0]}`, { reply_markup: { inline_keyboard: [[ib('✏️ Rolni o‘zgartirish', `ur:${m.from.id}`)]] } });
    return;
  }
  await admin.from('crm_edu_bot_users').upsert({ tg_id: m.from.id, role: 'pending', full_name: name, phone: '+998' + digits, employee_id: emp?.id || null, tg_username: m.from.username || null, updated_at: new Date().toISOString() });
  await send(chatId, `✅ So‘rovingiz yuborildi.\n👤 ${esc(name)} · +998${digits}${emp ? '\n🗂 Edutizim’da topildi' : ''}\n\nTop menejer rolingizni tasdiqlashi bilan xabar beramiz.`, { reply_markup: { remove_keyboard: true } });
  await notifyTops(`🆕 <b>Botga kirish so‘rovi</b>\n👤 ${esc(name)}${m.from.username ? ' · @' + esc(m.from.username) : ''}\n📱 +998${digits}${verified ? ' ✅ (Telegram tasdiqlagan)' : ' ⚠️ (qo‘lda yozilgan — Telegram tasdiqlamagan)'}\n🗂 Edutizim: ${emp ? 'xodim topildi ✅' : 'topilmadi ⚠️'}${pre[digits] ? `\n📝 Oldindan qo‘shilgan rol: ${ROLE_NAME[pre[digits]] || pre[digits]}` : ''}\n\nRolini tanlang:`, {
    reply_markup: { inline_keyboard: [[ib('👑 Top', `ua:${m.from.id}:top`), ib('🧭 Katta', `ua:${m.from.id}:senior`), ib('🎧 Servis', `ua:${m.from.id}:service`), ib('👩‍🏫 O‘qituvchi', `ua:${m.from.id}:teacher`)], [ib('👔 Rahbar', `ua:${m.from.id}:director`), ib('🎬 Media', `ua:${m.from.id}:media`), ib('⛔ Rad etish', `ua:${m.from.id}:blocked`)]] }
  });
}

async function setRole(chatId: number, tgId: number, newRole: Role, by: any) {
  const { data: u } = await admin.from('crm_edu_bot_users').update({ role: newRole, approved_by: by?.id || null, updated_at: new Date().toISOString() }).eq('tg_id', tgId).select('*').maybeSingle();
  if (!u) return void send(chatId, 'Foydalanuvchi topilmadi.');
  await send(chatId, `✅ ${esc(u.full_name)} — ${ROLE_NAME[newRole]}${newRole === 'teacher' && !u.employee_id ? '\n⚠️ Edutizim’da o‘qituvchi topilmadi (telefon mos emas) — “Mening natijam” ishlamaydi.' : ''}`);
  if (newRole === 'blocked') { await syncCommands(tgId, 'none'); await send(tgId, '⛔ Botga kirish rad etildi.', { reply_markup: { remove_keyboard: true } }); return void send(tgId, 'Xato bo‘lsa, top menejerga so‘rov yuboring:', { reply_markup: { inline_keyboard: [[ib('🔁 Qayta so‘rov yuborish', 'brq')]] } }); }
  await syncCommands(tgId, newRole);
  await sticker(tgId, 'welcome');
  await send(tgId, `🎉 Tasdiqlandingiz: <b>${ROLE_NAME[newRole]}</b>\n\nPastdagi tugmalardan foydalaning 👇`, { reply_markup: menuFor(newRole) });
}

async function usersPanel(chatId: number) {
  const { data } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,role,phone').order('role').order('full_name').limit(60);
  const list = data || [];
  await send(chatId, `👥 <b>Bot foydalanuvchilari</b> (${list.length})\n\n` + (list.map(u => `${ROLE_NAME[u.role] || u.role} — ${esc(u.full_name)} · ${esc(u.phone || '')}`).join('\n') || 'Hali yo‘q. Xodim botga /start yozib raqamini yuboradi.'), {
    reply_markup: { inline_keyboard: [[ib('➕ Xodim qo‘shish (raqam bilan)', 'pa:add')], ...(list.some(u => u.role === 'blocked') ? [[ib(`⛔ Bloklanganlar (${list.filter(u => u.role === 'blocked').length})`, 'ub:list')]] : []), ...list.filter(u => u.role !== 'blocked').slice(0, 30).map(u => [ib(`✏️ ${String(u.full_name).slice(0, 30)}`, `ur:${u.tg_id}`)])] }
  });
  const pre = (await getSetting<Record<string, string>>('eduPreApproved', {})) || {};
  const keys = Object.keys(pre);
  if (keys.length) await send(chatId, `📝 <b>Oldindan qo‘shilgan raqamlar</b> (xodim botga kirib raqamini tugma orqali yuborsa, shu rolni oladi):\n${keys.map(d => `• +998${d} — ${ROLE_NAME[pre[d]] || pre[d]}`).join('\n')}`, {
    reply_markup: { inline_keyboard: keys.slice(0, 20).map(d => [ib(`❌ +998${d}`, `pa:rm:${d}`)]) }
  });
}
// ⛔ Bloklanganlar: ro'yxat, ochish (rol tanlash) va tahrirlash (ism / raqam)
async function blockedPanel(chatId: number) {
  const { data } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,phone,updated_at').eq('role', 'blocked').order('updated_at', { ascending: false }).limit(40);
  if (!data?.length) return void send(chatId, '✅ Bloklangan foydalanuvchi yo‘q.', { reply_markup: { inline_keyboard: [[ib('⬅️ Foydalanuvchilar', 'adm:users')]] } });
  await send(chatId, `⛔ <b>Bloklanganlar</b> (${data.length})\n\n${data.map((u, i) => `${i + 1}. <b>${esc(u.full_name)}</b> · ${esc(u.phone || '—')} · <code>${u.tg_id}</code>`).join('\n')}\n\n<i>🔓 Ochish — rol tanlab qayta ruxsat berish. ✏️ — ism yoki raqamni tuzatish.</i>`, {
    reply_markup: { inline_keyboard: [...data.slice(0, 30).map(u => [ib(`🔓 ${String(u.full_name).slice(0, 24)}`, `ur:${u.tg_id}`), ib('✏️ Tahrirlash', `ue:${u.tg_id}`)]), [ib('⬅️ Foydalanuvchilar', 'adm:users')]] }
  });
}
async function userEditMenu(chatId: number, tgId: number) {
  const { data: u } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,phone,role,employee_id').eq('tg_id', tgId).maybeSingle();
  if (!u) return void send(chatId, 'Foydalanuvchi topilmadi.');
  await send(chatId, `✏️ <b>${esc(u.full_name)}</b>\n📱 ${esc(u.phone || '—')}\n🎭 ${ROLE_NAME[u.role] || u.role}\n🗂 Edutizim: ${u.employee_id ? 'bog‘langan ✅' : 'bog‘lanmagan'}\n🆔 <code>${u.tg_id}</code>`, {
    reply_markup: { inline_keyboard: [[ib('👤 Ismni o‘zgartirish', `ue:n:${tgId}`), ib('📱 Raqamni o‘zgartirish', `ue:p:${tgId}`)], [ib(u.role === 'blocked' ? '🔓 Ochish (rol berish)' : '🎭 Rolni o‘zgartirish', `ur:${tgId}`)], [ib('⬅️ Foydalanuvchilar', 'adm:users')]] }
  });
}
async function userEditSave(chatId: number, s: Session, text: string) {
  const { tgId, field } = s.data || {};
  if (!tgId) { await setSession(chatId, null); return; }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (field === 'p') {
    const ph = normPhone(text);
    if (!ph) return void send(chatId, 'Raqamni to‘g‘ri yozing: +998 90 123 45 67');
    patch.phone = ph;
    // Edutizim xodimi shu raqam bilan topilsa — bog'laymiz
    const emp = (await employeesList()).find((e: any) => e.digits === ph.slice(-9));
    if (emp) patch.employee_id = emp.id;
  } else {
    const name = text.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (name.length < 3) return void send(chatId, 'Ism va familiyani to‘liq yozing.');
    patch.full_name = name;
  }
  await admin.from('crm_edu_bot_users').update(patch).eq('tg_id', Number(tgId));
  await setSession(chatId, null);
  await send(chatId, '✅ Saqlandi.', { reply_markup: menu() });
  return userEditMenu(chatId, Number(tgId));
}
// Bloklangan foydalanuvchi qayta so'rov yuboradi (kuniga bir marta)
async function blockedRequest(chatId: number, from: any) {
  const { data: u } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,phone,role,updated_at').eq('tg_id', chatId).maybeSingle();
  if (!u || u.role !== 'blocked') return;
  const key = `eduUnblockReq:${chatId}`, today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  if ((await getSetting<string>(key, '')) === today) return void send(chatId, '⏳ So‘rovingiz bugun yuborilgan. Top menejer javobini kuting.');
  await admin.from('crm_settings').upsert({ key, value: today });
  await notifyTops(`🔓 <b>Blokdan chiqarish so‘rovi</b>\n👤 ${esc(u.full_name)}${from?.username ? ' · @' + esc(from.username) : ''}\n📱 ${esc(u.phone || '—')}\n🆔 <code>${u.tg_id}</code>\n\nRuxsat berasizmi?`, { reply_markup: { inline_keyboard: [[ib('🔓 Ochish (rol tanlash)', `ur:${u.tg_id}`), ib('✏️ Tahrirlash', `ue:${u.tg_id}`)]] } });
  await send(chatId, '📨 So‘rovingiz top menejerga yuborildi. Ruxsat berilsa, bot o‘zi xabar beradi.');
}

async function preApproveCallback(chatId: number, data: string) {
  if (role() !== 'top') return void send(chatId, '⛔ Faqat top menejer.');
  const [, act, d, r0] = data.split(':');
  const pre = (await getSetting<Record<string, string>>('eduPreApproved', {})) || {};
  if (act === 'add') { await setSession(chatId, 'pa_phone', {}); return void send(chatId, '➕ Xodimning telefon raqamini yozing (masalan +998 90 123 45 67):', { reply_markup: CANCEL_KB }); }
  if (act === 'rm') { delete pre[d]; await admin.from('crm_settings').upsert({ key: 'eduPreApproved', value: pre }); return usersPanel(chatId); }
  if (act === 'set' && /^\d{9}$/.test(d) && ['top', 'senior', 'director', 'service', 'teacher', 'media'].includes(r0)) {
    // Shu raqam botda allaqachon bo'lsa — darhol rol beramiz
    const { data: ex } = await admin.from('crm_edu_bot_users').select('tg_id').eq('phone', '+998' + d).maybeSingle();
    if (ex) { await setSession(chatId, null); return setRole(chatId, Number(ex.tg_id), r0 as Role, als.getStore()?.from); }
    pre[d] = r0;
    await admin.from('crm_settings').upsert({ key: 'eduPreApproved', value: pre });
    await setSession(chatId, null);
    return void send(chatId, `✅ +998${d} — ${ROLE_NAME[r0]} sifatida oldindan qo‘shildi.\nXodim botga kirib, <b>📱 Raqamni yuborish</b> tugmasini bossa, darhol shu rol bilan ulanadi.\n\nXodimga yuboring: botni oching → Start → 📱 Raqamni yuborish.`, { reply_markup: menu() });
  }
}

async function adminPanel(chatId: number) {
  await send(chatId, '⚙️ <b>Boshqaruv</b>', { reply_markup: { inline_keyboard: [[ib('👥 Foydalanuvchilar va rollar', 'adm:users')], [ib('📊 Hisobot', 'adm:report'), ib('🔄 Sinxron', 'adm:sync')]] } });
}

// =========================================================
// 📅 Davomat: kelmaganlar + bugungi menejer izohlari
// =========================================================
const hm = (iso: string) => new Date(new Date(iso).getTime() + TZ).toISOString().slice(11, 16);
const firstName = (s: string) => String(s || '').split(' ')[0];
// Izoh manbasi: bot orqali "[Bot · Ism]", ustoz vazifasi "[Ustoz Ism]", aks holda Edutizim'da yozgan menejer
function noteOf(c: any) {
  const t = String(c?.text || '');
  let m = /^\[Bot · ([^\]]+)\]\s*/.exec(t);
  if (m) return { who: m[1], via: '🤖 bot orqali', text: t.slice(m[0].length), at: c.at };
  m = /^\[Ustoz ([^\]]+)\]\s*/.exec(t);
  if (m) return { who: m[1], via: '👩‍🏫 ustoz (bot)', text: t.slice(m[0].length), at: c.at };
  return { who: c?.by || '—', via: '🗂 Edutizim', text: t, at: c.at };
}
const noteLine = (c: any, max = 110) => { const n = noteOf(c); return `💬 <b>${esc(n.who)}</b> · ${n.via} · ${n.at ? `${dmy(new Date(n.at).getTime())} ${hm(n.at)}` : ''}\n      <i>${esc(n.text.slice(0, max))}</i>`; };
async function sendLong(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  const parts: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > 3800) { parts.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) parts.push(cur);
  for (let i = 0; i < parts.length; i++) await send(chatId, parts[i], i === parts.length - 1 ? extra : {});
}

// 📊 Animatsiyali davomat (Mini App): Toq va Juft kunlar alohida
async function attAppRow(): Promise<any[]> {
  const url = await getSetting<string>('eduAttendanceAppUrl', '');
  return url ? [[{ text: '📊 Davomat: Toq / Juft (animatsiya)', web_app: { url } }]] : [];
}
async function attendanceView(chatId: number, day: 'today' | 'yesterday' = 'today') {
  await typing(chatId);
  const d0 = dayStart(Date.now()) - (day === 'yesterday' ? DAY : 0);
  // Edutizim sana filtri kun bo'yicha keng — aniq dars kunini lessonDate bo'yicha ajratamiz
  const ymd = new Date(d0 + TZ).toISOString().slice(0, 10);
  const r = await edu('absences', { fromDate: `${ymd}T00:00:00.000Z`, toDate: `${ymd}T23:59:59.999Z` });
  if (!r.ok) return void send(chatId, `⚠️ Edutizim: ${esc(r.error)}`, { reply_markup: menu() });
  const seen = new Set<string>();
  const rows = (r.rows || []).filter((x: any) => !x.lessonDate || String(x.lessonDate).slice(0, 10) === ymd).filter((x: any) => { const k = `${x.studentId}|${x.groupId}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a: any, b: any) => (a.manager || '').localeCompare(b.manager || '') || a.name.localeCompare(b.name));
  const label = `${day === 'today' ? 'Bugun' : 'Kecha'} · ${dmy(d0)}`;
  const nav = [ib(day === 'today' ? '• Bugun' : 'Bugun', 'att:today'), ib(day === 'yesterday' ? '• Kecha' : 'Kecha', 'att:yesterday')];
  const appRow = await attAppRow();
  if (!rows.length) return void send(chatId, `📅 <b>Davomat · ${label}</b>\n\n✅ Kelmagan o‘quvchi yo‘q (yoki davomat hali belgilanmagan).`, { reply_markup: { inline_keyboard: [nav, ...appRow] } });
  const cm = await edu('commentsFor', { studentIds: rows.map((x: any) => x.studentId) });
  const comments = cm.comments || {};
  const todayNote = (sid: string) => (comments[sid] || []).find((c: any) => new Date(c.at).getTime() >= d0);
  const unr = rows.filter((x: any) => x.state === 'unreasonable').length;
  const done = rows.filter((x: any) => todayNote(x.studentId)).length;
  const byMgr = new Map<string, { n: number; done: number }>();
  rows.forEach((x: any) => { const k = x.manager || '—'; const v = byMgr.get(k) || { n: 0, done: 0 }; v.n++; if (todayNote(x.studentId)) v.done++; byMgr.set(k, v); });
  const mgrLines = [...byMgr.entries()].map(([k, v]) => `👤 ${esc(k)}: ${v.done}/${v.n} ${v.done === v.n ? '✅' : '⏳'}`).join('\n');
  const list = rows.map((x: any, i: number) => {
    const n = todayNote(x.studentId);
    return `<b>${i + 1}. ${x.state === 'unreasonable' ? '🔴' : '🟡'} ${esc(x.name)}</b> · ${esc(x.phone)}\n   ${esc(x.group)} · ${esc(firstName(x.teacher))}${x.balance < 0 ? ` · 💳 ${sum(x.balance)}` : ''}\n   ` +
      (n ? noteLine(n) : `⚠️ bugun izoh yo‘q · mas’ul: ${esc(x.manager || '—')}${(comments[x.studentId] || [])[0] ? `\n   <i>oxirgi: ${esc(noteOf(comments[x.studentId][0]).who)} · ${dmy(new Date(comments[x.studentId][0].at).getTime())}</i>` : ''}`);
  }).join('\n');
  await setSession(chatId, 'att', { day, list: rows.map((x: any) => ({ id: x.studentId, name: x.name, phone: x.phone })) });
  const pending = rows.map((x: any, i: number) => ({ x, i })).filter(({ x }: any) => !todayNote(x.studentId)).slice(0, 24);
  const btns = pending.map(({ x, i }: any) => ib(`✍️ ${i + 1}. ${x.name.slice(0, 22)}`, `ac:${i}`));
  const kbRows: any[] = [nav, ...appRow];
  for (let i = 0; i < btns.length; i += 2) kbRows.push(btns.slice(i, i + 2));
  await sendLong(chatId,
    `📅 <b>Davomat · ${label}</b>\n\n❌ Kelmaganlar: <b>${rows.length}</b> (🔴 sababsiz ${unr} · 🟡 sababli ${rows.length - unr})\n📞 Menejer izohi: <b>${done}/${rows.length}</b>\n${mgrLines}\n\n${list}` +
    (pending.length ? '\n\n✍️ Gaplashgach izoh yozish uchun o‘quvchini tanlang 👇' : '\n\n✅ Hammasiga izoh yozilgan!'),
    { reply_markup: { inline_keyboard: kbRows } });
}

async function commentHistory(chatId: number, st: any) {
  await typing(chatId);
  const cm = (await edu('commentsFor', { studentIds: [st.id], limit: 15 })).comments || {};
  const list = cm[st.id] || [];
  await sendLong(chatId, `💬 <b>Izohlar tarixi</b> · ${esc(st.name)}${st.phone ? ' · ' + esc(st.phone) : ''}\n<i>Edutizim kartasidagi oxirgi ${list.length} ta izoh</i>\n\n${list.map((c: any) => noteLine(c, 400)).join('\n\n') || 'Hali izoh yo‘q.'}`,
    { reply_markup: { inline_keyboard: [[ib('✍️ Izoh yozish', 'fnw')]] } });
  await setSession(chatId, 'hist', { st });
}


// =========================================================
// 📩 Qarzdorlarga SMS (Edutizim SMS integratsiyasi orqali) — faqat top menejer
// =========================================================
const DEFAULT_SMS = 'Assalomu alaykum, {ism}! Registan LC: hisobingizda {qarz} qarzdorlik bor. Iltimos, to‘lovni bugun amalga oshiring. Rahmat!';
const fillSms = (t: string, st: any) => String(t)
  .replace(/\{(ism|name|fio)\}/gi, st.name || '')
  .replace(/\{(qarz|balance|debt|summa)\}/gi, sum(Math.abs(Math.min(0, Number(st.balance) || 0))));
const smsLen = (t: string) => { const n = t.length; return n <= 160 ? 1 : Math.ceil(n / 153); };

async function smsStart(chatId: number, preset: any[] | null = null) {
  if (role() !== 'top') return void send(chatId, '⛔ SMS yuborish faqat top menejer uchun.', { reply_markup: menu() });
  if (preset) { await setSession(chatId, 'sms', { list: preset, aud: 'one' }); return smsAskTo(chatId); }
  await typing(chatId);
  const all = (await allBalances()).filter(x => x.balance < 0);
  const act = all.filter(x => x.active);
  const cnt = (l: any[]) => l.length;
  await setSession(chatId, 'sms', {});
  await send(chatId, `📩 <b>Qarzdorlarga SMS</b> (Edutizim orqali)\n\nKimlarga yuboramiz?`, { reply_markup: { inline_keyboard: [
    [ib(`✅ Aktiv qarzdorlar (${cnt(act)})`, 'sma:act')],
    [ib(`🔴 Aktiv, qarz ≥ 500 ming (${cnt(act.filter(x => x.balance <= -500000))})`, 'sma:act500')],
    [ib(`🔴 Aktiv, qarz ≥ 1 mln (${cnt(act.filter(x => x.balance <= -1000000))})`, 'sma:act1m')],
    [ib(`📋 Barcha qarzdorlar, ketganlar bilan (${cnt(all)})`, 'sma:all')],
    [ib('❌ Bekor', 'x')]
  ] } });
}
async function smsPickAudience(chatId: number, aud: string) {
  const all = (await allBalances()).filter(x => x.balance < 0);
  const list = (aud === 'all' ? all : all.filter(x => x.active)).filter(x => aud === 'act500' ? x.balance <= -500000 : aud === 'act1m' ? x.balance <= -1000000 : true)
    .sort((a, b) => a.balance - b.balance).slice(0, 500).map(x => ({ id: x.id, name: x.name, balance: x.balance }));
  if (!list.length) return void send(chatId, 'Bu guruhda qarzdor yo‘q.', { reply_markup: menu() });
  await setSession(chatId, 'sms', { list, aud });
  return smsAskTo(chatId);
}
async function smsAskTo(chatId: number) {
  const s = await getSession(chatId);
  await send(chatId, `👥 Qabul qiluvchilar: <b>${s.data.list.length}</b> ta o‘quvchi\n\nSMS kimga borsin?`, { reply_markup: { inline_keyboard: [
    [ib('👨‍👩‍👧 Ota-onaga', 'smt:parent'), ib('🧑‍🎓 O‘quvchiga', 'smt:student')], [ib('👥 Ikkalasiga', 'smt:both')]
  ] } });
}
async function smsAskText(chatId: number) {
  const meta = await edu('smsMeta');
  if (!meta.ok) return void send(chatId, `⚠️ Edutizim SMS: ${esc(meta.error)}`, { reply_markup: menu() });
  if (!(meta.integrations || []).length) return void send(chatId, '⚠️ Edutizim’da faol SMS integratsiyasi yo‘q (Sozlamalar → Integratsiyalar).', { reply_markup: menu() });
  const tpls = (meta.templates || []).filter((t: any) => /qarz|to.?lov|mablag|minus|hisob/i.test(`${t.name} ${t.content}`)).slice(0, 8);
  const s = await getSession(chatId);
  await setSession(chatId, 'sms', { ...s.data, tpls, integrations: meta.integrations, devices: meta.devices || [] });
  const rows = tpls.map((t: any, i: number) => [ib(`📄 ${String(t.name || t.content).slice(0, 40)}`, `smx:${i}`)]);
  rows.unshift([ib('⭐ Standart: ism + qarz summasi', 'smx:def')]);
  rows.push([ib('✍️ O‘z matnimni yozaman', 'smx:own')]);
  await send(chatId, `📝 SMS matnini tanlang.\n<i>Matnda {ism} va {qarz} har bir o‘quvchiga alohida qo‘yiladi.</i>\n\n⭐ Standart:\n<code>${esc(DEFAULT_SMS)}</code>`, { reply_markup: { inline_keyboard: rows } });
}
async function smsPreview(chatId: number, text: string) {
  const s = await getSession(chatId);
  const d: any = { ...s.data, text };
  const integ = d.integrations || [];
  if (!d.integrationId && integ.length > 1) {
    await setSession(chatId, 'sms', d);
    return void send(chatId, '📡 Qaysi SMS xizmati orqali?', { reply_markup: { inline_keyboard: integ.map((x: any, i: number) => [ib(`📡 ${x.name}`, `smi:${i}`)]) } });
  }
  if (!d.integrationId) d.integrationId = integ[0]?.id;
  await setSession(chatId, 'sms_confirm', d);
  const sample = fillSms(text, d.list[0]);
  const parts = smsLen(sample);
  const mult = d.to === 'both' ? 2 : 1;
  const iname = (integ.find((x: any) => x.id === d.integrationId) || {}).name || '';
  await send(chatId,
    `📩 <b>SMS — tasdiqlash</b>\n\n👥 O‘quvchilar: <b>${d.list.length}</b> · ${d.to === 'parent' ? '👨‍👩‍👧 ota-onasiga' : d.to === 'both' ? '👥 o‘quvchi va ota-onasiga' : '🧑‍🎓 o‘zlariga'}\n📡 ${esc(iname)}\n📏 Taxminan <b>${d.list.length * mult * parts}</b> ta SMS (${parts} qism)\n\n<b>Namuna</b> (${esc(d.list[0].name)}):\n<i>${esc(sample)}</i>` +
    (d.list.length > 1 ? `\n\nRo‘yxat boshi: ${d.list.slice(0, 5).map((x: any) => esc(x.name)).join(', ')}${d.list.length > 5 ? '…' : ''}` : ''),
    { reply_markup: { inline_keyboard: [[ib(`✅ Yuborish (${d.list.length})`, 'smok'), ib('❌ Bekor', 'x')]] } });
}
async function smsSend(chatId: number, from: any) {
  const s = await getSession(chatId);
  if (s.step !== 'sms_confirm') return void send(chatId, s.step === 'sms_busy' ? '⏳ Yuborilmoqda…' : 'Amal eskirgan.', { reply_markup: menu() });
  const d = s.data;
  await setSession(chatId, 'sms_busy', {});
  await send(chatId, `⏳ ${d.list.length} ta o‘quvchiga SMS yuborilmoqda…`);
  const personal = /\{(ism|name|fio|qarz|balance|debt|summa)\}/i.test(d.text);
  const by = from?.username ? '@' + from.username : (from?.first_name || '');
  const r = await edu('sendSms', personal
    ? { asTg: chatId, messages: d.list.map((x: any) => ({ studentId: x.id, content: fillSms(d.text, x) })), to: d.to, integrationId: d.integrationId, by }
    : { asTg: chatId, studentIds: d.list.map((x: any) => x.id), content: d.text, to: d.to, integrationId: d.integrationId, by });
  await setSession(chatId, null);
  if (r.sent) await sticker(chatId, 'bajarildi');
  await send(chatId, r.sent ? `✅ SMS yuborildi: <b>${r.sent}</b>${r.failed ? ` · ⚠️ xato: ${r.failed}\n${esc((r.errors || []).join('; '))}` : ''}` : `⚠️ SMS yuborilmadi: ${esc((r.errors || [r.error]).join('; '))}`, { reply_markup: menu() });
  if (r.sent) await notifyOthers(`📩 Qarzdorlarga SMS: ${r.sent} ta${r.failed ? ` (xato ${r.failed})` : ''} · ${esc(by)}`, from?.id);
}


// =========================================================
// 🔔 Kassa qo'ng'iroqchalari va 💲 narx nazorati (faqat top)
// =========================================================
async function bellsView(chatId: number) {
  await typing(chatId);
  const r = await edu('bells');
  if (!r.ok) return void send(chatId, `⚠️ Edutizim: ${esc(r.error)}`, { reply_markup: menu() });
  const list = r.bells || [];
  if (!list.length) return void send(chatId, '🔔 Kassada qo‘ng‘iroqcha yo‘q — hammasi toza ✅', { reply_markup: menu() });
  await setSession(chatId, 'bells', { list });
  const price = list.filter((b: any) => b.type === 'price'), left = list.filter((b: any) => b.type === 'left');
  const L = (b: any) => list.indexOf(b) + 1;
  const txt = `🔔 <b>Kassa qo‘ng‘iroqchalari: ${list.length}</b>\n` +
    (price.length ? `\n💲 <b>Narxi o‘zgarganlar (${price.length})</b>\n${price.map((b: any) => `${L(b)}. ${esc(b.name)} · ${esc(b.group)}\n   ${sum(b.oldPrice)} → <b>${sum(b.newPrice)}</b>`).join('\n')}\n` : '') +
    (left.length ? `\n🚪 <b>Guruhdan chiqqanlar (${left.length})</b>\n${left.map((b: any) => `${L(b)}. ${esc(b.name)} · ${esc(b.group)}${b.leftAt ? ` · ${dmy(new Date(b.leftAt).getTime())}` : ''}${b.reason ? `\n   <i>${esc(String(b.reason).slice(0, 60))}</i>` : ''}`).join('\n')}\n` : '') +
    `\nTekshirib, to‘g‘ri bo‘lsa tozalang; narx xato o‘zgargan bo‘lsa — eski narxga qaytaring 👇`;
  const btns = list.slice(0, 30).map((b: any, i: number) => ib(`${b.type === 'price' ? '💲' : '🚪'} ${i + 1}. ${b.name.slice(0, 20)}`, `bl:${i}`));
  const rows: any[] = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  if (role() === 'top') rows.push([ib('🧹 Hammasini tozalash', 'bda')]);
  await sendLong(chatId, txt, { reply_markup: { inline_keyboard: rows } });
}
async function bellDetail(chatId: number, i: number) {
  const s = await getSession(chatId);
  const b = s.data.list?.[i];
  if (!b) return bellsView(chatId);
  const rows: any[] = role() === 'top' ? [[ib('✅ To‘g‘ri — tozalash', `bd:${i}`)]] : [];
  if (role() === 'top' && b.type === 'price' && b.oldPrice) rows.push([ib(`↩️ Eski narxga qaytarish (${sum(b.oldPrice)})`, `bo:${i}`)]);
  rows.push([ib('⬅️ Ro‘yxatga', 'bls')]);
  await send(chatId, `${b.type === 'price' ? '💲 <b>Narx o‘zgargan</b>' : '🚪 <b>Guruhdan chiqqan</b>'}\n\n👤 ${esc(b.name)} · ${esc(b.phone)}\n👥 ${esc(b.group)}` +
    (b.type === 'price' ? `\n💲 ${sum(b.oldPrice)} → <b>${sum(b.newPrice)}</b>` : `${b.leftAt ? `\n📆 Chiqqan: ${dmy(new Date(b.leftAt).getTime())}` : ''}${b.reason ? `\n📝 ${esc(b.reason)}` : ''}`), { reply_markup: { inline_keyboard: rows } });
}
async function bellAction(chatId: number, i: number, revert: boolean, from: any) {
  const s = await getSession(chatId);
  const b = s.data.list?.[i];
  if (!b) return bellsView(chatId);
  const by = from?.username ? '@' + from.username : (from?.first_name || '');
  if (revert) {
    const r = await edu('changePrice', { asTg: chatId, studentId: b.studentId, groupId: b.groupId, price: b.oldPrice, by });
    if (!r.ok) return void send(chatId, `⚠️ Narx qaytarilmadi: ${esc(r.error)}`, { reply_markup: menu() });
  }
  const d = await edu('bellDelete', { asTg: chatId, id: b.id, by });
  await send(chatId, d.ok ? `✅ ${revert ? `Narx ${sum(b.oldPrice)} ga qaytarildi va q` : 'Q'}o‘ng‘iroqcha tozalandi: ${esc(b.name)}` : `⚠️ Tozalanmadi: ${esc(d.error)}`, { reply_markup: menu() });
  if (revert) await notifyOthers(`↩️ Narx qaytarildi: ${esc(b.name)} · ${esc(b.group)} · ${sum(b.newPrice)} → ${sum(b.oldPrice)} · ${esc(by)}`, from?.id);
  return bellsView(chatId);
}
async function bellsClearAll(chatId: number, from: any) {
  const s = await getSession(chatId);
  const list = s.data.list || [];
  let ok = 0;
  for (const b of list) if ((await edu('bellDelete', { asTg: chatId, id: b.id, by: from?.first_name || '' })).ok) ok++;
  await send(chatId, `🧹 Tozalandi: ${ok}/${list.length}`, { reply_markup: menu() });
}

let auditCache: { at: number; rows: any[] } | null = null;
async function priceGroups(force = false) {
  if (!force && auditCache && Date.now() - auditCache.at < 300_000) return auditCache.rows;
  const r = await edu('priceAudit');
  if (!r.ok) throw new Error(r.error || 'Edutizim xatosi');
  const by = new Map<string, any>();
  for (const x of r.rows || []) {
    const g = by.get(x.groupId) || { groupId: x.groupId, group: x.group, teacher: x.teacher, expected: x.expected, coursePrice: x.coursePrice, size: x.groupSize, normCount: x.normCount, rows: [] };
    g.rows.push(x); by.set(x.groupId, g);
  }
  auditCache = { at: Date.now(), rows: [...by.values()].sort((a, b) => b.rows.length - a.rows.length) };
  return auditCache.rows;
}
async function priceView(chatId: number, force = false) {
  await typing(chatId);
  await send(chatId, '⏳ Narxlar tekshirilmoqda (20–30 soniya)…');
  let groups: any[];
  try { groups = await priceGroups(force); } catch (e) { return void send(chatId, `⚠️ ${esc((e as Error).message)}`, { reply_markup: menu() }); }
  const total = groups.reduce((a, g) => a + g.rows.length, 0);
  if (!total) return void send(chatId, '💲 Barcha aktiv o‘quvchilar guruh narxida ✅', { reply_markup: menu() });
  const lines = groups.map((g, gi) => `<b>${gi + 1}. ${esc(g.group)}</b> · ${esc(firstName(g.teacher))}\n   me’yor: <b>${sum(g.expected)}</b> (${g.normCount}/${g.size})${g.coursePrice ? ` · kurs: ${sum(g.coursePrice)}` : ''}${g.normCount * 2 <= g.size ? ' · ⚠️ me’yor aniq emas' : ''}\n` +
    g.rows.map((x: any) => `   • ${esc(x.name)} — ${sum(x.price)} (${x.price > g.expected ? '+' : '−'}${sum(Math.abs(x.price - g.expected))})${x.discount ? ' 🏷' : ''}`).join('\n')).join('\n');
  const btns = groups.slice(0, 30).map((g, gi) => ib(`👥 ${gi + 1}. ${g.group.slice(0, 22)} (${g.rows.length})`, `pgr:${gi}`));
  const rows: any[] = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([ib('🔄 Qayta tekshirish', 'prf')]);
  await sendLong(chatId, `💲 <b>Narx nazorati</b>\nGuruhdoshlaridan boshqa narxda o‘qiyotganlar: <b>${total}</b> ta (${groups.length} guruh)\n<i>Me’yor — guruhda ko‘pchilik to‘laydigan narx. 🏷 — ismida chegirma belgisi bor. Eski narxda qolganlar ataylab bo‘lishi mumkin — tekshirib to‘g‘irlang.</i>\n\n${lines}`, { reply_markup: { inline_keyboard: rows } });
}
async function priceGroupView(chatId: number, gi: number) {
  const g = (await priceGroups())[gi];
  if (!g) return priceView(chatId);
  const canFix = role() === 'top';
  const rows: any[] = canFix ? g.rows.slice(0, 30).map((x: any, si: number) => [ib(`${si + 1}. ${x.name.slice(0, 20)}: ${sum(x.price)} → ${sum(g.expected)}`, `pfx:${gi}:${si}`)]) : [];
  if (canFix && g.coursePrice && g.coursePrice !== g.expected) rows.push([ib(`Kurs narxiga (${sum(g.coursePrice)}) hammasini`, `pgc:${gi}`)]);
  if (canFix) rows.push([ib(`✅ Hammasini me’yorga (${sum(g.expected)})`, `pga:${gi}`)]);
  rows.push([ib('⬅️ Ro‘yxatga', 'prl')]);
  await send(chatId, `👥 <b>${esc(g.group)}</b> · ${esc(g.teacher)}\nMe’yor: <b>${sum(g.expected)}</b> (${g.normCount}/${g.size} o‘quvchi)${g.coursePrice ? ` · kurs narxi: ${sum(g.coursePrice)}` : ''}\n\n${canFix ? 'O‘quvchini bosib narxini to‘g‘irlang 👇' : g.rows.map((x: any) => `• ${esc(x.name)}: ${sum(x.price)}`).join('\n') + '\n\n<i>Narxni faqat top menejer o‘zgartiradi.</i>'}`, { reply_markup: { inline_keyboard: rows } });
}
async function priceConfirm(chatId: number, gi: number, si: number | 'all', target: 'norm' | 'course') {
  const g = (await priceGroups())[gi];
  if (!g) return priceView(chatId);
  const price = target === 'course' ? g.coursePrice : g.expected;
  const list = si === 'all' ? g.rows : [g.rows[si]].filter(Boolean);
  await setSession(chatId, 'price_fix', { items: list.map((x: any) => ({ studentId: x.studentId, groupId: x.groupId, name: x.name, from: x.price })), price, group: g.group });
  await send(chatId, `💲 <b>Tasdiqlash</b>\n👥 ${esc(g.group)}\n${list.map((x: any) => `• ${esc(x.name)}: ${sum(x.price)} → <b>${sum(price)}</b>`).join('\n')}\n\nEdutizim’da narx darhol o‘zgaradi.`, { reply_markup: { inline_keyboard: [[ib(`✅ Ha, o‘zgartirish (${list.length})`, 'pok'), ib('❌ Yo‘q', 'x')]] } });
}
async function priceApply(chatId: number, from: any) {
  const s = await getSession(chatId);
  if (s.step !== 'price_fix') return void send(chatId, 'Amal eskirgan.', { reply_markup: menu() });
  await setSession(chatId, null);
  const by = from?.username ? '@' + from.username : (from?.first_name || '');
  let ok = 0; const errs: string[] = [];
  for (const x of s.data.items) { const r = await edu('changePrice', { asTg: chatId, studentId: x.studentId, groupId: x.groupId, price: s.data.price, by }); r.ok ? ok++ : errs.push(`${x.name}: ${r.error}`); }
  auditCache = null;
  if (ok) await sticker(chatId, 'bajarildi');
  await send(chatId, `${ok ? '✅' : '⚠️'} Narx o‘zgartirildi: <b>${ok}/${s.data.items.length}</b> → ${sum(s.data.price)}${errs.length ? `\n${esc(errs.slice(0, 3).join('\n'))}` : ''}`, { reply_markup: menu() });
  if (ok) await notifyOthers(`💲 Narx to‘g‘rilandi: ${esc(s.data.group)} · ${ok} ta → ${sum(s.data.price)} · ${esc(by)}`, from?.id);
}


// =========================================================
// 🆕 Yangi talabalar va 🎧 menejerlar konversiyasi
// =========================================================
const normN = (x: string) => String(x || '').toLowerCase().replace(/[ʻʼ‘’'`]/g, '').replace(/\s+/g, ' ').trim();
function myManager(r: any) {
  const u = me();
  return (r.managers || []).find((m: any) => (u?.employee_id && m.id === u.employee_id) || normN(m.name) === normN(u?.full_name));
}
const periodKb = (cb: string, which: string) => [ib(which === 'm' ? '• Bu oy' : 'Bu oy', `${cb}:m`), ib(which === 'pm' ? '• O‘tgan oy' : 'O‘tgan oy', `${cb}:pm`)];

async function newStudentsView(chatId: number, which: string = 'm') {
  await typing(chatId);
  const r = await teacherReport(which);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  let list = r.newStudents || [];
  let head = `🆕 <b>Yangi talabalar · ${r.label}</b>\nMarkazga birinchi marta qo‘shilganlar: <b>${list.length}</b>`;
  if (role() === 'service') {
    const m = myManager(r);
    list = list.filter((x: any) => m && x.managerId === m.id);
    head += `\n👤 Sizga biriktirilganlar: <b>${list.length}</b>`;
  } else {
    const byM = new Map<string, number>();
    list.forEach((x: any) => byM.set(x.manager, (byM.get(x.manager) || 0) + 1));
    if (byM.size) head += '\n' + [...byM.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `🎧 ${esc(k)}: ${v}`).join(' · ');
  }
  const act = list.filter((x: any) => x.state === 'active'), gone = list.filter((x: any) => x.state !== 'active');
  head += `\n\n✅ Hozir o‘qiyapti: <b>${act.length}</b> · 🚪 Ketgan: <b>${gone.length}</b>${list.length ? ` · qolish darajasi: <b>${Math.round((act.length / list.length) * 100)}%</b>` : ''}`;
  const mgrTag = (x: any) => (role() !== 'service' ? ` · 🎧 ${esc(firstName(x.manager))}` : '');
  const actLines = act.slice(0, 100).map((x: any, i: number) => `${i + 1}. <b>${esc(x.name)}</b> · ${esc(x.phone)}\n   🗓 ${dmy(new Date(x.date).getTime())} · ${esc(x.group)} · ${esc(firstName(x.teacher))}${mgrTag(x)}`).join('\n');
  const goneLines = gone.slice(0, 100).map((x: any, i: number) => `${i + 1}. <b>${esc(x.name)}</b> · ${esc(x.phone)}\n   🗓 ${dmy(new Date(x.date).getTime())} → 🚪 ${x.leftAt ? dmy(new Date(x.leftAt).getTime()) : '—'} · ${esc(x.leftGroup || x.firstGroup || x.group)}${mgrTag(x)}${x.reason ? `\n   <i>${esc(String(x.reason).slice(0, 70))}</i>` : ''}`).join('\n');
  await sendLong(chatId,
    `${head}\n\n✅ <b>Hozir o‘qiyotganlar (${act.length})</b>\n${actLines || '—'}${act.length > 100 ? `\n… yana ${act.length - 100}` : ''}\n\n🚪 <b>Ketganlar (${gone.length})</b>\n${goneLines || '—'}${gone.length > 100 ? `\n… yana ${gone.length - 100}` : ''}`,
    { reply_markup: { inline_keyboard: monthKb('nst', which) } });
}

async function managersView(chatId: number, which: string = 'm') {
  await typing(chatId);
  const r = await teacherReport(which);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  const ms = r.managers || [];
  const lines = ms.map((m: any, i: number) => `<b>${i + 1}. ${esc(m.name)}</b>\n   🆕 yangi: <b>${m.newStudents}</b> · 🔁 konversiya: <b>${m.conversion ?? '—'}%</b> (${m.converted}/${m.trials}) · ➖ ketgan: ${m.left}`).join('\n');
  const c = r.center || {};
  await send(chatId, `🎧 <b>Menejerlar · ${r.label}</b>\n\n🏫 Markaz: 🆕 ${c.newStudents ?? (r.newStudents || []).length} yangi · 🔁 ${c.conversion ?? '—'}% (${c.converted}/${c.trials})\n\n${lines || 'Ma’lumot yo‘q.'}\n\n<i>Konversiya — menejerga biriktirilgan, sinov darsiga kelgan o‘quvchilardan shu oy guruhga qo‘shilganlar ulushi.</i>`,
    { reply_markup: { inline_keyboard: [...monthKb('mgv', which), [ib('🆕 Yangi talabalar ro‘yxati', `nst:${which}`)]] } });
}

async function managerMyStats(chatId: number, which: string = 'm') {
  await typing(chatId);
  const r = await teacherReport(which);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  const m = myManager(r);
  if (!m) return void send(chatId, `ℹ️ ${r.label} uchun sizga biriktirilgan ma’lumot topilmadi (Edutizim’dagi ismingiz botdagi bilan mos kelishi kerak: ${esc(me()?.full_name || '')}).`, { reply_markup: { inline_keyboard: monthKb('mys', which) } });
  const ms = (r.managers || []).filter((x: any) => x.conversion !== null).sort((a: any, b: any) => (b.conversion ?? 0) - (a.conversion ?? 0));
  const rank = ms.findIndex((x: any) => x.id === m.id) + 1;
  const mine = (r.newStudents || []).filter((x: any) => x.managerId === m.id);
  await send(chatId,
    `📊 <b>Mening natijam · ${r.label}</b>\n👤 ${esc(m.name)}\n\n🔁 <b>Konversiya: ${m.conversion ?? '—'}%</b> (${m.converted}/${m.trials})\n<i>Sinov darsiga kelganlardan guruhga qo‘shilganlar</i>${rank ? `\n🏅 Menejerlar orasida: ${rank}/${ms.length}` : ''}\n\n🆕 Yangi talabalar: <b>${m.newStudents}</b> (hozir o‘qiyapti: ${mine.filter((x: any) => x.state === 'active').length})\n➖ Ketganlar: ${m.left}\n🏫 Markaz konversiyasi: ${r.center?.conversion ?? '—'}%` +
    (mine.filter((x: any) => x.state === 'active').length ? `\n\n✅ <b>O‘qiyotganlar:</b>\n${mine.filter((x: any) => x.state === 'active').slice(0, 25).map((x: any) => `• ${esc(x.name)} · ${esc(x.group)} · ${dmy(new Date(x.date).getTime())}`).join('\n')}` : '') +
    (mine.filter((x: any) => x.state !== 'active').length ? `\n\n🚪 <b>Ketganlar:</b>\n${mine.filter((x: any) => x.state !== 'active').slice(0, 25).map((x: any) => `• ${esc(x.name)} · ${x.leftAt ? dmy(new Date(x.leftAt).getTime()) : '—'}${x.reason ? ` — <i>${esc(String(x.reason).slice(0, 50))}</i>` : ''}`).join('\n')}` : ''),
    { reply_markup: { inline_keyboard: monthKb('mys', which) } });
}


// =========================================================
// 🔑 Shaxsiy Edutizim akkaunti (izoh va amallar o'z nomidan tushadi)
// =========================================================
async function accountView(chatId: number) {
  const u = me();
  const phone = u?.phone || '';
  const st = phone ? await edu('accountStatus', { phone }) : { linked: false };
  await setSession(chatId, null);
  await send(chatId, `🔑 <b>Edutizim akkauntim</b>\n\n${st.linked ? `✅ Ulangan: <b>${esc(st.phone)}</b>\nBot orqali yozgan izohlaringiz va amallaringiz Edutizim’da <b>sizning nomingizdan</b> tushadi.` : `❌ Ulanmagan.\nHozir izohlaringiz umumiy akkauntdan “[Bot · ismingiz]” belgisi bilan yoziladi.`}\n\n<i>Parol faqat serverda saqlanadi, chatda qolmaydi.</i>`, {
    reply_markup: { inline_keyboard: [[ib(st.linked ? '🔄 Parolni yangilash' : '🔗 Akkauntni ulash', 'acl')], ...(st.linked ? [[ib('❌ Uzish', 'acu')]] : [])] }
  });
}
async function accountAskPhone(chatId: number) {
  const u = me();
  await setSession(chatId, 'acc_phone', {});
  await send(chatId, `📱 Edutizim’ga kiradigan telefon raqamingiz${u?.phone ? ` (odatda ${esc(u.phone)})` : ''}:`, { reply_markup: u?.phone ? kb([[u.phone], [B_CANCEL]]) : CANCEL_KB });
}
async function accountSave(chatId: number, s: Session, password: string, msgId?: number) {
  if (msgId) await tg(await token(), 'deleteMessage', { chat_id: chatId, message_id: msgId }).catch(() => {});
  await setSession(chatId, null);
  await typing(chatId);
  const r = await edu('linkAccount', { phone: s.data.phone, password, tgId: chatId, name: me()?.full_name || '' });
  if (!r.ok) return void send(chatId, `⚠️ Ulanmadi: ${esc(r.error)}\nTelefon va parolni tekshirib, qaytadan urinib ko‘ring: 🔑 Edutizim akkauntim`, { reply_markup: menu() });
  await sticker(chatId, 'bajarildi');
  await send(chatId, `✅ Edutizim akkauntingiz ulandi (${esc(s.data.phone)}). Endi izohlar sizning nomingizdan tushadi.\n🔒 Parol xabaringiz chatdan o‘chirildi.`, { reply_markup: menu() });
}

async function riskView(chatId: number) {
  await typing(chatId);
  const r = await edu('absenceRisk', { days: 21 });
  if (!r.ok) return void send(chatId, `⚠️ Edutizim: ${esc(r.error)}`, { reply_markup: menu() });
  const rows = r.rows || [];
  if (!rows.length) return void send(chatId, '✅ Ketma-ket 2+ dars qoldirgan aktiv o‘quvchi yo‘q.', { reply_markup: menu() });
  const red = rows.filter((x: any) => x.streak >= 3).length;
  await setSession(chatId, 'risk', { list: rows.map((x: any) => ({ id: x.studentId, name: x.name, phone: x.phone })) });
  const cm = (await edu('commentsFor', { studentIds: rows.map((x: any) => x.studentId), limit: 1 })).comments || {};
  const list = rows.map((x: any, i: number) => `<b>${i + 1}. ${x.streak >= 3 ? '🔴' : '🟠'} ${esc(x.name)}</b> — <b>${x.streak} dars</b> ketma-ket${x.unreasonable ? ` (sababsiz ${x.unreasonable})` : ''}\n   ${esc(x.group)} · ${esc(firstName(x.teacher))} · ${esc(x.phone)}\n   📆 ${x.dates.map((d: string) => dmy(new Date(d).getTime())).join(', ')} · mas’ul: ${esc(firstName(x.manager) || '—')}` +
    ((cm[x.studentId] || [])[0] ? `\n   ${noteLine(cm[x.studentId][0], 80)}` : '\n   ⚠️ izoh yo‘q')).join('\n');
  const btns = rows.slice(0, 24).map((x: any, i: number) => ib(`✍️ ${i + 1}. ${x.name.slice(0, 22)}`, `rc:${i}`));
  const kbRows: any[] = [];
  for (let i = 0; i < btns.length; i += 2) kbRows.push(btns.slice(i, i + 2));
  await sendLong(chatId, `⚠️ <b>Notcoming xavfi</b> — ketma-ket kelmayotganlar: <b>${rows.length}</b>\n🔴 3+ dars: ${red} · 🟠 2 dars (keyingi darsda chiqariladi): ${rows.length - red}\n\nEdutizim ketma-ket 3 dars qoldirganni notcoming qiladi — hoziroq qo‘ng‘iroq qiling.\n\n${list}`, { reply_markup: { inline_keyboard: kbRows } });
}

async function askStudentNote(chatId: number, st: any, back: string) {
  await setSession(chatId, 'note', { st, back });
  await send(chatId, `✍️ <b>${esc(st.name)}</b>${st.phone ? ' · ' + esc(st.phone) : ''}\n\nGaplashgan natijangizni yozing — izoh Edutizim’dagi o‘quvchi kartasiga tushadi:`, { reply_markup: CANCEL_KB });
}
async function saveStudentNote(chatId: number, s: Session, text: string) {
  if (text.length < 3) return void send(chatId, 'Izohni to‘liqroq yozing.');
  const r = await edu('comment', { studentId: s.data.st.id, text: text.slice(0, 950), prefix: `[Bot · ${me()?.full_name || als.getStore()?.from?.first_name || 'Xodim'}] `, asTg: chatId });
  await setSession(chatId, null);
  await send(chatId, r.ok ? `✅ Izoh Edutizim’ga yozildi: <b>${esc(s.data.st.name)}</b>\n${r.personal ? '👤 Sizning Edutizim akkauntingizdan' : '🤖 Umumiy akkauntdan (“[Bot · ismingiz]” bilan). O‘z nomingizdan yozish uchun: 🔑 Edutizim akkauntim'}` : `⚠️ Yozilmadi: ${esc(r.error)}`, { reply_markup: menu() });
  if (r.ok && s.data.back === 'att') return attendanceView(chatId, 'today');
}

// =========================================================
// 👩‍🏫 O'qituvchilar hisoboti + Excel
// =========================================================
const repCache = new Map<string, { at: number; r: any }>();
const OY = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
// which: 'm' (bu oy), 'pm' (o'tgan oy) yoki 'YYYY-MM'
function monthRange(which: string) {
  const t = new Date(Date.now() + TZ);
  let y = t.getUTCFullYear(), mo = t.getUTCMonth();
  if (which === 'pm') mo -= 1;
  else if (/^\d{4}-\d{2}$/.test(which)) { y = Number(which.slice(0, 4)); mo = Number(which.slice(5)) - 1; }
  const from = Date.UTC(y, mo, 1) - TZ, end = Date.UTC(y, mo + 1, 1) - TZ - 1;
  const cur = from <= Date.now() && Date.now() <= end;
  const d = new Date(from + TZ);
  return { from, to: Math.min(end, Date.now()), label: `${OY[d.getUTCMonth()]} ${d.getUTCFullYear()}${cur ? ' (joriy)' : ''}` };
}
function lastMonths(n = 6) {
  const t = new Date(Date.now() + TZ);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1)); return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, short: OY[d.getUTCMonth()].slice(0, 3) }; });
}
const monthKb = (cb: string, which: string) => {
  const cur = /^\d{4}-\d{2}$/.test(which) ? which : lastMonths(2)[which === 'pm' ? 1 : 0].key;
  const ms = lastMonths(6);
  return [ms.slice(0, 3), ms.slice(3)].map(row => row.map(m => ib((m.key === cur ? '• ' : '') + m.short, `${cb}:${m.key}`)));
};
async function teacherReport(which: string, teacherId?: string) {
  const key = `${which}|${teacherId || ''}`;
  const c = repCache.get(key);
  if (c && Date.now() - c.at < 600_000) return c.r;
  const mr = monthRange(which);
  const r = await edu('teacherReport', { fromDate: new Date(mr.from).toISOString(), toDate: new Date(mr.to).toISOString(), teacherId });
  if (r.ok) repCache.set(key, { at: Date.now(), r: { ...r, label: `${mr.label} (${dmy(mr.from)}–${dmy(mr.to)})`, mr } });
  return r.ok ? repCache.get(key)!.r : r;
}
const convTxt = (t: any) => (t.conversion === null || t.conversion === undefined ? '—' : `${t.conversion}% (${t.converted}/${t.trials})`);

async function teachersView(chatId: number, which: 'm' | 'pm' = 'm') {
  await typing(chatId);
  await send(chatId, '⏳ O‘qituvchilar hisoboti tayyorlanmoqda (20–40 soniya)…');
  const r = await teacherReport(which);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  const T = r.teachers || [];
  const tot = T.reduce((a: any, t: any) => ({ act: a.act + t.active, j: a.j + t.joined.length, l: a.l + t.left.length, tr: a.tr + t.trials, cv: a.cv + t.converted }), { act: 0, j: 0, l: 0, tr: 0, cv: 0 });
  const dl = (d: number) => (d > 0 ? `📈 +${d}` : d < 0 ? `📉 ${d}` : '➖ 0');
  const lines = T.map((t: any, i: number) => `<b>${i + 1}. ${esc(t.name)}</b> · ${t.groups.length} guruh\n   🗓 Oy boshida <b>${t.start}</b> → hozir <b>${t.now}</b> (${dl(t.delta)})\n   ➕ kelgan ${t.joined.length} · ➖ ketgan ${t.left.length} (aktivdan ${t.leftActive.length})${t.graduated.length ? ` · 🎓${t.graduated.length}` : ''} · 🔁 ${convTxt(t)}`).join('\n');
  const c = r.center || {};
  const centerBlock = `🏫 <b>Markaz</b>\n🗓 Oy boshida: <b>${c.start}</b> aktiv → ${which === 'm' ? 'hozir' : 'oy oxirida'}: <b>${c.now}</b> (${dl(c.delta)}, ${c.start ? (c.delta >= 0 ? '+' : '') + Math.round((c.delta / c.start) * 100) : 0}%)\n➕ Yangi kelgan: <b>${c.joined}</b> · ➖ Ketgan: <b>${c.left}</b> (shundan oy boshida aktiv edi: ${c.leftActive})\n🎓 Bitirgan: ${c.graduated} · 🔁 Konversiya: <b>${c.conversion ?? '—'}%</b> (${c.converted}/${c.trials} sinovdan)\n<i>Har bir o‘quvchi bir marta sanaladi; muzlatilganlar guruhda deb hisoblanadi.</i>`;
  await sendLong(chatId,
    `👩‍🏫 <b>O‘qituvchilar · ${r.label}</b>\n\n${centerBlock}\n\n<b>O‘qituvchilar bo‘yicha:</b>\n${lines}`,
    { reply_markup: { inline_keyboard: [
      [ib(which === 'm' ? '• Bu oy' : 'Bu oy', 'trp:m'), ib(which === 'pm' ? '• O‘tgan oy' : 'O‘tgan oy', 'trp:pm')],
      [ib('📥 Excel (har bir o‘qituvchi)', `txl:${which}`)],
      [ib('🆕 Yangi talabalar', `nst:${which}`), ib('🎧 Menejerlar', `mgv:${which}`)],
      [ib('📋 O‘qituvchiga vazifa berish', 'tnew')]
    ] } });
}

function sheetName(name: string, used: Set<string>) {
  let n = String(name || 'Ustoz').replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'Ustoz';
  let k = n, i = 2;
  while (used.has(k)) k = `${n.slice(0, 25)} ${i++}`;
  used.add(k);
  return k;
}
async function teacherExcel(chatId: number, which: 'm' | 'pm') {
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'upload_document' }).catch(() => {});
  const r = await teacherReport(which);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  const T = r.teachers || [];
  const wb = XLSX.utils.book_new();
  const used = new Set<string>(['Umumiy']);
  const d = (iso: string) => (iso ? new Date(new Date(iso).getTime() + TZ).toISOString().slice(0, 10) : '');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(T.map((t: any, i: number) => ({
    '№': i + 1, 'O‘qituvchi': t.name, 'Telefon': t.phone, 'Guruhlar soni': t.groups.length, 'Guruhlar': t.groups.join('; '),
    'Oy boshida aktiv': t.start, 'Hozir aktiv': t.now, 'O‘zgarish': t.delta, 'Aktivdan ketgan': t.leftActive.length,
    'Aktiv o‘quvchilar': t.active, 'Muzlatilgan': t.frozen, 'Oy davomida kelgan': t.joined.length, 'Oy davomida ketgan (arxiv)': t.left.length,
    'Bitirgan': t.graduated.length, 'Sinov darsiga kelgan': t.trials, 'Sinovdan guruhga o‘tgan': t.converted, 'Konversiya %': t.conversion ?? ''
  }))), 'Umumiy');
  const cc = r.center || {};
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Ko‘rsatkich', 'Qiymat'], ['Davr', r.label], ['Oy boshida aktiv o‘quvchilar', cc.start], ['Hozir aktiv', cc.now], ['O‘zgarish', cc.delta],
    ['O‘zgarish %', cc.start ? Math.round((cc.delta / cc.start) * 100) : 0], ['Yangi kelgan', cc.joined], ['Ketgan (arxiv)', cc.left], ['Oy boshida aktiv bo‘lib ketgan', cc.leftActive],
    ['Bitirgan', cc.graduated], ['Sinov darsiga kelgan', cc.trials], ['Sinovdan guruhga o‘tgan', cc.converted], ['Konversiya %', cc.conversion ?? ''], ['O‘qituvchilar soni', cc.teachers]
  ]), 'Markaz');
  used.add('Markaz');
  for (const t of T) {
    const rows: any[] = [];
    rows.push({ 'Bo‘lim': 'GURUHLAR', 'F.I.Sh.': '', 'Telefon': '', 'Guruh': t.groups.join('; '), 'Sana': '', 'Narx': '', 'Izoh / sabab': '' });
    t.joined.forEach((x: any) => rows.push({ 'Bo‘lim': 'Kelgan', 'F.I.Sh.': x.name, 'Telefon': x.phone, 'Guruh': x.group, 'Sana': d(x.date), 'Narx': x.price, 'Izoh / sabab': x.state }));
    t.left.forEach((x: any) => rows.push({ 'Bo‘lim': 'Ketgan (arxiv)', 'F.I.Sh.': x.name, 'Telefon': x.phone, 'Guruh': x.group, 'Sana': d(x.date), 'Narx': x.price, 'Izoh / sabab': x.reason }));
    t.leftActive.forEach((x: any) => rows.push({ 'Bo‘lim': 'Aktivdan ketgan', 'F.I.Sh.': x?.name || '', 'Telefon': x?.phone || '', 'Guruh': '', 'Sana': '', 'Narx': '', 'Izoh / sabab': 'oy boshida aktiv edi' }));
    t.graduated.forEach((x: any) => rows.push({ 'Bo‘lim': 'Bitirgan', 'F.I.Sh.': x.name, 'Telefon': x.phone, 'Guruh': x.group, 'Sana': d(x.date), 'Narx': '', 'Izoh / sabab': '' }));
    rows.push({ 'Bo‘lim': 'XULOSA', 'F.I.Sh.': `Oy boshida ${t.start} → hozir ${t.now} (${t.delta >= 0 ? '+' : ''}${t.delta}) · Kelgan: ${t.joined.length} · Ketgan: ${t.left.length} (aktivdan ${t.leftActive.length}) · Konversiya: ${convTxt(t)}` });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName(t.name, used));
  }
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Oqituvchilar_${which === 'm' ? 'bu_oy' : 'otgan_oy'}_${dmy(r.mr.from).replace('.', '-')}.xlsx`);
  form.append('caption', `📥 O‘qituvchilar hisoboti · ${r.label}\n${T.length} ta o‘qituvchi: umumiy varaq + har biriga alohida varaq (guruhlar, kelgan, ketgan, bitirgan).`);
  const res = await tg(await token(), 'sendDocument', form);
  if (!res?.ok) await send(chatId, `⚠️ Fayl yuborilmadi: ${esc(res?.description || '')}`);
}

// =========================================================
// 📋 Vazifalar: "Arxiv o'quvchilaringiz bilan ishlang"
// =========================================================
async function newTaskPickTeacher(chatId: number) {
  const { data: users } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,employee_id').eq('role', 'teacher').order('full_name');
  const list = (users || []).filter(u => u.employee_id);
  if (!list.length) return void send(chatId, '⚠️ Botga ulangan o‘qituvchi yo‘q. O‘qituvchi botga /start yozib raqamini yuborsin, keyin uni “👩‍🏫 O‘qituvchi” sifatida tasdiqlang.', { reply_markup: menu() });
  await setSession(chatId, 'tnew', { teachers: list.map(u => ({ tg: u.tg_id, name: u.full_name, emp: u.employee_id })) });
  await send(chatId, '📋 <b>Yangi vazifa: arxiv o‘quvchilar bilan ishlash</b>\n\nQaysi o‘qituvchiga?', { reply_markup: { inline_keyboard: list.slice(0, 40).map((u, i) => [ib(`👩‍🏫 ${String(u.full_name).slice(0, 34)}`, `tt:${i}`)]) } });
}

async function createTask(chatId: number, s: Session, days: number, from: any) {
  const d = s.data;
  await typing(chatId);
  const r = await teacherReport(d.period, d.teacher.emp);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  const t = (r.teachers || []).find((x: any) => x.teacherId === d.teacher.emp);
  const items = (t?.left || []).map((x: any) => ({ studentId: x.id, name: x.name, phone: x.phone, group: x.group, leftAt: x.date, reason: x.reason || '', comment: '', doneAt: null }));
  if (!items.length) { await setSession(chatId, null); return void send(chatId, `ℹ️ ${esc(d.teacher.name)}da ${r.label} davomida arxivga chiqqan o‘quvchi yo‘q.`, { reply_markup: menu() }); }
  const deadline = new Date(Date.now() + days * DAY);
  const { data: task } = await admin.from('crm_edu_tasks').insert({
    kind: 'archive', title: `Arxiv o‘quvchilar bilan ishlash · ${r.label}`, teacher_tg: d.teacher.tg, teacher_name: d.teacher.name, employee_id: d.teacher.emp,
    period_from: new Date(r.mr.from).toISOString(), period_to: new Date(r.mr.to).toISOString(), deadline: deadline.toISOString(), items, created_by: from?.id || null, last_reminded_at: new Date().toISOString()
  }).select('id').single();
  await setSession(chatId, null);
  await send(chatId, `✅ Vazifa yuborildi: <b>${esc(d.teacher.name)}</b>\n📋 ${items.length} ta arxiv o‘quvchi · ⏰ muddat: ${dmy(deadline.getTime())} ${hm(deadline.toISOString())}\nBot ustozga har 4 soatda eslatadi.`, { reply_markup: menu() });
  await send(d.teacher.tg, `📋 <b>Yangi vazifa</b> (${esc(from?.first_name || 'Top menejer')} tomonidan)\n\n<b>Arxiv o‘quvchilaringiz bilan ishlang</b> — ${esc(r.label)}\n👥 ${items.length} ta o‘quvchi\n⏰ Muddat: <b>${dmy(deadline.getTime())} ${hm(deadline.toISOString())}</b>\n\nHar biriga qo‘ng‘iroq qiling va natijani botda izoh qilib yozing. Bajarilmaguncha bot har 4 soatda eslatadi.`, {
    reply_markup: { inline_keyboard: [[ib('📋 Vazifani ochish', `tk:${task?.id}`)]] }
  });
}

const prog = (t: any) => { const n = (t.items || []).length, d = (t.items || []).filter((x: any) => x.doneAt).length; return { n, d }; };
const left = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); if (ms <= 0) return 'muddat o‘tdi'; const h = Math.floor(ms / 3600_000); return h >= 24 ? `${Math.floor(h / 24)} kun ${h % 24} soat qoldi` : `${h} soat qoldi`; };

async function myTasks(chatId: number) {
  const { data } = await admin.from('crm_edu_tasks').select('*').eq('teacher_tg', chatId).in('status', ['open', 'overdue']).order('deadline');
  if (!data?.length) return void send(chatId, '✅ Ochiq vazifa yo‘q.', { reply_markup: menu() });
  await send(chatId, '📋 <b>Vazifalarim</b>', { reply_markup: { inline_keyboard: data.map(t => { const p = prog(t); return [ib(`${t.status === 'overdue' ? '🔴' : '⏳'} ${p.d}/${p.n} · ${t.title.slice(0, 30)}`, `tk:${t.id}`)]; }) } });
}

async function openTask(chatId: number, id: number) {
  const { data: t } = await admin.from('crm_edu_tasks').select('*').eq('id', id).maybeSingle();
  if (!t || (role() === 'teacher' && Number(t.teacher_tg) !== chatId)) return void send(chatId, 'Vazifa topilmadi.', { reply_markup: menu() });
  const p = prog(t);
  const lines = (t.items || []).map((x: any, i: number) => `${x.doneAt ? '✅' : '⏳'} <b>${i + 1}. ${esc(x.name)}</b> · ${esc(x.phone)}\n   ${esc(x.group)} · chiqqan: ${x.leftAt ? dmy(new Date(x.leftAt).getTime()) : '—'}${x.reason ? ` · <i>${esc(String(x.reason).slice(0, 50))}</i>` : ''}${x.comment ? `\n   💬 ${esc(String(x.comment).slice(0, 100))}` : ''}`).join('\n');
  const isOwner = Number(t.teacher_tg) === chatId;
  const btns = isOwner ? (t.items || []).map((x: any, i: number) => ({ x, i })).filter(({ x }: any) => !x.doneAt).slice(0, 30).map(({ x, i }: any) => ib(`📞 ${i + 1}. ${x.name.slice(0, 24)}`, `ti:${t.id}:${i}`)) : [];
  const rows: any[] = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  if (!isOwner && role() === 'top' && ['open', 'overdue'].includes(t.status)) rows.push([ib('⛔ Vazifani bekor qilish', `tc:${t.id}`)]);
  await sendLong(chatId, `📋 <b>${esc(t.title)}</b>\n👩‍🏫 ${esc(t.teacher_name)} · ${p.d}/${p.n} bajarildi\n⏰ Muddat: ${dmy(new Date(t.deadline).getTime())} ${hm(t.deadline)} (${left(t.deadline)})${t.status === 'done' ? '\n✅ Bajarilgan' : t.status === 'overdue' ? '\n🔴 Muddati o‘tgan' : ''}\n\n${lines}` + (btns.length ? '\n\n📞 Qo‘ng‘iroq qilgach o‘quvchini tanlab izoh yozing 👇' : ''), { reply_markup: { inline_keyboard: rows } });
}

async function taskItemAsk(chatId: number, id: number, idx: number) {
  const { data: t } = await admin.from('crm_edu_tasks').select('*').eq('id', id).maybeSingle();
  const x = t?.items?.[idx];
  if (!t || !x || Number(t.teacher_tg) !== chatId) return void send(chatId, 'Topilmadi.', { reply_markup: menu() });
  await setSession(chatId, 'task_note', { id, idx });
  const prev = ((await edu('commentsFor', { studentIds: [x.studentId], limit: 3 })).comments || {})[x.studentId] || [];
  await send(chatId, `📞 <b>${esc(x.name)}</b>\n☎️ ${esc(x.phone)}\n👥 ${esc(x.group)}${x.reason ? `\n📝 Chiqish sababi: ${esc(x.reason)}` : ''}${prev.length ? `\n\n<b>Oldingi izohlar:</b>\n${prev.map((c: any) => noteLine(c, 120)).join('\n')}` : ''}\n\nQo‘ng‘iroq qiling va natijani yozing (masalan: “Dekabrdan qaytadi”, “Boshqa markazga o‘tgan”):`, { reply_markup: CANCEL_KB });
}

async function taskItemSave(chatId: number, s: Session, text: string, from: any) {
  if (text.length < 3) return void send(chatId, 'Izohni to‘liqroq yozing.');
  const { data: t } = await admin.from('crm_edu_tasks').select('*').eq('id', s.data.id).maybeSingle();
  if (!t) return;
  const items = [...(t.items || [])];
  const x = items[s.data.idx];
  const r = await edu('comment', { studentId: x.studentId, text: text.slice(0, 900), prefix: `[Ustoz ${t.teacher_name}] `, asTg: chatId });
  items[s.data.idx] = { ...x, comment: text.slice(0, 500), doneAt: new Date().toISOString() };
  const allDone = items.every((i: any) => i.doneAt);
  await admin.from('crm_edu_tasks').update({ items, ...(allDone ? { status: 'done', done_at: new Date().toISOString() } : {}) }).eq('id', t.id);
  await setSession(chatId, null);
  await send(chatId, `✅ Saqlandi${r.ok ? ' (Edutizim kartasiga ham yozildi)' : ''}: ${esc(x.name)}`, { reply_markup: menu() });
  if (allDone) {
    await sticker(chatId, 'bajarildi');
    await send(chatId, '🎉 Vazifa to‘liq bajarildi. Rahmat!');
    await notifyTops(`✅ <b>${esc(t.teacher_name)}</b> vazifani bajardi: ${esc(t.title)} (${items.length} ta)`, { reply_markup: { inline_keyboard: [[ib('📋 Ko‘rish', `tk:${t.id}`)]] } });
    return;
  }
  return openTask(chatId, t.id);
}

async function tasksTop(chatId: number) {
  const { data } = await admin.from('crm_edu_tasks').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(20);
  const rows = (data || []).map(t => { const p = prog(t); return [ib(`${t.status === 'done' ? '✅' : t.status === 'overdue' ? '🔴' : '⏳'} ${String(t.teacher_name).slice(0, 18)} · ${p.d}/${p.n}`, `tk:${t.id}`)]; });
  rows.push([ib('➕ Yangi vazifa', 'tnew')]);
  await send(chatId, `📋 <b>Vazifalar</b>\n\n${(data || []).length ? (data || []).map(t => { const p = prog(t); return `${t.status === 'done' ? '✅' : t.status === 'overdue' ? '🔴' : '⏳'} ${esc(t.teacher_name)} — ${p.d}/${p.n} · ⏰ ${dmy(new Date(t.deadline).getTime())}`; }).join('\n') : 'Hali vazifa yo‘q.'}`, { reply_markup: { inline_keyboard: rows } });
}

async function myStats(chatId: number, which: 'm' | 'pm' = 'm') {
  const u = me();
  if (!u?.employee_id) return void send(chatId, '⚠️ Edutizim’dagi o‘qituvchi profilingiz topilmadi (telefon mos emas). Top menejerga murojaat qiling.', { reply_markup: menu() });
  await typing(chatId);
  const r = await teacherReport(which, u.employee_id);
  if (!r.ok) return void send(chatId, `⚠️ ${esc(r.error)}`, { reply_markup: menu() });
  const t = (r.teachers || []).find((x: any) => x.teacherId === u.employee_id);
  if (!t) return void send(chatId, `ℹ️ ${r.label} uchun ma’lumot yo‘q.`, { reply_markup: menu() });
  await send(chatId,
    `📊 <b>Mening natijam · ${r.label}</b>\n\n🗓 Oy boshida: <b>${t.start}</b> → hozir: <b>${t.now}</b> (${t.delta > 0 ? '📈 +' + t.delta : t.delta < 0 ? '📉 ' + t.delta : '➖ 0'})\n🗂 Guruhlar: ${t.groups.length}\n${t.groups.map((g: string) => '   • ' + esc(g)).join('\n')}\n\n` +
    `➕ Yangi kelgan: <b>${t.joined.length}</b>\n➖ Ketgan: <b>${t.left.length}</b> · shundan aktivdan: <b>${t.leftActive.length}</b>\n🎓 Bitirgan: ${t.graduated.length}\n\n` +
    `🔁 <b>Konversiya</b>: ${convTxt(t)}\n<i>Sinov darsiga kelganlardan shu oy guruhga qo‘shilganlar ulushi</i>` +
    (t.joined.length ? `\n\n<b>Yangi kelganlar:</b>\n${t.joined.slice(0, 20).map((x: any) => `• ${esc(x.name)} · ${esc(x.group)} · ${dmy(new Date(x.date).getTime())}`).join('\n')}` : '') +
    (t.left.length ? `\n\n<b>Arxivdagilar:</b>\n${t.left.slice(0, 25).map((x: any) => `• ${esc(x.name)} · ${esc(x.phone)} · ${dmy(new Date(x.date).getTime())}${x.reason ? ` — <i>${esc(String(x.reason).slice(0, 50))}</i>` : ''}`).join('\n')}` : ''),
    { reply_markup: { inline_keyboard: [[ib(which === 'm' ? '• Bu oy' : 'Bu oy', 'my:m'), ib(which === 'pm' ? '• O‘tgan oy' : 'O‘tgan oy', 'my:pm')]] } });
}

// =========================================================
// Router
// =========================================================
const ACCESS: Record<string, Role[]> = {
  // matn tugmalari
  [B_IN]: ['top'], [B_OUT]: ['top'], [B_STATS]: ['top', 'senior'], [B_EXP]: ['top', 'senior'], [B_INK]: ['top', 'senior'], [B_SCHED]: ['top', 'senior', 'service', 'teacher', 'media'], [B_PHONES]: ['top', 'senior', 'service', 'teacher', 'media'], [B_BOOK]: ['teacher', 'top'], [B_BOOKS]: ['top'], [B_PUB]: ['top'], [B_STOCK]: ['top', 'senior'], [B_MEDIA]: ['top', 'senior', 'media'], [B_REPORTS]: ['top', 'senior'], [B_AI]: ['top', 'senior', 'service', 'teacher', 'media'], [B_TEACH]: ['top', 'senior'], [B_TASKS]: ['top', 'senior'], [B_ADMIN]: ['top'], [B_BELL]: ['top', 'senior'], [B_PRICE]: ['top', 'senior'], [B_NEW]: ['top', 'senior', 'service'], [B_MGR]: ['top', 'senior'],
  [B_ATT]: ['top', 'senior', 'service'], [B_RISK]: ['top', 'senior', 'service'], [B_FIND]: ['top', 'senior', 'service'], [B_DEBT]: ['top', 'senior', 'service'], [B_LEAD]: ['top', 'senior', 'service'], [B_ORDER]: ['top', 'senior', 'service'], [B_LREQ]: ['top', 'senior', 'service'], [B_VOUCH]: ['top', 'senior'],
  [B_MY]: ['teacher', 'service'], [B_MYTASK]: ['teacher'], [B_MYDEBT]: ['teacher']
};
function cbAllowed(data: string, r: Role) {
  const p = data.split(':')[0];
  const top = ['kt', 'ks', 'km', 'kb', 'ok', 'kx', 'pay', 'ex', 'exc', 'st', 'ua', 'ur', 'urs', 'adm', 'trp', 'txl', 'tnew', 'tt', 'tp', 'td', 'tc'];
  const svc = ['ai', 'sch', 'ph', 'att', 'ac', 'rc', 'dbt', 'lc', 'lf', 'lo', 'lm', 'lq', 'oq', 'x', 'ch', 'fn', 'fnw', 'nst', 'mys'];
  const tch = ['ai', 'sch', 'ph', 'bkt', 'tk', 'ti', 'my', 'x'];
  if (p === 'brq') return r === 'blocked';
  if (['go', 'home', 'acc', 'acl', 'acu'].includes(p)) return ['top', 'senior', 'service', 'teacher', 'media'].includes(r);
  if (r === 'media') return ['ai', 'ph', 'sch'].includes(p);
  if (r === 'top') return true;
  if (r === 'senior') return !['pub', 'pa', 'ub', 'ue', 'bko', 'bkl', 'bkt', 'kt', 'ks', 'km', 'kb', 'ok', 'kx', 'pay', 'ua', 'ur', 'urs', 'adm', 'sms', 'sm1', 'sma', 'smt', 'smx', 'smi', 'smok', 'bd', 'bo', 'bda', 'bdy', 'pfx', 'pga', 'pgc', 'pok', 'tc'].includes(p);
  if (r === 'service') return svc.includes(p);
  if (r === 'teacher') return tch.includes(p);
  return false;
}

async function startMsg(chatId: number, m: any) {
  const r = role();
  const name = esc(m.from?.first_name || '');
  const dir = !!me()?.director;
  const body = dir
    ? `📑 <b>Hisobotlar</b> — kunlik, haftalik, oylik (avtomatik shu chatga keladi)\n📈 <b>Statistika</b> · 🧾 <b>Xarajatlar</b> · 💵 <b>Naqd inkassa</b>\n📅 <b>Davomat</b> · ⚠️ <b>Xavf ostida</b>\n👩‍🏫 <b>O‘qituvchilar</b> · 🆕 <b>Yangi talabalar</b>\n📦 <b>Kitoblar ombori</b> · 🗓 <b>Dars jadvali</b> · 🤖 <b>AI yordamchi</b>`
    : r === 'top'
    ? `💰 <b>Kirim / Chiqim</b> — Edutizim kassasi\n🆕 <b>Yangi talabalar</b> · 🎧 <b>Menejerlar</b> konversiyasi\n📅 <b>Davomat</b> — kelmaganlar va menejer izohlari\n⚠️ <b>Xavf ostida</b> — notcoming bo‘lay deganlar\n📈 <b>Statistika</b> · 🧾 <b>Xarajatlar</b> · 💵 <b>Naqd inkassa</b>\n🔴 <b>Qarzdorlar</b> · 🔍 <b>O‘quvchi</b>\n👩‍🏫 <b>O‘qituvchilar</b> — hisobot, konversiya, Excel\n📋 <b>Vazifalar</b> — ustozlarga topshiriq\n⚙️ <b>Boshqaruv</b> — rollar, hisobot, sinxron`
    : r === 'senior'
      ? `📅 <b>Davomat</b> · ⚠️ <b>Xavf ostida</b>\n🆕 <b>Yangi talabalar</b> · 🎧 <b>Menejerlar</b>\n📈 <b>Statistika</b> · 🧾 <b>Xarajatlar</b> · 💵 <b>Naqd inkassa</b>\n🔔 <b>Qo‘ng‘iroqchalar</b> · 💲 <b>Narx nazorati</b> (ko‘rish)\n🔴 <b>Qarzdorlar</b> · 🔍 <b>O‘quvchi</b>\n👩‍🏫 <b>O‘qituvchilar</b> · 📋 <b>Vazifalar</b>\n<i>Kassa, SMS, narx o‘zgartirish va rollar — top menejerda.</i>`
      : r === 'service'
      ? `📅 <b>Davomat</b> — bugun kelmaganlar: qo‘ng‘iroq qilib izoh yozing\n⚠️ <b>Xavf ostida</b> — ketma-ket kelmayotganlar\n🆕 <b>Yangi talabalar</b> · 📊 <b>Mening natijam</b> — konversiyangiz\n🔍 <b>O‘quvchi</b> · 🔴 <b>Qarzdorlar</b> · ➕ <b>Lid</b>`
      : r === 'media'
      ? `🎬 <b>Video montaj</b> — rasm va videolardan Reels / Stories / Post: kesish, matn, logotip, musiqa, o‘tishlar. Tayyor video shu chatga keladi\n🗓 <b>Dars jadvali</b> · 📞 <b>Kerakli raqamlar</b>`
      : `📊 <b>Mening natijam</b> — aktiv, kelgan, ketgan, konversiya\n📋 <b>Vazifalarim</b> — top menejer topshiriqlari`;
  // 1) salom + doimiy pastki menyu, 2) banner ostida bosib tanlanadigan bo'limlar
  await send(chatId, `👋 Assalomu alaykum, <b>${name}</b>!`, { reply_markup: menu() });
  const caption = `🏛 <b>Registan · Markaz</b> · ${ROLE_NAME[dir ? 'director' : r] || ''}\n\n${body}\n\nKerakli bo‘limni tanlang 👇`;
  const hk = homeKb(me()?.director ? 'director' : r === 'teacher' && als.getStore()?.book ? 'teacherBook' : r, !!me()?.phone);
  hk.inline_keyboard.push(...(await attAppRow()));
  const res = await tg(await token(), 'sendPhoto', { chat_id: chatId, photo: BANNER, caption, parse_mode: 'HTML', reply_markup: hk });
  if (!res?.ok) await send(chatId, caption, { reply_markup: hk });
}

async function onMessage(m: any) {
  const chatId = m.chat.id as number;
  if (m.chat.type !== 'private') {
    // Hisobotlar guruhi: top menejer guruhda /hisobot_guruh yozsa — avtomatik hisobotlar shu guruhga ham boradi
    const gcmd = String(m.text || '').trim().split(/\s+/)[0].split('@')[0].toLowerCase();
    if ((gcmd === '/hisobot_guruh' || gcmd === '/hisobot_guruh_ochir') && role() === 'top') {
      const off = gcmd.endsWith('_ochir');
      await admin.from('crm_settings').upsert({ key: 'reportsChatId', value: off ? null : m.chat.id });
      await send(m.chat.id, off ? '🔕 Avtomatik hisobotlar bu guruhga endi yuborilmaydi.' : '✅ <b>Hisobotlar guruhi</b> ulandi.\nKunlik (20:00), haftalik (dushanba), oylik (1-sana) hisobotlar va Juma kungi inkassa shu guruhga keladi.');
    }
    return;
  }
  const text = String(m.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const r = role();
  if (cmd === '/id') return void send(chatId, `ID: <code>${m.from?.id}</code>`);
  if (r === 'none' && m.from?.username) {
    // Oldindan ruxsat berilgan rahbar — raqam yubormasdan, faqat Start bosganda ulanadi
    const dirNames = ((await getSetting<string[]>('directorUsernames', [])) || []).map(x => String(x).toLowerCase().replace(/^@/, ''));
    if (dirNames.includes(String(m.from.username).toLowerCase())) return directorJoin(chatId, m.from, '');
  }
  if (r === 'none') return m.contact || normPhone(text) ? register(chatId, m) : askContact(chatId, m.from?.first_name);
  if (r === 'pending') return void send(chatId, '⏳ So‘rovingiz top menejer tomonidan ko‘rib chiqilmoqda.', { reply_markup: { remove_keyboard: true } });
  if (r === 'blocked') {
    await send(chatId, '⛔ Botdan foydalanishga ruxsat yo‘q.', { reply_markup: { remove_keyboard: true } });
    return void send(chatId, 'Xato bilan bloklangan bo‘lsangiz, top menejerga so‘rov yuboring:', { reply_markup: { inline_keyboard: [[ib('🔁 Qayta so‘rov yuborish', 'brq')]] } });
  }

  if (cmd === '/akkaunt' && ['top', 'senior', 'service', 'teacher'].includes(r) && me()?.phone) return accountView(chatId);
  if (cmd === '/start' || cmd === '/menu') { await Promise.all([setSession(chatId, null), syncCommands(chatId, me()?.director ? 'director' : r)]); return startMsg(chatId, m); }
  if (text === B_CANCEL || cmd === '/cancel') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: menu() }); }
  if (ACCESS[text] && !ACCESS[text].includes(r)) return void send(chatId, '⛔ Bu bo‘lim sizning rolingiz uchun yopiq.', { reply_markup: menu() });
  const isTop = r === 'top', isMgr = r === 'top' || r === 'senior', isStaff = isMgr || r === 'service';
  const stKey = STICKER_OF[text] || STICKER_OF[cmd];
  if (stKey) await sticker(chatId, stKey);
  if (isTop && (text === B_IN || cmd === '/kirim')) return kassaStart(chatId, 'in');
  if (isTop && (text === B_OUT || cmd === '/chiqim')) return kassaStart(chatId, 'out');
  if (isMgr && (text === B_STATS || cmd === '/statistika')) return stats(chatId);
  if (isMgr && (text === B_EXP || cmd === '/xarajat')) return expenses(chatId, 'week');
  if (isMgr && cmd === '/xarajat_oy') return expenses(chatId, 'month');
  if (isMgr && (text === B_INK || cmd === '/inkassa')) return inkassa(chatId, 'cur');
  if ((text === B_SCHED || cmd === '/jadval')) return scheduleSend(chatId, false);
  if ((text === B_MEDIA || cmd === '/montaj') && ['top', 'senior', 'media'].includes(r)) return mediaOpen(chatId);
  if (isMgr && (text === B_REPORTS || cmd === '/hisobot')) return reportsHub(chatId);
  if (isTop && cmd === '/sms_test') {
    await typing(chatId);
    const kind = (['day', 'week', 'month', 'inkassa'].find(k => text.includes(k)) || 'day') as any;
    const r: any = await smsReport(kind).catch(e => ({ error: String(e) }));
    return void send(chatId, r.sent ? `📱 SMS yuborildi (${r.sent} ta raqam):\n<code>${esc(r.text)}</code>` : `⚠️ SMS yuborilmadi: ${esc(r.skipped === 'no eskiz' ? 'Eskiz login/parol kiritilmagan (CRM → Rahbarga SMS)' : r.skipped === 'no phones' ? 'Rahbar raqami kiritilmagan' : r.error || JSON.stringify(r.results?.map((x: any) => x.error)))}\n\nMatn: <code>${esc(r.text || '')}</code>`);
  }
  if (text === B_AI || cmd === '/ai') { const q = text.startsWith('/ai') ? text.slice(3).trim() : ''; if (q) { await setSession(chatId, 'ai', {}); return aiAsk(chatId, q, m.from); } return aiStart(chatId); }
  if (text === B_PHONES || cmd === '/raqamlar') { await setSession(chatId, null); return phonesView(chatId); }
  if (r === 'teacher' && (text === B_BOOK || cmd === '/kitob')) return bookStart(chatId);
  if (isTop && (text === B_BOOK || cmd === '/kitob')) return bookPickTeacher(chatId);
  if (isTop && (text === B_BOOKS || cmd === '/kitoblar')) return bookOrdersTop(chatId);
  if (isTop && (text === B_PUB || cmd === '/nashriyotlar')) return pubsView(chatId);
  if (isMgr && (text === B_STOCK || cmd === '/ombor')) { await setSession(chatId, null); return stockView(chatId); }
  if (isMgr && (text === B_TEACH || cmd === '/oqituvchilar')) return teachersView(chatId, 'm');
  if (isMgr && (text === B_TASKS || cmd === '/vazifalar')) return tasksTop(chatId);
  if (isTop && (text === B_ADMIN || cmd === '/boshqaruv')) return adminPanel(chatId);
  if (isMgr && (text === B_BELL || cmd === '/qongiroq')) return bellsView(chatId);
  if (isMgr && (text === B_MGR || cmd === '/menejerlar')) return managersView(chatId, 'm');
  if (isStaff && (text === B_NEW || cmd === '/yangilar')) return newStudentsView(chatId, 'm');
  if (r === 'service' && (text === B_MY || cmd === '/natijam')) return managerMyStats(chatId, 'm');
  if (isMgr && (text === B_PRICE || cmd === '/narx')) return priceView(chatId);
  if (isMgr && (text === B_REPORT || cmd === '/hisobot')) return report(chatId);
  if (isTop && (text === B_SYNC || cmd === '/sinxron')) return sync(chatId);
  if (isStaff && (text === B_ATT || cmd === '/davomat')) return attendanceView(chatId, 'today');
  if (isStaff && (text === B_RISK || cmd === '/xavf')) return riskView(chatId);
  if (isStaff && (text === B_FIND || cmd === '/qidir')) { await setSession(chatId, 'find', {}); return void send(chatId, '🔍 O‘quvchining ismi yoki telefon raqamini yozing:', { reply_markup: CANCEL_KB }); }
  if (isStaff && (text === B_DEBT || cmd === '/qarz')) return debtors(chatId);
  if (isStaff && (text === B_LEAD || cmd === '/lid')) { await setSession(chatId, 'lead_name', {}); return void send(chatId, '➕ <b>Yangi lid</b>\nKiritasiz → menejer tasdiqlaydi → Edutizimga uning nomidan yoziladi.\n\n👤 Familiya va ismini yozing:', { reply_markup: CANCEL_KB }); }
  if (isStaff && (text === B_ORDER || cmd === '/buyurtma')) { await setSession(chatId, 'ord_q', {}); return void send(chatId, '📝 <b>O‘quvchiga buyurtma</b>\nEdutizimdagi o‘quvchiga yangi kursga buyurtma (takror o‘quvchi yaratilmaydi).\n\n🔍 O‘quvchining ismi yoki telefonini yozing:', { reply_markup: CANCEL_KB }); }
  if (isStaff && (text === B_LREQ || cmd === '/lidsorov')) return leadInbox(chatId);
  if ((text === B_VOUCH || cmd === '/vaucher') && ['top', 'senior'].includes(r)) return voucherView(chatId);
  if (r === 'teacher' && (text === B_MY || cmd === '/natijam')) return myStats(chatId, 'm');
  if (r === 'teacher' && (text === B_MYTASK || cmd === '/vazifalarim')) return myTasks(chatId);
  if (r === 'teacher' && (text === B_MYDEBT || cmd === '/qarzim')) return myDebtors(chatId);

  const s = await getSession(chatId);
  if (isTop && await catalogStep(chatId, s, text, m.from)) return;
  if (isTop && s.step === 'pub_add') {
    const u = text.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(u)) return void send(chatId, 'Telegram username yozing, masalan: <b>@zomaxcom</b>');
    const L = await supplierList();
    await setSession(chatId, null);
    if (L.some(x => supKey(x) === supKey(u))) { await send(chatId, `ℹ️ @${esc(u)} allaqachon ro‘yxatda.`, { reply_markup: menu() }); return pubsView(chatId); }
    await admin.from('crm_settings').upsert({ key: 'bookSuppliers', value: [...L, u] });
    await send(chatId, `✅ <b>@${esc(u)}</b> nashriyot sifatida qo‘shildi.\nU botga /start bossa — profili ochiladi va kitoblarini o‘zi qo‘shadi.`, { reply_markup: menu() });
    return pubsView(chatId);
  }
  switch (s.step) {
    case 'note':
      if (!isStaff) break;
      return saveStudentNote(chatId, s, text);
    case 'task_note':
      return taskItemSave(chatId, s, text, m.from);
    case 'ph_name': {
      if (!isTop) break;
      if (text.length < 2) return void send(chatId, 'Ism va lavozimni yozing.');
      const [name, ...rest] = text.split(/\s+[—–-]\s+/);
      await setSession(chatId, 'ph_phone', { name: name.trim().slice(0, 60), role: rest.join(' — ').trim().slice(0, 60) });
      return void send(chatId, '📱 Telefon raqami (masalan: +998 90 123 45 67) yoki kontaktni ulashing:', { reply_markup: CANCEL_KB });
    }
    case 'ph_phone': {
      if (!isTop) break;
      const ph = normPhone(m.contact?.phone_number || text);
      if (!ph) return void send(chatId, 'Raqamni to‘g‘ri yozing: +998 90 123 45 67');
      const list = await contacts();
      list.push({ name: s.data.name, role: s.data.role || '', phone: ph });
      await saveContacts(list);
      await setSession(chatId, null);
      await send(chatId, `✅ Qo‘shildi: ${esc(s.data.name)} · ${esc(fmtPhone(ph))}`, { reply_markup: menu() });
      return phonesView(chatId);
    }
    case 'bk_book':
      if (r !== 'teacher' && !isTop) break;
      if (text.length < 2) return void send(chatId, 'Kitob nomini yozing.');
      await send(chatId, '✅', { reply_markup: menu() });
      { const { books: _b, cat: _c, unitPrice: _u, supplier: _sp, pubs: _ps, pub: _p, ...rest } = s.data; return bookAskNote(chatId, { ...rest, book: text.replace(/\s+/g, ' ').slice(0, 120) }); }
    case 'bk_price': {
      if (!isTop) break;
      const price = parseAmount(text);
      if (!price || price < 1000) return void send(chatId, 'Bitta kitob narxini so‘mda yozing, masalan: 85000 yoki 85k');
      return bookPayoutConfirm(chatId, s.data.id, price);
    }
    case 'bk_note':
      if (r !== 'teacher' && !isTop) break;
      await send(chatId, '✅', { reply_markup: menu() });
      return bookConfirm(chatId, { ...s.data, note: text === B_SKIP ? '' : text.slice(0, 300) });
    case 'ai':
      if (m.photo || m.video || m.document) return aiMedia(chatId, m);
      if (!text) return;
      return aiAsk(chatId, text, m.from);
    case 'ue_edit':
      if (!isTop) break;
      return userEditSave(chatId, s, text);
    case 'pa_phone': {
      if (!isTop) break;
      const ph = normPhone(m.contact?.phone_number || text);
      if (!ph) return void send(chatId, 'Raqamni to‘g‘ri yozing: +998 90 123 45 67');
      const d = ph.slice(-9);
      return void send(chatId, `📱 +998${d} — qaysi rol?`, { reply_markup: { inline_keyboard: [
        [ib('👑 Top', `pa:set:${d}:top`), ib('🧭 Katta', `pa:set:${d}:senior`), ib('👔 Rahbar', `pa:set:${d}:director`)],
        [ib('🎧 Servis', `pa:set:${d}:service`), ib('👩‍🏫 O‘qituvchi', `pa:set:${d}:teacher`), ib('🎬 Media', `pa:set:${d}:media`)]] } });
    }
    case 'om_qty':
      if (!isTop) break;
      return stockApply(chatId, s, text);
    case 'om_title': {
      if (!isTop) break;
      const title = text.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (title.length < 2) return void send(chatId, 'Kitob nomini yozing.');
      let b: any = await stockOf(s.data.subject, title);
      if (!b) {
        const ins = await admin.from('crm_edu_book_stock').insert({ subject: s.data.subject, title, qty: 0, min_qty: 5 }).select('*').single();
        if (ins.error || !ins.data) return void send(chatId, `⚠️ ${esc(ins.error?.message || '')}`);
        b = ins.data;
      }
      await setSession(chatId, 'om_qty', { act: 'in', id: b.id, title: b.title });
      return void send(chatId, `🆕 <b>${esc(title)}</b> (${esc(s.data.subject)}) qo‘shildi.\n➕ Hozir omborda nechta bor? Sonini yozing:`, { reply_markup: CANCEL_KB });
    }
    case 'bk_lib': {
      if (!isTop) break;
      const add = text.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x.length >= 2).map(x => x.slice(0, 120));
      if (!add.length) return void send(chatId, 'Kitob nomini yozing.');
      const books = (await getSetting<Record<string, string[]>>('eduBooks', {})) || {};
      const subj = s.data.subject;
      await admin.from('crm_settings').upsert({ key: 'eduBooks', value: { ...books, [subj]: [...new Set([...(books[subj] || []), ...add])] } });
      await setSession(chatId, null);
      await send(chatId, `✅ ${esc(subj)}: ${add.length} ta kitob qo‘shildi.`, { reply_markup: menu() });
      return bookLibrary(chatId, 'bkl:v');
    }
    case 'acc_phone': {
      const ph = normPhone(text);
      if (!ph) return void send(chatId, 'Raqamni to‘g‘ri yozing: +998 90 123 45 67');
      await setSession(chatId, 'acc_pass', { phone: ph });
      return void send(chatId, '🔒 Edutizim parolingizni yozing (xabar darhol o‘chiriladi):', { reply_markup: CANCEL_KB });
    }
    case 'acc_pass':
      if (text.length < 4) return void send(chatId, 'Parolni to‘liq yozing.');
      return accountSave(chatId, s, text, m.message_id);
    case 'sms_text':
      if (!isTop) break;
      if (text.length < 5) return void send(chatId, 'Matnni to‘liqroq yozing.');
      await setSession(chatId, 'sms', s.data);
      await send(chatId, '✅', { reply_markup: menu() });
      return smsPreview(chatId, text.slice(0, 800));
    case 'find':
      if (!isStaff) break;
      return findAnswer(chatId, text);
    case 'lead_name':
      if (!isStaff) break;
      if (text.length < 3) return void send(chatId, 'Familiya va ismni to‘liq yozing.');
      await setSession(chatId, 'lead_phone', { name: text.replace(/\s+/g, ' ').slice(0, 80) });
      return void send(chatId, '📱 Telefon raqami (masalan: +998 90 123 45 67):', { reply_markup: CANCEL_KB });
    case 'lead_phone': {
      if (!isStaff) break;
      const ph = normPhone(m.contact?.phone_number || text);
      if (!ph) return void send(chatId, 'Raqamni to‘g‘ri yozing: +998 90 123 45 67');
      return leadCheckPhone(chatId, { ...s.data, phone: ph });
    }
    case 'ord_q': {
      if (!isStaff) break;
      if (text.length < 3) return void send(chatId, 'Kamida 3 harf yoki telefon raqamini yozing.');
      const list = await eduFind(text);
      if (!list.length) return void send(chatId, '😕 Edutizimda topilmadi. Boshqacha yozib ko‘ring yoki “➕ Lid qo‘shish”dan foydalaning.');
      await setSession(chatId, 'ord_q', { found: list });
      return void send(chatId, list.map(line).join('\n\n'), { reply_markup: { inline_keyboard: list.map((x, i) => [ib(`${i + 1}. ${x.name.slice(0, 34)}`, `oq:${i}`)]) } });
    }
    case 'k_student': {
      if (!isTop) break;
      if (text.length < 3) return void send(chatId, 'Kamida 3 harf yoki telefon raqamini yozing.');
      const list = await eduFind(text);
      if (!list.length) return void send(chatId, '😕 Topilmadi. Boshqacha yozib ko‘ring.');
      await setSession(chatId, 'k_student', { ...s.data, found: list });
      return void send(chatId, list.map(line).join('\n\n'), { reply_markup: { inline_keyboard: list.map((x, i) => [ib(`${i + 1}. ${x.name.slice(0, 34)}`, `ks:${i}`)]) } });
    }
    case 'k_amount': {
      if (!isTop) break;
      const amount = parseAmount(text);
      const t = s.data.type || {};
      if (!amount || amount < 100) return void send(chatId, 'Summani raqamda yozing, masalan: 350000 yoki 350k');
      if (t.min && amount < t.min) return void send(chatId, `“${esc(t.name)}” uchun eng kam summa: ${sum(t.min)}`);
      if (t.max && amount > t.max) return void send(chatId, `“${esc(t.name)}” uchun eng ko‘p summa: ${sum(t.max)}`);
      return askMethod(chatId, { ...s.data, amount });
    }
    case 'k_comment':
      if (!isTop) break;
      return confirm(chatId, { ...s.data, comment: text === B_SKIP ? '' : text.slice(0, 200) });
  }
  return void send(chatId, 'Pastdagi tugmalardan tanlang 👇', { reply_markup: menu() });
}

async function onCallback(q: any) {
  const chatId = (q.message?.chat?.id ?? q.from?.id) as number;
  const data = String(q.data || '');
  tg(await token(), 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (!cbAllowed(data, role())) return void send(chatId, '⛔ Ruxsat yo‘q.', { reply_markup: menu() });
  if (data === 'brq') return blockedRequest(chatId, q.from);
  const s = await getSession(chatId);
  if (data === 'x') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: menu() }); }
  // Bosh sahifa tugmalari → xuddi menyu tugmasi bosilgandek
  if (data.startsWith('go:') && GO[data.slice(3)]) {
    await setSession(chatId, null);
    return onMessage({ chat: { id: chatId, type: 'private' }, from: q.from, text: GO[data.slice(3)] });
  }
  if (data === 'home') return startMsg(chatId, { from: q.from });
  // Qo'ng'iroqchalar va narx
  if (data === 'bls') return bellsView(chatId);
  if (data.startsWith('bl:') && s.step === 'bells') return bellDetail(chatId, Number(data.slice(3)));
  if (data.startsWith('bd:') && s.step === 'bells') return bellAction(chatId, Number(data.slice(3)), false, q.from);
  if (data.startsWith('bo:') && s.step === 'bells') return bellAction(chatId, Number(data.slice(3)), true, q.from);
  if (data === 'bda' && s.step === 'bells') return void send(chatId, `🧹 ${s.data.list?.length || 0} ta qo‘ng‘iroqchani tozalaymizmi?`, { reply_markup: { inline_keyboard: [[ib('✅ Ha', 'bdy'), ib('❌ Yo‘q', 'x')]] } });
  if (data === 'bdy' && s.step === 'bells') return bellsClearAll(chatId, q.from);
  if (data === 'prl') return priceView(chatId);
  if (data === 'prf') return priceView(chatId, true);
  if (data.startsWith('pgr:')) return priceGroupView(chatId, Number(data.slice(4)));
  if (data.startsWith('pfx:')) { const [, gi, si] = data.split(':'); return priceConfirm(chatId, Number(gi), Number(si), 'norm'); }
  if (data.startsWith('pga:')) return priceConfirm(chatId, Number(data.slice(4)), 'all', 'norm');
  if (data.startsWith('pgc:')) return priceConfirm(chatId, Number(data.slice(4)), 'all', 'course');
  if (data === 'pok') return priceApply(chatId, q.from);
  // SMS
  if (data === 'sms') return smsStart(chatId);
  if (data.startsWith('sm1:') && s.step === 'find') { const st = s.data.found?.[Number(data.slice(4))]; if (st) return smsStart(chatId, [{ id: st.id, name: st.name, balance: st.balance }]); }
  if (data.startsWith('sma:') && s.step === 'sms') return smsPickAudience(chatId, data.slice(4));
  if (data.startsWith('smt:') && s.step === 'sms' && s.data.list) { await setSession(chatId, 'sms', { ...s.data, to: data.slice(4) }); return smsAskText(chatId); }
  if (data.startsWith('smx:') && s.step === 'sms' && s.data.to) {
    const k = data.slice(4);
    if (k === 'own') { await setSession(chatId, 'sms_text', s.data); return void send(chatId, '✍️ SMS matnini yozing ({ism} va {qarz} ishlatish mumkin):', { reply_markup: CANCEL_KB }); }
    return smsPreview(chatId, k === 'def' ? DEFAULT_SMS : (s.data.tpls?.[Number(k)]?.content || DEFAULT_SMS));
  }
  if (data.startsWith('smi:') && (s.step === 'sms' || s.step === 'sms_confirm')) {
    await setSession(chatId, 'sms', { ...s.data, integrationId: s.data.integrations?.[Number(data.slice(4))]?.id });
    return smsPreview(chatId, s.data.text);
  }
  if (data === 'smok') return smsSend(chatId, q.from);
  // Rollar
  if (data.startsWith('ua:')) { const [, id, r] = data.split(':'); if (!['top', 'senior', 'director', 'service', 'teacher', 'media', 'blocked'].includes(r)) return; return setRole(chatId, Number(id), r as Role, q.from); }
  if (data.startsWith('ur:')) {
    const id = data.slice(3);
    return void send(chatId, 'Yangi rol:', { reply_markup: { inline_keyboard: [[ib('👑 Top', `ua:${id}:top`), ib('🧭 Katta', `ua:${id}:senior`), ib('🎧 Servis', `ua:${id}:service`), ib('👩‍🏫 O‘qituvchi', `ua:${id}:teacher`)], [ib('👔 Rahbar', `ua:${id}:director`), ib('🎬 Media', `ua:${id}:media`), ib('⛔ Bloklash', `ua:${id}:blocked`)], [ib('✏️ Ism / raqamni tahrirlash', `ue:${id}`)]] } });
  }
  if (data === 'adm:users') return usersPanel(chatId);
  if (data === 'ub:list') return blockedPanel(chatId);
  if (data === 'vch:r') return voucherView(chatId, true);
  if (/^ue:[np]:\d+$/.test(data)) { const [, f, id] = data.split(':'); await setSession(chatId, 'ue_edit', { tgId: Number(id), field: f }); return void send(chatId, f === 'p' ? '📱 Yangi raqamni yozing (+998 90 123 45 67):' : '👤 Yangi ism-familiyani yozing:', { reply_markup: CANCEL_KB }); }
  if (/^ue:\d+$/.test(data)) return userEditMenu(chatId, Number(data.slice(3)));
  if (data === 'adm:report') return report(chatId);
  if (data === 'adm:sync') return sync(chatId);
  // Davomat / xavf
  if (data.startsWith('att:')) return attendanceView(chatId, data.slice(4) as any);
  if (data.startsWith('ac:') && s.step === 'att') { const st = s.data.list?.[Number(data.slice(3))]; if (st) return askStudentNote(chatId, st, 'att'); }
  if (data.startsWith('ch:') && s.step === 'find') { const st = s.data.found?.[Number(data.slice(3))]; if (st) return commentHistory(chatId, st); }
  if (data.startsWith('fn:') && s.step === 'find') { const st = s.data.found?.[Number(data.slice(3))]; if (st) return askStudentNote(chatId, st, 'find'); }
  if (data === 'fnw' && s.step === 'hist' && s.data.st) return askStudentNote(chatId, s.data.st, 'hist');
  if (data.startsWith('rc:') && s.step === 'risk') { const st = s.data.list?.[Number(data.slice(3))]; if (st) return askStudentNote(chatId, st, 'risk'); }
  // O'qituvchilar
  if (data.startsWith('trp:')) return teachersView(chatId, data.slice(4) as any);
  if (data.startsWith('txl:')) return teacherExcel(chatId, data.slice(4) as any);
  if (data === 'tnew') return newTaskPickTeacher(chatId);
  if (data.startsWith('tt:') && s.step === 'tnew') {
    const teacher = s.data.teachers?.[Number(data.slice(3))];
    if (!teacher) return;
    await setSession(chatId, 'tnew', { ...s.data, teacher });
    return void send(chatId, `👩‍🏫 ${esc(teacher.name)}\n\nQaysi davrdagi arxiv o‘quvchilar?`, { reply_markup: { inline_keyboard: [[ib('Bu oy', 'tp:m'), ib('O‘tgan oy', 'tp:pm')]] } });
  }
  if (data.startsWith('tp:') && s.step === 'tnew' && s.data.teacher) {
    await setSession(chatId, 'tnew', { ...s.data, period: data.slice(3) });
    return void send(chatId, '⏰ Muddat (deadline):', { reply_markup: { inline_keyboard: [[ib('1 kun', 'td:1'), ib('2 kun', 'td:2'), ib('3 kun', 'td:3'), ib('1 hafta', 'td:7')]] } });
  }
  if (data.startsWith('td:') && s.step === 'tnew' && s.data.period) return createTask(chatId, s, Number(data.slice(3)), q.from);
  if (data.startsWith('tk:')) return openTask(chatId, Number(data.slice(3)));
  if (data.startsWith('ti:')) { const [, id, idx] = data.split(':'); return taskItemAsk(chatId, Number(id), Number(idx)); }
  if (data.startsWith('tc:')) {
    await admin.from('crm_edu_tasks').update({ status: 'cancelled' }).eq('id', Number(data.slice(3)));
    return void send(chatId, '⛔ Vazifa bekor qilindi.', { reply_markup: menu() });
  }
  if (data.startsWith('my:')) return myStats(chatId, data.slice(3) as any);
  if (data === 'acc') return accountView(chatId);
  if (data === 'acl') return accountAskPhone(chatId);
  if (data === 'acu') { await edu('unlinkAccount', { phone: me()?.phone || '' }); return void send(chatId, '❌ Edutizim akkaunti uzildi.', { reply_markup: menu() }); }
  if (data.startsWith('nst:')) return newStudentsView(chatId, data.slice(4) as any);
  if (data.startsWith('mgv:')) return managersView(chatId, data.slice(4) as any);
  if (data.startsWith('mys:')) return managerMyStats(chatId, data.slice(4) as any);
  // Statistika, xarajatlar, qarzdorlar
  if (data === 'dbt:active' || data === 'dbt:all') return debtors(chatId, data === 'dbt:all' ? 'all' : 'active');
  if (data === 'dbt:t') return debtTeachers(chatId);
  if (data.startsWith('dbt:t:')) return debtTeacher(chatId, data.slice(6));
  if (data === 'st:sync') { await sync(chatId); return stats(chatId); }
  if (data.startsWith('ex:')) return expenses(chatId, data.slice(3) as Period);
  if (data.startsWith('ink:')) return inkassa(chatId, data.slice(4));
  if (data === 'sch:r') return scheduleSend(chatId, true);
  if (data.startsWith('ph:')) return phonesCallback(chatId, data);
  if (data.startsWith('sup:d:')) return supplierReady(chatId, Number(data.slice(6)));
  if (data.startsWith('pub:')) return pubCallback(chatId, data, s);
  if (data.startsWith('sup:')) return catalogCallback(chatId, data, s, q.from);
  if (data.startsWith('bkt:')) return bookTeacherCallback(chatId, data, s, q.from);
  if (data.startsWith('bko:')) return bookOrderAction(chatId, data, q.from);
  if (data.startsWith('bkl:')) return bookLibrary(chatId, data);
  if (data.startsWith('om:')) return stockCallback(chatId, data);
  if (data.startsWith('pa:')) return preApproveCallback(chatId, data);
  if (data === 'rp:hub') return reportsHub(chatId);
  if (data.startsWith('rp:')) { await typing(chatId); return void send(chatId, await summaryReport(data.slice(3) as any), { reply_markup: { inline_keyboard: [[ib('📑 Boshqa hisobotlar', 'rp:hub')]] } }); }
  if (data === 'ai:new') {
    await admin.from('crm_ai_chats').update({ history: [] }).eq('tg_id', q.from.id);
    await admin.from('crm_ai_media').delete().eq('tg_id', q.from.id);
    await setSession(chatId, 'ai', {});
    return void send(chatId, '🧹 Yangi suhbat boshlandi. Savolingizni yozing yoki rasm/video yuboring.', { reply_markup: CANCEL_KB });
  }
  if (data === 'sch:a') return scheduleSend(chatId, false, true);
  if (data.startsWith('exc:')) return expenseCategory(chatId, Number(data.slice(4)));
  if (data.startsWith('pay:')) {
    const st = (s.data.found || [])[Number(data.slice(4))];
    if (!st) return void send(chatId, 'Qaytadan qidiring.', { reply_markup: menu() });
    return kassaStart(chatId, 'in', st);
  }
  // Lid
  if (data.startsWith('lc:') && s.step === 'lead_course') {
    const c = data === 'lc:-' ? null : (s.data.courses || [])[Number(data.slice(3))];
    const { courses: _c, ...rest } = s.data;
    return leadAskManager(chatId, { ...rest, courseId: c?.id || null, courseName: c?.name || '' });
  }
  if (data === 'lf' && s.step === 'lead_dup') { const { found: _f, ...rest } = s.data; return leadCourse(chatId, { ...rest, kind: 'lead' }); }
  if (data.startsWith('lo:') && s.step === 'lead_dup') return leadPickStudent(chatId, s.data, (s.data.found || [])[Number(data.slice(3))]);
  if (data.startsWith('oq:') && s.step === 'ord_q') return leadPickStudent(chatId, s.data, (s.data.found || [])[Number(data.slice(3))]);
  if (data.startsWith('lm:') && s.step === 'lead_mgr') { const { mgrs, ...rest } = s.data; return leadSubmit(chatId, rest, (mgrs || [])[Number(data.slice(3))], q.from); }
  if (data.startsWith('lq:')) return leadDecide(chatId, data, q.from);
  // Kassa
  if (data.startsWith('kt:') && s.step === 'k_type') {
    const t = (s.data.types || [])[Number(data.slice(3))];
    if (!t) return;
    if (t.subtype === 'student' && !s.data.student) {
      await setSession(chatId, 'k_student', { ...s.data, type: t });
      return void send(chatId, `${esc(t.name)}\n\n👤 O‘quvchining ismi yoki telefon raqamini yozing:`, { reply_markup: CANCEL_KB });
    }
    await setSession(chatId, 'k_amount', { ...s.data, type: t });
    return void send(chatId, `${s.data.kind === 'in' ? '💰' : '💸'} <b>${esc(t.name)}</b>\n\n💵 Summani yozing (masalan: <code>150000</code> yoki <code>150k</code>):`, { reply_markup: CANCEL_KB });
  }
  if (data.startsWith('ks:') && s.step === 'k_student') {
    const st = (s.data.found || [])[Number(data.slice(3))];
    if (!st) return;
    const { found: _f, ...rest } = s.data;
    await setSession(chatId, 'k_amount', { ...rest, student: st });
    return void send(chatId, `${line(st)}\n\n💵 Summani yozing:`, { reply_markup: CANCEL_KB });
  }
  if (data.startsWith('km:') && s.step === 'k_method') {
    const method = (s.data.methods || [])[Number(data.slice(3))];
    if (!method) return;
    const d: any = { ...s.data, method };
    if ((d.cashboxes || []).length > 1) {
      await setSession(chatId, 'k_cashbox', d);
      return void send(chatId, '🏦 Qaysi kassa?', { reply_markup: { inline_keyboard: d.cashboxes.map((c: any, i: number) => [ib(`🏦 ${String(c.name).slice(0, 34)}${c.main ? ' ⭐' : ''}`, `kb:${i}`)]) } });
    }
    return askComment(chatId, { ...d, cashbox: d.cashboxes[0] });
  }
  if (data.startsWith('kb:') && s.step === 'k_cashbox') {
    const cashbox = (s.data.cashboxes || [])[Number(data.slice(3))];
    if (!cashbox) return;
    return askComment(chatId, { ...s.data, cashbox });
  }
  if (data === 'ok') {
    if (s.step !== 'k_confirm') return void send(chatId, s.step === 'k_busy' ? '⏳ Yozilmoqda…' : 'Amal eskirgan. Qaytadan boshlang.', { reply_markup: menu() });
    return execute(chatId, s.data, q.from);
  }
  if (data.startsWith('kx:')) {
    const by = q.from?.username ? '@' + q.from.username : (q.from?.first_name || '');
    const r = await edu('kassaCancel', { asTg: chatId, transactionId: data.slice(3), by });
    if (r.ok && q.message?.message_id) await tg(await token(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await send(chatId, r.ok ? '↩️ Kassa amali bekor qilindi (Edutizim’da “bekor qilingan” bo‘lib turadi).' : `⚠️ Bekor qilib bo‘lmadi: ${esc(r.error)}`, { reply_markup: menu() });
    if (r.ok) await notifyOthers(`↩️ Kassa amali bekor qilindi · ${esc(by)}`, q.from?.id);
    if (r.ok) await admin.from('crm_edu_book_orders').update({ out_tx: null, out_amount: null, out_at: null, out_by: null }).eq('out_tx', data.slice(3));
    return;
  }
  return void send(chatId, 'Amal eskirgan. Pastdagi tugmalardan qaytadan boshlang.', { reply_markup: menu() });
}

async function handle(update: any) {
  const from = update.message?.from || update.callback_query?.from;
  const { role: r, user } = await resolveUser(from);
  const supName = ['top', 'senior', 'service', 'teacher', 'media', 'director'].includes(r) ? null : await isSupplier(from);
  if (supName) {
    return als.run({ role: 'none', user: null, menu: MENU_SUPPLIER, from, book: false } as any, () => supplierUpdate(update, supName).catch(e => console.error('supplier', e)));
  }
  const book = r === 'teacher' && (await bookGroups(user?.employee_id).catch(() => [])).length > 0;
  await als.run({ role: r, user, menu: user?.director ? MENU_DIRECTOR : book ? MENU_TEACHER_BOOK : menuFor(r), from, book }, async () => {
    try {
      if (update.message) await onMessage(update.message);
      else if (update.callback_query) await onCallback(update.callback_query);
    } catch (e) {
      console.error('edu-bot error', e);
      const chatId = update.message?.chat?.id || update.callback_query?.from?.id;
      if (chatId) await send(chatId, '⚠️ Texnik xatolik. Qaytadan urinib ko‘ring.', { reply_markup: menu() }).catch(() => {});
    }
  });
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok');
  const t = await token();
  if (!t) return new Response('edu bot token not set', { status: 503 });
  // Ichki: bot-jobs'dan avtomatik hisobotlar (x-cron-secret)
  const cronHdr = req.headers.get('x-cron-secret');
  if (cronHdr) {
    if (cronHdr !== await getSecret('cron_secret')) return new Response('forbidden', { status: 403 });
    const b = await req.json().catch(() => ({}));
    if (b.action === 'autoReport' && (b.kind === 'week' || b.kind === 'month')) return new Response(JSON.stringify({ ok: true, ...(await sendAutoReport(b.kind)) }), { headers: { 'Content-Type': 'application/json' } });
    if (b.action === 'smsReport' && ['day', 'inkassa'].includes(b.kind)) return new Response(JSON.stringify({ ok: true, ...(await smsReport(b.kind)) }), { headers: { 'Content-Type': 'application/json' } });
    // 🎟 Vaucher hisobotini top menejerga (yoki ko'rsatilgan chatga) post qilish
    if (b.action === 'voucherPost') {
      const to = Number(b.chatId) || Number((await adminIds())[0]);
      if (!to) return new Response('{"ok":false}', { status: 400 });
      await als.run({ role: 'top', user: null, menu: MENU, from: { id: to }, book: false } as any, () => voucherView(to, true));
      return new Response(JSON.stringify({ ok: true, to, chars: vouchCache?.text.length || 0, preview: vouchCache?.text }), { headers: { 'Content-Type': 'application/json' } });
    }
    // Top menejer so'rovi bo'yicha rol berish (botdagi "✏️ Rolni o'zgartirish" bilan bir xil: menyu + xodimga xabar)
    if (b.action === 'grantRole' && Number(b.tgId) && ['top', 'senior', 'director', 'service', 'teacher', 'media'].includes(b.role)) {
      const patch: Record<string, unknown> = {};
      if (b.phone) patch.phone = normPhone(String(b.phone)) || undefined;
      if (b.employeeId) patch.employee_id = String(b.employeeId);
      if (Object.keys(patch).length) await admin.from('crm_edu_bot_users').update(patch).eq('tg_id', Number(b.tgId));
      const owner = Number((await adminIds())[0]) || Number(b.tgId);
      await setRole(owner, Number(b.tgId), b.role as Role, null);
      const { data: u } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,role,phone,employee_id').eq('tg_id', Number(b.tgId)).maybeSingle();
      return new Response(JSON.stringify({ ok: !!u && u.role === b.role, user: u }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{"ok":false}', { status: 400 });
  }
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(t)) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => ({}));
  console.log('edu upd', update.message ? `msg ${update.message.chat?.id} ${String(update.message.text || '').slice(0, 30)}` : update.callback_query ? `cb ${update.callback_query.from?.id} ${update.callback_query.data}` : '');
  // Og'ir hisobotlar Telegram kutish vaqtidan oshmasligi uchun fonda
  const job = handle(update);
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) { EdgeRuntime.waitUntil(job); return new Response('ok'); }
  await job;
  return new Response('ok');
});
