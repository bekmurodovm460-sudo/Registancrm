// =========================================================
// REGISTAN · EDUTIZIM boti (alohida, faqat xodimlar uchun)
//  ➕ Lid · 🔍 O'quvchi · 🔴 Qarzdorlar · 💰 Kirim · 💸 Chiqim · 📊 Hisobot · 🔄 Sinxron
// Kirish: CRM → 🤖 Telegram Bot → "Bot adminlari" (Telegram ID) yoki admin chat ID.
// Edutizim bilan ishlash edutizim-sync funksiyasi orqali (x-cron-secret, ichki chaqiruv).
// =========================================================
import { admin, getSecret, getSetting, SUPABASE_URL, tg, webhookSecret } from '../_shared/common.ts';

const B_LEAD = '➕ Lid qo‘shish';
const B_FIND = '🔍 O‘quvchi';
const B_DEBT = '🔴 Qarzdorlar';
const B_IN = '💰 Kirim';
const B_OUT = '💸 Chiqim';
const B_REPORT = '📊 Hisobot';
const B_SYNC = '🔄 Sinxron';
const B_STATS = '📈 Statistika';
const B_CANCEL = '❌ Bekor qilish';
const B_SKIP = '⏭ O‘tkazib yuborish';

const kb = (rows: string[][]) => ({ keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true });
const MENU = { ...kb([[B_IN, B_OUT], [B_STATS, B_DEBT], [B_FIND, B_LEAD], [B_REPORT, B_SYNC]]), is_persistent: true, input_field_placeholder: 'Amalni tanlang…' };
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
  for (const id of await adminIds()) if (id !== String(exceptId)) await send(id, text).catch(() => {});
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
  if (!list.length) return void send(chatId, '✅ Qarzdorlar yo‘q.', { reply_markup: MENU });
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
// ➕ Lid
// ---------------------------------------------------------
async function leadCourse(chatId: number, d: any) {
  await typing(chatId);
  const meta = await edu('meta');
  if (!meta.ok) { await setSession(chatId, null); return void send(chatId, `⚠️ Edutizim: ${esc(meta.error)}`, { reply_markup: MENU }); }
  const courses = (meta.courses || []).slice(0, 40).map((c: any) => ({ id: c.id, name: c.name }));
  await setSession(chatId, 'lead_course', { ...d, courses, defCourse: meta.defaults?.courseId || null });
  const btns = courses.map((c: any, i: number) => ib(String(c.name).slice(0, 30), `lc:${i}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([ib('⏭ Kurssiz (standart)', 'lc:-')]);
  await send(chatId, '✅', { reply_markup: MENU });
  await send(chatId, `👤 ${esc(d.name)} · 📱 ${esc(d.phone)}\n\n📚 Qaysi kursga qiziqadi?`, { reply_markup: { inline_keyboard: rows } });
}

async function leadPush(chatId: number, d: any, force: boolean, from: any) {
  await typing(chatId);
  const r = await edu('pushLead', { students: [{ fullName: d.name, phone: d.phone }], courseId: d.courseId || undefined, force });
  const res = r.results?.[0];
  if (!r.ok || !res) { await setSession(chatId, null); return void send(chatId, `⚠️ ${esc(r.error || 'Xatolik')}`, { reply_markup: MENU }); }
  if (res.skipped === 'exists' && !force) {
    await setSession(chatId, 'lead_dup', d);
    return void send(chatId, `ℹ️ ${esc(res.message)}\n\nBaribir yangi lid qo‘shilsinmi?`, { reply_markup: { inline_keyboard: [[ib('➕ Ha, qo‘shish', 'lf'), ib('❌ Yo‘q', 'x')]] } });
  }
  await setSession(chatId, null);
  await send(chatId, res.ok
    ? `✅ Edutizim’ga lid qo‘shildi!\n\n👤 ${esc(d.name)}\n📱 ${esc(d.phone)}${d.courseName ? `\n📚 ${esc(d.courseName)}` : ''}`
    : `⚠️ Lid qo‘shilmadi: ${esc(res.message)}`, { reply_markup: MENU });
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
    { reply_markup: MENU });
}

async function sync(chatId: number) {
  await send(chatId, '⏳ Edutizim bilan sinxronlanmoqda… (30–60 soniya)');
  const r = await edu('sync');
  await send(chatId, r.ok ? `✅ Sinxron tugadi: <b>${r.students}</b> o‘quvchi, <b>${r.groups}</b> guruh (${Math.round((r.ms || 0) / 1000)} s)` : `⚠️ Sinxron xatosi: ${esc(r.error)}`, { reply_markup: MENU });
}

// ---------------------------------------------------------
// 💰 Kassa: kirim / chiqim
// ---------------------------------------------------------
async function kassaStart(chatId: number, kind: 'in' | 'out', student: any = null) {
  await typing(chatId);
  const meta = await edu('kassaMeta');
  if (!meta.ok) return void send(chatId, `⚠️ Edutizim kassasi: ${esc(meta.error)}`, { reply_markup: MENU });
  const types = (meta.types || []).filter((t: any) => t.type === (kind === 'in' ? 'payIn' : 'payOut') && t.subtype !== 'employee' && (!student || t.subtype === 'student'));
  const cashboxes = (meta.cashboxes || []).filter((c: any) => !c.frozen);
  if (!types.length || !cashboxes.length) return void send(chatId, '⚠️ Edutizim’da mos kassa yoki kirim/chiqim turi topilmadi.', { reply_markup: MENU });
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
  await send(chatId, '✅', { reply_markup: MENU });
  await send(chatId, `💵 Summa: <b>${sum(d.amount)}</b>\n\n💳 To‘lov usuli:`, { reply_markup: { inline_keyboard: rows } });
}
async function askComment(chatId: number, d: any) {
  await setSession(chatId, 'k_comment', d);
  await send(chatId, '📝 Izoh yozing (masalan: “Noyabr to‘lovi”, “Qog‘oz, 5 pachka”) yoki o‘tkazib yuboring:', { reply_markup: SKIP_KB });
}
async function confirm(chatId: number, d: any) {
  await setSession(chatId, 'k_confirm', d);
  await send(chatId, '✅', { reply_markup: MENU });
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
  if (!r.ok) return void send(chatId, `⚠️ Kassaga yozilmadi: ${esc(r.error)}\n\n${summary(d)}`, { reply_markup: MENU });
  const rows: any[] = [];
  if (r.id) rows.push([ib('↩️ Bu amalni bekor qilish', `kx:${r.id}`)]);
  await send(chatId, `✅ <b>Kassaga yozildi</b>\n\n${summary(d)}`, rows.length ? { reply_markup: { inline_keyboard: rows } } : { reply_markup: MENU });
  await notifyOthers(`${d.kind === 'in' ? '💰 Kirim' : '💸 Chiqim'}: ${esc(d.type?.name)} · <b>${sum(d.amount)}</b>${d.student ? ' · ' + esc(d.student.name) : ''}${d.comment ? ' · ' + esc(d.comment) : ''} · ${esc(by)}`, from?.id);
}

// ---------------------------------------------------------
// Router
// ---------------------------------------------------------
async function onMessage(m: any) {
  const chatId = m.chat.id as number;
  if (m.chat.type !== 'private') return;
  const text = String(m.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  if (!(await isAdmin(m.from?.id))) {
    return void send(chatId, `⛔ Bu bot faqat <b>Registan LC</b> xodimlari uchun.\n\nTelegram ID’ingiz: <code>${m.from?.id}</code>\nAdmin uni CRM → 🤖 Telegram Bot → “Bot adminlari”ga qo‘shsa, bot ochiladi.`, { reply_markup: { remove_keyboard: true } });
  }
  if (cmd === '/start' || cmd === '/menu' || text === B_CANCEL || cmd === '/cancel') {
    await setSession(chatId, null);
    if (cmd === '/start') {
      const caption = `👋 Assalomu alaykum, <b>${esc(m.from?.first_name || '')}</b>!\n\n💼 <b>Registan Globus · Moliya</b>\n\n💰 <b>Kirim</b> — o‘quvchi to‘lovi, boshqa tushumlar\n💸 <b>Chiqim</b> — xarajatlar (kanstovar, arenda…)\n🔍 <b>O‘quvchi</b> — balans, guruh, to‘lov qabul qilish\n🔴 <b>Qarzdorlar</b> — eng katta qarzlar\n➕ <b>Lid</b> — Edutizim’ga yangi mijoz\n📈 <b>Statistika</b> — aktiv o‘quvchilar va qarzdorlik\n📊 <b>Hisobot</b> · 🔄 <b>Sinxron</b>\n\nPastdagi tugmalardan tanlang 👇`;
      const r = await tg(await token(), 'sendPhoto', { chat_id: chatId, photo: BANNER, caption, parse_mode: 'HTML', reply_markup: MENU });
      if (!r?.ok) await send(chatId, caption, { reply_markup: MENU });
      return;
    }
    return void send(chatId, text === B_CANCEL || cmd === '/cancel' ? '❌ Bekor qilindi.' : 'Tanlang 👇', { reply_markup: MENU });
  }
  if (cmd === '/id') return void send(chatId, `ID: <code>${m.from?.id}</code>`);
  if (text === B_IN || cmd === '/kirim') return kassaStart(chatId, 'in');
  if (text === B_OUT || cmd === '/chiqim') return kassaStart(chatId, 'out');
  if (text === B_FIND || cmd === '/qidir') { await setSession(chatId, 'find', {}); return void send(chatId, '🔍 O‘quvchining ismi yoki telefon raqamini yozing:', { reply_markup: CANCEL_KB }); }
  if (text === B_DEBT || cmd === '/qarz') return debtors(chatId);
  if (text === B_STATS || cmd === '/statistika') return stats(chatId);
  if (text === B_LEAD || cmd === '/lid') { await setSession(chatId, 'lead_name', {}); return void send(chatId, '➕ <b>Yangi lid</b>\n\n👤 Familiya va ismini yozing:', { reply_markup: CANCEL_KB }); }
  if (text === B_REPORT || cmd === '/hisobot') return report(chatId);
  if (text === B_SYNC || cmd === '/sinxron') return sync(chatId);

  const s = await getSession(chatId);
  switch (s.step) {
    case 'find':
      return findAnswer(chatId, text);
    case 'lead_name':
      if (text.length < 3) return void send(chatId, 'Familiya va ismni to‘liq yozing.');
      await setSession(chatId, 'lead_phone', { name: text.replace(/\s+/g, ' ').slice(0, 80) });
      return void send(chatId, '📱 Telefon raqami (masalan: +998 90 123 45 67):', { reply_markup: CANCEL_KB });
    case 'lead_phone': {
      const ph = normPhone(m.contact?.phone_number || text);
      if (!ph) return void send(chatId, 'Raqamni to‘g‘ri yozing: +998 90 123 45 67');
      return leadCourse(chatId, { ...s.data, phone: ph });
    }
    case 'k_student': {
      if (text.length < 3) return void send(chatId, 'Kamida 3 harf yoki telefon raqamini yozing.');
      const list = await eduFind(text);
      if (!list.length) return void send(chatId, '😕 Topilmadi. Boshqacha yozib ko‘ring.');
      await setSession(chatId, 'k_student', { ...s.data, found: list });
      return void send(chatId, list.map(line).join('\n\n'), { reply_markup: { inline_keyboard: list.map((x, i) => [ib(`${i + 1}. ${x.name.slice(0, 34)}`, `ks:${i}`)]) } });
    }
    case 'k_amount': {
      const amount = parseAmount(text);
      const t = s.data.type || {};
      if (!amount || amount < 100) return void send(chatId, 'Summani raqamda yozing, masalan: 350000 yoki 350k');
      if (t.min && amount < t.min) return void send(chatId, `“${esc(t.name)}” uchun eng kam summa: ${sum(t.min)}`);
      if (t.max && amount > t.max) return void send(chatId, `“${esc(t.name)}” uchun eng ko‘p summa: ${sum(t.max)}`);
      return askMethod(chatId, { ...s.data, amount });
    }
    case 'k_comment':
      return confirm(chatId, { ...s.data, comment: text === B_SKIP ? '' : text.slice(0, 200) });
    default:
      return void send(chatId, 'Pastdagi tugmalardan tanlang 👇', { reply_markup: MENU });
  }
}

async function onCallback(q: any) {
  const chatId = (q.message?.chat?.id ?? q.from?.id) as number;
  const data = String(q.data || '');
  tg(await token(), 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (!(await isAdmin(q.from?.id))) return void send(chatId, '⛔ Ruxsat yo‘q.');
  const s = await getSession(chatId);
  if (data === 'x') { await setSession(chatId, null); return void send(chatId, '❌ Bekor qilindi.', { reply_markup: MENU }); }
  if (data === 'dbt:active' || data === 'dbt:all') return debtors(chatId, data === 'dbt:all' ? 'all' : 'active');
  if (data === 'st:sync') { await sync(chatId); return stats(chatId); }
  if (data.startsWith('pay:')) {
    const st = (s.data.found || [])[Number(data.slice(4))];
    if (!st) return void send(chatId, 'Qaytadan qidiring.', { reply_markup: MENU });
    return kassaStart(chatId, 'in', st);
  }
  if (data.startsWith('lc:') && s.step === 'lead_course') {
    const c = data === 'lc:-' ? null : (s.data.courses || [])[Number(data.slice(3))];
    const { courses: _c, ...rest } = s.data;
    const d = { ...rest, courseId: c?.id || s.data.defCourse || null, courseName: c?.name || '' };
    await setSession(chatId, 'lead_push', d);
    return leadPush(chatId, d, false, q.from);
  }
  if (data === 'lf' && s.step === 'lead_dup') return leadPush(chatId, s.data, true, q.from);
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
    if (s.step !== 'k_confirm') return void send(chatId, s.step === 'k_busy' ? '⏳ Yozilmoqda…' : 'Amal eskirgan. Qaytadan boshlang.', { reply_markup: MENU });
    return execute(chatId, s.data, q.from);
  }
  if (data.startsWith('kx:')) {
    const by = q.from?.username ? '@' + q.from.username : (q.from?.first_name || '');
    const r = await edu('kassaCancel', { transactionId: data.slice(3), by });
    if (r.ok && q.message?.message_id) await tg(await token(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await send(chatId, r.ok ? '↩️ Kassa amali bekor qilindi (Edutizim’da “bekor qilingan” bo‘lib turadi).' : `⚠️ Bekor qilib bo‘lmadi: ${esc(r.error)}`, { reply_markup: MENU });
    if (r.ok) await notifyOthers(`↩️ Kassa amali bekor qilindi · ${esc(by)}`, q.from?.id);
    return;
  }
  return void send(chatId, 'Amal eskirgan. Pastdagi tugmalardan qaytadan boshlang.', { reply_markup: MENU });
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok');
  const t = await token();
  if (!t) return new Response('edu bot token not set', { status: 503 });
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(t)) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => ({}));
  console.log('edu upd', update.message ? `msg ${update.message.chat?.id} ${String(update.message.text || '').slice(0, 30)}` : update.callback_query ? `cb ${update.callback_query.from?.id} ${update.callback_query.data}` : '');
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error('edu-bot error', e);
    const chatId = update.message?.chat?.id || update.callback_query?.from?.id;
    if (chatId) await send(chatId, '⚠️ Texnik xatolik. Qaytadan urinib ko‘ring.', { reply_markup: MENU }).catch(() => {});
  }
  return new Response('ok');
});
