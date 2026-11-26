// =========================================================
// LAYLO PARDAYEVA KITOBXONLIK AKADEMIYASI — Telegram bot (webhook)
//  👤 Ro'yxat (ism, yosh, shahar, telefon)
//  📚 Kitoblar: PDF · audio · qo'llanma → 📝 kitob testi → 🎙 2 daqiqalik audio taqriz → 🎓 sertifikat
//  🏆 Yakuniy yopiq tanlov (vaqtli)  · 👥 Guruhlar: Mini App chati, Jitsi uchrashuvlari
//  💳 Ixtiyoriy pullik a'zolik (chek rasmi → kassir tasdiqlaydi)
//  Xodimlar: /ulash KOD — botni CRM hisobiga bog'lash, /yukla — kitob faylini biriktirish
// =========================================================
import {
  admin, ACADEMY, botToken, DEFAULT_MEMBERSHIP, DEFAULT_RULES, esc, fmtDate, getSetting, isPaid, jitsiUrl,
  Membership, money, notifyStaff, Rules, send, tg, webhookSecret
} from '../_shared/common.ts';
import { sendBookFile, sendCertificate } from '../_shared/academy.ts';

// ---------------- Tugmalar ----------------
const B_BOOKS = '📚 Kitoblar';
const B_TESTS = '📝 Testlar';
const B_GROUPS = '👥 Guruhlarim';
const B_CONTESTS = '🏆 Tanlovlar';
const B_RESULTS = '🎓 Natijalarim';
const B_MEMBER = '💳 A’zolik';
const B_HELP = 'ℹ️ Yordam';
const B_CANCEL = '❌ Bekor qilish';
const B_PHONE = '📱 Raqamni yuborish';

const kb = (rows: string[][]) => ({ keyboard: rows.map(r => r.map(text => ({ text }))), resize_keyboard: true });
const CANCEL_KB = kb([[B_CANCEL]]);

async function menu() {
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  return kb([[B_BOOKS, B_TESTS], [B_GROUPS, B_CONTESTS], ms.enabled ? [B_RESULTS, B_MEMBER] : [B_RESULTS], [B_HELP]]);
}

// ---------------- Holat ----------------
type Session = { step: string | null; data: Record<string, any> };
async function getSession(chatId: number): Promise<Session> {
  const { data } = await admin.from('ka_bot_sessions').select('step,data').eq('chat_id', chatId).maybeSingle();
  return { step: data?.step ?? null, data: (data?.data as Record<string, any>) || {} };
}
async function setSession(chatId: number, step: string | null, data: Record<string, any> = {}) {
  await admin.from('ka_bot_sessions').upsert({ chat_id: chatId, step, data, updated_at: new Date().toISOString() });
}

async function getMember(tgId: number) {
  const { data } = await admin.from('ka_members').select('*').eq('tg_user_id', tgId).maybeSingle();
  return data as any;
}
async function getStaff(tgId: number) {
  const { data } = await admin.from('ka_staff').select('id,role,full_name').eq('tg_user_id', tgId).maybeSingle();
  return data as any;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const normPhone = (t: string) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? '+998' + d.slice(-9) : null; };

async function membershipBlock(chatId: number) {
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  await send(chatId, `🔒 Bu bo‘lim <b>pullik a’zolar</b> uchun.\n\n💳 A’zolik: <b>${money(ms.price)}</b> / ${ms.days} kun.\nBatafsil: “${B_MEMBER}” bo‘limi.`, {
    reply_markup: { inline_keyboard: [[{ text: '💳 A’zolik haqida', callback_data: 'pay' }]] }
  });
}

// =========================================================
// Ro'yxatdan o'tish
// =========================================================
async function startRegistration(chatId: number, extra: Record<string, any> = {}) {
  await setSession(chatId, 'reg_name', extra);
  await send(chatId, `👋 <b>${ACADEMY}</b> botiga xush kelibsiz!\n\nKitob o‘qing 📚, test topshiring 📝, audio taqriz yuboring 🎙 va sertifikat oling 🎓.\n\nRo‘yxatdan o‘tamiz. <b>Ism-familiyangizni</b> yozing:`, { reply_markup: CANCEL_KB });
}

async function finishRegistration(chatId: number, m: any, s: Session, phone: string) {
  const { data: mem, error } = await admin.from('ka_members').upsert({
    tg_user_id: m.from.id, chat_id: chatId, tg_username: m.from.username || null,
    full_name: s.data.name, age: s.data.age || null, city: s.data.city || null, phone
  }, { onConflict: 'tg_user_id' }).select('*').single();
  if (error) { console.error(error); return void send(chatId, '⚠️ Saqlab bo‘lmadi, qayta urinib ko‘ring: /start'); }
  await setSession(chatId, null);
  await send(chatId, `✅ <b>${esc(mem.full_name)}</b>, siz akademiya a’zosisiz!\n\n📚 “${B_BOOKS}” — kitobni tanlang, o‘qing va test topshiring.\n👥 “${B_GROUPS}” — kitobxonlik guruhlari, chat va onlayn uchrashuvlar.`, { reply_markup: await menu() });
  await notifyStaff(`👤 Yangi a’zo: <b>${esc(mem.full_name)}</b>${mem.age ? `, ${mem.age} yosh` : ''}${mem.city ? `, ${esc(mem.city)}` : ''} · ${esc(phone)}${m.from.username ? ` · @${esc(m.from.username)}` : ''}`, ['admin']);
  if (s.data.pendingGroup) await joinByCode(chatId, mem, s.data.pendingGroup);
}

