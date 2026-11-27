// =========================================================
// CRM uchun server amallari (xodim JWT bilan) va har 5 daqiqalik cron
//  setup · status · media · grade_review · payment_decide · payment_add · contest_publish
//  meeting_notify · broadcast · resend_cert · cron
// =========================================================
import {
  admin, ACADEMY, callerStaff, cors, DEFAULT_MEMBERSHIP, esc, fmtDate, getSecret, getSetting, json, jitsiUrl,
  Membership, money, send, sleep, SUPABASE_URL, tg, webhookSecret
} from '../_shared/common.ts';
import { gradeReview, publishContest, sendCertificate } from '../_shared/academy.ts';

const ROLES: Record<string, string[]> = {
  setup: ['admin'], status: ['admin'], broadcast: ['admin'], resend_cert: ['admin', 'moderator'],
  media: ['admin', 'moderator', 'kassir'], grade_review: ['admin', 'moderator'], contest_publish: ['admin', 'moderator'],
  payment_decide: ['admin', 'kassir'], payment_add: ['admin', 'kassir'], meeting_notify: ['admin', 'moderator']
};

async function canGroup(staff: { id: string; role: string }, groupId: number) {
  if (staff.role === 'admin') return true;
  const { data } = await admin.from('ka_groups').select('moderator_id').eq('id', groupId).maybeSingle();
  return data?.moderator_id === staff.id;
}

async function groupChats(groupId: number) {
  const { data } = await admin.from('ka_group_members').select('member:ka_members(chat_id,full_name,status)').eq('group_id', groupId);
  return (data || []).map(x => x.member as any).filter(m => m?.chat_id && m.status === 'active');
}

async function announceMeeting(meetingId: number, reminder: boolean) {
  const { data: mt } = await admin.from('ka_meetings').select('*, group:ka_groups(name)').eq('id', meetingId).maybeSingle();
  if (!mt) return 0;
  const jitsi = await getSetting<{ domain: string }>('jitsi', { domain: 'meet.jit.si' });
  const members = await groupChats(mt.group_id);
  let n = 0;
  for (const m of members) {
    const r = await send(m.chat_id,
      `${reminder ? '⏰ <b>Uchrashuv 30 daqiqadan so‘ng!</b>' : '📅 <b>Yangi uchrashuv</b>'}\n\n👥 ${esc((mt.group as any)?.name)}\n🎥 <b>${esc(mt.title)}</b>\n🕒 ${fmtDate(mt.starts_at)} · ${mt.duration_min} daq.${mt.notes ? `\n\n${esc(mt.notes)}` : ''}`,
      { reply_markup: { inline_keyboard: [[{ text: '🎥 Uchrashuvga kirish', url: jitsiUrl(jitsi.domain, mt.room, m.full_name) }]] } });
    if (r.ok) n++;
    await sleep(40);
  }
  return n;
}

