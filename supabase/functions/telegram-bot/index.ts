// =========================================================
// REGISTAN LC Telegram bot (webhook)
//  • 📝 Natijani tekshirish — javoblar varaqasi rasmi (OMR) orqali
//  • 🧒 Kids Mock'ga ro'yxatdan o'tish
// =========================================================
import jpeg from 'npm:jpeg-js@0.4.4';
import { admin, getSecret, getSetting, tg, webhookSecret } from '../_shared/common.ts';
import { readSheet, rgbaToGray, gradeAnswers } from '../_shared/omr.js';

const BTN_CHECK = '📝 Natijani tekshirish';
const BTN_REG = '🧒 Kids Mock ro‘yxatdan o‘tish';
const BTN_HELP = 'ℹ️ Yordam';
const BTN_CANCEL = '❌ Bekor qilish';

const MENU = {
  keyboard: [[{ text: BTN_CHECK }], [{ text: BTN_REG }], [{ text: BTN_HELP }]],
  resize_keyboard: true
};

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
// Update router
// ---------------------------------------------------------
async function onMessage(m: any) {
  const chatId = m.chat.id as number;
  if (m.chat.type !== 'private') {
    if ((m.text || '').startsWith('/id')) await send(chatId, `Chat ID: <code>${chatId}</code>`);
    return;
  }
  const text = (m.text || '').trim();
  if (text === '/start' || text === '/menu' || text === BTN_CANCEL || text === '/cancel') {
    await setSession(chatId, null);
    await send(chatId, '👋 <b>Registan LC</b> botiga xush kelibsiz!\n\nKerakli bo‘limni tanlang:', { reply_markup: MENU });
    return;
  }
  if (text === '/id') { await send(chatId, `Chat ID: <code>${chatId}</code>`); return; }
  if (text === BTN_CHECK) return startCheck(chatId);
  if (text === BTN_REG) return startReg(chatId);
  if (text === BTN_HELP) {
    await send(chatId, '📝 <b>Natijani tekshirish</b>: testni tanlang, ismni yozing va to‘ldirilgan javoblar varaqasini rasmga olib yuboring. 4 ta qora burchak rasmga to‘liq tushishi kerak.\n\n🧒 <b>Kids Mock</b>: farzandingizni imtihonga yozing — xona avtomatik beriladi.', { reply_markup: MENU });
    return;
  }

  const s = await getSession(chatId);
  switch (s.step) {
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
      const raw = m.contact?.phone_number || text;
      const digits = String(raw).replace(/\D/g, '');
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
