// Bot va CRM (ka-admin) uchun umumiy mantiq: sertifikat berish, tanlov natijalari, fayl yuborish
import { admin, esc, fmtDay, getSetting, send, sendPhotoBytes, sleep, tg, DEFAULT_RULES, Rules } from './common.ts';
import { certPng } from './cert.ts';

export const CONTEST_BONUS: Record<number, number> = { 1: 30, 2: 20, 3: 10 };

/** Sertifikat rasmini yaratib a'zoga yuborish */
export async function sendCertificate(completionId: number) {
  const { data: c } = await admin.from('ka_completions')
    .select('*, member:ka_members(full_name,chat_id), book:ka_books(title,author)')
    .eq('id', completionId).maybeSingle();
  if (!c || !c.member?.chat_id) return { ok: false, error: 'topilmadi' };
  let participants: number | undefined;
  if (c.kind === 'contest' && c.test_id) {
    const { count } = await admin.from('ka_completions').select('id', { count: 'exact', head: true }).eq('test_id', c.test_id).eq('kind', 'contest');
    participants = count || undefined;
  }
  const png = await certPng({
    kind: c.kind,
    fullName: c.member.full_name,
    title: c.book?.title || c.title || '',
    author: c.book?.author || undefined,
    certNo: c.cert_no,
    date: fmtDay(c.created_at),
    testPct: c.test_pct ?? 0,
    reviewScore: c.review_score ?? undefined,
    rank: c.rank ?? undefined,
    participants
  });
  const caption = c.kind === 'book'
    ? `🎓 <b>Tabriklaymiz, ${esc(c.member.full_name)}!</b>\n«${esc(c.book?.title || c.title)}» kitobini muvaffaqiyatli yakunladingiz.\n\n⭐ +${c.points} ball · № ${esc(c.cert_no)}`
    : `🏆 <b>${esc(c.title)}</b>\n${c.rank && c.rank <= 3 ? `🥇 Siz <b>${c.rank}-o‘rin</b>ni egalladingiz!` : `Ishtirokingiz uchun rahmat!`} Natija: ${c.test_pct}%\n\n⭐ +${c.points} ball · № ${esc(c.cert_no)}`;
  const r = await sendPhotoBytes(c.member.chat_id, png, caption);
  return { ok: !!r.ok, error: r.description };
}

/** Audio taqriz baholandi: o'tsa — kitob yakunlanadi va sertifikat yuboriladi */
export async function gradeReview(reviewId: number, score: number, comment: string, reviewer: string | null, again = false) {
  const rules = await getSetting<Rules>('rules', DEFAULT_RULES);
  const { data: rv } = await admin.from('ka_reviews')
    .select('*, member:ka_members(id,full_name,chat_id), book:ka_books(id,title)')
    .eq('id', reviewId).maybeSingle();
  if (!rv) return { ok: false, error: 'Taqriz topilmadi' };
  const status = again ? 'Qayta' : 'Baholandi';
  const { error } = await admin.from('ka_reviews').update({
    status, score: again ? null : score, comment: comment || null, reviewer, reviewed_at: new Date().toISOString()
  }).eq('id', reviewId);
  if (error) return { ok: false, error: error.message };
  const chat = rv.member?.chat_id;
  const title = rv.book?.title || '';

  if (again) {
    if (chat) {
      await admin.from('ka_bot_sessions').upsert({ chat_id: chat, step: 'review_voice', data: { attemptId: rv.attempt_id, bookId: rv.book_id }, updated_at: new Date().toISOString() });
      await send(chat, `🔁 «${esc(title)}» bo‘yicha audio taqrizingizni <b>qayta yuborishingiz</b> so‘raldi.${comment ? `\n\n💬 Ustoz izohi: <i>${esc(comment)}</i>` : ''}\n\n🎙 ${rules.audioMinSec}–${rules.audioMaxSec} soniyalik ovozli xabar yuboring.`);
    }
    return { ok: true };
  }

  if (score < rules.reviewPass) {
    if (chat) await send(chat, `🎙 «${esc(title)}» taqrizingiz baholandi: <b>${score}/10</b>.\nKitobni yakunlash uchun kamida ${rules.reviewPass} ball kerak.${comment ? `\n\n💬 Ustoz izohi: <i>${esc(comment)}</i>` : ''}\n\nQayta taqriz yuborish uchun “🎓 Natijalarim” bo‘limiga kiring.`, {
      reply_markup: { inline_keyboard: [[{ text: '🎙 Qayta taqriz yuborish', callback_data: `rv:${rv.attempt_id}` }]] }
    });
    return { ok: true, completed: false };
  }

  // Kitob yakunlandi
  const { data: at } = await admin.from('ka_attempts').select('pct,test_id').eq('id', rv.attempt_id).maybeSingle();
  const pct = at?.pct ?? 0;
  const { data: existing } = await admin.from('ka_completions').select('id').eq('member_id', rv.member_id).eq('book_id', rv.book_id).eq('kind', 'book').maybeSingle();
  let completionId = existing?.id as number | undefined;
  if (!completionId) {
    const { data: cert } = await admin.rpc('ka_next_cert');
    const { data: comp, error: ce } = await admin.from('ka_completions').insert({
      member_id: rv.member_id, book_id: rv.book_id, test_id: at?.test_id || null, kind: 'book', title,
      test_pct: pct, review_score: score, points: Math.round(pct / 10) + score, cert_no: cert
    }).select('id').single();
    if (ce) return { ok: false, error: ce.message };
    completionId = comp.id;
  }
  if (comment && chat) await send(chat, `💬 Ustoz izohi («${esc(title)}»): <i>${esc(comment)}</i>`);
  const sent = await sendCertificate(completionId!).catch(e => ({ ok: false, error: String(e) }));
  return { ok: true, completed: true, certificate: sent.ok, certError: sent.ok ? undefined : sent.error };
}