async function runCron() {
  const out: Record<string, number> = { reminders: 0, contests: 0, expiring: 0 };
  // 1) 30 daqiqa ichida boshlanadigan uchrashuvlar
  const soon = new Date(Date.now() + 30 * 60000).toISOString();
  const { data: meets } = await admin.from('ka_meetings').select('id').eq('reminded', false).lte('starts_at', soon).gte('starts_at', new Date(Date.now() - 10 * 60000).toISOString());
  for (const mt of meets || []) {
    await admin.from('ka_meetings').update({ reminded: true }).eq('id', mt.id);
    out.reminders += await announceMeeting(mt.id, true);
  }
  // 2) Ochilgan tanlovlar haqida e'lon
  const { data: tests } = await admin.from('ka_tests').select('id,title,time_limit_min,closes_at,questions').eq('kind', 'contest').eq('active', true).eq('announced', false).lte('opens_at', new Date().toISOString());
  for (const t of tests || []) {
    await admin.from('ka_tests').update({ announced: true }).eq('id', t.id);
    if (t.closes_at && new Date(t.closes_at) < new Date()) continue;
    const { data: members } = await admin.from('ka_members').select('chat_id').eq('status', 'active').not('chat_id', 'is', null);
    for (const m of members || []) {
      await send(m.chat_id, `🏆 <b>Tanlov boshlandi!</b>\n\n${esc(t.title)}\n${(t.questions as any[]).length} savol${t.time_limit_min ? ` · ⏱ ${t.time_limit_min} daqiqa` : ''}${t.closes_at ? `\n⌛ ${fmtDate(t.closes_at)} gacha` : ''}\n\n🔒 Yopiq test — bitta urinish.`,
        { reply_markup: { inline_keyboard: [[{ text: '▶️ Qatnashish', callback_data: `ts:${t.id}` }]] } }).catch(() => {});
      out.contests++;
      await sleep(40);
    }
  }
  // 3) A'zolik muddati 3 kun ichida tugaydiganlar (bir marta eslatish)
  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  if (ms.enabled) {
    const { data: exp } = await admin.from('ka_members').select('id,chat_id,paid_until,paid_reminded_at')
      .gt('paid_until', new Date().toISOString()).lt('paid_until', new Date(Date.now() + 3 * 86400000).toISOString());
    for (const m of exp || []) {
      if (m.paid_reminded_at && new Date(m.paid_reminded_at) > new Date(new Date(m.paid_until).getTime() - 4 * 86400000)) continue;
      await admin.from('ka_members').update({ paid_reminded_at: new Date().toISOString() }).eq('id', m.id);
      if (m.chat_id) await send(m.chat_id, `💳 A’zoligingiz <b>${fmtDate(m.paid_until)}</b> da tugaydi.\nUzaytirish: ${money(ms.price)} / ${ms.days} kun — /azolik`).catch(() => {});
      out.expiring++;
    }
  }
  return out;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST kerak' }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');

  // Cron (pg_cron → pg_net)
  if (action === 'cron') {
    const secret = await getSecret('cron_secret');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ ok: false, error: 'forbidden' }, 403);
    try { return json({ ok: true, ...(await runCron()) }); } catch (e) { console.error(e); return json({ ok: false, error: String(e) }, 500); }
  }

  const staff = await callerStaff(req);
  if (!staff || !ROLES[action]?.includes(staff.role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
  const token = await getSecret('telegram_bot_token');
  if (!token && action !== 'media') return json({ ok: false, error: 'Bot tokeni kiritilmagan (⚙️ Sozlamalar → Bot)' });

  try {
    switch (action) {
      case 'status': {
        const [me, wh] = await Promise.all([tg('getMe', {}), tg('getWebhookInfo', {})]);
        return json({ ok: true, bot: me.result || null, webhook: wh.result || null, expected: `${SUPABASE_URL}/functions/v1/ka-bot`, error: me.ok ? undefined : me.description });
      }
      case 'setup': {
        const url = `${SUPABASE_URL}/functions/v1/ka-bot`;
        const wh = await tg('setWebhook', { url, secret_token: await webhookSecret(token), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
        const commands = [
          { command: 'start', description: 'Bosh menyu' },
          { command: 'kitoblar', description: 'Kitoblar: PDF, audio, qo‘llanma' },
          { command: 'testlar', description: 'Kitob testlari' },
          { command: 'guruhlar', description: 'Guruhlarim va uchrashuvlar' },
          { command: 'tanlovlar', description: 'Yakuniy tanlovlar' },
          { command: 'natijalar', description: 'Natijalarim va sertifikatlar' },
          { command: 'reyting', description: 'Kitobxonlar reytingi' },
          { command: 'azolik', description: 'A’zolik va to‘lov' },
          { command: 'yordam', description: 'Yordam' },
          { command: 'cancel', description: 'Bekor qilish' }
        ];
        const cmd = await tg('setMyCommands', { commands });
        await tg('setMyDescription', { description: `${ACADEMY}: kitob o‘qing, test topshiring, audio taqriz yuboring va sertifikat oling. Kitobxonlik guruhlari, onlayn uchrashuvlar va tanlovlar.` }).catch(() => {});
        await tg('setMyShortDescription', { short_description: `📚 ${ACADEMY}` }).catch(() => {});
        const me = await tg('getMe', {});
        if (me.ok) await admin.from('ka_settings').upsert({ key: 'botUsername', value: me.result.username });
        const miniApp = String(body.miniAppUrl || await getSetting<string>('miniAppUrl', '') || '');
        let menu: any = null;
        if (miniApp) {
          await admin.from('ka_settings').upsert({ key: 'miniAppUrl', value: miniApp });
          menu = await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: '📱 Ilova', web_app: { url: miniApp } } });
        }
        if (!wh.ok) return json({ ok: false, error: wh.description });
        return json({ ok: true, url, commands: cmd.ok, miniApp: menu?.ok ? miniApp : null, miniAppError: menu && !menu.ok ? menu.description : undefined });
      }
      case 'media': {
        // Faqat bazada mavjud fayllar (taqriz ovozi yoki to'lov cheki) — bot tokeni brauzerga chiqmaydi
        const fileId = String(body.fileId || '');
        const [{ data: rv }, { data: pay }] = await Promise.all([
          admin.from('ka_reviews').select('id').eq('file_id', fileId).limit(1).maybeSingle(),
          admin.from('ka_payments').select('id').eq('receipt_file_id', fileId).limit(1).maybeSingle()
        ]);
        const allowed = (rv && ['admin', 'moderator'].includes(staff.role)) || (pay && ['admin', 'kassir'].includes(staff.role));
        if (!allowed) return json({ ok: false, error: 'Fayl topilmadi' }, 404);
        const info = await tg('getFile', { file_id: fileId }, token);
        if (!info.ok) return json({ ok: false, error: info.description }, 404);
        const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
        const ext = String(info.result.file_path).split('.').pop()?.toLowerCase();
        const type = ext === 'oga' || ext === 'ogg' ? 'audio/ogg' : ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
        return new Response(res.body, { headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
      }
      case 'grade_review': {
        const score = Math.max(0, Math.min(10, Math.round(Number(body.score) || 0)));
        const r = await gradeReview(Number(body.id), score, String(body.comment || '').slice(0, 1000), staff.id, !!body.again);
        return json(r);
      }
      case 'contest_publish':
        return json(await publishContest(Number(body.id)));
      case 'resend_cert':
        return json(await sendCertificate(Number(body.id)));
      case 'payment_decide': {
        const status = body.status === 'Tasdiqlandi' ? 'Tasdiqlandi' : 'Rad etildi';
        const { data: p, error } = await admin.from('ka_payments').update({ status, approved_by: staff.id, note: body.note ?? undefined }).eq('id', Number(body.id)).select('*, member:ka_members(chat_id,paid_until)').single();
        if (error) return json({ ok: false, error: error.message });
        const chat = (p.member as any)?.chat_id;
        if (chat) {
          const { data: m } = await admin.from('ka_members').select('paid_until').eq('id', p.member_id).single();
          await send(chat, status === 'Tasdiqlandi'
            ? `✅ To‘lovingiz tasdiqlandi (${money(p.amount)}).\n💳 A’zolik <b>${fmtDate(m!.paid_until)}</b> gacha faol. Rahmat!`
            : `❌ To‘lov cheki tasdiqlanmadi.${body.note ? `\nSabab: ${esc(body.note)}` : ''}\nSavollar bo‘lsa administratorga yozing.`).catch(() => {});
        }
        return json({ ok: true });
      }
      case 'payment_add': {
        const { data: p, error } = await admin.from('ka_payments').insert({
          member_id: Number(body.memberId), amount: Number(body.amount) || 0, days: Number(body.days) || 30,
          method: ['naqd', 'karta', 'o‘tkazma', 'boshqa'].includes(body.method) ? body.method : 'naqd',
          note: body.note || null, status: 'Tasdiqlandi', created_by: staff.id, approved_by: staff.id
        }).select('member_id').single();
        if (error) return json({ ok: false, error: error.message });
        const { data: m } = await admin.from('ka_members').select('chat_id,paid_until').eq('id', p.member_id).single();
        if (m?.chat_id) await send(m.chat_id, `✅ To‘lov qabul qilindi. 💳 A’zolik <b>${fmtDate(m.paid_until)}</b> gacha faol.`).catch(() => {});
        return json({ ok: true });
      }
      case 'meeting_notify': {
        const { data: mt } = await admin.from('ka_meetings').select('group_id').eq('id', Number(body.id)).maybeSingle();
        if (!mt || !(await canGroup(staff, mt.group_id))) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
        return json({ ok: true, sent: await announceMeeting(Number(body.id), false) });
      }
      case 'broadcast': {
        const text = String(body.text || '').trim().slice(0, 3500);
        if (!text) return json({ ok: false, error: 'Matn bo‘sh' });
        let chats: number[] = [];
        if (String(body.audience || 'all').startsWith('group:')) {
          chats = (await groupChats(Number(String(body.audience).slice(6)))).map(m => m.chat_id);
        } else {
          let q = admin.from('ka_members').select('chat_id').eq('status', 'active').not('chat_id', 'is', null);
          if (body.audience === 'paid') q = q.gt('paid_until', new Date().toISOString());
          if (body.audience === 'unpaid') q = q.or(`paid_until.is.null,paid_until.lt.${new Date().toISOString()}`);
          const { data } = await q;
          chats = (data || []).map(m => m.chat_id);
        }
        let sent = 0;
        for (const c of chats) {
          const r = await send(c, `📢 ${esc(text)}`).catch(() => ({ ok: false }));
          if (r.ok) sent++;
          await sleep(40);
        }
        return json({ ok: true, total: chats.length, sent });
      }
    }
    return json({ ok: false, error: 'Noma’lum amal' }, 400);
  } catch (e) {
    console.error(action, e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
