// =========================================================
// REGISTAN · EDUTIZIM boti (alohida, faqat xodimlar uchun)
//  ➕ Lid · 🔍 O'quvchi · 🔴 Qarzdorlar · 💰 Kirim · 💸 Chiqim · 📊 Hisobot · 🔄 Sinxron
// Kirish: CRM → 🤖 Telegram Bot → "Bot adminlari" (Telegram ID) yoki admin chat ID.
// Edutizim bilan ishlash edutizim-sync funksiyasi orqali (x-cron-secret, ichki chaqiruv).
// =========================================================
import { admin, getSecret, getSetting, SUPABASE_URL, tg, webhookSecret } from '../_shared/common.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as XLSX from 'npm:xlsx@0.18.5';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const B_LEAD = '➕ Lid qo‘shish';
const B_FIND = '🔍 O‘quvchi';
const B_DEBT = '🔴 Qarzdorlar';
const B_IN = '💰 Kirim';
const B_OUT = '💸 Chiqim';
const B_REPORT = '📊 Hisobot';
const B_SYNC = '🔄 Sinxron';
const B_STATS = '📈 Statistika';
const B_EXP = '🧾 Xarajatlar';
const B_ATT = '📅 Davomat';
const B_RISK = '⚠️ Xavf ostida';
const B_TEACH = '👩‍🏫 O‘qituvchilar';
const B_TASKS = '📋 Vazifalar';
const B_ADMIN = '⚙️ Boshqaruv';
const B_MY = '📊 Mening natijam';
const B_MYTASK = '📋 Vazifalarim';
const B_CANCEL = '❌ Bekor qilish';
const B_SKIP = '⏭ O‘tkazib yuborish';