/** Yopiq tanlov natijalarini e'lon qilish: reyting, ball, sertifikatlar */
export async function publishContest(testId: number) {
  const { data: test } = await admin.from('ka_tests').select('*').eq('id', testId).eq('kind', 'contest').maybeSingle();
  if (!test) return { ok: false, error: 'Tanlov topilmadi' };
  const { data: atts } = await admin.from('ka_attempts').select('id,member_id,correct,total,pct,duration_sec,finished_at')
    .eq('test_id', testId).eq('status', 'done');
  // Har a'zoning eng yaxshi urinishi (tanlovda bitta bo'ladi)
  const best = new Map<number, any>();
  (atts || []).forEach(a => {
    const b = best.get(a.member_id);
    if (!b || a.correct > b.correct || (a.correct === b.correct && (a.duration_sec ?? 1e9) < (b.duration_sec ?? 1e9))) best.set(a.member_id, a);
  });
  const ranked = [...best.values()].sort((a, b) => b.correct - a.correct || (a.duration_sec ?? 1e9) - (b.duration_sec ?? 1e9));
  const ids: number[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const a = ranked[i];
    const rank = i + 1;
    const { data: ex } = await admin.from('ka_completions').select('id').eq('member_id', a.member_id).eq('test_id', testId).eq('kind', 'contest').maybeSingle();
    if (ex) {
      await admin.from('ka_completions').update({ rank, test_pct: a.pct, points: (CONTEST_BONUS[rank] || 0) + Math.round(a.pct / 10) }).eq('id', ex.id);
      ids.push(ex.id);
      continue;
    }
    const { data: cert } = await admin.rpc('ka_next_cert');
    const { data: c } = await admin.from('ka_completions').insert({
      member_id: a.member_id, test_id: testId, kind: 'contest', title: test.title, test_pct: a.pct, rank,
      points: (CONTEST_BONUS[rank] || 0) + Math.round(a.pct / 10), cert_no: cert
    }).select('id').single();
    if (c) ids.push(c.id);
  }
  await admin.from('ka_tests').update({ results_published: true }).eq('id', testId);
  let sent = 0;
  for (const id of ids) {
    const r = await sendCertificate(id).catch(() => ({ ok: false }));
    if (r.ok) sent++;
    await sleep(60); // Telegram cheklovi (~30 xabar/soniya)
  }
  return { ok: true, participants: ranked.length, sent };
}

/** Kitob faylini yuborish: avval Telegram file_id, bo'lmasa Storage'dan vaqtinchalik havola */
export async function sendBookFile(chatId: number, book: any, kind: 'pdf' | 'audio' | 'guide') {
  const idCol = kind === 'pdf' ? 'pdf_file_id' : kind === 'audio' ? 'audio_file_id' : 'guide_file_id';
  const pathCol = kind === 'pdf' ? 'pdf_path' : kind === 'audio' ? 'audio_path' : 'guide_path';
  const method = kind === 'audio' ? 'sendAudio' : 'sendDocument';
  const field = kind === 'audio' ? 'audio' : 'document';
  const caption = `${kind === 'audio' ? '🎧' : kind === 'guide' ? '📘' : '📄'} <b>${esc(book.title)}</b>${book.author ? ` — ${esc(book.author)}` : ''}${kind === 'guide' ? '\nQo‘llanma' : ''}`;
  if (book[idCol]) {
    const r = await tg(method, { chat_id: chatId, [field]: book[idCol], caption, parse_mode: 'HTML', protect_content: true });
    if (r.ok) return true;
  }
  if (book[pathCol]) {
    const { data: signed } = await admin.storage.from('ka-books').createSignedUrl(book[pathCol], 600);
    if (signed?.signedUrl) {
      const r = await tg(method, { chat_id: chatId, [field]: signed.signedUrl, caption, parse_mode: 'HTML', protect_content: true });
      if (r.ok) {
        const msg = r.result;
        const fid = kind === 'audio' ? (msg.audio?.file_id || msg.document?.file_id) : msg.document?.file_id;
        if (fid) await admin.from('ka_books').update({ [idCol]: fid }).eq('id', book.id);
        return true;
      }
      console.error('send file', r.description);
    }
  }
  return false;
}
