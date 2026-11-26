// =========================================================
// REGISTAN LC Telegram bot (webhook)
//  • 📝 Natijani tekshirish — javoblar varaqasi rasmi (OMR) orqali
//  • 🧒 Kids Mock'ga ro'yxatdan o'tish
//  • /natija, /karta, /mening, /aloqa — ota-onalar uchun
//  • /hisobot — kunlik statistika (faqat admin chat/guruhda)
// =========================================================
import jpeg from 'npm:jpeg-js@0.4.4';
import { admin, getSecret, getSetting, tg, webhookSecret } from '../_shared/common.ts';
import { readSheet, rgbaToGray, gradeAnswers } from '../_shared/omr.js';
import { cardPng, money, PRIZES, promoCode } from '../_shared/card.ts';
import * as XLSX from 'npm:xlsx@0.18.5';
import { analyze, computeScore, nameKey, classKey, regIdOf, FIELDS } from '../_shared/evalbee.js';

// Asosiy bo'limlar
const BTN_SEC1 = '📚 Maktab imtihonlari javoblari';
const BTN_SEC2 = '🧒 Kids Mock’ga ro‘yxatdan o‘tish';
const BTN_SEC3 = '📊 Natijalar ro‘yxati';
const BTN_CONTACT = '📞 Aloqa';
const BTN_HELP = 'ℹ️ Yordam';
const BTN_HOME = '⬅️ Bosh menyu';
const BTN_CANCEL = '❌ Bekor qilish';
// 1-bo'lim
const BTN_KEYS = '🔑 Javoblar kaliti';
const BTN_CHECK = '📸 Varaqni tekshirish';
// 2-bo'lim
const BTN_REG = '📝 Ro‘yxatdan o‘tish';
const BTN_MINE = '📋 Mening arizalarim';
// 3-bo'lim
const BTN_RESULT = '🔍 Farzandim natijasi';
const BTN_TOP = '🏆 TOP-3 sovrindorlar';
const BTN_CARD = '🏅 Yutuqli karta';
// Nazoratchilar (maktab testlari)
const BTN_PROCTOR = '👮 Nazoratchilar';
const BTN_SKIP = '⏭ O‘tkazib yuborish';
// Eski menyu tugmalari (foydalanuvchida eski klaviatura qolgan bo'lsa)
const OLD_CHECK = '📝 Natijani tekshirish';
const OLD_REG = '🧒 Kids Mock ro‘yxatdan o‘tish';
const OLD_RESULT = '🏆 Farzand natijasi';

// Yangi ixcham menyu (2 ustun, doimiy)
const M_MOCK = '🧒 Kids Mock';
const M_CHECK = '📸 Natijani tekshirish';
const M_KEYS = '🔑 Javoblar';
const M_RESULTS = '📊 Natijalar';
const M_CONTACT = '📞 Aloqa';
const M_HELP = 'ℹ️ Yordam';
const M_PROCTOR = '👮 Nazorat';
const M_TEACHER = '👩‍🏫 Ustozlar';

const kb = (rows: string[][]) => ({ keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true });
const MENU = {
  ...kb([[M_MOCK, M_CHECK], [M_KEYS, M_RESULTS], [M_TEACHER, M_PROCTOR], [M_CONTACT, M_HELP]]),
  is_persistent: true,
  input_field_placeholder: 'Bo‘limni tanlang…'
};
const SKIP_KB = kb([[BTN_SKIP], [BTN_CANCEL]]);
// Eski pastki menyular o'rniga yagona menyu (bo'lim ichidagi tanlovlar inline tugmalarda)
const SUB1 = MENU;
const SUB2 = MENU;
const SUB3 = MENU;
const ib = (text: string, data: string) => ({ text, callback_data: data });
const BANNER_URL = 'https://raw.githubusercontent.com/bekmurodovm460-sudo/Registancrm/a0821b4e804f5cd7e5dcf02df85e2cfc0e546489/brand/bot-tavsif-1280x720.png';
const CANCEL_KB = { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true };
const DEFAULT_CENTER = '📍 <b>Registan LC</b> o‘quv markazi\n\nAloqa ma’lumotlari hali kiritilmagan. Admin CRM’dagi “🤖 Telegram Bot” bo‘limida ularni yozadi.';

let TOKEN = '';
let tokenLoadedAt = 0;
async function token() {
  if (!TOKEN || Date.now() - tokenLoadedAt > 600_000) {
    TOKEN = await getSecret('telegram_bot_token');
    tokenLoadedAt = Date.now();
  }
  return TOKEN;
}

// Sozlamalar keshi (baza boshqa hududda — har so'rovda o'qimaslik uchun)
const settingCache = new Map<string, { v: unknown; at: number }>();
async function cachedSetting<T>(key: string, fallback: T, ttl = 120_000): Promise<T> {
  const c = settingCache.get(key);
  if (c && Date.now() - c.at < ttl) return c.v as T;
  const v = await getSetting<T>(key, fallback);
  settingCache.set(key, { v, at: Date.now() });
  return v;
}

type Session = { step: string | null; data: Record<string, any> };

async function getSession(chatId: number): Promise<Session> {
  const { data } = await admin.from('crm_bot_sessions').select('step,data').eq('chat_id', chatId).maybeSingle();
  return { step: data?.step ?? null, data: (data?.data as Record<string, any>) || {} };
}
async function setSession(chatId: number, step: string | null, data: Record<string, any> = {}) {
  await admin.from('crm_bot_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString(), blocked_at: null });
}

async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  const r = await tg(await token(), 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
  if (!r?.ok) console.error('tg sendMessage fail', chatId, r?.error_code, r?.description);
  return r;
}

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

// Kids Mock varianti: 1-fan (Matematika / Rus tili) + daraja (Oson / Qiyin)
const SUBJECTS: Record<string, string> = { MAT: 'Matematika', RUS: 'Rus tili' };
const LEVELS: Record<string, string> = { OSON: 'Oson', QIYIN: 'Qiyin' };
const SUBJECTS2: Record<string, string> = { ENG: 'Ingliz tili', RUS: 'Rus tili', MAT: 'Matematika' };
// Variant: 1-fan-daraja+2-fan-daraja (MAT-OSON+ENG-QIYIN); bo'lmasa faqat 1-fan bo'yicha (MAT-OSON)
const SC: Record<string, string> = { 'Rus tili': 'RUS', 'Matematika': 'MAT', 'Ingliz tili': 'ENG' };
const LC = (l?: string) => (l === 'Qiyin' ? 'QIYIN' : 'OSON');
const baseVariant = (subject1?: string, level?: string) => `${subject1 === 'Rus tili' ? 'RUS' : 'MAT'}-${LC(level)}`;
const variantOf = (subject1?: string, level?: string, subject2?: string, level2?: string) =>
  `${baseVariant(subject1, level)}+${SC[subject2 || ''] || 'ENG'}-${LC(level2)}`;

async function notifyAdmin(text: string, markup?: unknown) {
  const chat = await getSecret('telegram_admin_chat_id');
  if (chat) await tg(await token(), 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) }).catch(() => {});
}

// ---------------------------------------------------------
// Natijani tekshirish
// ---------------------------------------------------------
async function startCheck(chatId: number) {
  const [{ data: tests }, { data: regs }] = await Promise.all([
    admin.from('crm_tests').select('code,title,num_questions,variant,kind').eq('active', true).order('created_at', { ascending: false }).limit(30),
    admin.from('crm_mock_registrations').select('id,full_name,subject1,level,subject2,level2').eq('chat_id', chatId).neq('status', 'Bekor').order('created_at', { ascending: false }).limit(5)
  ]);
  // Maktab testlari faqat nazoratchilar bo'limida
  const plain = (tests || []).filter(t => !t.variant && t.kind !== 'school');
  const hasMock = (tests || []).some(t => t.variant);
  const rows: any[] = [];
  if (hasMock) (regs || []).forEach(r => rows.push([{ text: `🧒 Kids Mock — ${r.full_name} (${r.subject1 || 'Matematika'} · ${r.level || 'Oson'} + ${r.subject2 || 'Ingliz tili'} · ${r.level2 || 'Oson'})`, callback_data: `km:${r.id}` }]));
  plain.forEach(t => rows.push([{ text: `${t.code} — ${t.title} (${t.num_questions} savol)`, callback_data: `t:${t.code}` }]));
  if (!rows.length) {
    await send(chatId, 'Hozircha faol test yo‘q. Keyinroq urinib ko‘ring.', { reply_markup: MENU });
    return;
  }
  await setSession(chatId, 'check_test', {});
  await send(chatId, '📝 Qaysi natijani tekshiramiz?' + (hasMock ? '\n🧒 Kids Mock uchun farzandingiz arizasini tanlang — variant kaliti avtomatik olinadi.' : ''), {
    reply_markup: { inline_keyboard: rows }
  });
}

// Kids Mock: ariza bo'yicha variant testini topish
async function pickMockReg(chatId: number, regId: number) {
  const { data: reg } = await admin.from('crm_mock_registrations').select('*').eq('id', regId).eq('chat_id', chatId).maybeSingle();
  if (!reg) return void send(chatId, 'Ariza topilmadi.', { reply_markup: SUB1 });
  const exact = variantOf(reg.subject1, reg.level, reg.subject2, reg.level2);
  const { data: all } = await admin.from('crm_tests').select('*').eq('active', true).in('variant', [exact, baseVariant(reg.subject1, reg.level)]).order('created_at', { ascending: false });
  // Aniq variant (2-fan bilan) ustun, bo'lmasa 1-fan+daraja varianti
  const tests = (all || []).filter(t => t.variant === exact).length ? (all || []).filter(t => t.variant === exact) : (all || []);
  const test = tests.find(t => !t.session || t.session === reg.session) || tests[0];
  if (!test) return void send(chatId, `⚠️ ${esc(reg.subject1 || 'Matematika')} · ${esc(reg.level || 'Oson')} + ${esc(reg.subject2 || 'Ingliz tili')} (${esc(reg.level2 || 'Oson')}) varianti uchun faol test hali kiritilmagan. Administratorga murojaat qiling.`, { reply_markup: SUB1 });
  await setSession(chatId, 'check_photo', { test: test.code, name: reg.full_name, regId: reg.id, room: reg.room, subject1: reg.subject1, level: reg.level, subject2: reg.subject2, level2: reg.level2, teacher: reg.teacher });
  await send(chatId, `🧒 <b>${esc(reg.full_name)}</b>\n${esc(reg.subject1 || 'Matematika')} (${esc(reg.level || 'Oson')}) + ${esc(reg.subject2 || 'Ingliz tili')} (${esc(reg.level2 || 'Oson')}) · ${test.num_questions} savol\n\n📸 Endi to‘ldirilgan <b>javoblar varaqasi</b> rasmini yuboring.`, {
    reply_markup: { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true }
  });
}

async function pickTest(chatId: number, code: string) {
  const { data: test } = await admin.from('crm_tests').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (!test) { await send(chatId, 'Test topilmadi yoki yopilgan.', { reply_markup: MENU }); return; }
  // Maktab imtihoni: natija tanlangan maktab va sinfdagi o'quvchiga yoziladi
  if (test.kind === 'school') {
    const { data: schools } = await admin.from('crm_schools').select('id,data').order('id');
    const list = (schools || []).map(x => ({ id: x.id as string, name: ((x.data as any)?.name || x.id) as string }));
    await setSession(chatId, 'check_school', { test: code });
    if (list.length === 1) return pickCheckSchool(chatId, list[0].id);
    await send(chatId, `✅ <b>${esc(test.title)}</b>\n\n🏫 Maktabingizni tanlang:`, {
      reply_markup: { inline_keyboard: list.map(x => [{ text: `🏫 ${x.name}`, callback_data: `cs:${x.id}` }]) }
    });
    return;
  }
  await setSession(chatId, 'check_name', { test: code });
  await send(chatId, `✅ <b>${esc(test.title)}</b> tanlandi.\n\nO‘quvchining ism-familiyasini yozing:`, {
    reply_markup: { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true }
  });
}

async function pickCheckSchool(chatId: number, school: string) {
  const s = await getSession(chatId);
  if (!s.data.test) return startCheck(chatId);
  const { data: classes } = await admin.from('crm_classes').select('name').eq('school_id', school);
  const names = (classes || []).map(c => c.name as string).sort((a, b) => a.localeCompare(b, 'uz', { numeric: true }));
  const { data: sc } = await admin.from('crm_schools').select('data').eq('id', school).maybeSingle();
  const sname = (sc?.data as any)?.name || school;
  if (!names.length) return void send(chatId, `🏫 ${esc(sname)}da hali sinflar yo‘q. Administratorga murojaat qiling.`, { reply_markup: SUB1 });
  await setSession(chatId, 'check_class', { ...s.data, school, schoolName: sname });
  const btns = names.map(n => ({ text: n, callback_data: `cc:${n}` }));
  const rows = [];
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
  await send(chatId, `🏫 <b>${esc(sname)}</b>\n\n🗂 Sinfingizni tanlang:`, { reply_markup: { inline_keyboard: rows } });
}

async function pickCheckClass(chatId: number, cls: string) {
  const s = await getSession(chatId);
  if (s.step !== 'check_class' || !s.data.school) return startCheck(chatId);
  await setSession(chatId, 'check_name', { ...s.data, cls });
  await send(chatId, `🏫 ${esc(s.data.schoolName)} · 🗂 <b>${esc(cls)}</b>\n\nO‘quvchining <b>familiya va ismini</b> yozing (CRM’dagi kabi, masalan: Karimov Azizbek):`, {
    reply_markup: { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true }
  });
}

