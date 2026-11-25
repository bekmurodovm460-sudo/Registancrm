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
// Eski menyu tugmalari (foydalanuvchida eski klaviatura qolgan bo'lsa)
const OLD_CHECK = '📝 Natijani tekshirish';
const OLD_REG = '🧒 Kids Mock ro‘yxatdan o‘tish';
const OLD_RESULT = '🏆 Farzand natijasi';

const kb = (rows: string[][]) => ({ keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true });
const MENU = kb([[BTN_SEC1], [BTN_SEC2], [BTN_SEC3], [BTN_CONTACT, BTN_HELP]]);
const SUB1 = kb([[BTN_KEYS, BTN_CHECK], [BTN_HOME]]);
const SUB2 = kb([[BTN_REG], [BTN_MINE], [BTN_HOME]]);
const SUB3 = kb([[BTN_RESULT], [BTN_TOP, BTN_CARD], [BTN_HOME]]);
const CANCEL_KB = { keyboard: [[{ text: BTN_CANCEL }]], resize_keyboard: true };
const DEFAULT_CENTER = '📍 <b>Registan LC</b> o‘quv markazi\n\nAloqa ma’lumotlari hali kiritilmagan. Admin CRM’dagi “🤖 Telegram Bot” bo‘limida ularni yozadi.';

let TOKEN = '';
let tokenLoadedAt = 0;
async function token() {
  if (!TOKEN || Date.now() - tokenLoadedAt > 60_000) {
    TOKEN = await getSecret('telegram_bot_token');
    tokenLoadedAt = Date.now();
  }
  return TOKEN;
}

type Session = { step: string | null; data: Record<string, any> };