const kb = (rows: string[][]) => ({ keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true });
const persist = (rows: string[][], ph = 'Bo‘limni tanlang…') => ({ ...kb(rows), is_persistent: true, input_field_placeholder: ph });
const MENU = persist([[B_IN, B_OUT], [B_ATT, B_RISK], [B_STATS, B_EXP], [B_DEBT, B_FIND], [B_TEACH, B_TASKS], [B_LEAD, B_ADMIN]]);
const MENU_SERVICE = persist([[B_ATT, B_RISK], [B_FIND, B_DEBT], [B_LEAD]]);
const MENU_TEACHER = persist([[B_MY, B_MYTASK]]);
type Role = 'top' | 'service' | 'teacher' | 'pending' | 'blocked' | 'none';
type Ctx = { role: Role; user: any; menu: any; from: any };
const als = new AsyncLocalStorage<Ctx>();
const menu = () => als.getStore()?.menu ?? MENU;
const role = (): Role => als.getStore()?.role ?? 'none';
const me = () => als.getStore()?.user;
const menuFor = (r: Role) => (r === 'top' ? MENU : r === 'service' ? MENU_SERVICE : r === 'teacher' ? MENU_TEACHER : { remove_keyboard: true });
const ROLE_NAME: Record<string, string> = { top: '👑 Top menejer', service: '🎧 Servis menejer', teacher: '👩‍🏫 O‘qituvchi', pending: '⏳ Kutilmoqda', blocked: '⛔ Bloklangan' };
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
  const r = await fetch(`${SUPABASE_URL}/functions/v1/edutizim-sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action, ...body })
  });
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
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
  return (data || []).map(toStudent);
}
const line = (s: any, i?: number) =>
  `${i !== undefined ? `<b>${i + 1}.</b> ` : ''}👤 <b>${esc(s.name)}</b>${s.phone ? ` · ${esc(s.phone)}` : ''}\n` +
  `   💳 Balans: <b>${s.balance < 0 ? '🔴 ' : ''}${sum(s.balance)}</b>${s.groups ? `\n   👥 ${esc(String(s.groups).slice(0, 80))}` : ''}${s.status ? ` · ${esc(s.status)}` : ''}`;

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
  await send(chatId, `🔍 Topildi (${list.length}):\n\n${list.map(line).join('\n\n')}\n\nYana qidirish uchun ism yoki raqam yozing.`, {
    reply_markup: { inline_keyboard: list.map((s, i) => [ib(`💰 ${i + 1}. ${s.name.slice(0, 28)} — to‘lov qabul qilish`, `pay:${i}`)]) }
  });
}

async function debtors(chatId: number, scope: 'active' | 'all' = 'active') {
  await typing(chatId);
  const list = (await allBalances()).filter(s => s.balance < 0 && (scope === 'all' || s.active)).sort((a, b) => a.balance - b.balance);
  if (!list.length) return void send(chatId, '✅ Qarzdorlar yo‘q.', { reply_markup: menu() });
  const top = list.slice(0, 20);
  await setSession(chatId, 'find', { found: top });
  const total = list.reduce((a, b) => a + b.balance, 0);
  const rows = top.slice(0, 10).map((s, i) => [ib(`💰 ${i + 1}. ${s.name.slice(0, 30)} — to‘lov`, `pay:${i}`)]);
  rows.push([scope === 'active' ? ib('📋 Barcha qarzdorlar (ketganlar bilan)', 'dbt:all') : ib('✅ Faqat aktiv qarzdorlar', 'dbt:active')]);
  await send(chatId, `🔴 <b>${scope === 'active' ? 'Aktiv o‘quvchilar qarzi' : 'Barcha qarzdorlar'}: ${list.length}</b> · jami <b>${sum(-total)}</b>\nEng katta 20 tasi:\n\n${top.map((s, i) => `<b>${i + 1}.</b> ${esc(s.name)} — <b>${sum(-s.balance)}</b>${s.active ? '' : ' · <i>guruhda emas</i>'}${s.phone ? ` · ${esc(s.phone)}` : ''}`).join('\n')}`, {
    reply_markup: { inline_keyboard: rows }
  });
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
    { reply_markup: { inline_keyboard: [[ib('🔴 Aktiv qarzdorlar ro‘yxati', 'dbt:active')], [ib('📋 Barcha qarzdorlar', 'dbt:all'), ib('🔄 Yangilash', 'st:sync')]] } });
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
      txFor('payOut', r.prev.from, r.prev.to, meta.cashboxes || []),
      txFor('payIn', r.from, r.to, meta.cashboxes || [])
    ]);
  } catch (e) { return void send(chatId, `⚠️ Kassa tarixini olib bo‘lmadi: ${esc((e as Error).message)}`, { reply_markup: menu() }); }
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
    `💰 Kirim: ${mln(incTotal)} · 📊 Sof (kirim − chiqim): <b>${mln(incTotal - total)}</b>\n\n` +
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
// ➕ Lid
// ---------------------------------------------------------
async function leadCourse(chatId: number, d: any) {
  await typing(chatId);
  const meta = await edu('meta');
  if (!meta.ok) { await setSession(chatId, null); return void send(chatId, `⚠️ Edutizim: ${esc(meta.error)}`, { reply_markup: menu() }); }
  const courses = (meta.courses || []).slice(0, 40).map((c: any) => ({ id: c.id, name: c.name }));
  await setSession(chatId, 'lead_course', { ...d, courses, defCourse: meta.defaults?.courseId || null });
  const btns = courses.map((c: any, i: number) => ib(String(c.name).slice(0, 30), `lc:${i}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([ib('⏭ Kurssiz (standart)', 'lc:-')]);
  await send(chatId, '✅', { reply_markup: menu() });
  await send(chatId, `👤 ${esc(d.name)} · 📱 ${esc(d.phone)}\n\n📚 Qaysi kursga qiziqadi?`, { reply_markup: { inline_keyboard: rows } });
}

async function leadPush(chatId: number, d: any, force: boolean, from: any) {
  await typing(chatId);
  const r = await edu('pushLead', { students: [{ fullName: d.name, phone: d.phone }], courseId: d.courseId || undefined, force });
  const res = r.results?.[0];
  if (!r.ok || !res) { await setSession(chatId, null); return void send(chatId, `⚠️ ${esc(r.error || 'Xatolik')}`, { reply_markup: menu() }); }
  if (res.skipped === 'exists' && !force) {
    await setSession(chatId, 'lead_dup', d);
    return void send(chatId, `ℹ️ ${esc(res.message)}\n\nBaribir yangi lid qo‘shilsinmi?`, { reply_markup: { inline_keyboard: [[ib('➕ Ha, qo‘shish', 'lf'), ib('❌ Yo‘q', 'x')]] } });
  }
  await setSession(chatId, null);
  await send(chatId, res.ok
    ? `✅ Edutizim’ga lid qo‘shildi!\n\n👤 ${esc(d.name)}\n📱 ${esc(d.phone)}${d.courseName ? `\n📚 ${esc(d.courseName)}` : ''}`
    : `⚠️ Lid qo‘shilmadi: ${esc(res.message)}`, { reply_markup: menu() });
  if (res.ok) await notifyOthers(`➕ Lid: <b>${esc(d.name)}</b> · ${esc(d.phone)}${d.courseName ? ' · ' + esc(d.courseName) : ''} · ${esc(from?.first_name || '')}`, from?.id);
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
  const r = await edu('kassaPay', {
    kind: d.kind, cashboxId: d.cashbox?.id, paymentTransactionId: d.type?.id, paymentMethodId: d.method?.id,
    amount: d.amount, studentId: d.student?.id || undefined, comment: `[Bot ${by}] ${d.comment || d.type?.name || ''}`.trim(), by
  });
  await setSession(chatId, null);
  if (!r.ok) return void send(chatId, `⚠️ Kassaga yozilmadi: ${esc(r.error)}\n\n${summary(d)}`, { reply_markup: menu() });
  const rows: any[] = [];
  if (r.id) rows.push([ib('↩️ Bu amalni bekor qilish', `kx:${r.id}`)]);
  await send(chatId, `✅ <b>Kassaga yozildi</b>\n\n${summary(d)}`, rows.length ? { reply_markup: { inline_keyboard: rows } } : { reply_markup: menu() });
  await notifyOthers(`${d.kind === 'in' ? '💰 Kirim' : '💸 Chiqim'}: ${esc(d.type?.name)} · <b>${sum(d.amount)}</b>${d.student ? ' · ' + esc(d.student.name) : ''}${d.comment ? ' · ' + esc(d.comment) : ''} · ${esc(by)}`, from?.id);
}