async function downloadTelegramFile(fileId: string) {
  const t = await token();
  const info = await tg(t, 'getFile', { file_id: fileId });
  if (!info.ok) throw new Error('Rasm yuklab olinmadi');
  const res = await fetch(`https://api.telegram.org/file/bot${t}/${info.result.file_path}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function handleSheetPhoto(chatId: number, s: Session, fileId: string) {
  const { data: test } = await admin.from('crm_tests').select('*').eq('code', s.data.test).maybeSingle();
  if (!test) { await setSession(chatId, null); await send(chatId, 'Test topilmadi.', { reply_markup: MENU }); return; }
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'typing' });

  let res;
  try {
    const bytes = await downloadTelegramFile(fileId);
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
    res = readSheet({ gray: rgbaToGray(img.data, img.width, img.height), width: img.width, height: img.height }, { numQuestions: test.num_questions, numOptions: test.num_options });
  } catch (e) {
    await send(chatId, '⚠️ Rasmni o‘qib bo‘lmadi. Iltimos, varaqni oddiy <b>rasm (photo)</b> sifatida yuboring.');
    console.error(e);
    return;
  }
  if (!res.ok) {
    await send(chatId, `⚠️ ${esc(res.error)}\n\nQaytadan rasm yuboring yoki ${BTN_CANCEL}.`);
    return;
  }

  const g = gradeAnswers(res.answers!, test);

  // Maktab imtihoni: tanlangan sinfdagi o'quvchini topib balini yangilash (topilmasa qo'shish)
  let crmLine = '';
  let rec: { student_id: number; matched: boolean; full_name: string } | null = null;
  if (test.kind === 'school' && s.data.school && s.data.cls) {
    const q1 = Number(test.q1_count) ? g.q1 : g.correct;
    const q2 = Number(test.q1_count) ? g.q2 : 0;
    const { data: r, error } = await admin.rpc('crm_bot_record_result', {
      p_school: s.data.school, p_class: s.data.cls, p_name: s.data.name, p_q1: q1, p_q2: q2, p_score: g.score, p_test: test.code,
      p_student_phone: s.data.studentPhone || null, p_parent_phone: s.data.parentPhone || null
    });
    rec = (r as any[])?.[0] || null;
    crmLine = error
      ? '\n⚠️ Natija CRM’ga yozilmadi, administratorga xabar bering.'
      : `\n🗂 CRM: ${esc(s.data.schoolName)} · ${esc(s.data.cls)} · ${esc(rec?.full_name)} — ${rec?.matched ? 'ball yangilandi ✅' : 'sinfga yangi o‘quvchi sifatida qo‘shildi 🆕'}`;
  }

  const { data: sub } = await admin.from('crm_omr_submissions').insert({
    school_id: s.data.school || null,
    class_name: s.data.cls || null,
    student_id: rec?.student_id || null,
    proctor_id: s.data.proctorId || null,
    test_code: test.code,
    source: 'telegram',
    chat_id: chatId,
    student_name: s.data.name,
    answers: res.answers,
    correct: g.correct,
    q1_correct: g.q1,
    q2_correct: g.q2,
    score: g.score,
    details: { wrong: g.wrong, fills: res.fills, rotation: res.rotation }
  }).select('id').single();

  // Kids Mock testi bo'lsa — natija CRM'dagi Kids Mock ro'yxatiga ham tushadi
  if (sub && test.kind === 'mock') {
    // Ariza orqali bo'lsa — bitta arizaga bitta natija (qayta tekshirsa yangilanadi)
    const mockId = s.data.regId ? 700000000 + Number(s.data.regId) : 900000000 + Number(sub.id);
    const q1 = Number(test.q1_count) ? g.q1 : g.correct;
    const q2 = Number(test.q1_count) ? g.q2 : 0;
    await admin.from('crm_mock_students').upsert({
      id: mockId,
      data: {
        id: mockId,
        fullName: s.data.name,
        room: s.data.room || 'Telegram',
        session: test.session || '',
        q1, q2,
        score: g.score,
        source: 'telegram-omr',
        testCode: test.code,
        ...(s.data.regId ? { regId: s.data.regId, subject1: s.data.subject1 || 'Matematika', level: s.data.level || 'Oson', subject2: s.data.subject2 || 'Ingliz tili', level2: s.data.level2 || 'Oson', teacher: s.data.teacher || '' } : {})
      }
    });
    await admin.from('crm_omr_submissions').update({ mock_student_id: mockId }).eq('id', sub.id);
  }

  const wrongList = g.wrong.slice(0, 40).map(w => `${w.q}: ${w.given === '-' ? 'bo‘sh' : w.given === '*' ? '2 ta belgi' : w.given} → <b>${w.right}</b>`).join('\n');
  const pct = g.total ? Math.round((g.correct / g.total) * 100) : 0;
  await send(chatId,
    `✅ <b>${esc(s.data.name)}</b> — ${esc(test.title)}\n\n` +
    `To‘g‘ri javoblar: <b>${g.correct} / ${g.total}</b> (${pct}%)\n` +
    (Number(test.q1_count) ? `1-bo‘lim: ${g.q1} · 2-bo‘lim: ${g.q2}\n` : '') +
    `🏆 Ball: <b>${g.score}</b>\n` +
    crmLine +
    (g.wrong.length ? `\n\n❌ Xatolar (savol: belgilangan → to‘g‘ri):\n${wrongList}${g.wrong.length > 40 ? '\n…' : ''}` : '\n\n🎉 Barcha javoblar to‘g‘ri!'),
    { reply_markup: s.data.proctorId ? { remove_keyboard: true } : SUB1 });
  await notifyAdmin(`📝 OMR: <b>${esc(s.data.name)}</b>${s.data.cls ? ` (${esc(s.data.schoolName)}, ${esc(s.data.cls)})` : ''} · ${esc(test.code)} · ${g.correct}/${g.total} · ${g.score} ball${rec && !rec.matched ? ' · 🆕 yangi o‘quvchi' : ''}${s.data.proctorName ? ` · 👮 ${esc(s.data.proctorName)}` : ''}`);
  if (s.data.proctorId) return prAfterResult(chatId, s);
  await setSession(chatId, null);
}

// ---------------------------------------------------------
// Kids Mock ro'yxatdan o'tish
// ---------------------------------------------------------
type Room = { name: string; capacity: number };

async function pickRoom(session: string): Promise<string> {
  const rooms = await getSetting<Room[]>('mockRooms', [
    { name: '1-xona', capacity: 30 }, { name: '2-xona', capacity: 30 },
    { name: '3-xona', capacity: 30 }, { name: '4-xona', capacity: 30 }
  ]);
  const { data } = await admin.from('crm_mock_registrations').select('room').eq('session', session).neq('status', 'Bekor');
  const counts: Record<string, number> = {};
  (data || []).forEach(r => { counts[r.room as string] = (counts[r.room as string] || 0) + 1; });
  const free = rooms.find(r => (counts[r.name] || 0) < (Number(r.capacity) || 30));
  return free ? free.name : 'Navbatda';
}

async function startReg(chatId: number) {
  await setSession(chatId, 'reg_name', {});
  await send(chatId, '🧒 <b>Kids Mock</b> imtihoniga ro‘yxatdan o‘tish.\n\nFarzandingizning ism-familiyasini yozing:', {
    reply_markup: { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true }
  });
}

async function askGrade(chatId: number) {
  const rows = [];
  for (let i = 1; i <= 11; i += 4) {
    rows.push([i, i + 1, i + 2, i + 3].filter(n => n <= 11).map(n => ({ text: `${n}-sinf`, callback_data: `g:${n}` })));
  }
  rows.push([{ text: 'Maktabgacha', callback_data: 'g:0' }]);
  await send(chatId, 'Nechanchi sinfda o‘qiydi?', { reply_markup: { inline_keyboard: rows } });
}

async function askSubject(chatId: number) {
  await send(chatId, '📚 Kids Mock’da <b>1-fan</b> qaysi bo‘ladi?', {
    reply_markup: { inline_keyboard: [[{ text: '📐 Matematika', callback_data: 'sb:MAT' }, { text: '🇷🇺 Rus tili', callback_data: 'sb:RUS' }]] }
  });
}

async function askLevel(chatId: number, subject: string) {
  await send(chatId, `📚 1-fan: <b>${esc(subject)}</b>\nQaysi daraja?`, {
    reply_markup: { inline_keyboard: [[{ text: '🟢 Oson', callback_data: 'lv:OSON' }, { text: '🔴 Qiyin', callback_data: 'lv:QIYIN' }]] }
  });
}

async function askSubject2(chatId: number, subject1: string) {
  const btns = Object.entries(SUBJECTS2).filter(([, v]) => v !== subject1)
    .map(([k, v]) => ({ text: `${k === 'ENG' ? '🇬🇧' : k === 'RUS' ? '🇷🇺' : '📐'} ${v}`, callback_data: `sb2:${k}` }));
  await send(chatId, `📚 1-fan: <b>${esc(subject1)}</b>\n<b>2-fan</b> qaysi bo‘ladi?`, { reply_markup: { inline_keyboard: [btns] } });
}

async function askLevel2(chatId: number, subject2: string) {
  await send(chatId, `📚 2-fan: <b>${esc(subject2)}</b>\nQaysi daraja?`, {
    reply_markup: { inline_keyboard: [[{ text: '🟢 Oson', callback_data: 'lv2:OSON' }, { text: '🔴 Qiyin', callback_data: 'lv2:QIYIN' }]] }
  });
}

async function askTeacher(chatId: number) {
  await send(chatId, '👩‍🏫 Farzandingizning <b>o‘qituvchisi</b> kim? (familiya va ismini yozing yoki o‘tkazib yuboring)', { reply_markup: SKIP_KB });
}

async function askPhone(chatId: number) {
  await send(chatId, 'Ota-ona telefon raqamini yuboring (pastdagi tugma yoki +998 90 123 45 67 ko‘rinishida):', {
    reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }], [{ text: BTN_CANCEL }]], resize_keyboard: true, one_time_keyboard: true }
  });
}

async function askSession(chatId: number, s: Session) {
  const sessions = await cachedSetting<string[]>('mockSessions', ['2026-11 (Noyabr Mock)']);
  if (sessions.length <= 1) return finishReg(chatId, s, sessions[0] || '');
  await setSession(chatId, 'reg_session', s.data);
  await send(chatId, 'Qaysi imtihon sessiyasiga yozilasiz?', {
    reply_markup: { inline_keyboard: sessions.map((x, i) => [{ text: x, callback_data: `s:${i}` }]) }
  });
}

async function finishReg(chatId: number, s: Session, session: string, username = '') {
  const d = s.data;
  const { data: dup } = await admin.from('crm_mock_registrations').select('id,room').eq('session', session).eq('phone', d.phone).ilike('full_name', d.name).maybeSingle();
  if (dup) {
    await setSession(chatId, null);
    await send(chatId, `ℹ️ <b>${esc(d.name)}</b> allaqachon ro‘yxatdan o‘tgan.\nSessiya: ${esc(session)}\nXona: <b>${esc(dup.room)}</b>`, { reply_markup: MENU });
    return;
  }
  // 🔗 Edutizim: telefon + ism bo'yicha o'quvchini topish. Ustoz allaqachon ariza ochgan bo'lsa — o'shanga qo'shiladi
  const eduSt = await matchEduStudent(d.phone, d.name).catch(() => null);
  if (eduSt) {
    const { data: ex } = await admin.from('crm_mock_registrations').select(REG_T).eq('session', session).eq('edu_student_id', eduSt.id).neq('status', 'Bekor').maybeSingle();
    if (ex) {
      if (ex.chat_id && ex.chat_id !== chatId) {
        await setSession(chatId, null);
        await send(chatId, `ℹ️ <b>${esc(d.name)}</b> allaqachon ro‘yxatdan o‘tgan.\nSessiya: ${esc(session)}\nXona: <b>${esc(ex.room)}</b>`, { reply_markup: MENU });
        return;
      }
      const patch: Record<string, unknown> = { chat_id: chatId, tg_username: username || d.username || null, grade: d.grade, phone: d.phone };
      if (!ex.subject1) Object.assign(patch, { subject1: d.subject1 || 'Matematika', level: d.level || 'Oson' });
      const s1 = (patch.subject1 as string) || ex.subject1;
      if (!ex.subject2 && (d.subject2 || 'Ingliz tili') !== s1) Object.assign(patch, { subject2: d.subject2 || 'Ingliz tili', level2: d.level2 || 'Oson' });
      await admin.from('crm_mock_registrations').update(patch).eq('id', ex.id);
      const r2 = { ...ex, ...patch };
      await setSession(chatId, null);
      const tag = (by?: string | null) => (by ? ` — 👩‍🏫 ${esc(by)}` : '');
      await send(chatId,
        `✅ Ro‘yxatdan o‘tdingiz!\n\n👤 ${esc(r2.full_name)}\n🏫 ${esc(d.grade)}\n📚 ${esc(r2.subject1 || '—')} (${esc(r2.level || '—')})${tag(r2.level_by)}\n📚 ${esc(r2.subject2 || '—')} (${esc(r2.level2 || '—')})${tag(r2.level2_by)}\n🗓 ${esc(session)}\n🚪 Xona: <b>${esc(r2.room)}</b>\n🔖 Ariza raqami: <b>KM-${ex.id}</b>\n\nUstoz belgilagan daraja saqlandi. Imtihondan 1 kun va 2 soat oldin eslatma yuboramiz.`,
        { reply_markup: MENU });
      await askOtherTeachers(r2, await eduLinks(null, eduSt.id), null, '📝 Ota-ona Telegram bot orqali ro‘yxatdan o‘tkazdi.').catch(e => console.error('askTeachers', e));
      return;
    }
  }
  const room = await pickRoom(session);
  const { data: reg } = await admin.from('crm_mock_registrations').insert({
    chat_id: chatId, tg_username: username || d.username || null, full_name: d.name, grade: d.grade, phone: d.phone, session, room,
    subject1: d.subject1 || 'Matematika', level: d.level || 'Oson', subject2: d.subject2 || 'Ingliz tili', level2: d.level2 || 'Oson', teacher: d.teacher || null,
    edu_student_id: eduSt?.id || null
  }).select(REG_T).single();
  await setSession(chatId, null);
  if (eduSt && reg) {
    const links = await eduLinks(null, eduSt.id);
    if (links.length) await askOtherTeachers(reg, links, null, `📝 Ota-ona ro‘yxatdan o‘tkazdi: ${esc(reg.subject1)} (${esc(reg.level)}) + ${esc(reg.subject2)} (${esc(reg.level2)}). Ustoz darajasi ota-ona tanlovidan ustun turadi.`).catch(e => console.error('askTeachers', e));
  }
  const sch = (await cachedSetting<Record<string, any>>('mockSchedule', {}))?.[session];
  const when = sch?.date ? `\n⏰ ${esc(sch.date.split('-').reverse().join('.'))}, soat ${esc(sch.time || '09:00')}${sch.place ? `\n📍 ${esc(sch.place)}` : ''}` : '';
  await send(chatId,
    `✅ Ro‘yxatdan o‘tdingiz!\n\n👤 ${esc(d.name)}\n🏫 ${esc(d.grade)}\n📚 ${esc(d.subject1 || 'Matematika')} (${esc(d.level || 'Oson')}) + ${esc(d.subject2 || 'Ingliz tili')} (${esc(d.level2 || 'Oson')})${d.teacher ? `\n👩‍🏫 ${esc(d.teacher)}` : ''}\n📱 ${esc(d.phone)}\n🗓 ${esc(session)}\n🚪 Xona: <b>${esc(room)}</b>${when}\n🔖 Ariza raqami: <b>KM-${reg?.id ?? ''}</b>\n\nImtihondan 1 kun va 2 soat oldin eslatma yuboramiz. Imtihon kuni shu xabarni ko‘rsating.`,
    { reply_markup: MENU });
  await notifyAdmin(`🧒 Yangi Kids Mock arizasi: <b>${esc(d.name)}</b> · ${esc(d.grade)} · ${esc(d.subject1 || 'Matematika')} (${esc(d.level || 'Oson')}) + ${esc(d.subject2 || 'Ingliz tili')} (${esc(d.level2 || 'Oson')})${d.teacher ? ` · 👩‍🏫 ${esc(d.teacher)}` : ''} · ${esc(d.phone)} · ${esc(room)}`);
}


// ---------------------------------------------------------
// /natija — farzand natijasi (ism yoki telefon bo'yicha)
// ---------------------------------------------------------
type Lookup = { id: number; full_name: string; class_name: string; school_name: string; score: number; grade_key: string; rank: number; total: number };

async function lookup(q: string): Promise<Lookup[]> {
  const { data } = await admin.rpc('crm_parent_lookup', { p_query: q });
  return (data as Lookup[]) || [];
}

function resultLine(r: Lookup) {
  const p = PRIZES[r.rank];
  return `👤 <b>${esc(r.full_name)}</b> — ${esc(r.class_name)}, ${esc(r.school_name)}\n` +
    `   Ball: <b>${r.score}</b> · ${esc(r.grade_key)} orasida <b>#${r.rank}</b> / ${r.total}` +
    (p ? `\n   ${r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'} <b>${p.tier}</b> — ${money(p.amount)} chegirma kartasi` : '');
}

async function startResult(chatId: number) {
  await setSession(chatId, 'natija_q', {});
  await send(chatId, '🏆 Farzandingizning <b>ism-familiyasini</b> (kamida 4 harf) yoki <b>telefon raqamini</b> yozing:', { reply_markup: CANCEL_KB });
}

async function answerResult(chatId: number, q: string) {
  const digits = q.replace(/\D/g, '');
  if (q.trim().length < 4 && digits.length < 9) return void send(chatId, 'Kamida 4 harf yoki to‘liq telefon raqamini yozing.');
  const rows = await lookup(q);
  await setSession(chatId, null);
  if (!rows.length) {
    await send(chatId, '😕 Mos o‘quvchi topilmadi. Ism-familiyani to‘liqroq yoki boshqa telefon raqamini yozib ko‘ring: /natija', { reply_markup: MENU });
    return;
  }
  const top = rows.some(r => r.rank <= 3);
  await send(chatId, `📊 Natijalar (${rows.length}):\n\n${rows.map(resultLine).join('\n\n')}` +
    (top ? '\n\n🏅 Yutuqli kartani olish uchun: /karta' : ''), { reply_markup: MENU });
}

// ---------------------------------------------------------
// /karta — tasdiqlangan telefon orqali yutuqli karta rasmi
// ---------------------------------------------------------
async function startCard(chatId: number) {
  await setSession(chatId, 'karta_phone', {});
  await send(chatId, '🏅 Yutuqli kartani olish uchun pastdagi tugma orqali <b>o‘z telefon raqamingizni</b> yuboring. Raqam CRM’dagi ota-ona raqami bilan solishtiriladi.', {
    reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }], [{ text: BTN_CANCEL }]], resize_keyboard: true, one_time_keyboard: true }
  });
}

