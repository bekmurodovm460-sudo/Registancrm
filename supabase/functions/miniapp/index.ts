// =========================================================
// Telegram Mini App backend
//  • Har bir so'rov Telegram initData imzosi bilan tekshiriladi (HMAC, bot token)
//  • Kids Mock ro'yxati, e'lon qilingan javoblar kaliti, varaq natijasini serverda baholash
// Javob kaliti mijozga yuborilmaydi (faqat e'lon qilinganlari) — baholash shu yerda.
// =========================================================
import { admin, cors, getSecret, getSetting, json, tg } from '../_shared/common.ts';
import { gradeAnswers } from '../_shared/omr.js';

const enc = new TextEncoder();
async function hmac(key: Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

/** https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
async function verifyInitData(initData: string, token: string) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), token);
  if (hex(await hmac(secret, dcs)) !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null; // 24 soatdan eski
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

async function notifyAdmin(token: string, text: string) {
  const chat = await getSecret('telegram_admin_chat_id');
  if (chat) await tg(token, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML' }).catch(() => {});
}

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST kerak' }, 405);
  const body = await req.json().catch(() => ({}));
  const token = await getSecret('telegram_bot_token');
  const user = await verifyInitData(String(body.initData || ''), token);
  if (!user?.id) return json({ ok: false, error: 'Ilovani Telegram bot ichidan oching' }, 401);
  const chatId = Number(user.id);

  try {
    switch (body.action) {
      // ---------- boshlang'ich ma'lumotlar ----------
      case 'init': {
        const [sessions, tests, keys, schools, regs] = await Promise.all([
          getSetting<string[]>('mockSessions', ['2026-11 (Noyabr Mock)']),
          admin.from('crm_tests').select('code,title,kind,num_questions,num_options,q1_count,w1,w2').eq('active', true).order('created_at', { ascending: false }).limit(30),
          admin.from('crm_tests').select('code,title,kind,num_questions').eq('answers_published', true).order('created_at', { ascending: false }).limit(30),
          admin.from('crm_schools').select('id,data').order('id'),
          admin.from('crm_mock_registrations').select('id,full_name,grade,phone,session,room,status,created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(20)
        ]);
        return json({
          ok: true,
          user: { id: user.id, first_name: user.first_name, username: user.username },
          sessions,
          tests: tests.data || [],
          keys: keys.data || [],
          schools: (schools.data || []).map(s => ({ id: s.id, name: (s.data as any)?.name || s.id })),
          registrations: regs.data || []
        });
      }

      // ---------- sinflar ----------
      case 'classes': {
        const { data } = await admin.from('crm_classes').select('name').eq('school_id', String(body.school || ''));
        const names = (data || []).map(c => c.name as string).sort((a, b) => a.localeCompare(b, 'uz', { numeric: true }));
        return json({ ok: true, classes: names });
      }

      // ---------- javoblar kaliti (faqat e'lon qilingan) ----------
      case 'key': {
        const { data: t } = await admin.from('crm_tests').select('code,title,num_questions,q1_count,w1,w2,answer_key')
          .eq('code', String(body.code || '')).eq('answers_published', true).maybeSingle();
        if (!t) return json({ ok: false, error: 'Bu test javoblari hali e’lon qilinmagan' });
        return json({ ok: true, test: t });
      }

      // ---------- Kids Mock ro'yxatdan o'tish ----------
      case 'register': {
        const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        const grade = String(body.grade || '').trim().slice(0, 30);
        const digits = String(body.phone || '').replace(/\D/g, '');
        const sessions = await getSetting<string[]>('mockSessions', ['2026-11 (Noyabr Mock)']);
        const session = sessions.includes(body.session) ? String(body.session) : (sessions[0] || '');
        if (name.length < 3) return json({ ok: false, error: 'Ism-familiyani to‘liq yozing' });
        if (!grade) return json({ ok: false, error: 'Sinfni tanlang' });
        if (digits.length < 9) return json({ ok: false, error: 'Telefon raqamini to‘g‘ri kiriting' });
        const phone = '+998' + digits.slice(-9);
        const { data: dup } = await admin.from('crm_mock_registrations').select('id,room,session').eq('session', session).eq('phone', phone).ilike('full_name', name).maybeSingle();
        if (dup) return json({ ok: true, duplicate: true, registration: dup });
        const room = await pickRoom(session);
        const { data: reg, error } = await admin.from('crm_mock_registrations').insert({
          chat_id: chatId, tg_username: user.username || null, full_name: name, grade, phone, session, room
        }).select('id,full_name,grade,phone,session,room,status,created_at').single();
        if (error) throw error;
        await notifyAdmin(token, `🧒 Yangi Kids Mock arizasi (Mini App): <b>${esc(name)}</b> · ${esc(grade)} · ${esc(phone)} · ${esc(room)}`);
        return json({ ok: true, registration: reg });
      }

      case 'mine': {
        const { data } = await admin.from('crm_mock_registrations').select('id,full_name,grade,phone,session,room,status,created_at').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(20);
        return json({ ok: true, registrations: data || [] });
      }

      // ---------- varaq natijasi (javoblar telefonda o'qilgan, baholash shu yerda) ----------
      case 'check': {
        const { data: test } = await admin.from('crm_tests').select('*').eq('code', String(body.code || '')).eq('active', true).maybeSingle();
        if (!test) return json({ ok: false, error: 'Test topilmadi yoki yopilgan' });
        const answers = String(body.answers || '').toUpperCase().replace(/[^A-E*\-]/g, '').slice(0, test.num_questions);
        if (answers.length !== test.num_questions) return json({ ok: false, error: 'Varaq to‘liq o‘qilmadi' });
        const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        if (name.length < 3) return json({ ok: false, error: 'Ism-familiyani yozing' });
        const g = gradeAnswers(answers, test);
        const q1 = Number(test.q1_count) ? g.q1 : g.correct;
        const q2 = Number(test.q1_count) ? g.q2 : 0;

        let rec: any = null;
        let schoolName = '';
        if (test.kind === 'school') {
          const school = String(body.school || '');
          const cls = String(body.cls || '');
          const { data: c } = await admin.from('crm_classes').select('name').eq('school_id', school).eq('name', cls).maybeSingle();
          if (!c) return json({ ok: false, error: 'Maktab va sinfni tanlang' });
          const { data: sc } = await admin.from('crm_schools').select('data').eq('id', school).maybeSingle();
          schoolName = (sc?.data as any)?.name || school;
          const { data: r, error } = await admin.rpc('crm_bot_record_result', {
            p_school: school, p_class: cls, p_name: name, p_q1: q1, p_q2: q2, p_score: g.score, p_test: test.code
          });
          if (error) throw error;
          rec = (r as any[])?.[0] || null;
        }
        const { data: sub } = await admin.from('crm_omr_submissions').insert({
          test_code: test.code, source: 'miniapp', chat_id: chatId, student_name: name, answers,
          correct: g.correct, q1_correct: g.q1, q2_correct: g.q2, score: g.score,
          school_id: body.school || null, class_name: body.cls || null, student_id: rec?.student_id || null,
          details: { wrong: g.wrong }
        }).select('id').single();
        if (sub && test.kind === 'mock') {
          const mockId = 900000000 + Number(sub.id);
          await admin.from('crm_mock_students').upsert({ id: mockId, data: { id: mockId, fullName: name, room: 'Mini App', session: test.session || '', q1, q2, score: g.score, source: 'miniapp-omr', testCode: test.code } });
          await admin.from('crm_omr_submissions').update({ mock_student_id: mockId }).eq('id', sub.id);
        }
        await notifyAdmin(token, `📸 Mini App OMR: <b>${esc(name)}</b>${body.cls ? ` (${esc(schoolName)}, ${esc(body.cls)})` : ''} · ${esc(test.code)} · ${g.correct}/${g.total} · ${g.score} ball${rec && !rec.matched ? ' · 🆕 yangi o‘quvchi' : ''}`);
        // Kalit e'lon qilinmagan bo'lsa, to'g'ri javoblarni ko'rsatmaymiz — faqat qaysi savollar xato
        const showKey = !!test.answers_published;
        return json({
          ok: true,
          result: {
            total: g.total, correct: g.correct, q1: g.q1, q2: g.q2, score: g.score,
            q1Count: Number(test.q1_count) || 0, w1: Number(test.w1), w2: Number(test.w2),
            wrong: g.wrong.map(w => ({ q: w.q, given: w.given, right: showKey ? w.right : null })),
            crm: rec ? { matched: rec.matched, fullName: rec.full_name, school: schoolName, cls: body.cls } : null
          }
        });
      }

      default:
        return json({ ok: false, error: 'Noma’lum amal' }, 400);
    }
  } catch (e) {
    console.error('miniapp', e);
    return json({ ok: false, error: 'Server xatosi: ' + String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