// =========================================================
// 📚 Kitoblar
// =========================================================
const PAGE = 8;
async function showBooks(chatId: number, page = 0, messageId?: number) {
  const { data: books, count } = await admin.from('ka_books').select('id,title,author,premium', { count: 'exact' })
    .eq('active', true).order('sort').order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (!books?.length) return void send(chatId, '📚 Hozircha kitoblar qo‘shilmagan.');
  const rows: any[] = books.map(b => [{ text: `${b.premium ? '🔒 ' : ''}${b.title}${b.author ? ` — ${b.author}` : ''}`.slice(0, 60), callback_data: `bk:${b.id}` }]);
  const nav: any[] = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `bp:${page - 1}` });
  if ((count || 0) > (page + 1) * PAGE) nav.push({ text: '➡️', callback_data: `bp:${page + 1}` });
  if (nav.length) rows.push(nav);
  const text = `📚 <b>Kitoblar</b> (${count})\nKitobni tanlang:`;
  if (messageId) await tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  else await send(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function showBook(chatId: number, member: any, bookId: number) {
  const { data: b } = await admin.from('ka_books').select('*').eq('id', bookId).eq('active', true).maybeSingle();
  if (!b) return void send(chatId, 'Kitob topilmadi.');
  const [{ data: test }, { data: comp }] = await Promise.all([
    admin.from('ka_tests').select('id,questions').eq('book_id', bookId).eq('kind', 'book').eq('active', true).order('id', { ascending: false }).limit(1).maybeSingle(),
    admin.from('ka_completions').select('id').eq('member_id', member.id).eq('book_id', bookId).eq('kind', 'book').maybeSingle()
  ]);
  const rows: any[] = [];
  const files: any[] = [];
  if (b.pdf_file_id || b.pdf_path) files.push({ text: '📄 PDF', callback_data: `f:${b.id}:pdf` });
  if (b.audio_file_id || b.audio_path) files.push({ text: '🎧 Audio', callback_data: `f:${b.id}:audio` });
  if (files.length) rows.push(files);
  if (b.guide || b.guide_file_id || b.guide_path) rows.push([{ text: '📘 Qo‘llanma', callback_data: `gd:${b.id}` }]);
  if (comp) rows.push([{ text: '🎓 Sertifikatni olish', callback_data: `ct:${comp.id}` }]);
  else if (test && (test.questions as any[])?.length) rows.push([{ text: `📝 Testni boshlash (${(test.questions as any[]).length} savol)`, callback_data: `tb:${b.id}` }]);
  rows.push([{ text: '⬅️ Kitoblar', callback_data: 'bp:0' }]);
  const text = `📖 <b>${esc(b.title)}</b>${b.author ? `\n✍️ ${esc(b.author)}` : ''}${b.category ? `\n🏷 ${esc(b.category)}` : ''}${b.pages ? ` · ${b.pages} bet` : ''}` +
    `${b.premium ? '\n🔒 Pullik a’zolar uchun' : ''}${b.description ? `\n\n${esc(b.description).slice(0, 700)}` : ''}` +
    `${comp ? '\n\n✅ Siz bu kitobni yakunlagansiz.' : '\n\n<i>Yo‘l: o‘qing → test → 🎙 audio taqriz → 🎓 sertifikat</i>'}`;
  if (b.cover_url) {
    const r = await tg('sendPhoto', { chat_id: chatId, photo: b.cover_url, caption: text.slice(0, 1020), parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
    if (r.ok) return;
  }
  await send(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function bookFile(chatId: number, member: any, bookId: number, kind: 'pdf' | 'audio' | 'guide') {
  const { data: b } = await admin.from('ka_books').select('*').eq('id', bookId).eq('active', true).maybeSingle();
  if (!b) return void send(chatId, 'Kitob topilmadi.');
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  if (b.premium && !isPaid(member, ms)) return membershipBlock(chatId);
  await tg('sendChatAction', { chat_id: chatId, action: kind === 'audio' ? 'upload_voice' : 'upload_document' });
  const ok = await sendBookFile(chatId, b, kind);
  if (!ok) return void send(chatId, '⚠️ Fayl hali yuklanmagan yoki juda katta. Administratorga xabar berdik.');
  await admin.from('ka_book_opens').insert({ member_id: member.id, book_id: bookId, kind });
}

async function showGuide(chatId: number, member: any, bookId: number) {
  const { data: b } = await admin.from('ka_books').select('*').eq('id', bookId).maybeSingle();
  if (!b) return;
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  if (b.premium && !isPaid(member, ms)) return membershipBlock(chatId);
  if (b.guide) {
    // Telegram xabar chegarasi 4096 belgi
    const text = `📘 <b>${esc(b.title)} — qo‘llanma</b>\n\n${esc(b.guide)}`;
    for (let i = 0; i < text.length; i += 3900) await send(chatId, text.slice(i, i + 3900));
  }
  if (b.guide_file_id || b.guide_path) await sendBookFile(chatId, b, 'guide');
  await admin.from('ka_book_opens').insert({ member_id: member.id, book_id: bookId, kind: 'guide' });
  const { data: test } = await admin.from('ka_tests').select('id').eq('book_id', bookId).eq('kind', 'book').eq('active', true).limit(1).maybeSingle();
  if (test) await send(chatId, 'Tayyormisiz? 👇', { reply_markup: { inline_keyboard: [[{ text: '📝 Testni boshlash', callback_data: `tb:${bookId}` }]] } });
}

// =========================================================
// 📝 Testlar
// =========================================================
async function showTests(chatId: number, member: any) {
  const { data: tests } = await admin.from('ka_tests').select('id,title,book_id,questions').eq('kind', 'book').eq('active', true).not('book_id', 'is', null).order('id', { ascending: false }).limit(40);
  const { data: comps } = await admin.from('ka_completions').select('book_id').eq('member_id', member.id).eq('kind', 'book');
  const done = new Set((comps || []).map(c => c.book_id));
  const seen = new Set<number>();
  const rows: any[] = [];
  (tests || []).forEach(t => {
    if (seen.has(t.book_id) || !(t.questions as any[])?.length) return;
    seen.add(t.book_id);
    rows.push([{ text: `${done.has(t.book_id) ? '✅' : '📝'} ${t.title}`.slice(0, 60), callback_data: done.has(t.book_id) ? `bk:${t.book_id}` : `tb:${t.book_id}` }]);
  });
  if (!rows.length) return void send(chatId, '📝 Hozircha faol testlar yo‘q.');
  await send(chatId, '📝 <b>Kitob testlari</b>\nKitobni o‘qib bo‘lgach testni boshlang. O‘tsangiz — 🎙 audio taqriz yuborasiz.', { reply_markup: { inline_keyboard: rows } });
}

async function startBookTest(chatId: number, member: any, bookId: number) {
  const rules = await getSetting<Rules>('rules', DEFAULT_RULES);
  const { data: test } = await admin.from('ka_tests').select('*').eq('book_id', bookId).eq('kind', 'book').eq('active', true).order('id', { ascending: false }).limit(1).maybeSingle();
  if (!test || !(test.questions as any[])?.length) return void send(chatId, 'Bu kitob uchun test hali tayyor emas.');
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  const { data: book } = await admin.from('ka_books').select('premium,title').eq('id', bookId).maybeSingle();
  if ((test.premium || book?.premium) && !isPaid(member, ms)) return membershipBlock(chatId);

  const { data: comp } = await admin.from('ka_completions').select('id').eq('member_id', member.id).eq('book_id', bookId).eq('kind', 'book').maybeSingle();
  if (comp) return void send(chatId, '✅ Siz bu kitobni allaqachon yakunlagansiz.', { reply_markup: { inline_keyboard: [[{ text: '🎓 Sertifikat', callback_data: `ct:${comp.id}` }]] } });

  const { data: atts } = await admin.from('ka_attempts').select('id,status,passed,current').eq('test_id', test.id).eq('member_id', member.id).order('id', { ascending: false });
  const passed = (atts || []).find(a => a.passed);
  if (passed) {
    const { data: rv } = await admin.from('ka_reviews').select('status').eq('attempt_id', passed.id).order('id', { ascending: false }).limit(1).maybeSingle();
    if (!rv || rv.status === 'Qayta' || (rv.status === 'Baholandi')) return askReview(chatId, passed.id, bookId, true);
    return void send(chatId, '⏳ Testdan o‘tgansiz, audio taqrizingiz ustoz tomonidan tekshirilmoqda.');
  }
  const open = (atts || []).find(a => a.status === 'in_progress');
  if (open) return sendQuestion(chatId, open.id);
  const doneCount = (atts || []).filter(a => a.status === 'done').length;
  const maxA = test.max_attempts || rules.maxAttempts;
  if (doneCount >= maxA) return void send(chatId, `⛔ Urinishlar tugadi (${maxA} ta). Ustozingizga murojaat qiling.`);
  const { data: at, error } = await admin.from('ka_attempts').insert({ test_id: test.id, member_id: member.id, total: (test.questions as any[]).length }).select('id').single();
  if (error) return void send(chatId, '⚠️ Testni boshlab bo‘lmadi.');
  await send(chatId, `📝 <b>${esc(test.title)}</b>\n${(test.questions as any[]).length} ta savol · o‘tish chegarasi <b>${test.pass_pct}%</b> · urinish ${doneCount + 1}/${maxA}\n\nJavobni tugma bilan tanlang 👇`);
  await sendQuestion(chatId, at.id);
}

async function startContest(chatId: number, member: any, testId: number) {
  const { data: t } = await admin.from('ka_tests').select('*').eq('id', testId).eq('kind', 'contest').eq('active', true).maybeSingle();
  if (!t) return void send(chatId, 'Tanlov topilmadi.');
  const now = Date.now();
  if (t.opens_at && new Date(t.opens_at).getTime() > now) return void send(chatId, `⏳ Tanlov <b>${fmtDate(t.opens_at)}</b> da ochiladi.`);
  if (t.closes_at && new Date(t.closes_at).getTime() < now) return void send(chatId, '⌛ Tanlov yopilgan.');
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  if (t.premium && !isPaid(member, ms)) return membershipBlock(chatId);
  const { data: atts } = await admin.from('ka_attempts').select('id,status').eq('test_id', testId).eq('member_id', member.id);
  const open = (atts || []).find(a => a.status === 'in_progress');
  if (open) return sendQuestion(chatId, open.id);
  if ((atts || []).length) return void send(chatId, '✅ Siz bu tanlovda qatnashgansiz. Natijalar e’lon qilinganda xabar beramiz.');
  const { data: at } = await admin.from('ka_attempts').insert({ test_id: testId, member_id: member.id, total: (t.questions as any[]).length }).select('id').single();
  await send(chatId, `🏆 <b>${esc(t.title)}</b>\n${(t.questions as any[]).length} ta savol${t.time_limit_min ? ` · ⏱ <b>${t.time_limit_min} daqiqa</b>` : ''}\n\n🔒 Yopiq test: to‘g‘ri javoblar va natijalar tanlov yakunida e’lon qilinadi. Faqat <b>bitta urinish</b>. Omad!`);
  await sendQuestion(chatId, at!.id);
}

function questionText(t: any, at: any, q: any, idx: number) {
  let timer = '';
  if (t.kind === 'contest' && t.time_limit_min) {
    const left = Math.max(0, Math.round((new Date(at.started_at).getTime() + t.time_limit_min * 60000 - Date.now()) / 60000));
    timer = ` · ⏱ ~${left} daq. qoldi`;
  }
  return `${t.kind === 'contest' ? '🏆' : '📝'} <b>${esc(t.title)}</b>\nSavol <b>${idx + 1}/${(t.questions as any[]).length}</b>${timer}\n\n<b>${esc(q.q)}</b>\n\n` +
    (q.o as string[]).map((o, i) => `${LETTERS[i]}) ${esc(o)}`).join('\n');
}

async function sendQuestion(chatId: number, attemptId: number, messageId?: number) {
  const { data: at } = await admin.from('ka_attempts').select('*, test:ka_tests(*)').eq('id', attemptId).maybeSingle();
  if (!at || at.status !== 'in_progress') return;
  const t = at.test;
  const qs = t.questions as any[];
  if (at.current >= qs.length) return finishAttempt(chatId, at, messageId);
  const q = qs[at.current];
  const buttons = (q.o as string[]).map((_, i) => ({ text: LETTERS[i], callback_data: `an:${at.id}:${at.current}:${i}` }));
  const markup = { inline_keyboard: [buttons] };
  const text = questionText(t, at, q, at.current);
  if (messageId) {
    const r = await tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: markup });
    if (r.ok) return;
  }
  await send(chatId, text, { reply_markup: markup });
}

async function onAnswer(chatId: number, member: any, attemptId: number, qIdx: number, opt: number, messageId: number) {
  const { data: at } = await admin.from('ka_attempts').select('*, test:ka_tests(*)').eq('id', attemptId).eq('member_id', member.id).maybeSingle();
  if (!at || at.status !== 'in_progress' || at.current !== qIdx) return; // eski tugma / qayta bosish
  const t = at.test;
  // Tanlov vaqti tugaganmi
  const deadline = t.kind === 'contest' && t.time_limit_min ? new Date(at.started_at).getTime() + t.time_limit_min * 60000 : Infinity;
  const closes = t.closes_at ? new Date(t.closes_at).getTime() : Infinity;
  if (Date.now() > Math.min(deadline, closes + 60000)) return finishAttempt(chatId, at, messageId, true);
  const answers = [...(at.answers as number[])];
  answers[qIdx] = opt;
  const { data: upd } = await admin.from('ka_attempts').update({ answers, current: qIdx + 1 })
    .eq('id', at.id).eq('current', qIdx).select('id');
  if (!upd?.length) return;
  await sendQuestion(chatId, at.id, messageId);
}

async function finishAttempt(chatId: number, at: any, messageId?: number, timeout = false) {
  const t = at.test;
  const qs = t.questions as any[];
  const answers = at.answers as number[];
  let correct = 0;
  qs.forEach((q, i) => { if (answers[i] === q.a) correct++; });
  const pct = qs.length ? Math.round((correct / qs.length) * 100) : 0;
  const passed = t.kind === 'book' && pct >= (t.pass_pct ?? 70);
  const finished = new Date();
  const { data: upd } = await admin.from('ka_attempts').update({
    status: 'done', correct, total: qs.length, pct, passed, finished_at: finished.toISOString(),
    duration_sec: Math.round((finished.getTime() - new Date(at.started_at).getTime()) / 1000)
  }).eq('id', at.id).eq('status', 'in_progress').select('id');
  if (!upd?.length) return;
  if (messageId) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});

  if (t.kind === 'contest') {
    return void send(chatId, `${timeout ? '⏱ Vaqt tugadi. ' : ''}✅ <b>Javoblaringiz qabul qilindi!</b>\n\n🏆 ${esc(t.title)}\nJavob berilgan savollar: ${answers.filter(a => a !== null && a !== undefined).length}/${qs.length}\n\n🔒 Natijalar va g‘oliblar tanlov yakunida e’lon qilinadi, sertifikatingiz shu yerga keladi.`, { reply_markup: await menu() });
  }
  if (passed) {
    await send(chatId, `🎉 <b>Testdan o‘tdingiz!</b>\nNatija: <b>${correct}/${qs.length}</b> (${pct}%)`);
    return askReview(chatId, at.id, t.book_id);
  }
  const rules = await getSetting<Rules>('rules', DEFAULT_RULES);
  const { count } = await admin.from('ka_attempts').select('id', { count: 'exact', head: true }).eq('test_id', t.id).eq('member_id', at.member_id).eq('status', 'done');
  const left = (t.max_attempts || rules.maxAttempts) - (count || 0);
  await send(chatId, `😔 Natija: <b>${correct}/${qs.length}</b> (${pct}%). O‘tish uchun ${t.pass_pct}% kerak.\n\n📖 Kitobni yana bir bor ko‘rib chiqing.${left > 0 ? ` Qolgan urinishlar: <b>${left}</b>.` : ' Urinishlar tugadi — ustozingizga murojaat qiling.'}`, {
    reply_markup: left > 0 ? { inline_keyboard: [[{ text: '🔁 Qayta topshirish', callback_data: `tb:${t.book_id}` }], [{ text: '📘 Qo‘llanma', callback_data: `gd:${t.book_id}` }]] } : undefined
  });
}

// =========================================================
// 🎙 Audio taqriz
// =========================================================
async function askReview(chatId: number, attemptId: number, bookId: number, again = false) {
  const rules = await getSetting<Rules>('rules', DEFAULT_RULES);
  await setSession(chatId, 'review_voice', { attemptId, bookId });
  await send(chatId, `🎙 ${again ? 'Endi' : 'Keyingi qadam:'} kitob haqida <b>audio taqriz</b> yuboring.\n\n⏱ Davomiyligi: <b>${rules.audioMinSec}–${rules.audioMaxSec} soniya</b> (ovozli xabar)\n💡 Nimalar haqida gapirish mumkin:\n• kitob nima haqida (qisqacha)\n• sizga yoqqan qahramon va nega\n• asosiy g‘oya va siz uchun xulosa\n\nUstoz baholagach, 🎓 sertifikatingiz shu yerga keladi.`, { reply_markup: CANCEL_KB });
}

async function onReviewVoice(chatId: number, member: any, s: Session, m: any) {
  const rules = await getSetting<Rules>('rules', DEFAULT_RULES);
  const v = m.voice || m.audio;
  if (!v) return void send(chatId, `🎙 Iltimos, <b>ovozli xabar</b> yuboring (${rules.audioMinSec}–${rules.audioMaxSec} soniya).`);
  const dur = Number(v.duration || 0);
  if (dur < rules.audioMinSec) return void send(chatId, `⏱ Taqriz juda qisqa (${dur} s). Kamida <b>${rules.audioMinSec} soniya</b> gapiring.`);
  if (dur > rules.audioMaxSec + 5) return void send(chatId, `⏱ Taqriz ${rules.audioMaxSec} soniyadan oshmasin (sizniki ${dur} s). Qisqaroq qilib qayta yozing.`);
  const { data: rv, error } = await admin.from('ka_reviews').insert({
    member_id: member.id, book_id: s.data.bookId, attempt_id: s.data.attemptId, file_id: v.file_id, duration: dur
  }).select('id').single();
  if (error) return void send(chatId, '⚠️ Saqlab bo‘lmadi, qayta yuboring.');
  await setSession(chatId, null);
  const { data: b } = await admin.from('ka_books').select('title').eq('id', s.data.bookId).maybeSingle();
  await send(chatId, '✅ Audio taqrizingiz qabul qilindi! Ustoz tinglab baholagach xabar beramiz. 🎓', { reply_markup: await menu() });
  // Bog'langan moderatorlarga ovozni yuborish (ular botda ham tinglay oladi, baholash — CRM'da)
  const caption = `🎙 Yangi taqriz #${rv.id}: <b>${esc(member.full_name)}</b> — «${esc(b?.title || '')}» · ${dur} s\nBaholash: CRM → 🎙 Taqrizlar`;
  const { data: staff } = await admin.from('ka_staff').select('tg_user_id').in('role', ['admin', 'moderator']).not('tg_user_id', 'is', null);
  for (const st of staff || []) await tg('sendVoice', { chat_id: st.tg_user_id, voice: v.file_id, caption, parse_mode: 'HTML' }).catch(() => {});
}

// =========================================================
// 🏆 Tanlovlar
// =========================================================
async function showContests(chatId: number, member: any) {
  const { data: tests } = await admin.from('ka_tests').select('id,title,description,opens_at,closes_at,time_limit_min,results_published,questions')
    .eq('kind', 'contest').eq('active', true).order('opens_at', { ascending: false, nullsFirst: false }).limit(10);
  if (!tests?.length) return void send(chatId, '🏆 Hozircha tanlovlar e’lon qilinmagan.');
  const ids = tests.map(t => t.id);
  const [{ data: atts }, { data: comps }] = await Promise.all([
    admin.from('ka_attempts').select('test_id,status').eq('member_id', member.id).in('test_id', ids),
    admin.from('ka_completions').select('id,test_id,rank,test_pct').eq('member_id', member.id).eq('kind', 'contest').in('test_id', ids)
  ]);
  const now = Date.now();
  for (const t of tests) {
    const mine = (atts || []).find(a => a.test_id === t.id);
    const comp = (comps || []).find(c => c.test_id === t.id);
    const opens = t.opens_at ? new Date(t.opens_at).getTime() : 0;
    const closes = t.closes_at ? new Date(t.closes_at).getTime() : Infinity;
    let status = '', btn: any = null;
    if (t.results_published) {
      status = comp ? `🏁 Natijalar e’lon qilindi. Sizning o‘rningiz: <b>${comp.rank}</b> (${comp.test_pct}%)` : '🏁 Natijalar e’lon qilindi';
      if (comp) btn = { text: '🎓 Sertifikat', callback_data: `ct:${comp.id}` };
    } else if (mine) status = mine.status === 'done' ? '✅ Qatnashdingiz — natijalar kutilmoqda' : '▶️ Davom ettiring';
    else if (now < opens) status = `⏳ Boshlanishi: <b>${fmtDate(t.opens_at)}</b>`;
    else if (now > closes) status = '⌛ Yopilgan';
    else { status = `🟢 Ochiq${t.closes_at ? ` · ${fmtDate(t.closes_at)} gacha` : ''}`; }
    if (!t.results_published && (now >= opens && now <= closes) && (!mine || mine.status !== 'done')) btn = { text: mine ? '▶️ Davom ettirish' : '▶️ Boshlash', callback_data: `ts:${t.id}` };
    await send(chatId, `🏆 <b>${esc(t.title)}</b>\n${(t.questions as any[]).length} savol${t.time_limit_min ? ` · ⏱ ${t.time_limit_min} daq.` : ''}${t.description ? `\n${esc(t.description)}` : ''}\n\n${status}`,
      btn ? { reply_markup: { inline_keyboard: [[btn]] } } : {});
  }
}

// =========================================================
// 👥 Guruhlar va uchrashuvlar
// =========================================================
async function miniAppUrl(groupId?: number) {
  const url = await getSetting<string>('miniAppUrl', '');
  if (!url) return '';
  return groupId ? `${url}${url.includes('?') ? '&' : '?'}g=${groupId}` : url;
}

async function showGroups(chatId: number, member: any) {
  const { data: gm } = await admin.from('ka_group_members').select('group:ka_groups(id,name,description,active,book:ka_books(title))').eq('member_id', member.id);
  const groups = (gm || []).map(x => x.group as any).filter(g => g?.active);
  const jitsi = await getSetting<{ domain: string }>('jitsi', { domain: 'meet.jit.si' });
  const app = await miniAppUrl();
  if (!groups.length) {
    return void send(chatId, '👥 Siz hali hech qaysi guruhda emassiz.\n\nOchiq guruhlardan birini tanlang yoki ustozingiz bergan <b>kod</b> bilan qo‘shiling.', {
      reply_markup: { inline_keyboard: [[{ text: '📋 Ochiq guruhlar', callback_data: 'gl' }], [{ text: '🔑 Kod bilan qo‘shilish', callback_data: 'gc' }]] }
    });
  }
  const { data: meets } = await admin.from('ka_meetings').select('*').in('group_id', groups.map(g => g.id))
    .gte('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString()).order('starts_at').limit(20);
  for (const g of groups) {
    const ms = (meets || []).filter(x => x.group_id === g.id && new Date(x.starts_at).getTime() + x.duration_min * 60000 > Date.now()).slice(0, 3);
    const rows: any[] = [];
    ms.forEach(x => rows.push([{ text: `🎥 ${fmtDate(x.starts_at)} — ${x.title}`.slice(0, 60), url: jitsiUrl(jitsi.domain, x.room, member.full_name) }]));
    const url = await miniAppUrl(g.id);
    if (url) rows.push([{ text: '💬 Guruh chati', web_app: { url } }]);
    await send(chatId, `👥 <b>${esc(g.name)}</b>${g.book?.title ? `\n📖 Hozir o‘qilmoqda: «${esc(g.book.title)}»` : ''}${g.description ? `\n${esc(g.description)}` : ''}\n\n` +
      (ms.length ? `📅 Yaqin uchrashuvlar:\n${ms.map(x => `• ${fmtDate(x.starts_at)} — ${esc(x.title)} (${x.duration_min} daq.)`).join('\n')}\n<i>Kirish uchun 🎥 tugmasini bosing.</i>` : '📅 Yaqin uchrashuv rejalashtirilmagan.'),
      rows.length ? { reply_markup: { inline_keyboard: rows } } : {});
  }
  await send(chatId, 'Boshqa guruhga qo‘shilish:', {
    reply_markup: { inline_keyboard: [[{ text: '📋 Ochiq guruhlar', callback_data: 'gl' }, { text: '🔑 Kod bilan', callback_data: 'gc' }], ...(app ? [[{ text: '📱 Ilovani ochish', web_app: { url: app } }]] : [])] }
  });
}

async function listOpenGroups(chatId: number, member: any) {
  const [{ data: groups }, { data: mine }] = await Promise.all([
    admin.from('ka_groups').select('id,name,premium,book:ka_books(title)').eq('active', true).eq('is_open', true).order('id'),
    admin.from('ka_group_members').select('group_id').eq('member_id', member.id)
  ]);
  const joined = new Set((mine || []).map(x => x.group_id));
  const rows = (groups || []).filter(g => !joined.has(g.id)).map(g => [{ text: `${g.premium ? '🔒 ' : ''}${g.name}${(g.book as any)?.title ? ` · ${(g.book as any).title}` : ''}`.slice(0, 60), callback_data: `gj:${g.id}` }]);
  if (!rows.length) return void send(chatId, 'Hozircha qo‘shilish mumkin bo‘lgan ochiq guruh yo‘q. Ustozingizdan kod so‘rang.', { reply_markup: { inline_keyboard: [[{ text: '🔑 Kod bilan qo‘shilish', callback_data: 'gc' }]] } });
  await send(chatId, '📋 <b>Ochiq guruhlar</b> — qo‘shilish uchun tanlang:', { reply_markup: { inline_keyboard: rows } });
}

async function joinGroup(chatId: number, member: any, group: any) {
  if (!group || !group.active) return void send(chatId, 'Guruh topilmadi.');
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  if (group.premium && !isPaid(member, ms)) return membershipBlock(chatId);
  await admin.from('ka_group_members').upsert({ group_id: group.id, member_id: member.id }, { onConflict: 'group_id,member_id', ignoreDuplicates: true });
  await setSession(chatId, null);
  const url = await miniAppUrl(group.id);
  await send(chatId, `✅ Siz <b>${esc(group.name)}</b> guruhiga qo‘shildingiz!\nUchrashuvlar oldidan eslatma yuboramiz.`, {
    reply_markup: url ? { inline_keyboard: [[{ text: '💬 Guruh chatini ochish', web_app: { url } }]] } : await menu()
  });
}

async function joinByCode(chatId: number, member: any, code: string) {
  const { data: g } = await admin.from('ka_groups').select('*').eq('invite_code', code.trim().toUpperCase()).maybeSingle();
  if (!g) return void send(chatId, '❌ Bunday kodli guruh topilmadi. Kodni tekshirib qayta yozing yoki /cancel.');
  return joinGroup(chatId, member, g);
}

// =========================================================
// 🎓 Natijalar va reyting
// =========================================================
async function showResults(chatId: number, member: any) {
  const [{ data: comps }, { data: reviews }, { data: board }] = await Promise.all([
    admin.from('ka_completions').select('id,kind,title,points,rank,test_pct,created_at').eq('member_id', member.id).order('id', { ascending: false }),
    admin.from('ka_reviews').select('id,status,score,attempt_id,book:ka_books(title)').eq('member_id', member.id).in('status', ['Yangi', 'Qayta']).order('id', { ascending: false }),
    admin.rpc('ka_leaderboard', { p_period: 'all', p_limit: 200 })
  ]);
  const points = (comps || []).reduce((s, c) => s + Number(c.points || 0), 0);
  const me = (board || []).find((r: any) => r.member_id === member.id);
  const books = (comps || []).filter(c => c.kind === 'book');
  const contests = (comps || []).filter(c => c.kind === 'contest');
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  let text = `🎓 <b>${esc(member.full_name)}</b>\n\n⭐ Ball: <b>${points}</b>${me ? ` · 🏅 Reytingda: <b>${me.rank}</b>-o‘rin` : ''}\n📚 Yakunlangan kitoblar: <b>${books.length}</b>\n🏆 Tanlovlar: <b>${contests.length}</b>`;
  if (ms.enabled) text += `\n💳 A’zolik: ${member.paid_until && new Date(member.paid_until) > new Date() ? `✅ ${fmtDate(member.paid_until)} gacha` : '❌ faol emas'}`;
  if (reviews?.length) text += `\n\n🎙 Taqrizlar:\n${reviews.map(r => `• «${esc((r.book as any)?.title)}» — ${r.status === 'Yangi' ? '⏳ tekshirilmoqda' : '🔁 qayta yuborish so‘ralgan'}`).join('\n')}`;
  const rows: any[] = [];
  books.slice(0, 8).forEach(c => rows.push([{ text: `🎓 ${c.title}`.slice(0, 60), callback_data: `ct:${c.id}` }]));
  contests.slice(0, 4).forEach(c => rows.push([{ text: `🏆 ${c.title} — ${c.rank}-o‘rin`.slice(0, 60), callback_data: `ct:${c.id}` }]));
  (reviews || []).filter(r => r.status === 'Qayta').forEach(r => rows.push([{ text: `🎙 Qayta yuborish: ${(r.book as any)?.title}`.slice(0, 60), callback_data: `rv:${r.attempt_id}` }]));
  rows.push([{ text: '🏅 Umumiy reyting', callback_data: 'lb:all' }, { text: '📅 Shu oy', callback_data: 'lb:month' }]);
  await send(chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function showLeaderboard(chatId: number, member: any, period: string) {
  const { data } = await admin.rpc('ka_leaderboard', { p_period: period, p_limit: 10 });
  const medal = ['🥇', '🥈', '🥉'];
  const lines = (data || []).map((r: any, i: number) => `${medal[i] || `${r.rank}.`} ${esc(r.full_name)}${r.member_id === member.id ? ' (siz)' : ''} — <b>${r.points}</b> ball · 📚${r.books}`);
  await send(chatId, `🏅 <b>Kitobxonlar reytingi</b> (${period === 'month' ? 'shu oy' : period === 'week' ? 'shu hafta' : 'umumiy'})\n\n${lines.join('\n') || 'Hali natijalar yo‘q.'}`);
}

async function resendCert(chatId: number, member: any, compId: number) {
  const { data: c } = await admin.from('ka_completions').select('id').eq('id', compId).eq('member_id', member.id).maybeSingle();
  if (!c) return;
  await tg('sendChatAction', { chat_id: chatId, action: 'upload_photo' });
  const r = await sendCertificate(compId).catch(e => ({ ok: false, error: String(e) }));
  if (!r.ok) await send(chatId, '⚠️ Sertifikatni hozir yaratib bo‘lmadi, birozdan so‘ng urinib ko‘ring.');
}

// =========================================================
// 💳 A'zolik va kassa
// =========================================================
async function showMembership(chatId: number, member: any) {
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  if (!ms.enabled) return void send(chatId, '✅ Hozircha barcha imkoniyatlar bepul.', { reply_markup: await menu() });
  const active = member.paid_until && new Date(member.paid_until) > new Date();
  const { data: pend } = await admin.from('ka_payments').select('id').eq('member_id', member.id).eq('status', 'Kutilmoqda').limit(1).maybeSingle();
  await send(chatId,
    `💳 <b>A’zolik</b>\n\nHolat: ${active ? `✅ faol — <b>${fmtDate(member.paid_until)}</b> gacha` : '❌ faol emas'}\n` +
    `Narx: <b>${money(ms.price)}</b> / ${ms.days} kun\n` +
    (ms.card ? `\n💳 Karta: <code>${esc(ms.card)}</code>${ms.cardOwner ? `\n👤 ${esc(ms.cardOwner)}` : ''}\n` : '') +
    (ms.note ? `\n${esc(ms.note)}\n` : '') +
    (pend ? '\n⏳ Yuborgan chekingiz kassir tomonidan tekshirilmoqda.' : ''),
    { reply_markup: { inline_keyboard: [[{ text: '📸 To‘lov chekini yuborish', callback_data: 'payrc' }]] } });
}

async function onReceipt(chatId: number, member: any, m: any) {
  const photo = m.photo?.length ? m.photo[m.photo.length - 1] : null;
  const doc = m.document && /image|pdf/.test(m.document.mime_type || '') ? m.document : null;
  if (!photo && !doc) return void send(chatId, '📸 Chek <b>rasmini</b> (yoki PDF) yuboring.');
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  const { data: p } = await admin.from('ka_payments').insert({
    member_id: member.id, amount: ms.price, days: ms.days, method: 'karta', receipt_file_id: (photo || doc).file_id,
    note: m.caption ? String(m.caption).slice(0, 300) : null, created_by: null
  }).select('id').single();
  await setSession(chatId, null);
  await send(chatId, '✅ Chek qabul qilindi. Kassir tasdiqlagach a’zoligingiz faollashadi va xabar beramiz.', { reply_markup: await menu() });
  const caption = `💳 To‘lov cheki #${p?.id}: <b>${esc(member.full_name)}</b> · ${esc(member.phone || '')} · ${money(ms.price)}\nTasdiqlash: CRM → 💳 Kassa`;
  const { data: staff } = await admin.from('ka_staff').select('tg_user_id').in('role', ['admin', 'kassir']).not('tg_user_id', 'is', null);
  for (const st of staff || []) {
    if (photo) await tg('sendPhoto', { chat_id: st.tg_user_id, photo: photo.file_id, caption, parse_mode: 'HTML' }).catch(() => {});
    else await tg('sendDocument', { chat_id: st.tg_user_id, document: doc.file_id, caption, parse_mode: 'HTML' }).catch(() => {});
  }
}

// =========================================================
// Xodimlar: /ulash va /yukla (kitob fayllarini Telegram orqali biriktirish)
// =========================================================
async function linkStaff(chatId: number, m: any, code: string) {
  if (!code) return void send(chatId, 'Foydalanish: <code>/ulash KOD</code> — kodni CRM’dagi “👤 Profil” bo‘limidan oling.');
  const { data: st } = await admin.from('ka_staff').select('id,full_name,role').eq('link_code', code.trim().toUpperCase()).maybeSingle();
  if (!st || st.role === 'pending') return void send(chatId, '❌ Kod noto‘g‘ri yoki eskirgan.');
  await admin.from('ka_staff').update({ tg_user_id: null }).eq('tg_user_id', m.from.id);
  await admin.from('ka_staff').update({ tg_user_id: m.from.id, link_code: null }).eq('id', st.id);
  await send(chatId, `✅ ${esc(st.full_name)}, bot CRM hisobingizga bog‘landi (${st.role}).\n\nEndi yangi taqrizlar${st.role !== 'moderator' ? ' va to‘lov cheklari' : ''} shu yerga keladi.${st.role !== 'kassir' ? '\n📤 Kitob faylini biriktirish: /yukla' : ''}`);
}

async function startUpload(chatId: number, staff: any) {
  if (!staff || !['admin', 'moderator'].includes(staff.role)) return void send(chatId, 'Bu buyruq faqat bog‘langan admin/moderator uchun. Avval: /ulash KOD');
  const { data: books } = await admin.from('ka_books').select('id,title,pdf_file_id,audio_file_id,guide_file_id').order('id', { ascending: false }).limit(40);
  if (!books?.length) return void send(chatId, 'Avval CRM’da kitob qo‘shing.');
  await send(chatId, '📤 Qaysi kitobga fayl biriktiramiz?', {
    reply_markup: { inline_keyboard: books.map(b => [{ text: `${b.title} ${b.pdf_file_id ? '📄' : ''}${b.audio_file_id ? '🎧' : ''}${b.guide_file_id ? '📘' : ''}`.slice(0, 60), callback_data: `up:${b.id}` }]) }
  });
}

async function onUploadFile(chatId: number, s: Session, m: any) {
  const kind = s.data.kind as 'pdf' | 'audio' | 'guide';
  let fid: string | null = null;
  if (kind === 'audio') fid = m.audio?.file_id || m.voice?.file_id || (m.document && /audio/.test(m.document.mime_type || '') ? m.document.file_id : null);
  else fid = m.document?.file_id || null;
  if (!fid) return void send(chatId, kind === 'audio' ? '🎧 Audio fayl yuboring (mp3/m4a).' : '📄 Faylni <b>hujjat (document)</b> sifatida yuboring.');
  const col = kind === 'pdf' ? 'pdf_file_id' : kind === 'audio' ? 'audio_file_id' : 'guide_file_id';
  await admin.from('ka_books').update({ [col]: fid }).eq('id', s.data.bookId);
  await setSession(chatId, null);
  await send(chatId, `✅ Fayl biriktirildi (${kind === 'pdf' ? '📄 PDF' : kind === 'audio' ? '🎧 Audio' : '📘 Qo‘llanma'}). A’zolar endi uni botdan oladi.\nYana biriktirish: /yukla`);
}

// =========================================================
// Xabarlar
// =========================================================
const HELP = `ℹ️ <b>${ACADEMY}</b>\n\n` +
  '<b>Qanday ishlaydi?</b>\n1️⃣ 📚 Kitoblar — kitobni tanlang (PDF, audio, qo‘llanma)\n2️⃣ 📝 O‘qib bo‘lgach testni topshiring\n3️⃣ 🎙 2 daqiqagacha audio taqriz yuboring\n4️⃣ 🎓 Ustoz baholagach sertifikat olasiz\n\n' +
  '👥 Guruhlar — chat va onlayn uchrashuvlar (Jitsi)\n🏆 Tanlovlar — yakuniy yopiq testlar, g‘oliblarga diplom\n\n' +
  '<b>Buyruqlar:</b>\n/kitoblar · /testlar · /guruhlar · /tanlovlar · /natijalar · /reyting · /azolik · /cancel';

async function onMessage(m: any) {
  const chatId = m.chat.id as number;
  if (m.chat.type !== 'private') {
    if ((m.text || '').startsWith('/id')) await send(chatId, `Chat ID: <code>${chatId}</code>`);
    return;
  }
  const raw = String(m.text || '').trim();
  const cmd = raw.startsWith('/') ? raw.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const arg = raw.startsWith('/') ? raw.split(/\s+/).slice(1).join(' ') : '';

  if (cmd === '/id') return void send(chatId, `Chat ID: <code>${chatId}</code>`);
  if (cmd === '/ulash') return linkStaff(chatId, m, arg);
  const staff = await getStaff(m.from.id);
  if (cmd === '/yukla') return startUpload(chatId, staff);

  const s = await getSession(chatId);
  let member = await getMember(m.from.id);

  if (raw === B_CANCEL || cmd === '/cancel') {
    await setSession(chatId, null);
    if (!member) return startRegistration(chatId);
    return void send(chatId, 'Bekor qilindi.', { reply_markup: await menu() });
  }

  // Xodim fayl yuklash bosqichi
  if (s.step === 'staff_upload' && staff) return onUploadFile(chatId, s, m);

  // Ro'yxatdan o'tish
  if (!member) {
    if (cmd === '/start') {
      const code = arg.startsWith('g_') ? arg.slice(2) : '';
      return startRegistration(chatId, code ? { pendingGroup: code } : {});
    }
    switch (s.step) {
      case 'reg_name':
        if (raw.length < 3 || raw.startsWith('/')) return void send(chatId, 'Ism-familiyani to‘liq yozing (masalan: Aziza Karimova).');
        await setSession(chatId, 'reg_age', { ...s.data, name: raw.replace(/\s+/g, ' ').slice(0, 80) });
        return void send(chatId, '🎂 Yoshingiz nechada? (raqam bilan)');
      case 'reg_age': {
        const age = parseInt(raw, 10);
        if (!(age >= 5 && age <= 120)) return void send(chatId, 'Yoshni raqam bilan yozing, masalan: 24');
        await setSession(chatId, 'reg_city', { ...s.data, age });
        return void send(chatId, '🏙 Qaysi shahar/tumandansiz?');
      }
      case 'reg_city':
        if (raw.length < 2) return void send(chatId, 'Shahar yoki tuman nomini yozing.');
        await setSession(chatId, 'reg_phone', { ...s.data, city: raw.slice(0, 60) });
        return void send(chatId, '📱 Telefon raqamingizni yuboring (tugma orqali yoki yozib):', {
          reply_markup: { keyboard: [[{ text: B_PHONE, request_contact: true }], [{ text: B_CANCEL }]], resize_keyboard: true }
        });
      case 'reg_phone': {
        const phone = normPhone(m.contact?.phone_number || raw);
        if (!phone) return void send(chatId, 'Raqamni to‘g‘ri kiriting, masalan: +998 90 123 45 67');
        return finishRegistration(chatId, m, s, phone);
      }
      default:
        return startRegistration(chatId);
    }
  }

  if (member.chat_id !== chatId || member.tg_username !== (m.from.username || null)) {
    await admin.from('ka_members').update({ chat_id: chatId, tg_username: m.from.username || null }).eq('id', member.id);
    member = { ...member, chat_id: chatId };
  }
  if (member.status === 'blocked') return void send(chatId, '⛔ Hisobingiz vaqtincha cheklangan. Administrator bilan bog‘laning.');

  if (cmd === '/start') {
    await setSession(chatId, null);
    if (arg.startsWith('g_')) return joinByCode(chatId, member, arg.slice(2));
    const about = await getSetting<{ text: string }>('about', { text: '' });
    return void send(chatId, `${about.text || `📚 <b>${ACADEMY}</b>`}\n\nBo‘limni tanlang 👇`, { reply_markup: await menu() });
  }
  if (raw === B_BOOKS || cmd === '/kitoblar') { await setSession(chatId, null); return showBooks(chatId); }
  if (raw === B_TESTS || cmd === '/testlar') { await setSession(chatId, null); return showTests(chatId, member); }
  if (raw === B_GROUPS || cmd === '/guruhlar') { await setSession(chatId, null); return showGroups(chatId, member); }
  if (raw === B_CONTESTS || cmd === '/tanlovlar') { await setSession(chatId, null); return showContests(chatId, member); }
  if (raw === B_RESULTS || cmd === '/natijalar') { await setSession(chatId, null); return showResults(chatId, member); }
  if (cmd === '/reyting') return showLeaderboard(chatId, member, 'all');
  if (raw === B_MEMBER || cmd === '/azolik') { await setSession(chatId, null); return showMembership(chatId, member); }
  if (raw === B_HELP || cmd === '/yordam' || cmd === '/help') return void send(chatId, HELP, { reply_markup: await menu() });
  if (cmd === '/guruh' && arg) return joinByCode(chatId, member, arg);

  switch (s.step) {
    case 'review_voice': return onReviewVoice(chatId, member, s, m);
    case 'pay_receipt': return onReceipt(chatId, member, m);
    case 'join_code':
      if (!raw) return void send(chatId, 'Guruh kodini yozing.');
      return joinByCode(chatId, member, raw);
  }
  if (m.voice) return void send(chatId, '🎙 Taqriz yuborish uchun avval kitob testidan o‘ting (📝 Testlar).', { reply_markup: await menu() });
  await send(chatId, 'Bo‘limni tanlang 👇', { reply_markup: await menu() });
}

async function onCallback(q: any) {
  const chatId = q.message?.chat?.id as number;
  const msgId = q.message?.message_id as number;
  const data = String(q.data || '');
  await tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  if (!chatId) return;

  // Xodim: fayl biriktirish
  if (data.startsWith('up:') || data.startsWith('uk:')) {
    const staff = await getStaff(q.from.id);
    if (!staff || !['admin', 'moderator'].includes(staff.role)) return;
    if (data.startsWith('up:')) {
      const id = Number(data.slice(3));
      return void send(chatId, 'Qaysi fayl turi?', { reply_markup: { inline_keyboard: [[{ text: '📄 PDF', callback_data: `uk:${id}:pdf` }, { text: '🎧 Audio', callback_data: `uk:${id}:audio` }, { text: '📘 Qo‘llanma', callback_data: `uk:${id}:guide` }]] } });
    }
    const [, id, kind] = data.split(':');
    await setSession(chatId, 'staff_upload', { bookId: Number(id), kind });
    return void send(chatId, `Endi faylni yuboring (${kind === 'audio' ? '🎧 audio' : '📄 hujjat'}). Bekor qilish: /cancel`);
  }

  const member = await getMember(q.from.id);
  if (!member) return startRegistration(chatId);
  if (member.status === 'blocked') return;

  if (data.startsWith('bp:')) return showBooks(chatId, Number(data.slice(3)), q.message?.text ? msgId : undefined);
  if (data.startsWith('bk:')) return showBook(chatId, member, Number(data.slice(3)));
  if (data.startsWith('f:')) { const [, id, kind] = data.split(':'); return bookFile(chatId, member, Number(id), kind as any); }
  if (data.startsWith('gd:')) return showGuide(chatId, member, Number(data.slice(3)));
  if (data.startsWith('tb:')) return startBookTest(chatId, member, Number(data.slice(3)));
  if (data.startsWith('ts:')) return startContest(chatId, member, Number(data.slice(3)));
  if (data.startsWith('an:')) { const [, a, qi, o] = data.split(':').map(Number); return onAnswer(chatId, member, a, qi, o, msgId); }
  if (data.startsWith('ct:')) return resendCert(chatId, member, Number(data.slice(3)));
  if (data.startsWith('lb:')) return showLeaderboard(chatId, member, data.slice(3));
  if (data.startsWith('rv:')) {
    const attemptId = Number(data.slice(3));
    const { data: at } = await admin.from('ka_attempts').select('id,passed,test:ka_tests(book_id)').eq('id', attemptId).eq('member_id', member.id).maybeSingle();
    if (!at?.passed) return;
    return askReview(chatId, at.id, (at.test as any).book_id, true);
  }
  if (data === 'gl') return listOpenGroups(chatId, member);
  if (data === 'gc') { await setSession(chatId, 'join_code', {}); return void send(chatId, '🔑 Guruh kodini yozing (masalan: A1B2C3):', { reply_markup: CANCEL_KB }); }
  if (data.startsWith('gj:')) {
    const { data: g } = await admin.from('ka_groups').select('*').eq('id', Number(data.slice(3))).eq('is_open', true).maybeSingle();
    return joinGroup(chatId, member, g);
  }
  if (data === 'pay') return showMembership(chatId, member);
  if (data === 'payrc') { await setSession(chatId, 'pay_receipt', {}); return void send(chatId, '📸 To‘lov chekining rasmini yuboring:', { reply_markup: CANCEL_KB }); }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('ok');
  const t = await botToken();
  if (!t) return new Response('bot token not set', { status: 503 });
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(t)) return new Response('forbidden', { status: 403 });
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