async function sendPhotoBytes(chatId: number, png: Uint8Array, caption: string) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'karta.png');
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  return tg(await token(), 'sendPhoto', form);
}

async function answerCard(chatId: number, m: any) {
  const c = m.contact;
  if (!c) return void send(chatId, '📱 Iltimos, pastdagi <b>“Raqamni yuborish”</b> tugmasini bosing.');
  if (c.user_id && m.from?.id && c.user_id !== m.from.id) return void send(chatId, '⚠️ Faqat o‘zingizning raqamingizni yuboring (tugma orqali).');
  const digits = String(c.phone_number || '').replace(/\D/g, '');
  await setSession(chatId, null);
  const rows = (await lookup(digits)).filter(r => String(r.full_name || '').length);
  if (!rows.length) {
    await send(chatId, '😕 Bu raqam CRM’dagi o‘quvchilar ota-onasi raqamlari orasida topilmadi. Maktab yoki markaz administratoriga murojaat qiling: /aloqa', { reply_markup: MENU });
    return;
  }
  const winners = rows.filter(r => r.rank >= 1 && r.rank <= 3);
  if (!winners.length) {
    await send(chatId, `Farzandingiz hozircha parallel TOP-3 da emas:\n\n${rows.map(resultLine).join('\n\n')}\n\nKeyingi bosqichda albatta! 💪`, { reply_markup: MENU });
    return;
  }
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'upload_photo' });
  for (const w of winners) {
    const png = await cardPng({ id: w.id, fullName: w.full_name, className: w.class_name, schoolName: w.school_name, gradeKey: w.grade_key, rank: w.rank });
    const p = PRIZES[w.rank];
    await sendPhotoBytes(chatId, png,
      `🏆 <b>${esc(w.full_name)}</b> (${esc(w.class_name)}, ${esc(w.school_name)})\n${p.tier}\nKarta: <b>${money(p.amount)}</b>\nKod: <code>${promoCode(w.id)}</code>\n⏳ 2 oy davomida amal qiladi`);
  }
  await send(chatId, 'Kartani kassada ko‘rsating yoki promo-kodni ayting. 🎉', { reply_markup: MENU });
  await notifyAdmin(`🏅 Karta olindi (bot): ${winners.map(w => esc(w.full_name)).join(', ')}`);
}

// ---------------------------------------------------------
// /mening — shu Telegram hisobidan yuborilganlar
// ---------------------------------------------------------
async function answerMine(chatId: number) {
  const [{ data: regs }, { data: subs }] = await Promise.all([
    admin.from('crm_mock_registrations').select('id,full_name,grade,session,room,status,created_at,subject1,level,subject2,level2').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10),
    admin.from('crm_omr_submissions').select('student_name,test_code,correct,score,created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10)
  ]);
  const d = (t: string) => new Date(t).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  const parts = [];
  parts.push(regs?.length
    ? '🧒 <b>Kids Mock arizalari:</b>\n' + regs.map(r => `• KM-${r.id} — ${esc(r.full_name)} (${esc(r.grade)}) · ${esc(r.subject1 || 'Matematika')} ${esc(r.level || '')} + ${esc(r.subject2 || 'Ingliz tili')} ${esc(r.level2 || '')}\n   ${esc(r.session)} · 🚪 ${esc(r.room)} · <b>${esc(r.status)}</b>`).join('\n')
    : '🧒 Kids Mock arizalari yo‘q. Yozilish: ' + BTN_REG);
  parts.push(subs?.length
    ? '📝 <b>Tekshirilgan varaqlar:</b>\n' + subs.map(r => `• ${d(r.created_at)} — ${esc(r.student_name)} · ${esc(r.test_code)} · ${r.correct} ta to‘g‘ri · <b>${r.score}</b> ball`).join('\n')
    : '📝 Tekshirilgan varaqlar yo‘q.');
  await send(chatId, parts.join('\n\n'), { reply_markup: MENU });
}

// ---------------------------------------------------------
// /aloqa — markaz ma'lumoti (CRM'da tahrirlanadi)
// ---------------------------------------------------------
async function answerContact(chatId: number) {
  const info = await cachedSetting<string>('centerInfo', '');
  await send(chatId, info ? esc(info) : DEFAULT_CENTER, { reply_markup: MENU, disable_web_page_preview: true });
}

// ---------------------------------------------------------
// /hisobot — kunlik statistika (faqat admin chat/guruh)
// ---------------------------------------------------------
async function answerReport(chatId: number) {
  const adminChat = await getSecret('telegram_admin_chat_id');
  if (!adminChat || String(chatId) !== String(adminChat).trim()) {
    await send(chatId, '⛔ /hisobot faqat admin chatida ishlaydi. Admin chat ID CRM’dagi “🤖 Telegram Bot” bo‘limida kiritiladi.');
    return;
  }
  const now = new Date();
  const tz = 5 * 3600_000; // Asia/Tashkent
  const dayStart = new Date(Math.floor((now.getTime() + tz) / 86400_000) * 86400_000 - tz).toISOString();
  const cnt = async (q: any) => (await q).count ?? 0;
  const [regsToday, regsAll, subsToday, subsAllRows, students, schools, eduStudents, activeTests] = await Promise.all([
    cnt(admin.from('crm_mock_registrations').select('id', { count: 'exact', head: true }).gte('created_at', dayStart)),
    cnt(admin.from('crm_mock_registrations').select('id', { count: 'exact', head: true }).neq('status', 'Bekor')),
    cnt(admin.from('crm_omr_submissions').select('id', { count: 'exact', head: true }).gte('created_at', dayStart)),
    admin.from('crm_omr_submissions').select('score').gte('created_at', dayStart).limit(2000),
    cnt(admin.from('crm_students').select('id', { count: 'exact', head: true })),
    admin.from('crm_schools').select('id', { count: 'exact', head: true }),
    cnt(admin.from('crm_edu_students').select('id', { count: 'exact', head: true })),
    cnt(admin.from('crm_tests').select('code', { count: 'exact', head: true }).eq('active', true))
  ]);
  const scores = (subsAllRows.data || []).map((r: any) => Number(r.score) || 0);
  const avg = scores.length ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : '—';
  const day = now.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  await send(chatId,
    `📊 <b>Kunlik hisobot</b> · ${day}\n\n` +
    `🧒 Kids Mock arizalari: bugun <b>${regsToday}</b> · jami faol <b>${regsAll}</b>\n` +
    `📝 Tekshirilgan varaqlar: bugun <b>${subsToday}</b> · o‘rtacha ball <b>${avg}</b>\n` +
    `📋 Faol testlar: <b>${activeTests}</b>\n` +
    `🏫 Maktablar: <b>${schools.count ?? 0}</b> · o‘quvchilar: <b>${students}</b>\n` +
    `🔗 Edutizim o‘quvchilari: <b>${eduStudents}</b>`);
}


// ---------------------------------------------------------
// 1-bo'lim: 🔑 Javoblar kaliti (faqat CRM'da e'lon qilingan testlar)
// ---------------------------------------------------------
async function startKeys(chatId: number) {
  const { data: tests } = await admin.from('crm_tests').select('code,title,num_questions,kind')
    .eq('answers_published', true).order('created_at', { ascending: false }).limit(20);
  if (!tests?.length) {
    await send(chatId, '🔑 Hozircha e’lon qilingan javoblar yo‘q. Imtihondan keyin javoblar shu yerda paydo bo‘ladi.', { reply_markup: SUB1 });
    return;
  }
  await send(chatId, '🔑 Qaysi imtihon javoblarini ko‘rasiz?', {
    reply_markup: { inline_keyboard: tests.map(t => [{ text: `${t.kind === 'mock' ? '🧒' : '🏫'} ${t.code} — ${t.title}`, callback_data: `k:${t.code}` }]) }
  });
}

async function showKey(chatId: number, code: string) {
  const { data: t } = await admin.from('crm_tests').select('*').eq('code', code).eq('answers_published', true).maybeSingle();
  if (!t) return void send(chatId, 'Bu test javoblari hali e’lon qilinmagan.', { reply_markup: SUB1 });
  const key = String(t.answer_key || '').toUpperCase();
  const cells = [...key].map((a, i) => `${String(i + 1).padStart(2, ' ')}-${a}`);
  const lines = [];
  for (let i = 0; i < cells.length; i += 5) lines.push(cells.slice(i, i + 5).join('  '));
  const split = Number(t.q1_count) ? `\n1-bo‘lim: 1–${t.q1_count} (${t.w1} ball) · 2-bo‘lim: ${Number(t.q1_count) + 1}–${t.num_questions} (${t.w2} ball)` : '';
  await send(chatId,
    `🔑 <b>${esc(t.title)}</b> (${esc(t.code)})\n${t.num_questions} ta savol${split}\n\n<pre>${esc(lines.join('\n'))}</pre>\n` +
    `📸 O‘z varag‘ingizni tekshirish: “${BTN_CHECK}”`, { reply_markup: SUB1 });
}