// ---------------------------------------------------------
// Router
// ---------------------------------------------------------
// =========================================================
// 👥 Foydalanuvchilar va rollar
// =========================================================
async function resolveUser(from: any): Promise<{ role: Role; user: any }> {
  if (!from?.id) return { role: 'none', user: null };
  if ((await adminIds()).includes(String(from.id))) return { role: 'top', user: { tg_id: from.id, full_name: from.first_name || 'Owner', owner: true } };
  const { data } = await admin.from('crm_edu_bot_users').select('*').eq('tg_id', from.id).maybeSingle();
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
  await send(chatId, `👋 Assalomu alaykum${first ? ', <b>' + esc(first) + '</b>' : ''}!\n\n💼 <b>Registan Globus · Moliya</b> — xodimlar boti.\nKirish uchun pastdagi tugma orqali <b>telefon raqamingizni</b> yuboring. Top menejer tasdiqlagach bot ochiladi.`, {
    reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
  });
}

async function register(chatId: number, m: any) {
  const c = m.contact;
  if (!c || c.user_id !== m.from?.id) return void send(chatId, '📱 Faqat o‘zingizning raqamingizni tugma orqali yuboring.');
  const digits = String(c.phone_number || '').replace(/\D/g, '').slice(-9);
  const emp = (await employeesList()).find((e: any) => e.digits === digits);
  const name = emp?.name || [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
  await admin.from('crm_edu_bot_users').upsert({ tg_id: m.from.id, role: 'pending', full_name: name, phone: '+998' + digits, employee_id: emp?.id || null, tg_username: m.from.username || null, updated_at: new Date().toISOString() });
  await send(chatId, `✅ So‘rovingiz yuborildi.\n👤 ${esc(name)} · +998${digits}${emp ? '\n🗂 Edutizim’da topildi' : ''}\n\nTop menejer rolingizni tasdiqlashi bilan xabar beramiz.`, { reply_markup: { remove_keyboard: true } });
  await notifyTops(`🆕 <b>Botga kirish so‘rovi</b>\n👤 ${esc(name)}${m.from.username ? ' · @' + esc(m.from.username) : ''}\n📱 +998${digits}\n🗂 Edutizim: ${emp ? 'xodim topildi ✅' : 'topilmadi ⚠️'}\n\nRolini tanlang:`, {
    reply_markup: { inline_keyboard: [[ib('👑 Top', `ua:${m.from.id}:top`), ib('🎧 Servis', `ua:${m.from.id}:service`), ib('👩‍🏫 O‘qituvchi', `ua:${m.from.id}:teacher`)], [ib('⛔ Rad etish', `ua:${m.from.id}:blocked`)]] }
  });
}

async function setRole(chatId: number, tgId: number, newRole: Role, by: any) {
  const { data: u } = await admin.from('crm_edu_bot_users').update({ role: newRole, approved_by: by?.id || null, updated_at: new Date().toISOString() }).eq('tg_id', tgId).select('*').maybeSingle();
  if (!u) return void send(chatId, 'Foydalanuvchi topilmadi.');
  await send(chatId, `✅ ${esc(u.full_name)} — ${ROLE_NAME[newRole]}${newRole === 'teacher' && !u.employee_id ? '\n⚠️ Edutizim’da o‘qituvchi topilmadi (telefon mos emas) — “Mening natijam” ishlamaydi.' : ''}`);
  if (newRole === 'blocked') return void send(tgId, '⛔ Botga kirish rad etildi.', { reply_markup: { remove_keyboard: true } });
  await send(tgId, `🎉 Tasdiqlandingiz: <b>${ROLE_NAME[newRole]}</b>\n\nPastdagi tugmalardan foydalaning 👇`, { reply_markup: menuFor(newRole) });
}

async function usersPanel(chatId: number) {
  const { data } = await admin.from('crm_edu_bot_users').select('tg_id,full_name,role,phone').order('role').order('full_name').limit(60);
  const list = data || [];
  await send(chatId, `👥 <b>Bot foydalanuvchilari</b> (${list.length})\n\n` + (list.map(u => `${ROLE_NAME[u.role] || u.role} — ${esc(u.full_name)} · ${esc(u.phone || '')}`).join('\n') || 'Hali yo‘q. Xodim botga /start yozib raqamini yuboradi.'), {
    reply_markup: { inline_keyboard: list.slice(0, 30).map(u => [ib(`✏️ ${String(u.full_name).slice(0, 30)}`, `ur:${u.tg_id}`)]) }
  });
}

async function adminPanel(chatId: number) {
  await send(chatId, '⚙️ <b>Boshqaruv</b>', { reply_markup: { inline_keyboard: [[ib('👥 Foydalanuvchilar va rollar', 'adm:users')], [ib('📊 Hisobot', 'adm:report'), ib('🔄 Sinxron', 'adm:sync')]] } });
}

// =========================================================
// 📅 Davomat: kelmaganlar + bugungi menejer izohlari
// =========================================================
const hm = (iso: string) => new Date(new Date(iso).getTime() + TZ).toISOString().slice(11, 16);
const firstName = (s: string) => String(s || '').split(' ')[0];
async function sendLong(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  const parts: string[] = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > 3800) { parts.push(cur); cur = line; } else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) parts.push(cur);
  for (let i = 0; i < parts.length; i++) await send(chatId, parts[i], i === parts.length - 1 ? extra : {});
}