async function getSession(chatId: number): Promise<Session> {
  const { data } = await admin.from('crm_bot_sessions').select('step,data').eq('chat_id', chatId).maybeSingle();
  return { step: data?.step ?? null, data: (data?.data as Record<string, any>) || {} };
}
async function setSession(chatId: number, step: string | null, data: Record<string, any> = {}) {
  await admin.from('crm_bot_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() });
}

async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg(await token(), 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

async function notifyAdmin(text: string) {
  const chat = await getSecret('telegram_admin_chat_id');
  if (chat) await tg(await token(), 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML' }).catch(() => {});
}

// ---------------------------------------------------------
// Natijani tekshirish
// ---------------------------------------------------------
async function startCheck(chatId: number) {
  const { data: tests } = await admin.from('crm_tests').select('code,title,num_questions').eq('active', true).order('created_at', { ascending: false }).limit(20);
  if (!tests?.length) {
    await send(chatId, 'Hozircha faol test yo‘q. Keyinroq urinib ko‘ring.', { reply_markup: MENU });
    return;
  }
  await setSession(chatId, 'check_test', {});
  await send(chatId, '📝 Qaysi test natijasini tekshiramiz? Test kodini tanlang:', {
    reply_markup: { inline_keyboard: tests.map(t => [{ text: `${t.code} — ${t.title} (${t.num_questions} savol)`, callback_data: `t:${t.code}` }]) }
  });
}

async function pickTest(chatId: number, code: string) {
  const { data: test } = await admin.from('crm_tests').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (!test) { await send(chatId, 'Test topilmadi yoki yopilgan.', { reply_markup: MENU }); return; }
  await setSession(chatId, 'check_name', { test: code });
  await send(chatId, `✅ <b>${esc(test.title)}</b> tanlandi.\n\nO‘quvchining ism-familiyasini yozing:`, {
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
  const { data: sub } = await admin.from('crm_omr_submissions').insert({
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
    const mockId = 900000000 + Number(sub.id);
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
        testCode: test.code
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
    (g.wrong.length ? `\n❌ Xatolar (savol: belgilangan → to‘g‘ri):\n${wrongList}${g.wrong.length > 40 ? '\n…' : ''}` : '\n🎉 Barcha javoblar to‘g‘ri!'),
    { reply_markup: MENU });
  await setSession(chatId, null);
  await notifyAdmin(`📝 OMR: <b>${esc(s.data.name)}</b> · ${esc(test.code)} · ${g.correct}/${g.total} · ${g.score} ball`);
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

async function askPhone(chatId: number) {
  await send(chatId, 'Ota-ona telefon raqamini yuboring (pastdagi tugma yoki +998 90 123 45 67 ko‘rinishida):', {
    reply_markup: { keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }], [{ text: BTN_CANCEL }]], resize_keyboard: true, one_time_keyboard: true }
  });
}

async function askSession(chatId: number, s: Session) {
  const sessions = await getSetting<string[]>('mockSessions', ['2026-11 (Noyabr Mock)']);
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
  const room = await pickRoom(session);
  const { data: reg } = await admin.from('crm_mock_registrations').insert({
    chat_id: chatId, tg_username: username || d.username || null, full_name: d.name, grade: d.grade, phone: d.phone, session, room
  }).select('id').single();
  await setSession(chatId, null);
  await send(chatId,
    `✅ Ro‘yxatdan o‘tdingiz!\n\n👤 ${esc(d.name)}\n🏫 ${esc(d.grade)}\n📱 ${esc(d.phone)}\n🗓 ${esc(session)}\n🚪 Xona: <b>${esc(room)}</b>\n🔖 Ariza raqami: <b>KM-${reg?.id ?? ''}</b>\n\nImtihon kuni shu xabarni ko‘rsating. Natijani shu bot orqali tekshirasiz.`,
    { reply_markup: MENU });
  await notifyAdmin(`🧒 Yangi Kids Mock arizasi: <b>${esc(d.name)}</b> · ${esc(d.grade)} · ${esc(d.phone)} · ${esc(room)}`);
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
    admin.from('crm_mock_registrations').select('id,full_name,grade,session,room,status,created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10),
    admin.from('crm_omr_submissions').select('student_name,test_code,correct,score,created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(10)
  ]);
  const d = (t: string) => new Date(t).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  const parts = [];
  parts.push(regs?.length
    ? '🧒 <b>Kids Mock arizalari:</b>\n' + regs.map(r => `• KM-${r.id} — ${esc(r.full_name)} (${esc(r.grade)})\n   ${esc(r.session)} · 🚪 ${esc(r.room)} · <b>${esc(r.status)}</b>`).join('\n')
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
  const info = await getSetting<string>('centerInfo', '');
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
  if (text === '/start' || text === '/menu' || text === BTN_CANCEL || text === BTN_HOME || text === '/cancel') {
    await setSession(chatId, null);
    await send(chatId, '👋 <b>Registan LC</b> botiga xush kelibsiz!\n\n' +
      `1️⃣ ${BTN_SEC1}\n2️⃣ ${BTN_SEC2}\n3️⃣ ${BTN_SEC3}\n\nKerakli bo‘limni tanlang 👇`, { reply_markup: MENU });
    return;
  }
  if (text === '/id') { await send(chatId, `Chat ID: <code>${chatId}</code>`); return; }
  // Bo'limlar
  if (text === BTN_SEC1) { await setSession(chatId, null); return void send(chatId, `📚 <b>Maktab imtihonlari javoblari</b>\n\n${BTN_KEYS} — imtihon to‘g‘ri javoblari\n${BTN_CHECK} — to‘ldirilgan varaq rasmini yuborib ballni bilish`, { reply_markup: SUB1 }); }
  if (text === BTN_SEC2) { await setSession(chatId, null); return void send(chatId, `🧒 <b>Kids Mock</b>\n\n${BTN_REG} — farzandingizni imtihonga yozish (xona avtomatik beriladi)\n${BTN_MINE} — arizalaringiz holati`, { reply_markup: SUB2 }); }
  if (text === BTN_SEC3) { await setSession(chatId, null); return void send(chatId, `📊 <b>Natijalar ro‘yxati</b>\n\n${BTN_RESULT} — ism yoki telefon bo‘yicha\n${BTN_TOP} — maktab va parallel bo‘yicha sovrindorlar\n${BTN_CARD} — sovrindorlar uchun karta rasmi`, { reply_markup: SUB3 }); }
  if (text === BTN_KEYS || text === '/javoblar') return startKeys(chatId);
  if (text === BTN_TOP || text === '/top') return startTop(chatId);
  if (text === BTN_CHECK || text === OLD_CHECK || text === '/tekshir') return startCheck(chatId);
  if (text === BTN_REG || text === OLD_REG || text === '/royxat') return startReg(chatId);
  if (text === BTN_RESULT || text === OLD_RESULT || text === '/natija') return startResult(chatId);
  if (text === BTN_CARD || text === '/karta') return startCard(chatId);
  if (text === BTN_MINE || text === '/mening') { await setSession(chatId, null); return answerMine(chatId); }
  if (text === BTN_CONTACT || text === '/aloqa') { await setSession(chatId, null); return answerContact(chatId); }
  if (text === '/hisobot') return answerReport(chatId);
  if (text === BTN_HELP || text === '/yordam' || text === '/help') {
    await send(chatId,
      '📖 <b>Buyruqlar</b>\n\n' +
      '/javoblar — maktab imtihonlari to‘g‘ri javoblari\n' +
      '/top — maktab va parallel bo‘yicha TOP-3 sovrindorlar\n' +
      '/natija — farzandingiz balli va parallel TOP-3 o‘rni\n' +
      '/karta — yutuqli karta (TOP-3 sovrindorlar uchun, telefon tasdiqlanadi)\n' +
      '/tekshir — javoblar varaqasi rasmini yuborib natijani bilish\n' +
      '/royxat — Kids Mock imtihoniga yozilish\n' +
      '/mening — arizalaringiz va tekshirilgan varaqlar\n' +
      '/aloqa — markaz manzili va telefoni\n' +
      '/cancel — bekor qilish', { reply_markup: MENU });
    return;
  }

  const s = await getSession(chatId);
  switch (s.step) {
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
      await setSession(chatId, 'reg_phone', { ...s.data, grade: text.slice(0, 30) });
      return askPhone(chatId);
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
      await send(chatId, 'Kerakli bo‘limni tanlang 👇', { reply_markup: MENU });
  }
}

async function onCallback(q: any) {
  const chatId = q.message?.chat?.id as number;
  const data = String(q.data || '');
  await tg(await token(), 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (!chatId) return;
  if (data.startsWith('t:')) return pickTest(chatId, data.slice(2));
  if (data.startsWith('k:')) return showKey(chatId, data.slice(2));
  if (data.startsWith('ts:')) return showGrades(chatId, data.slice(3));
  if (data.startsWith('tg:')) {
    const [school, grade] = data.slice(3).split('|');
    return showTop(chatId, school, grade || 'all');
  }
  const s = await getSession(chatId);
  if (data.startsWith('g:') && s.step === 'reg_grade') {
    const n = Number(data.slice(2));
    await setSession(chatId, 'reg_phone', { ...s.data, grade: n ? `${n}-sinf` : 'Maktabgacha' });
    return askPhone(chatId);
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
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error('bot error', e);
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chatId) await send(chatId, '⚠️ Texnik xatolik. Birozdan so‘ng qayta urinib ko‘ring.').catch(() => {});
  }
  return new Response('ok');
});