// ---------------------------------------------------------
// 3-bo'lim: 🏆 TOP-3 sovrindorlar (maktab -> parallel)
// ---------------------------------------------------------
async function startTop(chatId: number) {
  const { data: schools } = await admin.from('crm_schools').select('id,data').order('id');
  const list = (schools || []).map(s => ({ id: s.id as string, name: ((s.data as any)?.name || s.id) as string }));
  if (!list.length) return void send(chatId, 'Maktablar hali kiritilmagan.', { reply_markup: SUB3 });
  if (list.length === 1) return showGrades(chatId, list[0].id);
  await send(chatId, '🏫 Qaysi maktab natijalari?', {
    reply_markup: { inline_keyboard: list.map(s => [{ text: `🏫 ${s.name}`, callback_data: `ts:${s.id}` }]) }
  });
}

async function showGrades(chatId: number, school: string) {
  const { data: grades } = await admin.rpc('crm_school_grades', { p_school: school });
  const { data: sc } = await admin.from('crm_schools').select('data').eq('id', school).maybeSingle();
  const name = (sc?.data as any)?.name || school;
  if (!grades?.length) return void send(chatId, `🏫 ${esc(name)}: hali o‘quvchilar yo‘q.`, { reply_markup: SUB3 });
  const btns = (grades as any[]).map(g => ({ text: g.grade === 'x' ? 'Boshqa' : `${g.grade}-sinflar`, callback_data: `tg:${school}|${g.grade}` }));
  const rows = [];
  for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
  rows.push([{ text: '📋 Barcha parallellar TOP-3', callback_data: `tg:${school}|all` }]);
  await send(chatId, `🏫 <b>${esc(name)}</b> — qaysi parallel?`, { reply_markup: { inline_keyboard: rows } });
}

async function showTop(chatId: number, school: string, grade: string) {
  const { data: rows } = await admin.rpc('crm_top_list', { p_school: school, p_grade: grade === 'all' ? null : grade, p_limit: 3 });
  const { data: sc } = await admin.from('crm_schools').select('data').eq('id', school).maybeSingle();
  const name = (sc?.data as any)?.name || school;
  if (!rows?.length) return void send(chatId, 'Natijalar topilmadi.', { reply_markup: SUB3 });
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
  const groups: Record<string, any[]> = {};
  (rows as any[]).forEach(r => { (groups[r.grade_key] ||= []).push(r); });
  const body = Object.entries(groups).map(([g, list]) =>
    `<b>${esc(g)}</b> (${list[0].total} o‘quvchi)\n` + list.map(r =>
      `${medal(Number(r.rank))} ${esc(r.full_name)} — ${esc(r.class_name)} · <b>${r.score}</b> ball · ${money(PRIZES[Number(r.rank)].amount)}`).join('\n')
  ).join('\n\n');
  await send(chatId, `🏆 <b>${esc(name)} · TOP-3 sovrindorlar</b>\n\n${body}\n\n🔍 Farzandingiz o‘rnini bilish: “${BTN_RESULT}”\n🏅 Sovrindor kartasi: “${BTN_CARD}”`, { reply_markup: SUB3 });
}


// =========================================================
// 👮 NAZORATCHILAR: maktab testi natijalarini yuborish
// maktab → sinf raqami → sinf harfi → ism → o'quvchi tel (ixt.) → ota-ona tel (ixt.) → varaq
// =========================================================
async function getProctor(userId: number) {
  const { data } = await admin.from('crm_proctors').select('*').eq('tg_user_id', userId).eq('active', true).maybeSingle();
  return data;
}

async function startProctor(chatId: number, userId: number) {
  const p = await getProctor(userId);
  if (!p) {
    await setSession(chatId, 'pr_link', {});
    await send(chatId, '👮 <b>Nazoratchilar bo‘limi</b>\n\nBu bo‘lim faqat CRM’da ro‘yxatga olingan nazoratchi va ustozlar uchun. Kirish uchun pastdagi tugma orqali <b>telefon raqamingizni</b> yuboring.', {
      reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }], [{ text: BTN_CANCEL }]], resize_keyboard: true, one_time_keyboard: true }
    });
    return;
  }
  return prChooseSchool(chatId, p);
}

async function linkProctor(chatId: number, m: any) {
  const c = m.contact;
  if (!c) return void send(chatId, '📱 Pastdagi <b>“Raqamni yuborish”</b> tugmasini bosing.');
  if (!c.user_id || c.user_id !== m.from?.id) return void send(chatId, '⚠️ Faqat o‘zingizning raqamingizni tugma orqali yuboring.');
  const digits = String(c.phone_number || '').replace(/\D/g, '').slice(-9);
  const { data: p } = await admin.from('crm_proctors').select('*').eq('phone_digits', digits).eq('active', true).maybeSingle();
  if (!p) {
    await setSession(chatId, null);
    await send(chatId, '⛔ Bu raqam nazoratchilar ro‘yxatida yo‘q. CRM administratoriga murojaat qiling.', { reply_markup: MENU });
    await notifyAdmin(`⛔ Nazoratchilar bo‘limiga kirishga urinish: +998${esc(digits)} (@${esc(m.from?.username || '-')})`);
    return;
  }
  await admin.from('crm_proctors').update({ tg_user_id: m.from.id, tg_username: m.from.username || null, linked_at: new Date().toISOString() }).eq('id', p.id);
  await send(chatId, `✅ Xush kelibsiz, <b>${esc(p.full_name)}</b>! (${p.role === 'ustoz' ? '👩‍🏫 Ustoz' : '👮 Nazoratchi'})`, { reply_markup: { remove_keyboard: true } });
  await notifyAdmin(`👮 ${esc(p.full_name)} Telegram’ni bog‘ladi (@${esc(m.from?.username || '-')})`);
  return prChooseSchool(chatId, p);
}

async function prChooseSchool(chatId: number, p: any) {
  let q = admin.from('crm_schools').select('id,data').order('id');
  if (p.school_id) q = q.eq('id', p.school_id);
  const { data: schools } = await q;
  const list = (schools || []).map(x => ({ id: x.id as string, name: ((x.data as any)?.name || x.id) as string }));
  if (!list.length) return void send(chatId, 'Maktablar topilmadi.', { reply_markup: MENU });
  await setSession(chatId, 'pr_school', { proctorId: p.id, proctorName: p.full_name, schoolFilter: p.school_id || null });
  if (list.length === 1) return prChooseGrade(chatId, list[0].id);
  await send(chatId, '🏫 Maktabni tanlang:\n\n<i>📥 EvalBee’dan yuklab olingan Excel faylni ham shu chatga yuborishingiz mumkin — natijalar CRM’ga yoziladi.</i>', { reply_markup: { inline_keyboard: list.map(x => [{ text: `🏫 ${x.name}`, callback_data: `ps:${x.id}` }]) } });
}

async function prChooseGrade(chatId: number, school: string) {
  const s = await getSession(chatId);
  if (!s.data.proctorId) return;
  if (s.data.schoolFilter && s.data.schoolFilter !== school) return;
  const { data: sc } = await admin.from('crm_schools').select('data').eq('id', school).maybeSingle();
  const schoolName = (sc?.data as any)?.name || school;
  const { data: grades } = await admin.rpc('crm_school_grades', { p_school: school });
  const list = ((grades as any[]) || []).filter(g => g.grade !== 'x');
  if (!list.length) return void send(chatId, `🏫 ${esc(schoolName)}: sinflar yo‘q. CRM’da sinf qo‘shing.`, { reply_markup: MENU });
  await setSession(chatId, 'pr_grade', { ...s.data, school, schoolName });
  const btns = list.map(g => ({ text: `${g.grade}-sinf`, callback_data: `pg:${g.grade}` }));
  const rows = [];
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
  await send(chatId, `🏫 <b>${esc(schoolName)}</b>\n\n🔢 Sinfni tanlang:`, { reply_markup: { inline_keyboard: rows } });
}

async function prChooseLetter(chatId: number, grade: string) {
  const s = await getSession(chatId);
  if (s.step !== 'pr_grade' && s.step !== 'pr_done') return;
  const { data: letters } = await admin.rpc('crm_school_letters', { p_school: s.data.school, p_grade: grade });
  const list = (letters as any[]) || [];
  if (!list.length) return void send(chatId, 'Bu sinfda harflar topilmadi.', { reply_markup: MENU });
  await setSession(chatId, 'pr_letter', { ...s.data, grade });
  const btns = list.map(l => ({ text: l.class_name, callback_data: `pl:${l.class_name}` }));
  const rows = [];
  for (let i = 0; i < btns.length; i += 4) rows.push(btns.slice(i, i + 4));
  await send(chatId, `🔤 <b>${esc(grade)}-sinf</b> — harfini tanlang:`, { reply_markup: { inline_keyboard: rows } });
}

async function prAskName(chatId: number, cls: string) {
  const s = await getSession(chatId);
  if (s.step !== 'pr_letter' && s.step !== 'pr_done') return;
  // Sinf raqami bo'yicha maktab testi avtomatik
  const grade = Number(String(cls).match(/\d+/)?.[0] || s.data.grade);
  const { data: tests } = await admin.from('crm_tests').select('code,title,num_questions').eq('active', true).eq('kind', 'school').contains('grades', [grade]).order('created_at', { ascending: false });
  const test = (tests || [])[0];
  if (!test) return void send(chatId, `⚠️ ${grade}-sinf uchun faol maktab testi topilmadi. CRM → 📝 Testlar’da testga sinflarni belgilang.`, { reply_markup: MENU });
  await setSession(chatId, 'pr_name', { ...s.data, cls, test: test.code, testTitle: test.title, grade });
  await send(chatId, `🏫 ${esc(s.data.schoolName)} · 🗂 <b>${esc(cls)}</b>\n📝 Test: ${esc(test.title)} (${test.num_questions} savol)\n\n👤 O‘quvchining <b>familiya va ismini</b> yozing:`, {
    reply_markup: { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true }
  });
}

const normPhone = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? '+998' + d.slice(-9) : null; };

async function prAfterResult(chatId: number, s: Session) {
  await setSession(chatId, 'pr_done', { proctorId: s.data.proctorId, proctorName: s.data.proctorName, schoolFilter: s.data.schoolFilter, school: s.data.school, schoolName: s.data.schoolName, grade: s.data.grade, cls: s.data.cls });
  await send(chatId, 'Keyingi qadam:', { reply_markup: { inline_keyboard: [
    [{ text: `➕ ${s.data.cls} — keyingi o‘quvchi`, callback_data: 'pn:same' }],
    [{ text: '🔄 Boshqa sinf', callback_data: 'pn:grade' }, { text: '🏁 Tugatish', callback_data: 'pn:end' }]
  ] } });
}

// =========================================================
// 📥 EvalBee: OMR ilovasi natijalari (Excel/CSV) → CRM
// Faqat nazoratchilar yuboradi. Maktab testi yoki Kids Mock tanlanadi.
// =========================================================
const isSheetFile = (d: any) => d && /\.(xlsx|xls|csv)$/i.test(d.file_name || '');

async function handleEvalbeeFile(chatId: number, m: any) {
  const p = await getProctor(m.from?.id);
  if (!p) return void send(chatId, '⛔ Natija faylini faqat CRM’dagi nazoratchi va ustozlar yuboradi. “👮 Nazorat” orqali raqamingizni tasdiqlang.', { reply_markup: MENU });
  if ((m.document.file_size || 0) > 5_000_000) return void send(chatId, '⚠️ Fayl 5 MB dan katta.');
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'typing' });
  let a;
  try {
    const bytes = await downloadTelegramFile(m.document.file_id);
    const wb = XLSX.read(bytes, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }) as unknown[][];
    a = analyze(rows);
  } catch (e) {
    console.error('evalbee parse', e);
    return void send(chatId, '⚠️ Faylni o‘qib bo‘lmadi. EvalBee’dan <b>Excel (.xlsx)</b> yoki <b>CSV</b> ko‘rinishida yuklab yuboring.');
  }
  if (!a.ok || !a.records.length) {
    return void send(chatId,
      '⚠️ Faylda kerakli ustunlar topilmadi.\n\nKerak: <b>ism-familiya</b> va <b>ball</b> (yoki 1-fan/2-fan to‘g‘ri javoblari).\n' +
      `Topilgan sarlavhalar: <code>${esc(a.headers.filter(Boolean).join(' | ').slice(0, 300))}</code>\n\n` +
      'CRM → 📝 Testlar → “📥 EvalBee importi” orqali ustunlarni qo‘lda tanlab yuklashingiz mumkin.');
  }
  const found = Object.keys(a.map).map(k => (FIELDS as any)[k]).join(', ');
  await setSession(chatId, 'eb_target', { proctorId: p.id, proctorName: p.full_name, schoolFilter: p.school_id || null, file: m.document.file_name, records: a.records.slice(0, 600) });
  await send(chatId,
    `📥 <b>${esc(m.document.file_name)}</b>\n👥 ${a.records.length} ta o‘quvchi topildi\n🔎 Ustunlar: ${esc(found)}\n\nNatija qaysi imtihonga yozilsin?`, {
      reply_markup: { inline_keyboard: [[ib('🏫 Maktab testi', 'eb:school'), ib('🧒 Kids Mock', 'eb:mock')], [ib('❌ Bekor qilish', 'eb:cancel')]] }
    });
}