async function attendanceView(chatId: number, day: 'today' | 'yesterday' = 'today') {
  await typing(chatId);
  const d0 = dayStart(Date.now()) - (day === 'yesterday' ? DAY : 0);
  const r = await edu('absences', { fromDate: new Date(d0).toISOString(), toDate: new Date(d0 + DAY - 1).toISOString() });
  if (!r.ok) return void send(chatId, `⚠️ Edutizim: ${esc(r.error)}`, { reply_markup: menu() });
  const seen = new Set<string>();
  const rows = (r.rows || []).filter((x: any) => { const k = `${x.studentId}|${x.groupId}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a: any, b: any) => (a.manager || '').localeCompare(b.manager || '') || a.name.localeCompare(b.name));
  const label = `${day === 'today' ? 'Bugun' : 'Kecha'} · ${dmy(d0)}`;
  const nav = [ib(day === 'today' ? '• Bugun' : 'Bugun', 'att:today'), ib(day === 'yesterday' ? '• Kecha' : 'Kecha', 'att:yesterday')];
  if (!rows.length) return void send(chatId, `📅 <b>Davomat · ${label}</b>\n\n✅ Kelmagan o‘quvchi yo‘q (yoki davomat hali belgilanmagan).`, { reply_markup: { inline_keyboard: [nav] } });
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
      (n ? `💬 <i>${esc(firstName(n.by))} (${hm(n.at)}): ${esc(String(n.text).slice(0, 90))}</i>` : `⚠️ izoh yo‘q · mas’ul: ${esc(firstName(x.manager) || '—')}`);
  }).join('\n');
  await setSession(chatId, 'att', { day, list: rows.map((x: any) => ({ id: x.studentId, name: x.name, phone: x.phone })) });
  const pending = rows.map((x: any, i: number) => ({ x, i })).filter(({ x }: any) => !todayNote(x.studentId)).slice(0, 24);
  const btns = pending.map(({ x, i }: any) => ib(`✍️ ${i + 1}. ${x.name.slice(0, 22)}`, `ac:${i}`));
  const kbRows: any[] = [nav];
  for (let i = 0; i < btns.length; i += 2) kbRows.push(btns.slice(i, i + 2));
  await sendLong(chatId,
    `📅 <b>Davomat · ${label}</b>\n\n❌ Kelmaganlar: <b>${rows.length}</b> (🔴 sababsiz ${unr} · 🟡 sababli ${rows.length - unr})\n📞 Menejer izohi: <b>${done}/${rows.length}</b>\n${mgrLines}\n\n${list}` +
    (pending.length ? '\n\n✍️ Gaplashgach izoh yozish uchun o‘quvchini tanlang 👇' : '\n\n✅ Hammasiga izoh yozilgan!'),
    { reply_markup: { inline_keyboard: kbRows } });
}

async function riskView(chatId: number) {
  await typing(chatId);
  const r = await edu('absenceRisk', { days: 21 });
  if (!r.ok) return void send(chatId, `⚠️ Edutizim: ${esc(r.error)}`, { reply_markup: menu() });
  const rows = r.rows || [];
  if (!rows.length) return void send(chatId, '✅ Ketma-ket 2+ dars qoldirgan aktiv o‘quvchi yo‘q.', { reply_markup: menu() });
  const red = rows.filter((x: any) => x.streak >= 3).length;
  await setSession(chatId, 'risk', { list: rows.map((x: any) => ({ id: x.studentId, name: x.name, phone: x.phone })) });
  const list = rows.map((x: any, i: number) => `<b>${i + 1}. ${x.streak >= 3 ? '🔴' : '🟠'} ${esc(x.name)}</b> — <b>${x.streak} dars</b> ketma-ket${x.unreasonable ? ` (sababsiz ${x.unreasonable})` : ''}\n   ${esc(x.group)} · ${esc(firstName(x.teacher))} · ${esc(x.phone)}\n   📆 ${x.dates.map((d: string) => dmy(new Date(d).getTime())).join(', ')} · mas’ul: ${esc(firstName(x.manager) || '—')}`).join('\n');
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
  const r = await edu('comment', { studentId: s.data.st.id, text: text.slice(0, 1000) });
  await setSession(chatId, null);
  await send(chatId, r.ok ? `✅ Izoh Edutizim’ga yozildi: <b>${esc(s.data.st.name)}</b>` : `⚠️ Yozilmadi: ${esc(r.error)}`, { reply_markup: menu() });
  if (r.ok && s.data.back === 'att') return attendanceView(chatId, 'today');
}

// =========================================================
// 👩‍🏫 O'qituvchilar hisoboti + Excel
// =========================================================
const repCache = new Map<string, { at: number; r: any }>();
function monthRange(which: 'm' | 'pm') {
  const t = new Date(Date.now() + TZ);
  const m0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TZ;
  const pm0 = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1) - TZ;
  return which === 'm' ? { from: m0, to: Date.now(), label: 'Bu oy' } : { from: pm0, to: m0 - 1, label: 'O‘tgan oy' };
}
async function teacherReport(which: 'm' | 'pm', teacherId?: string) {
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
  const lines = T.map((t: any, i: number) => `<b>${i + 1}. ${esc(t.name)}</b>\n   👥 ${t.active} aktiv · ${t.groups.length} guruh · ➕${t.joined.length} · ➖${t.left.length}${t.graduated.length ? ` · 🎓${t.graduated.length}` : ''} · 🔁 ${convTxt(t)}`).join('\n');
  await sendLong(chatId,
    `👩‍🏫 <b>O‘qituvchilar · ${r.label}</b>\n\n👥 Aktiv: <b>${tot.act}</b> · ➕ kelgan: <b>${tot.j}</b> · ➖ ketgan (arxiv): <b>${tot.l}</b>\n🔁 Konversiya (sinov → guruh): <b>${tot.tr ? Math.round((tot.cv / tot.tr) * 100) : 0}%</b> (${tot.cv}/${tot.tr})\n\n${lines}`,
    { reply_markup: { inline_keyboard: [
      [ib(which === 'm' ? '• Bu oy' : 'Bu oy', 'trp:m'), ib(which === 'pm' ? '• O‘tgan oy' : 'O‘tgan oy', 'trp:pm')],
      [ib('📥 Excel (har bir o‘qituvchi)', `txl:${which}`)],
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
    'Aktiv o‘quvchilar': t.active, 'Muzlatilgan': t.frozen, 'Oy davomida kelgan': t.joined.length, 'Oy davomida ketgan (arxiv)': t.left.length,
    'Bitirgan': t.graduated.length, 'Sinov darsiga kelgan': t.trials, 'Sinovdan guruhga o‘tgan': t.converted, 'Konversiya %': t.conversion ?? ''
  }))), 'Umumiy');
  for (const t of T) {
    const rows: any[] = [];
    rows.push({ 'Bo‘lim': 'GURUHLAR', 'F.I.Sh.': '', 'Telefon': '', 'Guruh': t.groups.join('; '), 'Sana': '', 'Narx': '', 'Izoh / sabab': '' });
    t.joined.forEach((x: any) => rows.push({ 'Bo‘lim': 'Kelgan', 'F.I.Sh.': x.name, 'Telefon': x.phone, 'Guruh': x.group, 'Sana': d(x.date), 'Narx': x.price, 'Izoh / sabab': x.state }));
    t.left.forEach((x: any) => rows.push({ 'Bo‘lim': 'Ketgan (arxiv)', 'F.I.Sh.': x.name, 'Telefon': x.phone, 'Guruh': x.group, 'Sana': d(x.date), 'Narx': x.price, 'Izoh / sabab': x.reason }));
    t.graduated.forEach((x: any) => rows.push({ 'Bo‘lim': 'Bitirgan', 'F.I.Sh.': x.name, 'Telefon': x.phone, 'Guruh': x.group, 'Sana': d(x.date), 'Narx': '', 'Izoh / sabab': '' }));
    rows.push({ 'Bo‘lim': 'XULOSA', 'F.I.Sh.': `Aktiv: ${t.active} · Kelgan: ${t.joined.length} · Ketgan: ${t.left.length} · Konversiya: ${convTxt(t)}` });
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
  await send(chatId, `📞 <b>${esc(x.name)}</b>\n☎️ ${esc(x.phone)}\n👥 ${esc(x.group)}${x.reason ? `\n📝 Chiqish sababi: ${esc(x.reason)}` : ''}\n\nQo‘ng‘iroq qiling va natijani yozing (masalan: “Dekabrdan qaytadi”, “Boshqa markazga o‘tgan”):`, { reply_markup: CANCEL_KB });
}

async function taskItemSave(chatId: number, s: Session, text: string, from: any) {
  if (text.length < 3) return void send(chatId, 'Izohni to‘liqroq yozing.');
  const { data: t } = await admin.from('crm_edu_tasks').select('*').eq('id', s.data.id).maybeSingle();
  if (!t) return;
  const items = [...(t.items || [])];
  const x = items[s.data.idx];
  const r = await edu('comment', { studentId: x.studentId, text: `[Ustoz ${t.teacher_name}] ${text.slice(0, 900)}` });
  items[s.data.idx] = { ...x, comment: text.slice(0, 500), doneAt: new Date().toISOString() };
  const allDone = items.every((i: any) => i.doneAt);
  await admin.from('crm_edu_tasks').update({ items, ...(allDone ? { status: 'done', done_at: new Date().toISOString() } : {}) }).eq('id', t.id);
  await setSession(chatId, null);
  await send(chatId, `✅ Saqlandi${r.ok ? ' (Edutizim kartasiga ham yozildi)' : ''}: ${esc(x.name)}`, { reply_markup: menu() });
  if (allDone) {
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
    `📊 <b>Mening natijam · ${r.label}</b>\n\n👥 Aktiv o‘quvchilar: <b>${t.active}</b>\n🗂 Guruhlar: ${t.groups.length}\n${t.groups.map((g: string) => '   • ' + esc(g)).join('\n')}\n\n` +
    `➕ Kelgan: <b>${t.joined.length}</b>\n➖ Ketgan (arxiv): <b>${t.left.length}</b>\n🎓 Bitirgan: ${t.graduated.length}\n\n` +
    `🔁 <b>Konversiya</b>: ${convTxt(t)}\n<i>Sinov darsiga kelganlardan shu oy guruhga qo‘shilganlar ulushi</i>` +
    (t.left.length ? `\n\n<b>Arxivdagilar:</b>\n${t.left.slice(0, 25).map((x: any) => `• ${esc(x.name)} · ${esc(x.phone)} · ${dmy(new Date(x.date).getTime())}${x.reason ? ` — <i>${esc(String(x.reason).slice(0, 50))}</i>` : ''}`).join('\n')}` : ''),
    { reply_markup: { inline_keyboard: [[ib(which === 'm' ? '• Bu oy' : 'Bu oy', 'my:m'), ib(which === 'pm' ? '• O‘tgan oy' : 'O‘tgan oy', 'my:pm')]] } });
}

// =========================================================
// Router
// =========================================================
const ACCESS: Record<string, Role[]> = {
  // matn tugmalari
  [B_IN]: ['top'], [B_OUT]: ['top'], [B_STATS]: ['top'], [B_EXP]: ['top'], [B_TEACH]: ['top'], [B_TASKS]: ['top'], [B_ADMIN]: ['top'],
  [B_ATT]: ['top', 'service'], [B_RISK]: ['top', 'service'], [B_FIND]: ['top', 'service'], [B_DEBT]: ['top', 'service'], [B_LEAD]: ['top', 'service'],
  [B_MY]: ['teacher'], [B_MYTASK]: ['teacher']
};
function cbAllowed(data: string, r: Role) {
  const p = data.split(':')[0];
  const top = ['kt', 'ks', 'km', 'kb', 'ok', 'kx', 'pay', 'ex', 'exc', 'st', 'ua', 'ur', 'urs', 'adm', 'trp', 'txl', 'tnew', 'tt', 'tp', 'td', 'tc'];
  const svc = ['att', 'ac', 'rc', 'dbt', 'lc', 'lf', 'x'];
  const tch = ['tk', 'ti', 'my', 'x'];
  if (r === 'top') return true;
  if (r === 'service') return svc.includes(p);
  if (r === 'teacher') return tch.includes(p);
  return false;
}

async function startMsg(chatId: number, m: any) {
  const r = role();
  const name = esc(m.from?.first_name || '');
  const body = r === 'top'
    ? `💰 <b>Kirim / Chiqim</b> — Edutizim kassasi\n📅 <b>Davomat</b> — kelmaganlar va menejer izohlari\n⚠️ <b>Xavf ostida</b> — notcoming bo‘lay deganlar\n📈 <b>Statistika</b> · 🧾 <b>Xarajatlar</b>\n🔴 <b>Qarzdorlar</b> · 🔍 <b>O‘quvchi</b>\n👩‍🏫 <b>O‘qituvchilar</b> — hisobot, konversiya, Excel\n📋 <b>Vazifalar</b> — ustozlarga topshiriq\n⚙️ <b>Boshqaruv</b> — rollar, hisobot, sinxron`
    : r === 'service'
      ? `📅 <b>Davomat</b> — bugun kelmaganlar: qo‘ng‘iroq qilib izoh yozing\n⚠️ <b>Xavf ostida</b> — ketma-ket kelmayotganlar\n🔍 <b>O‘quvchi</b> · 🔴 <b>Qarzdorlar</b> · ➕ <b>Lid</b>`
      : `📊 <b>Mening natijam</b> — aktiv, kelgan, ketgan, konversiya\n📋 <b>Vazifalarim</b> — top menejer topshiriqlari`;
  const caption = `👋 Assalomu alaykum, <b>${name}</b>!\n💼 <b>Registan Globus · Moliya</b> · ${ROLE_NAME[r] || ''}\n\n${body}\n\nPastdagi tugmalardan tanlang 👇`;
  const res = await tg(await token(), 'sendPhoto', { chat_id: chatId, photo: BANNER, caption, parse_mode: 'HTML', reply_markup: menu() });
  if (!res?.ok) await send(chatId, caption, { reply_markup: menu() });
}

async function onMessage(m: any) {
  const chatId = m.chat.id as number;
  if (m.chat.type !== 'private') return;
  const text = String(m.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const r = role();
  if (cmd === '/id') return void send(chatId, `ID: <code>${m.from?.id}</code>`);
  if (r === 'none') return m.contact ? register(chatId, m) : askContact(chatId, m.from?.first_name);
  if (r === 'pending') return void send(chatId, '⏳ So‘rovingiz top menejer tomonidan ko‘rib chiqilmoqda.', { reply_markup: { remove_keyboard: true } });
  if (r === 'blocked') return void send(chatId, '⛔ Botdan foydalanishga ruxsat yo‘q.', { reply_markup: { remove_keyboard: true } });

  if (cmd === '/start' || cmd === '/menu') { await setSession(chatId, null); return startMsg(chatId, m); }
  if (text === B_CANCEL || cmd === '/cancel') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: menu() }); }
  if (ACCESS[text] && !ACCESS[text].includes(r)) return void send(chatId, '⛔ Bu bo‘lim sizning rolingiz uchun yopiq.', { reply_markup: menu() });
  const isTop = r === 'top', isStaff = r === 'top' || r === 'service';
  if (isTop && (text === B_IN || cmd === '/kirim')) return kassaStart(chatId, 'in');
  if (isTop && (text === B_OUT || cmd === '/chiqim')) return kassaStart(chatId, 'out');
  if (isTop && (text === B_STATS || cmd === '/statistika')) return stats(chatId);
  if (isTop && (text === B_EXP || cmd === '/xarajat')) return expenses(chatId, 'week');
  if (isTop && cmd === '/xarajat_oy') return expenses(chatId, 'month');
  if (isTop && (text === B_TEACH || cmd === '/oqituvchilar')) return teachersView(chatId, 'm');
  if (isTop && (text === B_TASKS || cmd === '/vazifalar')) return tasksTop(chatId);
  if (isTop && (text === B_ADMIN || cmd === '/boshqaruv')) return adminPanel(chatId);
  if (isTop && (text === B_REPORT || cmd === '/hisobot')) return report(chatId);
  if (isTop && (text === B_SYNC || cmd === '/sinxron')) return sync(chatId);
  if (isStaff && (text === B_ATT || cmd === '/davomat')) return attendanceView(chatId, 'today');
  if (isStaff && (text === B_RISK || cmd === '/xavf')) return riskView(chatId);
  if (isStaff && (text === B_FIND || cmd === '/qidir')) { await setSession(chatId, 'find', {}); return void send(chatId, '🔍 O‘quvchining ismi yoki telefon raqamini yozing:', { reply_markup: CANCEL_KB }); }
  if (isStaff && (text === B_DEBT || cmd === '/qarz')) return debtors(chatId);
  if (isStaff && (text === B_LEAD || cmd === '/lid')) { await setSession(chatId, 'lead_name', {}); return void send(chatId, '➕ <b>Yangi lid</b>\n\n👤 Familiya va ismini yozing:', { reply_markup: CANCEL_KB }); }
  if (r === 'teacher' && (text === B_MY || cmd === '/natijam')) return myStats(chatId, 'm');
  if (r === 'teacher' && (text === B_MYTASK || cmd === '/vazifalarim')) return myTasks(chatId);

  const s = await getSession(chatId);
  switch (s.step) {
    case 'note':
      if (!isStaff) break;
      return saveStudentNote(chatId, s, text);
    case 'task_note':
      return taskItemSave(chatId, s, text, m.from);
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
      return leadCourse(chatId, { ...s.data, phone: ph });
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
  const s = await getSession(chatId);
  if (data === 'x') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: menu() }); }
  // Rollar
  if (data.startsWith('ua:')) { const [, id, r] = data.split(':'); return setRole(chatId, Number(id), r as Role, q.from); }
  if (data.startsWith('ur:')) {
    const id = data.slice(3);
    return void send(chatId, 'Yangi rol:', { reply_markup: { inline_keyboard: [[ib('👑 Top', `ua:${id}:top`), ib('🎧 Servis', `ua:${id}:service`), ib('👩‍🏫 O‘qituvchi', `ua:${id}:teacher`)], [ib('⛔ Bloklash', `ua:${id}:blocked`)]] } });
  }
  if (data === 'adm:users') return usersPanel(chatId);
  if (data === 'adm:report') return report(chatId);
  if (data === 'adm:sync') return sync(chatId);
  // Davomat / xavf
  if (data.startsWith('att:')) return attendanceView(chatId, data.slice(4) as any);
  if (data.startsWith('ac:') && s.step === 'att') { const st = s.data.list?.[Number(data.slice(3))]; if (st) return askStudentNote(chatId, st, 'att'); }
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
  // Statistika, xarajatlar, qarzdorlar
  if (data === 'dbt:active' || data === 'dbt:all') return debtors(chatId, data === 'dbt:all' ? 'all' : 'active');
  if (data === 'st:sync') { await sync(chatId); return stats(chatId); }
  if (data.startsWith('ex:')) return expenses(chatId, data.slice(3) as Period);
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
    const d = { ...rest, courseId: c?.id || s.data.defCourse || null, courseName: c?.name || '' };
    await setSession(chatId, 'lead_push', d);
    return leadPush(chatId, d, false, q.from);
  }
  if (data === 'lf' && s.step === 'lead_dup') return leadPush(chatId, s.data, true, q.from);
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
    const r = await edu('kassaCancel', { transactionId: data.slice(3), by });
    if (r.ok && q.message?.message_id) await tg(await token(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await send(chatId, r.ok ? '↩️ Kassa amali bekor qilindi (Edutizim’da “bekor qilingan” bo‘lib turadi).' : `⚠️ Bekor qilib bo‘lmadi: ${esc(r.error)}`, { reply_markup: menu() });
    if (r.ok) await notifyOthers(`↩️ Kassa amali bekor qilindi · ${esc(by)}`, q.from?.id);
    return;
  }
  return void send(chatId, 'Amal eskirgan. Pastdagi tugmalardan qaytadan boshlang.', { reply_markup: menu() });
}

async function handle(update: any) {
  const from = update.message?.from || update.callback_query?.from;
  const { role: r, user } = await resolveUser(from);
  await als.run({ role: r, user, menu: menuFor(r), from }, async () => {
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
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(t)) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => ({}));
  console.log('edu upd', update.message ? `msg ${update.message.chat?.id} ${String(update.message.text || '').slice(0, 30)}` : update.callback_query ? `cb ${update.callback_query.from?.id} ${update.callback_query.data}` : '');
  // Og'ir hisobotlar Telegram kutish vaqtidan oshmasligi uchun fonda
  const job = handle(update);
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) { EdgeRuntime.waitUntil(job); return new Response('ok'); }
  await job;
  return new Response('ok');
});