async function ebChooseSchool(chatId: number) {
  const s = await getSession(chatId);
  let q = admin.from('crm_schools').select('id,data').order('id');
  if (s.data.schoolFilter) q = q.eq('id', s.data.schoolFilter);
  const { data: schools } = await q;
  const list = (schools || []).map(x => ({ id: x.id as string, name: ((x.data as any)?.name || x.id) as string }));
  if (!list.length) return void send(chatId, 'Maktablar topilmadi.', { reply_markup: MENU });
  if (list.length === 1) return ebSchoolPicked(chatId, list[0].id);
  await send(chatId, '🏫 Qaysi maktab natijalari?', { reply_markup: { inline_keyboard: list.map(x => [ib(`🏫 ${x.name}`, `ebs:${x.id}`)]) } });
}

async function ebSchoolPicked(chatId: number, school: string) {
  const s = await getSession(chatId);
  if (s.step !== 'eb_target') return;
  if (s.data.schoolFilter && s.data.schoolFilter !== school) return;
  const hasCls = (s.data.records || []).some((r: any) => r.cls);
  if (hasCls) return ebImportSchool(chatId, school, null);
  const { data: classes } = await admin.from('crm_classes').select('name').eq('school_id', school);
  const names = (classes || []).map(c => c.name as string).sort((a, b) => a.localeCompare(b, 'uz', { numeric: true }));
  await setSession(chatId, 'eb_target', { ...s.data, school });
  const rows = [];
  for (let i = 0; i < names.length; i += 4) rows.push(names.slice(i, i + 4).map(n => ib(n, `ebc:${n}`)));
  await send(chatId, '🗂 Faylda sinf ustuni yo‘q. Barcha o‘quvchilar qaysi sinfga yozilsin?', { reply_markup: { inline_keyboard: rows } });
}

async function ebImportSchool(chatId: number, school: string, forcedClass: string | null) {
  const s = await getSession(chatId);
  if (s.step !== 'eb_target') return;
  await setSession(chatId, 'eb_busy', {});
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'typing' });
  const records = (s.data.records || []) as any[];
  const [{ data: classes }, { data: tests }, { data: sc }] = await Promise.all([
    admin.from('crm_classes').select('name').eq('school_id', school),
    admin.from('crm_tests').select('code,title,q1_count,w1,w2,grades').eq('active', true).eq('kind', 'school').order('created_at', { ascending: false }),
    admin.from('crm_schools').select('data').eq('id', school).maybeSingle()
  ]);
  const schoolName = (sc?.data as any)?.name || school;
  const byKey = new Map((classes || []).map(c => [classKey(c.name as string), c.name as string]));
  const testFor = (cls: string) => {
    const g = Number(String(cls).match(/\d+/)?.[0] || 0);
    return (tests || []).find(t => (t.grades || []).includes(g));
  };
  let updated = 0, created = 0;
  const skipped: string[] = [];
  const subs: any[] = [];
  const work = records.map(rec => async () => {
    const cls = forcedClass || byKey.get(classKey(rec.cls));
    if (!cls) { skipped.push(`${rec.name} (sinf: ${rec.cls || '—'})`); return; }
    const t = testFor(cls);
    const sc2 = computeScore(rec, Number(t?.w1) || 1, Number(t?.w2) || 1);
    if (!sc2) { skipped.push(`${rec.name} (ball yo‘q)`); return; }
    const { data: r, error } = await admin.rpc('crm_bot_record_result', {
      p_school: school, p_class: cls, p_name: rec.name, p_q1: sc2.q1, p_q2: sc2.q2, p_score: sc2.score, p_test: t?.code || 'EVALBEE',
      p_student_phone: null, p_parent_phone: rec.phone ? normPhone(rec.phone) : null
    });
    if (error) { skipped.push(`${rec.name} (xato)`); return; }
    const row = (r as any[])?.[0];
    row?.matched ? updated++ : created++;
    subs.push({ test_code: t?.code || 'EVALBEE', source: 'evalbee-bot', chat_id: chatId, student_name: rec.name, correct: rec.correct ?? (sc2.q1 + sc2.q2), q1_correct: sc2.q1, q2_correct: sc2.q2, score: sc2.score, school_id: school, class_name: cls, student_id: row?.student_id || null, proctor_id: s.data.proctorId, details: { file: s.data.file, row: rec.row } });
  });
  for (let i = 0; i < work.length; i += 8) await Promise.all(work.slice(i, i + 8).map(f => f()));
  if (subs.length) await admin.from('crm_omr_submissions').insert(subs);
  await setSession(chatId, null);
  await send(chatId,
    `✅ <b>EvalBee importi tugadi</b> · ${esc(schoolName)}\n\n` +
    `🔄 Yangilandi: <b>${updated}</b>\n🆕 Sinfga yangi qo‘shildi: <b>${created}</b>\n⚠️ O‘tkazib yuborildi: <b>${skipped.length}</b>` +
    (skipped.length ? `\n\n${skipped.slice(0, 15).map(x => '• ' + esc(x)).join('\n')}${skipped.length > 15 ? '\n…' : ''}` : ''),
    { reply_markup: MENU });
  await notifyAdmin(`📥 EvalBee (bot): ${esc(s.data.proctorName || '')} · ${esc(schoolName)} · ${updated} yangilandi, ${created} yangi, ${skipped.length} o‘tkazildi`);
}

async function ebImportMock(chatId: number) {
  const s = await getSession(chatId);
  if (s.step !== 'eb_target') return;
  await setSession(chatId, 'eb_busy', {});
  await tg(await token(), 'sendChatAction', { chat_id: chatId, action: 'typing' });
  const records = (s.data.records || []) as any[];
  const [{ data: regs }, rules] = await Promise.all([
    admin.from('crm_mock_registrations').select('id,full_name,room,session,phone,subject1,level,subject2,level2,teacher').neq('status', 'Bekor'),
    cachedSetting<any>('mockRules', { w1: 1.5, w2: 1 })
  ]);
  const byName = new Map<string, any>();
  (regs || []).forEach(r => byName.set(nameKey(r.full_name), r));
  const byId = new Map((regs || []).map(r => [r.id, r]));
  let matched = 0, extra = 0;
  const skipped: string[] = [];
  const upserts: any[] = [];
  for (const rec of records) {
    const sc2 = computeScore(rec, Number(rules?.w1) || 1.5, Number(rules?.w2) || 1);
    if (!sc2) { skipped.push(`${rec.name} (ball yo‘q)`); continue; }
    const reg = byName.get(nameKey(rec.name)) || (/km/i.test(rec.roll) ? byId.get(regIdOf(rec.roll)) : null);
    const key = nameKey(rec.name);
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 9_000_000;
    const id = reg ? 700000000 + Number(reg.id) : 980000000 + h;
    reg ? matched++ : extra++;
    upserts.push({ id, data: {
      id, fullName: reg?.full_name || rec.name, room: reg?.room || 'EvalBee', session: reg?.session || '', q1: sc2.q1, q2: sc2.q2, score: sc2.score,
      phone: reg?.phone || rec.phone || '', source: 'evalbee',
      ...(reg ? { regId: reg.id, subject1: reg.subject1 || 'Matematika', level: reg.level || 'Oson', subject2: reg.subject2 || 'Ingliz tili', level2: reg.level2 || 'Oson', teacher: reg.teacher || '' } : {})
    } });
  }
  for (let i = 0; i < upserts.length; i += 200) await admin.from('crm_mock_students').upsert(upserts.slice(i, i + 200));
  await setSession(chatId, null);
  await send(chatId,
    `✅ <b>EvalBee importi tugadi</b> · 🧒 Kids Mock\n\n` +
    `🔗 Ariza bilan bog‘landi: <b>${matched}</b>\n➕ Arizasiz qo‘shildi: <b>${extra}</b>\n⚠️ O‘tkazib yuborildi: <b>${skipped.length}</b>` +
    (skipped.length ? `\n\n${skipped.slice(0, 15).map(x => '• ' + esc(x)).join('\n')}` : '') +
    `\n\nNatijalar CRM → 🏆 KIDS MOCK bo‘limida.`, { reply_markup: MENU });
  await notifyAdmin(`📥 EvalBee (bot) · Kids Mock: ${matched} bog‘landi, ${extra} arizasiz, ${skipped.length} o‘tkazildi`);
}

// ---------------------------------------------------------
// 🏠 Bosh menyu va bo'limlar (inline tugmalar bilan)
// ---------------------------------------------------------
async function miniAppUrl() {
  return await cachedSetting<string>('miniAppUrl', '', 300_000);
}

async function sendHome(chatId: number, firstName = '', userId?: number) {
  const [, app] = await Promise.all([
    send(chatId, `👋 Assalomu alaykum${firstName ? ', <b>' + esc(firstName) + '</b>' : ''}!`, { reply_markup: MENU }),
    miniAppUrl()
  ]);
  const rows: any[] = [
    [ib('🧒 Kids Mock’ga yozilish', 'go:reg'), ib('📸 Natijani tekshirish', 'go:check')],
    [ib('🔑 Javoblar kaliti', 'go:keys'), ib('🏆 TOP-3 sovrindorlar', 'go:top')],
    [ib('🔍 Farzandim natijasi', 'go:result'), ib('🏅 Yutuqli karta', 'go:card')]
  ];
  if (app) rows.push([{ text: '📱 Ilovani ochish', web_app: { url: app } }]);
  const caption = '<b>Registan LC</b> — you belong here! 🧡\n\n' +
    '🧒 <b>Kids Mock</b> — imtihonga ro‘yxatdan o‘tish\n' +
    '📸 <b>Natija</b> — varaq rasmini yuborib ballni bilish\n' +
    '🔑 <b>Javoblar</b> — imtihon kalitlari\n' +
    '📊 <b>Natijalar</b> — TOP-3 va yutuqli kartalar\n\n' +
    'Kerakli bo‘limni tanlang 👇';
  const r = await tg(await token(), 'sendPhoto', { chat_id: chatId, photo: BANNER_URL, caption, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  if (!r?.ok) { console.error('tg sendPhoto fail', r?.error_code, r?.description); await send(chatId, caption, { reply_markup: { inline_keyboard: rows } }); }
}

async function sectionMock(chatId: number) {
  const app = await miniAppUrl();
  const rows: any[] = [
    [ib('📝 Ro‘yxatdan o‘tish', 'go:reg'), ib('📋 Arizalarim', 'go:mine')],
    [ib('📸 Natijani tekshirish', 'go:check')]
  ];
  if (app) rows.push([{ text: '📱 Ilovada yozilish', web_app: { url: app } }]);
  await send(chatId,
    '🧒 <b>Kids Mock</b>\n\n' +
    '• 1-fan: Matematika yoki Rus tili (Oson / Qiyin)\n' +
    '• 2-fan: Ingliz tili, Rus tili yoki Matematika (Oson / Qiyin)\n' +
    '• Har fandan 40 ta savol · xona avtomatik beriladi\n\n' +
    'Tanlang 👇', { reply_markup: { inline_keyboard: rows } });
}

async function sectionResults(chatId: number) {
  await send(chatId,
    '📊 <b>Natijalar</b>\n\n' +
    '🔍 Farzandingiz balli va parallel o‘rni\n' +
    '🏆 Maktab va parallel bo‘yicha TOP-3\n' +
    '🏅 Sovrindorlar uchun yutuqli karta\n\n' +
    'Tanlang 👇', {
      reply_markup: { inline_keyboard: [
        [ib('🔍 Farzandim natijasi', 'go:result')],
        [ib('🏆 TOP-3 sovrindorlar', 'go:top'), ib('🏅 Yutuqli karta', 'go:card')]
      ] }
    });
}

async function sendHelp(chatId: number) {
  await send(chatId,
    '📖 <b>Yordam</b>\n\n' +
    `${M_MOCK} — imtihonga yozilish va arizalar\n` +
    `${M_CHECK} — varaq rasmini yuborib ballni bilish\n` +
    `${M_KEYS} — e’lon qilingan javoblar kaliti\n` +
    `${M_RESULTS} — farzand natijasi, TOP-3, yutuqli karta\n` +
    `${M_TEACHER} — ustozlar: o‘quvchilarning Kids Mock darajasini belgilash\n` +
    `${M_PROCTOR} — maktab testlari nazoratchilari uchun\n` +
    '📱 <b>Ilova</b> — pastki chapdagi tugma\n\n' +
    '<b>Buyruqlar:</b> /start · /royxat · /tekshir · /javoblar · /natija · /top · /karta · /mening · /aloqa · /cancel',
    { reply_markup: MENU });
}

// ---------------------------------------------------------
// 👩‍🏫 Ustozlar — Edutizim bilan bog'langan. Ustoz o'z fanidan o'quvchisining
// Kids Mock darajasini (Oson/Qiyin) belgilaydi; o'quvchi markazda boshqa Kids Mock
// fanidan ham o'qisa, o'sha fan ustoziga faqat o'z fanini belgilash uchun xabar boradi.
// ---------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUBJ_BY_CODE: Record<string, string> = { MAT: 'Matematika', RUS: 'Rus tili', ENG: 'Ingliz tili' };
const SUBJ_ICON: Record<string, string> = { 'Matematika': '📐', 'Rus tili': '🇷🇺', 'Ingliz tili': '🇬🇧' };
type Link = { student_id: string; student_name: string; phone: string; parent_phone: string | null; group_id: string; group_name: string; teacher_id: string; teacher_name: string; course: string; subject: string | null };
type Teacher = { tg_id: number; chat_id: number; edu_teacher_id: string; full_name: string; phone: string; status: string; session: string | null };

async function edu(action: string, body: Record<string, unknown> = {}): Promise<any> {
  const secret = await getSecret('cron_secret');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/edutizim-sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action, ...body })
  });
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
}
async function eduLinks(teacher: string | null, student: string | null): Promise<Link[]> {
  const { data, error } = await admin.rpc('crm_edu_links', { p_teacher: teacher, p_student: student });
  if (error) console.error('crm_edu_links', error.message);
  return ((data as Link[]) || []).filter(l => l.subject);
}
async function getTeacher(tg?: number): Promise<Teacher | null> {
  if (!tg) return null;
  const { data } = await admin.from('crm_exam_teachers').select('*').eq('tg_id', tg).maybeSingle();
  return data as Teacher | null;
}
async function mockSessions() { return await cachedSetting<string[]>('mockSessions', ['2026-11 (Noyabr Mock)']); }
async function teacherSession(t: Teacher) {
  const ss = await mockSessions();
  return t.session && ss.includes(t.session) ? t.session : ss[0] || '';
}
const phone998 = (p?: string | null) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? '+998' + d.slice(-9) : ''; };
const lvIcon = (lv?: string | null) => (lv === 'Qiyin' ? '🔴' : '🟢');
// Arizada shu fan qaysi o'rinda (1-fan / 2-fan) va kim belgilagan
function slotOf(reg: any, subject: string): 0 | 1 | 2 { return reg?.subject1 === subject ? 1 : reg?.subject2 === subject ? 2 : 0; }
function levelOf(reg: any, subject: string) {
  const s = slotOf(reg, subject);
  return s === 1 ? { level: reg.level as string, by: reg.level_by as string | null } : s === 2 ? { level: reg.level2 as string, by: reg.level2_by as string | null } : null;
}
const REG_T = 'id,chat_id,full_name,phone,session,room,status,subject1,level,level_by,subject2,level2,level2_by,edu_student_id,teacher';

async function sendOrEdit(chatId: number, msgId: number | undefined, text: string, markup: any) {
  if (msgId) {
    const r = await tg(await token(), 'editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', reply_markup: markup });
    if (r?.ok || /not modified/.test(r?.description || '')) return;
  }
  await send(chatId, text, { reply_markup: markup });
}

// Ism mosligi: Edutizim'dagi ism (birinchi so'z) arizadagi so'zlardan biriga mos bo'lishi shart
const normName = (s: string) => String(s || '').toLowerCase().replace(/[’'`ʻʼ‘]/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length >= 3);
const wordEq = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
async function matchEduStudent(phone: string, name: string): Promise<{ id: string; full_name: string } | null> {
  const digits = String(phone || '').replace(/\D/g, '').slice(-9);
  if (digits.length !== 9) return null;
  const { data } = await admin.rpc('crm_edu_by_phone', { p_digits: digits });
  const words = normName(name);
  const scored = ((data as any[]) || []).map(c => {
    const cw = normName(c.full_name);
    const first = cw[0] && words.some(w => wordEq(w, cw[0]));
    return { c, first, score: cw.filter(x => words.some(w => wordEq(w, x))).length };
  }).filter(x => x.first).sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].c;
}

async function startTeacher(chatId: number, userId?: number) {
  const t = await getTeacher(userId);
  if (t?.status === 'blocked') return void send(chatId, '⛔ Ustozlar bo‘limiga kirish yopilgan. Administratorga murojaat qiling: /aloqa', { reply_markup: MENU });
  if (t) { await setSession(chatId, null); return teacherHome(chatId, t); }
  await setSession(chatId, 't_contact', {});
  await send(chatId,
    '👩‍🏫 <b>Ustozlar bo‘limi</b>\n\nBu yerda o‘quvchilaringizning Kids Mock darajasini (🟢 Oson / 🔴 Qiyin) belgilaysiz.\n\n' +
    'Ulanish uchun <b>Edutizim’dagi raqamingizni</b> pastdagi tugma orqali yuboring 👇', {
      reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }], [{ text: BTN_CANCEL }]], resize_keyboard: true, one_time_keyboard: true }
    });
}

async function linkTeacher(chatId: number, m: any) {
  if (!m.contact) return void send(chatId, 'Pastdagi “📱 Raqamni yuborish” tugmasini bosing yoki ❌ Bekor qilish.');
  if (m.contact.user_id !== m.from?.id) return void send(chatId, 'Faqat <b>o‘zingizning</b> raqamingizni yuboring (pastdagi tugma orqali).');
  const digits = String(m.contact.phone_number || '').replace(/\D/g, '').slice(-9);
  const old = await getTeacher(m.from.id);
  if (old?.status === 'blocked') { await setSession(chatId, null); return void send(chatId, '⛔ Kirish yopilgan. /aloqa', { reply_markup: MENU }); }
  await send(chatId, '⏳ Edutizim’dan tekshirilmoqda…', { reply_markup: { remove_keyboard: true } });
  const r = await edu('employees');
  if (!r?.ok) { await setSession(chatId, null); return void send(chatId, '⚠️ Edutizim bilan bog‘lanib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.', { reply_markup: MENU }); }
  const emps = ((r.employees || []) as any[]).filter(e => e.digits === digits);
  let emp: any = null, links: Link[] = [];
  for (const e of emps) { const l = await eduLinks(e.id, null); if (l.length || !emp) { emp = e; links = l; } if (l.length) break; }
  await setSession(chatId, null);
  if (!emp) {
    await notifyAdmin(`👩‍🏫 Imtihon botiga ustoz bo‘lib ulanmoqchi: ${esc(m.from?.first_name || '')} · +998${digits} — Edutizim xodimlarida topilmadi.`);
    return void send(chatId, `❌ <b>+998${digits}</b> raqami Edutizim xodimlari ro‘yxatida topilmadi.\nEdutizim’dagi raqamingiz shu raqam bilan bir xil ekanini tekshiring yoki administratorga yozing: /aloqa`, { reply_markup: MENU });
  }
  const t: Teacher = { tg_id: m.from.id, chat_id: chatId, edu_teacher_id: emp.id, full_name: emp.name, phone: '+998' + digits, status: 'active', session: old?.session || null };
  await admin.from('crm_exam_teachers').upsert({ ...t, updated_at: new Date().toISOString() });
  const subjects = [...new Set(links.map(l => l.subject!))];
  const n = new Set(links.map(l => l.student_id)).size;
  await notifyAdmin(`👩‍🏫 Imtihon botiga ustoz ulandi: <b>${esc(emp.name)}</b> · ${esc(subjects.join(', ') || 'Kids Mock fani yo‘q')} · ${n} o‘quvchi`, { inline_keyboard: [[ib('🚫 Bloklash', `tb:${m.from.id}`)]] });
  await send(chatId, `✅ <b>${esc(emp.name)}</b>, siz ustoz sifatida ulandingiz!`, { reply_markup: MENU });
  return teacherHome(chatId, t);
}

async function teacherStudents(t: Teacher, session: string) {
  const links = await eduLinks(t.edu_teacher_id, null);
  const ids = [...new Set(links.map(l => l.student_id))];
  const regs: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin.from('crm_mock_registrations').select(REG_T).eq('session', session).in('edu_student_id', ids.slice(i, i + 150)).neq('status', 'Bekor');
    regs.push(...(data || []));
  }
  const byStudent = new Map(regs.map(r => [r.edu_student_id, r]));
  const seen = new Set<string>();
  const rows = links.filter(l => { const k = `${l.student_id}|${l.subject}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(l => { const reg = byStudent.get(l.student_id); const lv = levelOf(reg, l.subject!); return { ...l, reg, mark: lv?.by ? lv : null }; })
    .sort((a, b) => a.student_name.localeCompare(b.student_name));
  return rows;
}

async function teacherHome(chatId: number, t: Teacher, msgId?: number) {
  const session = await teacherSession(t);
  const [rows, ss] = await Promise.all([teacherStudents(t, session), mockSessions()]);
  const subjects = [...new Set(rows.map(r => r.subject!))];
  if (!rows.length) {
    return sendOrEdit(chatId, msgId, `👩‍🏫 <b>${esc(t.full_name)}</b>\n\nEdutizim’da sizning aktiv guruhlaringizda Kids Mock fanlari (Matematika, Rus tili, Ingliz tili) bo‘yicha o‘quvchi topilmadi.\nGuruh yaqinda ochilgan bo‘lsa, ma’lumotlar har soatda yangilanadi.`, { inline_keyboard: [[ib('🔄 Yangilash', 'tm:h')]] });
  }
  const done = rows.filter(r => r.mark).length;
  const kb: any[] = [
    [ib(`⬜ Belgilanmaganlar (${rows.length - done})`, 'tm:u:0'), ib(`👥 Hammasi (${rows.length})`, 'tm:a:0')]
  ];
  if (ss.length > 1) kb.push([ib('🗓 Sessiyani almashtirish', 'tse')]);
  kb.push([ib('🔄 Yangilash', 'tm:h')]);
  await sendOrEdit(chatId, msgId,
    `👩‍🏫 <b>${esc(t.full_name)}</b>\n` +
    `📚 ${subjects.map(s => `${SUBJ_ICON[s] || ''} ${esc(s)}`).join(' · ')}\n` +
    `🗓 Sessiya: <b>${esc(session)}</b>\n\n` +
    `👥 O‘quvchilar: <b>${rows.length}</b>\n✅ Daraja belgilangan: <b>${done}</b>\n⬜ Qolgan: <b>${rows.length - done}</b>\n\n` +
    'O‘quvchini tanlab, o‘z faningizdan darajasini belgilang. Ikkinchi fanidan boshqa ustozda o‘qisa, unga avtomatik xabar boradi.', { inline_keyboard: kb });
}

async function teacherList(chatId: number, t: Teacher, mode: string, page: number, msgId?: number) {
  const session = await teacherSession(t);
  const all = await teacherStudents(t, session);
  const rows = mode === 'u' ? all.filter(r => !r.mark) : all;
  const per = 10, pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(Math.max(0, page), pages - 1);
  const multi = new Set(all.map(r => r.subject)).size > 1;
  const kb: any[] = rows.slice(p * per, p * per + per).map(r => [ib(
    `${r.mark ? lvIcon(r.mark.level) : '⬜'} ${r.student_name}${multi ? ` · ${SUBJ_ICON[r.subject!] || r.subject}` : ''}`.slice(0, 60), `tp:${r.student_id}:${SC[r.subject!]}`)]);
  const nav: any[] = [];
  if (p > 0) nav.push(ib('◀️', `tm:${mode}:${p - 1}`));
  if (pages > 1) nav.push(ib(`${p + 1}/${pages}`, 'noop'));
  if (p < pages - 1) nav.push(ib('▶️', `tm:${mode}:${p + 1}`));
  if (nav.length) kb.push(nav);
  kb.push([ib(mode === 'u' ? '👥 Hammasi' : '⬜ Belgilanmaganlar', `tm:${mode === 'u' ? 'a' : 'u'}:0`), ib('⬅️ Panel', 'tm:h')]);
  const head = mode === 'u' ? `⬜ <b>Belgilanmagan o‘quvchilar</b> — ${rows.length} ta` : `👥 <b>Barcha o‘quvchilar</b> — ${rows.length} ta`;
  await sendOrEdit(chatId, msgId, rows.length ? `${head}\n🗓 ${esc(session)}\n\n🟢 Oson · 🔴 Qiyin · ⬜ belgilanmagan` : '🎉 Hamma o‘quvchilaringizga daraja belgilangan!', { inline_keyboard: kb });
}

async function teacherPick(chatId: number, t: Teacher, sid: string, code: string, msgId?: number) {
  const subject = SUBJ_BY_CODE[code];
  const links = await eduLinks(null, sid);
  const mine = links.find(l => l.teacher_id === t.edu_teacher_id && l.subject === subject);
  if (!mine) return void send(chatId, '⛔ Bu o‘quvchi sizning guruhingizda emas.');
  const session = await teacherSession(t);
  const { data: reg } = await admin.from('crm_mock_registrations').select(REG_T).eq('session', session).eq('edu_student_id', sid).neq('status', 'Bekor').maybeSingle();
  const cur = levelOf(reg, subject);
  const others = [...new Set(links.filter(l => l.subject !== subject).map(l => `${SUBJ_ICON[l.subject!] || ''} ${l.subject} — ${l.teacher_name}`))];
  await sendOrEdit(chatId, msgId,
    `👤 <b>${esc(mine.student_name)}</b>\n👥 ${esc(mine.group_name)}\n${SUBJ_ICON[subject]} Fan: <b>${esc(subject)}</b>\n` +
    (cur ? `Hozir: ${lvIcon(cur.level)} <b>${esc(cur.level)}</b>${cur.by ? ` (${esc(cur.by)})` : ' (ota-ona tanlagan)'}\n` : '') +
    (others.length ? `\nIkkinchi fan: ${others.map(esc).join('; ')}\n` : '') +
    '\nKids Mock darajasini tanlang 👇', {
      inline_keyboard: [[ib('🟢 Oson', `tl:${sid}:${code}:O`), ib('🔴 Qiyin', `tl:${sid}:${code}:Q`)], [ib('⬅️ Ro‘yxat', 'tm:u:0')]]
    });
}

// Arizani topish: avval Edutizim ID bo'yicha, bo'lmasa ota-ona yozgan arizani telefon+ism bilan bog'lash
async function findOrLinkReg(session: string, l: Link) {
  const { data: reg } = await admin.from('crm_mock_registrations').select(REG_T).eq('session', session).eq('edu_student_id', l.student_id).neq('status', 'Bekor').maybeSingle();
  if (reg) return reg;
  const phones = [phone998(l.phone), phone998(l.parent_phone)].filter(Boolean);
  if (!phones.length) return null;
  const { data: cands } = await admin.from('crm_mock_registrations').select(REG_T).eq('session', session).is('edu_student_id', null).in('phone', phones).neq('status', 'Bekor');
  const ew = normName(l.student_name);
  const hit = (cands || []).filter(c => { const w = normName(c.full_name); return ew[0] && w.some(x => wordEq(x, ew[0])); });
  if (hit.length !== 1) return null;
  await admin.from('crm_mock_registrations').update({ edu_student_id: l.student_id }).eq('id', hit[0].id);
  return { ...hit[0], edu_student_id: l.student_id };
}

// O'quvchining boshqa Kids Mock fanlari ustozlariga "darajani belgilang" xabari
async function askOtherTeachers(reg: any, links: Link[], exceptSubject: string | null, note: string) {
  const notified: string[] = [], missing: string[] = [];
  const bySubject = new Map<string, Link>();
  links.filter(l => l.subject !== exceptSubject).forEach(l => { if (!bySubject.has(l.subject!)) bySubject.set(l.subject!, l); });
  for (const [subject, l] of bySubject) {
    if (levelOf(reg, subject)?.by) continue;
    const { data: ts } = await admin.from('crm_exam_teachers').select('chat_id,full_name').eq('edu_teacher_id', l.teacher_id).eq('status', 'active');
    if (!ts?.length) { missing.push(`${subject} — ${l.teacher_name}`); continue; }
    for (const t of ts) {
      await send(t.chat_id,
        `🧒 <b>Kids Mock</b> · ${esc(reg.session || '')}\n👤 <b>${esc(l.student_name)}</b> (${esc(l.group_name)})\n${note}\n\n` +
        `Siz o‘qitadigan ${SUBJ_ICON[subject] || ''} <b>${esc(subject)}</b> fanidan darajasini belgilang 👇`,
        { reply_markup: { inline_keyboard: [[ib('🟢 Oson', `tl:${l.student_id}:${SC[subject]}:O`), ib('🔴 Qiyin', `tl:${l.student_id}:${SC[subject]}:Q`)]] } });
    }
    notified.push(`${subject} — ${l.teacher_name}`);
  }
  if (missing.length) await notifyAdmin(`⚠️ Kids Mock: <b>${esc(reg.full_name)}</b> (KM-${reg.id}) uchun ${missing.map(esc).join('; ')} ustozi imtihon botiga ulanmagan — darajani CRM’da kiriting yoki ustozni botga ulang (👩‍🏫 Ustozlar).`);
  return { notified, missing };
}

async function teacherSetLevel(chatId: number, t: Teacher, sid: string, code: string, L: string, msgId?: number) {
  const subject = SUBJ_BY_CODE[code];
  const level = L === 'Q' ? 'Qiyin' : 'Oson';
  if (!subject) return;
  const links = await eduLinks(null, sid);
  const mine = links.find(l => l.teacher_id === t.edu_teacher_id && l.subject === subject);
  if (!mine) return void send(chatId, '⛔ Bu o‘quvchi sizning guruhingizda emas.');
  const session = await teacherSession(t);
  let reg: any = await findOrLinkReg(session, mine);
  if (!reg) {
    const { data, error } = await admin.from('crm_mock_registrations').insert({
      full_name: mine.student_name, phone: phone998(mine.parent_phone) || phone998(mine.phone) || null, session, room: await pickRoom(session),
      source: 'teacher', edu_student_id: sid, teacher: t.full_name
    }).select(REG_T).single();
    if (error || !data) { console.error('teacher reg insert', error?.message); return void send(chatId, '⚠️ Saqlab bo‘lmadi, qayta urinib ko‘ring.'); }
    reg = data;
  }
  // Fan qaysi o'ringa yoziladi: 1-fan faqat Matematika/Rus tili; ustoz belgilagan o'rin boshqa ustoz tomonidan almashtirilmaydi
  let slot = slotOf(reg, subject);
  if (!slot) {
    const free2 = !reg.subject2 || !reg.level2_by;
    if (subject === 'Ingliz tili') slot = free2 ? 2 : 0;
    else if (!reg.subject1) slot = 1;
    else if (!reg.subject2) slot = 2;
    else if (!reg.level_by) slot = 1;
    else if (free2) slot = 2;
  }
  if (!slot) return void send(chatId, `ℹ️ <b>${esc(mine.student_name)}</b> uchun ikkala fan boshqa ustozlar tomonidan belgilangan. O‘zgartirish kerak bo‘lsa, administratorga yozing.`);
  const patch: Record<string, unknown> = slot === 1 ? { subject1: subject, level, level_by: t.full_name } : { subject2: subject, level2: level, level2_by: t.full_name };
  const after = { ...reg, ...patch };
  patch.teacher = [...new Set([after.level_by, after.level2_by].filter(Boolean))].join(', ') || t.full_name;
  const { error } = await admin.from('crm_mock_registrations').update(patch).eq('id', reg.id);
  if (error) return void send(chatId, '⚠️ Saqlab bo‘lmadi, qayta urinib ko‘ring.');
  Object.assign(reg, patch);

  const other = await askOtherTeachers(reg, links, subject, `✅ ${SUBJ_ICON[subject]} ${esc(subject)}: <b>${esc(level)}</b> — ${esc(t.full_name)} belgiladi.`);
  const hasOther = links.some(l => l.subject !== subject);
  const lines = [
    `✅ Saqlandi: <b>${esc(mine.student_name)}</b>`,
    `${SUBJ_ICON[subject]} ${esc(subject)}: ${lvIcon(level)} <b>${esc(level)}</b>`,
    `🔖 KM-${reg.id} · 🚪 ${esc(reg.room || '')}`
  ];
  if (other.notified.length) lines.push(`\n📨 Ikkinchi fan ustoziga xabar yuborildi: ${other.notified.map(esc).join('; ')}`);
  if (other.missing.length) lines.push(`\n⚠️ ${other.missing.map(esc).join('; ')} — ustoz botga hali ulanmagan, admin xabardor qilindi.`);
  if (!hasOther && !(slot === 1 ? reg.subject2 : reg.subject1)) lines.push('\nℹ️ O‘quvchi markazda boshqa Kids Mock fanidan o‘qimaydi — 2-fanni ota-ona ro‘yxatda tanlaydi yoki admin kiritadi.');
  await sendOrEdit(chatId, msgId, lines.join('\n'), { inline_keyboard: [[ib('⬜ Keyingi o‘quvchi', 'tm:u:0'), ib('⬅️ Panel', 'tm:h')]] });
  if (reg.chat_id) await send(reg.chat_id, `👩‍🏫 Ustoz <b>${esc(t.full_name)}</b> farzandingiz <b>${esc(reg.full_name)}</b> uchun Kids Mock’da ${SUBJ_ICON[subject]} ${esc(subject)} fanidan <b>${esc(level)}</b> darajani belgiladi.\n🔖 KM-${reg.id} · 🚪 ${esc(reg.room || '')}`).catch(() => {});
}

async function teacherSessions(chatId: number, msgId?: number) {
  const ss = await mockSessions();
  await sendOrEdit(chatId, msgId, '🗓 Qaysi Kids Mock sessiyasi uchun belgilaysiz?', { inline_keyboard: [...ss.map((x, i) => [ib(x, `tss:${i}`)]), [ib('⬅️ Panel', 'tm:h')]] });
}

// ---------------------------------------------------------
// Update router
// ---------------------------------------------------------
async function onMessage(m: any) {
  const chatId = m.chat.id as number;
  const raw = (m.text || '').trim();
  // "/natija@BotName" -> "/natija"
  const text = raw.startsWith('/') ? raw.split(/\s+/)[0].split('@')[0].toLowerCase() : raw;
  if (m.chat.type !== 'private') {
    if (text === '/id') await send(chatId, `Chat ID: <code>${chatId}</code>`);
    if (text === '/hisobot') await answerReport(chatId);
    return;
  }
  if (text === '/start' || text === '/menu' || text === BTN_HOME) {
    await setSession(chatId, null);
    return sendHome(chatId, m.from?.first_name || '', m.from?.id);
  }
  if (text === BTN_CANCEL || text === '/cancel') {
    await Promise.all([setSession(chatId, null), send(chatId, '❌ Bekor qilindi. Kerakli bo‘limni tanlang 👇', { reply_markup: MENU })]);
    return;
  }
  if (text === '/id') { await send(chatId, `Chat ID: <code>${chatId}</code>`); return; }
  // Bo'limlar
  if (text === M_MOCK || text === BTN_SEC2) { await Promise.all([setSession(chatId, null), sectionMock(chatId)]); return; }
  if (text === M_RESULTS || text === BTN_SEC3) { await Promise.all([setSession(chatId, null), sectionResults(chatId)]); return; }
  if (text === BTN_SEC1) { await Promise.all([setSession(chatId, null), startKeys(chatId)]); return; }
  if (text === M_KEYS || text === BTN_KEYS || text === '/javoblar') return startKeys(chatId);
  if (text === BTN_TOP || text === '/top') return startTop(chatId);
  if (text === M_CHECK || text === BTN_CHECK || text === OLD_CHECK || text === '/tekshir') return startCheck(chatId);
  if (text === BTN_REG || text === OLD_REG || text === '/royxat') return startReg(chatId);
  if (text === BTN_RESULT || text === OLD_RESULT || text === '/natija') return startResult(chatId);
  if (text === BTN_CARD || text === '/karta') return startCard(chatId);
  if (text === BTN_MINE || text === '/mening') { await Promise.all([setSession(chatId, null), answerMine(chatId)]); return; }
  if (text === M_CONTACT || text === BTN_CONTACT || text === '/aloqa') { await Promise.all([setSession(chatId, null), answerContact(chatId)]); return; }
  if (text === '/hisobot') return answerReport(chatId);
  if (text === M_PROCTOR || text === BTN_PROCTOR || text === '/nazorat') return startProctor(chatId, m.from?.id);
  if (text === M_HELP || text === BTN_HELP || text === '/yordam' || text === '/help') return sendHelp(chatId);
  if (text === M_TEACHER || text === '/ustoz') return startTeacher(chatId, m.from?.id);
  if (text === '/admin') return void send(chatId, `🛠 Edutizim boshqaruvi alohida botga ko‘chirildi (CRM → 🤖 Telegram Bot → “Edutizim boti”).\nTelegram ID’ingiz: <code>${m.from?.id}</code>`, { reply_markup: MENU });

  if (isSheetFile(m.document)) return handleEvalbeeFile(chatId, m);

  const s = await getSession(chatId);
  switch (s.step) {
    case 'pr_link':
      return linkProctor(chatId, m);
    case 't_contact':
      return linkTeacher(chatId, m);
    case 'pr_name':
      if (text.length < 3) return void send(chatId, 'Familiya va ismni to‘liq yozing.');
      await setSession(chatId, 'pr_sphone', { ...s.data, name: text.slice(0, 80) });
      return void send(chatId, '📱 O‘quvchining telefon raqami <i>(ixtiyoriy)</i>:', { reply_markup: SKIP_KB });
    case 'pr_sphone': {
      const ph = text === BTN_SKIP ? null : normPhone(text);
      if (text !== BTN_SKIP && !ph) return void send(chatId, 'Raqamni to‘g‘ri yozing (masalan +998 90 123 45 67) yoki “O‘tkazib yuborish”.');
      await setSession(chatId, 'pr_pphone', { ...s.data, studentPhone: ph });
      return void send(chatId, '👨‍👩‍👧 Ota-onasining telefon raqami <i>(ixtiyoriy)</i>:', { reply_markup: SKIP_KB });
    }
    case 'pr_pphone': {
      const ph = text === BTN_SKIP ? null : normPhone(text);
      if (text !== BTN_SKIP && !ph) return void send(chatId, 'Raqamni to‘g‘ri yozing yoki “O‘tkazib yuborish”.');
      await setSession(chatId, 'check_photo', { ...s.data, parentPhone: ph });
      return void send(chatId, `📸 <b>${esc(s.data.name)}</b> — endi to‘ldirilgan <b>natijalar varag‘i</b> rasmini yuboring.\n4 ta qora burchak kadrga to‘liq tushsin.`, {
        reply_markup: { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true }
      });
    }
    case 'natija_q':
      return answerResult(chatId, raw);
    case 'karta_phone':
      return answerCard(chatId, m);
    case 'check_name':
      if (text.length < 3) return void send(chatId, 'Ism-familiyani to‘liq yozing.');
      await setSession(chatId, 'check_photo', { ...s.data, name: text.slice(0, 80) });
      await send(chatId, '📸 Endi to‘ldirilgan <b>javoblar varaqasi</b> rasmini yuboring.\nVaraq tekis, yorug‘ joyda, 4 ta qora burchak ko‘rinib tursin.');
      return;
    case 'check_photo': {
      const photo = m.photo?.length ? m.photo.reduce((b: any, p: any) => (Math.max(p.width, p.height) <= 2600 && p.width * p.height > b.width * b.height ? p : b), m.photo[0]) : null;
      const doc = m.document && /image\/jpe?g/.test(m.document.mime_type || '') ? m.document : null;
      if (!photo && !doc) return void send(chatId, '📸 Iltimos, varaq <b>rasmini</b> yuboring.');
      return handleSheetPhoto(chatId, s, (photo || doc).file_id);
    }
    case 'reg_name':
      if (text.length < 3) return void send(chatId, 'Ism-familiyani to‘liq yozing.');
      await setSession(chatId, 'reg_grade', { name: text.slice(0, 80), username: m.from?.username || '' });
      return askGrade(chatId);
    case 'reg_grade':
      if (!text) return askGrade(chatId);
      await setSession(chatId, 'reg_subject', { ...s.data, grade: text.slice(0, 30) });
      return askSubject(chatId);
    case 'reg_subject':
      return askSubject(chatId);
    case 'reg_level':
      return askLevel(chatId, s.data.subject1 || 'Matematika');
    case 'reg_subject2':
      return askSubject2(chatId, s.data.subject1 || 'Matematika');
    case 'reg_level2':
      return askLevel2(chatId, s.data.subject2 || 'Ingliz tili');
    case 'reg_teacher': {
      const teacher = text === BTN_SKIP ? '' : text.replace(/\s+/g, ' ').slice(0, 80);
      if (text !== BTN_SKIP && teacher.length < 3) return void send(chatId, 'O‘qituvchining familiya va ismini yozing yoki “O‘tkazib yuborish”.');
      await setSession(chatId, 'reg_phone', { ...s.data, teacher });
      return askPhone(chatId);
    }
    case 'reg_phone': {
      const rawPhone = m.contact?.phone_number || text;
      const digits = String(rawPhone).replace(/\D/g, '');
      if (digits.length < 9) return void send(chatId, 'Telefon raqamini to‘g‘ri kiriting, masalan: +998 90 123 45 67');
      const phone = '+998' + digits.slice(-9);
      s.data.phone = phone;
      await setSession(chatId, 'reg_phone_done', s.data);
      await send(chatId, '✅ Raqam qabul qilindi.', { reply_markup: { remove_keyboard: true } });
      return askSession(chatId, s);
    }
    default:
      // Mini App'dan "Raqamni ulashish" — CRM'dagi nazoratchi bo'lsa avtomatik bog'lanadi (parolsiz)
      if (m.contact && m.contact.user_id === m.from?.id) {
        const digits = String(m.contact.phone_number || '').replace(/\D/g, '').slice(-9);
        const { data: p } = await admin.from('crm_proctors').select('id,full_name,role,tg_user_id').eq('phone_digits', digits).eq('active', true).maybeSingle();
        if (p) {
          if (p.tg_user_id !== m.from.id) await admin.from('crm_proctors').update({ tg_user_id: m.from.id, tg_username: m.from.username || null, linked_at: new Date().toISOString() }).eq('id', p.id);
          return void send(chatId, `✅ ${esc(p.full_name)}, siz ${p.role === 'ustoz' ? 'ustoz' : 'nazoratchi'} sifatida tasdiqlandingiz. Mini App’da “🏫 Maktab” bo‘limi ochildi, botda esa “${BTN_PROCTOR}” tugmasi.`, { reply_markup: MENU });
        }
      }
      await send(chatId, 'Kerakli bo‘limni tanlang 👇', { reply_markup: MENU });
  }
}

async function onCallback(q: any) {
  // Tugma tasdig'i javob bilan parallel ketadi (foydalanuvchi kutmaydi)
  const ack = token().then(t => tg(t, 'answerCallbackQuery', { callback_query_id: q.id })).catch(() => {});
  try {
    await routeCallback(q);
  } finally {
    await ack;
  }
}

async function routeCallback(q: any) {
  // Shaxsiy chatda chat ID = foydalanuvchi ID; Telegram ba'zan callback'da message'ni yubormaydi
  const chatId = (q.message?.chat?.id ?? q.from?.id) as number;
  const data = String(q.data || '');
  if (!chatId) return;
  if (data.startsWith('go:')) {
    const go = data.slice(3);
    // O'z sessiyasini yozadigan bo'limlar sessiyani o'zi almashtiradi; qolganlarida tozalash parallel
    const reset = ['reg', 'check', 'result', 'card', 'proctor'].includes(go) ? Promise.resolve() : setSession(chatId, null);
    try {
      switch (go) {
        case 'reg': return await startReg(chatId);
        case 'mine': return await answerMine(chatId);
        case 'check': return await startCheck(chatId);
        case 'keys': return await startKeys(chatId);
        case 'top': return await startTop(chatId);
        case 'result': return await startResult(chatId);
        case 'card': return await startCard(chatId);
        case 'mock': return await sectionMock(chatId);
        case 'results': return await sectionResults(chatId);
        case 'contact': return await answerContact(chatId);
        case 'help': return await sendHelp(chatId);
        case 'proctor': return await startProctor(chatId, q.from?.id);
        case 'teacher': return await startTeacher(chatId, q.from?.id);
        default: return await sendHome(chatId, q.from?.first_name || '', q.from?.id);
      }
    } finally {
      await reset;
    }
  }
  if (data === 'noop') return;
  // 👩‍🏫 Ustozlar
  if (data.startsWith('tb:')) {
    const adminChat = Number(await getSecret('telegram_admin_chat_id'));
    const owners = await getSetting<number[]>('botAdmins', []);
    if (chatId !== adminChat && !owners.map(Number).includes(Number(q.from?.id))) return;
    const { data: bt } = await admin.from('crm_exam_teachers').update({ status: 'blocked', updated_at: new Date().toISOString() }).eq('tg_id', Number(data.slice(3))).select('full_name').maybeSingle();
    if (q.message?.message_id) await tg(await token(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[ib('✅ Blokdan chiqarish', `tu:${data.slice(3)}`)]] } }).catch(() => {});
    return void send(chatId, `🚫 Ustoz bloklandi: ${esc(bt?.full_name || data.slice(3))}`);
  }
  if (data.startsWith('tu:')) {
    const adminChat = Number(await getSecret('telegram_admin_chat_id'));
    const owners = await getSetting<number[]>('botAdmins', []);
    if (chatId !== adminChat && !owners.map(Number).includes(Number(q.from?.id))) return;
    const { data: bt } = await admin.from('crm_exam_teachers').update({ status: 'active', updated_at: new Date().toISOString() }).eq('tg_id', Number(data.slice(3))).select('full_name').maybeSingle();
    if (q.message?.message_id) await tg(await token(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[ib('🚫 Bloklash', `tb:${data.slice(3)}`)]] } }).catch(() => {});
    return void send(chatId, `✅ Ustoz qayta faollashtirildi: ${esc(bt?.full_name || data.slice(3))}`);
  }
  if (data.startsWith('tm:') || data.startsWith('tp:') || data.startsWith('tl:') || data === 'tse' || data.startsWith('tss:')) {
    const t = await getTeacher(q.from?.id);
    if (!t || t.status !== 'active') return void send(chatId, '⛔ Avval “👩‍🏫 Ustozlar” bo‘limida Edutizim raqamingiz bilan ulaning.', { reply_markup: MENU });
    const mid = q.message?.message_id as number | undefined;
    if (data === 'tm:h') return teacherHome(chatId, t, mid);
    if (data.startsWith('tm:')) { const [, mode, pg] = data.split(':'); return teacherList(chatId, t, mode, Number(pg) || 0, mid); }
    if (data.startsWith('tp:')) { const [, sid, code] = data.split(':'); return teacherPick(chatId, t, sid, code, mid); }
    if (data.startsWith('tl:')) { const [, sid, code, L] = data.split(':'); return teacherSetLevel(chatId, t, sid, code, L, mid); }
    if (data === 'tse') return teacherSessions(chatId, mid);
    const ss = await mockSessions();
    const session = ss[Number(data.slice(4))] || ss[0] || null;
    await admin.from('crm_exam_teachers').update({ session, updated_at: new Date().toISOString() }).eq('tg_id', t.tg_id);
    return teacherHome(chatId, { ...t, session }, mid);
  }
  if (data.startsWith('t:')) return pickTest(chatId, data.slice(2));
  if (data.startsWith('k:')) return showKey(chatId, data.slice(2));
  if (data.startsWith('cs:')) return pickCheckSchool(chatId, data.slice(3));
  if (data.startsWith('cc:')) return pickCheckClass(chatId, data.slice(3));
  if (data.startsWith('ts:')) return showGrades(chatId, data.slice(3));
  if (data.startsWith('tg:')) {
    const [school, grade] = data.slice(3).split('|');
    return showTop(chatId, school, grade || 'all');
  }
  const s = await getSession(chatId);
  if (data.startsWith('g:') && s.step === 'reg_grade') {
    const n = Number(data.slice(2));
    await setSession(chatId, 'reg_subject', { ...s.data, grade: n ? `${n}-sinf` : 'Maktabgacha' });
    return askSubject(chatId);
  }
  if (data.startsWith('sb:') && s.step === 'reg_subject') {
    const subject1 = SUBJECTS[data.slice(3)] || 'Matematika';
    await setSession(chatId, 'reg_level', { ...s.data, subject1 });
    return askLevel(chatId, subject1);
  }
  if (data.startsWith('lv:') && s.step === 'reg_level') {
    await setSession(chatId, 'reg_subject2', { ...s.data, level: LEVELS[data.slice(3)] || 'Oson' });
    return askSubject2(chatId, s.data.subject1 || 'Matematika');
  }
  if (data.startsWith('sb2:') && s.step === 'reg_subject2') {
    const subject2 = SUBJECTS2[data.slice(4)];
    if (!subject2 || subject2 === s.data.subject1) return askSubject2(chatId, s.data.subject1 || 'Matematika');
    await setSession(chatId, 'reg_level2', { ...s.data, subject2 });
    return askLevel2(chatId, subject2);
  }
  if (data.startsWith('lv2:') && s.step === 'reg_level2') {
    const level2 = LEVELS[data.slice(4)] || 'Oson';
    await setSession(chatId, 'reg_teacher', { ...s.data, level2 });
    await send(chatId, `📚 2-fan: <b>${esc(s.data.subject2 || 'Ingliz tili')}</b> · ${esc(level2)}`);
    return askTeacher(chatId);
  }
  if (data.startsWith('km:')) return pickMockReg(chatId, Number(data.slice(3)));
  // ⏰ Eslatmadagi "Boraman / Bora olmayman"
  if (data.startsWith('att:')) {
    const [, yn, idRaw] = data.split(':');
    const confirm = yn === 'y' ? 'Boraman' : 'Bora olmayman';
    const { data: reg } = await admin.from('crm_mock_registrations').update({ confirm, confirmed_at: new Date().toISOString() })
      .eq('id', Number(idRaw)).eq('chat_id', chatId).select('id,full_name,room,session').maybeSingle();
    if (!reg) return void send(chatId, 'Ariza topilmadi.', { reply_markup: MENU });
    if (q.message?.message_id) await tg(await token(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await send(chatId, yn === 'y'
      ? `✅ Rahmat! <b>${esc(reg.full_name)}</b> imtihonga keladi deb belgilandi.\n🚪 Xona: <b>${esc(reg.room)}</b> · 🔖 KM-${reg.id}`
      : `Tushunarli, <b>${esc(reg.full_name)}</b> kelmasligi belgilandi. Fikringiz o‘zgarsa, administratorga yozing: /aloqa`, { reply_markup: MENU });
    if (yn !== 'y') await notifyAdmin(`❌ Kids Mock'ga kelmaydi: <b>${esc(reg.full_name)}</b> · KM-${reg.id} · ${esc(reg.session)} · ${esc(reg.room)}`);
    return;
  }
  // EvalBee
  if (data.startsWith('eb:') || data.startsWith('ebs:') || data.startsWith('ebc:')) {
    if (data === 'eb:cancel') { await setSession(chatId, null); return void send(chatId, '❌ Import bekor qilindi.', { reply_markup: MENU }); }
    if (s.step !== 'eb_target') return void send(chatId, s.step === 'eb_busy' ? '⏳ Import davom etmoqda…' : 'Faylni qaytadan yuboring.', { reply_markup: MENU });
    if (!(await getProctor(q.from?.id))) return void send(chatId, '⛔ Ruxsat yo‘q.', { reply_markup: MENU });
    if (data === 'eb:school') return ebChooseSchool(chatId);
    if (data === 'eb:mock') return ebImportMock(chatId);
    if (data.startsWith('ebs:')) return ebSchoolPicked(chatId, data.slice(4));
    if (data.startsWith('ebc:') && s.data.school) return ebImportSchool(chatId, s.data.school, data.slice(4));
  }
  // Nazoratchilar
  if (data.startsWith('ps:') || data.startsWith('pg:') || data.startsWith('pl:') || data.startsWith('pn:')) {
    const p = await getProctor(q.from?.id);
    if (!p) return void send(chatId, '⛔ Nazoratchilar bo‘limiga ruxsat yo‘q.', { reply_markup: MENU });
    if (data.startsWith('ps:')) return prChooseGrade(chatId, data.slice(3));
    if (data.startsWith('pg:')) return prChooseLetter(chatId, data.slice(3));
    if (data.startsWith('pl:')) return prAskName(chatId, data.slice(3));
    if (data === 'pn:same' && s.data.cls) { await setSession(chatId, 'pr_done', s.data); return prAskName(chatId, s.data.cls); }
    if (data === 'pn:grade' && s.data.school) { await setSession(chatId, 'pr_grade', s.data); return prChooseGrade(chatId, s.data.school); }
    await setSession(chatId, null);
    return void send(chatId, '🏁 Rahmat! Natijalar CRM’ga yozildi.', { reply_markup: MENU });
  }
  if (data.startsWith('s:') && s.step === 'reg_session') {
    const sessions = await getSetting<string[]>('mockSessions', ['2026-11 (Noyabr Mock)']);
    const session = sessions[Number(data.slice(2))] || sessions[0] || '';
    return finishReg(chatId, s, session, q.from?.username || '');
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok');
  const t = await token();
  if (!t) return new Response('bot token not set', { status: 503 });
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(t)) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await req.json().catch(() => ({}));
  const um = update.message, uq = update.callback_query;
  console.log('upd', Object.keys(update).filter(k => k !== 'update_id').join(','), um ? `msg chat=${um.chat?.id}/${um.chat?.type} text=${String(um.text || (um.contact ? '[contact]' : um.photo ? '[photo]' : '')).slice(0, 40)}` : uq ? `cb chat=${uq.message?.chat?.id ?? 'from:' + uq.from?.id} keys=${Object.keys(uq).join('/')} data=${uq.data}` : '');
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error('bot error', e);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id || update.callback_query?.from?.id;
    if (chatId) await send(chatId, '⚠️ Texnik xatolik. Birozdan so‘ng qayta urinib ko‘ring.').catch(() => {});
  }
  return new Response('ok');
});
