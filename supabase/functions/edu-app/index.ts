// =========================================================
// Moliya boti Mini App API (Telegram initData bilan, edu_bot_token)
//  • attendance — Edutizim davomati: Toq (Du·Ch·Ju) va Juft (Se·Pa·Sh) kunlar alohida
//    har guruh: kelgan / sababli / sababsiz / belgilanmagan (guruh ro'yxatiga nisbatan)
// Faqat o'qiydi — Edutizimda hech narsa o'zgartirilmaydi.
// =========================================================
import { admin, cors, getSecret, getSetting, json, SUPABASE_URL, tg } from '../_shared/common.ts';

const enc = new TextEncoder();
async function hmac(key: Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
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
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

async function edu(action: string, body: Record<string, unknown> = {}): Promise<any> {
  const secret = await getSecret('cron_secret');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/edutizim-sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ action, ...body }) });
  return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
}

const TZ = 5 * 3600_000, DAY = 86400_000;
// Edutizim kunlari: 1 = Yakshanba … 7 = Shanba
export const PATTERNS = { toq: [2, 4, 6], juft: [3, 5, 7] } as const;
const eduDay = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay() + 1;
const localYmd = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);
/** Shu kun turidagi eng so'nggi dars kuni (bugun ham bo'lishi mumkin) */
export function lastDayOf(kind: 'toq' | 'juft', now = Date.now()) {
  for (let i = 0; i < 7; i++) { const d = localYmd(now - i * DAY); if ((PATTERNS[kind] as readonly number[]).includes(eduDay(d))) return d; }
  return localYmd(now);
}
// Izoh muallifi: bot orqali yozilganlarda "[Bot · Ism]" / "[Ustoz Ism]" belgisi
function noteOf(c: any) {
  const t = String(c?.text || '');
  let m = /^\[Bot · ([^\]]+)\]\s*/.exec(t);
  if (m) return { who: m[1], via: 'bot', text: t.slice(m[0].length), at: c.at };
  m = /^\[Ustoz ([^\]]+)\]\s*/.exec(t);
  if (m) return { who: m[1], via: 'ustoz', text: t.slice(m[0].length), at: c.at };
  return { who: c?.by || '—', via: 'edutizim', text: t, at: c.at };
}
const fullName = (o: any) => [o?.firstName, o?.lastName].filter(Boolean).join(' ').trim() || String(o?.fullName || '').trim();

async function roleOf(tgId: number) {
  const [owners, chat] = await Promise.all([getSetting<any[]>('botAdmins', []), getSecret('telegram_admin_chat_id')]);
  if ([...(owners || []).map(String), String(chat || '')].includes(String(tgId))) return { role: 'top', user: null as any };
  const { data } = await admin.from('crm_edu_bot_users').select('role,full_name,employee_id').eq('tg_id', tgId).maybeSingle();
  return { role: String(data?.role || 'none'), user: data };
}

async function attendanceFor(day: string, kind: 'toq' | 'juft', teacherId?: string) {
  // Edutizim sana filtri kun bo'yicha keng ishlaydi — aniq kunni lessonDate bo'yicha ajratamiz
  const states = ['attended', 'reasonable', 'unreasonable'];
  // Ketma-ket: Edutizim bir vaqtdagi ko'p kirishni rad etadi
  const res: any[] = [];
  for (const state of states) {
    let r = await edu('read', { path: '/attendance-histoy-pagin', body: { state, fromDate: `${day}T00:00:00.000Z`, toDate: `${day}T23:59:59.999Z` }, limit: 200, pages: 15 });
    if (!r.ok && /kirib bo/.test(String(r.error))) { await new Promise(ok => setTimeout(ok, 1200)); r = await edu('read', { path: '/attendance-histoy-pagin', body: { state, fromDate: `${day}T00:00:00.000Z`, toDate: `${day}T23:59:59.999Z` }, limit: 200, pages: 15 }); }
    res.push(r);
  }
  const bad = res.find(r => !r.ok);
  if (bad) throw new Error(bad.error || 'Edutizim davomati');
  const recs = res.flatMap(r => r.items || []).filter((a: any) => String(a.lessonDate || '').slice(0, 10) === day && !a.isTrial);
  const [{ data: groups }, { data: links }] = await Promise.all([
    admin.from('crm_edu_groups').select('id,name,data'),
    admin.rpc('crm_edu_links', { p_teacher: teacherId || null, p_student: null })
  ]);
  const days = PATTERNS[kind] as readonly number[];
  const roster = new Map<string, { id: string; name: string }[]>();
  ((links as any[]) || []).forEach(l => (roster.get(l.group_id) || roster.set(l.group_id, []).get(l.group_id)!).push({ id: l.student_id, name: l.student_name }));
  const out: any[] = [];
  for (const g of groups || []) {
    const d = g.data || {};
    if ((d.state || 'active') !== 'active') continue;
    const gd = (d.courseDay?.days || []).map(Number);
    if (!gd.some((x: number) => days.includes(x))) continue;
    if (teacherId && String(d.teacherId || '') !== teacherId) continue;
    const mine = recs.filter((a: any) => (a.groupId || a.group?._id) === g.id);
    const seen = new Map<string, any>();
    mine.forEach((a: any) => seen.set(String(a.studentId || a.student?._id), a));
    const list = roster.get(String(g.id)) || [];
    const byState = (st: string) => [...seen.values()].filter(a => a.state === st).map(a => ({ id: String(a.studentId || a.student?._id), name: fullName(a.student), reason: a.reason?.name || a.reason || '', manager: fullName(a.moderator) }));
    const unmarked = list.filter(s => !seen.has(s.id)).map(s => ({ id: s.id, name: s.name }));
    const attended = byState('attended'), reasonable = byState('reasonable'), unreasonable = byState('unreasonable');
    out.push({
      id: g.id, name: String(d.name || g.name || '').replace(/\s+/g, ' ').trim(), room: String(d.room?.name || '').replace(/\s+/g, ' ').trim(),
      start: d.courseShift?.startHour || '', end: d.courseShift?.endHour || '', teacher: fullName(d.teacher), course: String(d.course?.name || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(),
      total: Math.max(list.length, seen.size), attended: attended.length, reasonable: reasonable.length, unreasonable: unreasonable.length, unmarked: unmarked.length,
      marked: seen.size > 0, absentList: [...unreasonable.map(x => ({ ...x, st: 'unreasonable' })), ...reasonable.map(x => ({ ...x, st: 'reasonable' }))], unmarkedList: unmarked
    });
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  // 💬 Kelmaganlarga menejer izohlari + mas'ul menejer (belgilanmaganlarga — o'quvchi kartasidagi menejer)
  const absentIds = [...new Set(out.flatMap(g => g.absentList.map((x: any) => x.id)))];
  const unmarkedIds = [...new Set(out.flatMap(g => g.unmarkedList.map((x: any) => x.id)))];
  const dayStartMs = new Date(day + 'T00:00:00Z').getTime() - TZ;
  let comments: Record<string, any[]> = {};
  if (absentIds.length) {
    const cm = await edu('commentsFor', { studentIds: absentIds, limit: 3 });
    if (cm.ok) comments = cm.comments || {};
  }
  const mgr = new Map<string, string>();
  for (let i = 0; i < unmarkedIds.length; i += 200) {
    const { data } = await admin.from('crm_edu_students').select('id,data->moderator').in('id', unmarkedIds.slice(i, i + 200));
    (data || []).forEach((r: any) => mgr.set(String(r.id), fullName(r.moderator)));
  }
  const managers = new Map<string, { n: number; done: number }>();
  for (const g of out) {
    g.absentList = g.absentList.map((x: any) => {
      const list = (comments[x.id] || []).map(noteOf);
      const today = list.filter(n => n.at && new Date(n.at).getTime() >= dayStartMs);
      const k = x.manager || '—';
      const v = managers.get(k) || { n: 0, done: 0 }; v.n++; if (today.length) v.done++; managers.set(k, v);
      return { ...x, noted: today.length > 0, notes: (today.length ? today : list).slice(0, 2) };
    });
    g.unmarkedList = g.unmarkedList.map((x: any) => ({ ...x, manager: mgr.get(x.id) || '' }));
    g.noted = g.absentList.filter((x: any) => x.noted).length;
  }
  const sum = (k: string) => out.reduce((s, g) => s + g[k], 0);
  return {
    kind, day, weekday: eduDay(day), groups: out,
    managers: [...managers.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => (b.n - b.done) - (a.n - a.done) || a.name.localeCompare(b.name)),
    totals: { groups: out.length, marked: out.filter(g => g.marked).length, total: sum('total'), attended: sum('attended'), reasonable: sum('reasonable'), unreasonable: sum('unreasonable'), unmarked: sum('unmarked'), absent: out.reduce((n, g) => n + g.absentList.length, 0), noted: sum('noted') }
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const token = await getSecret('edu_bot_token');
  const user = await verifyInitData(String(body.initData || ''), token);
  if (!user?.id) return json({ ok: false, error: 'Telegram orqali oching' }, 401);
  const { role, user: u } = await roleOf(user.id);
  if (!['top', 'senior', 'service', 'teacher', 'media'].includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
  const MEDIA_ROLES = ['top', 'senior', 'media'];
  try {
    // 🎬 Video montaj: brauzerda tayyorlangan videoni yopiq bucket'ga yuklash → bot chatga yuboradi
    if (body.action === 'mediaUploadUrl') {
      if (!MEDIA_ROLES.includes(role)) return json({ ok: false, error: 'Video montaj — media, katta va top menejer uchun' }, 403);
      const ext = body.ext === 'mp4' ? 'mp4' : 'webm';
      const size = Number(body.size) || 0;
      if (size > 50 * 1024 * 1024) return json({ ok: false, error: 'Video 50 MB dan katta. Qisqaroq yoki past sifatda eksport qiling.' });
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { data, error } = await admin.storage.from('edu-media').createSignedUploadUrl(path);
      if (error || !data) return json({ ok: false, error: error?.message || 'Yuklash havolasi olinmadi' });
      return json({ ok: true, path, url: data.signedUrl, token: data.token });
    }
    // 🤖 AI montaj loyihasi: reja + fayllar (Telegram'dan, 20 MB gacha)
    if (body.action === 'aiProject' || body.action === 'aiFile') {
      if (!MEDIA_ROLES.includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
      const { data: pr } = await admin.from('crm_ai_projects').select('*').eq('id', String(body.id || '')).maybeSingle();
      if (!pr || Number(pr.tg_id) !== Number(user.id)) return json({ ok: false, error: 'Loyiha topilmadi' }, 404);
      if (body.action === 'aiProject') return json({ ok: true, plan: pr.plan, files: (pr.files || []).map((f: any) => ({ kind: f.kind, duration: f.duration, width: f.width, height: f.height })) });
      const f = (pr.files || [])[Number(body.i)];
      if (!f) return json({ ok: false, error: 'Fayl topilmadi' }, 404);
      const gf = await tg(token, 'getFile', { file_id: f.file_id });
      if (!gf?.ok) return json({ ok: false, error: 'Telegram: ' + (gf?.description || 'fayl olinmadi') });
      const fr = await fetch(`https://api.telegram.org/file/bot${token}/${gf.result.file_path}`);
      if (!fr.ok || !fr.body) return json({ ok: false, error: 'Fayl yuklanmadi' });
      const ct = f.kind === 'video' ? (String(gf.result.file_path).endsWith('.mov') ? 'video/quicktime' : 'video/mp4') : 'image/jpeg';
      return new Response(fr.body, { headers: { ...cors, 'Content-Type': ct, 'Cache-Control': 'private, max-age=3600' } });
    }
    if (body.action === 'mediaSend') {
      if (!MEDIA_ROLES.includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);
      const path = String(body.path || '');
      if (!path.startsWith(`${user.id}/`) || path.includes('..')) return json({ ok: false, error: 'Noto‘g‘ri fayl' }, 400);
      const caption = String(body.caption || '🎬 Video tayyor — Registan LC').slice(0, 900);
      const { data: file, error } = await admin.storage.from('edu-media').download(path);
      if (error || !file) return json({ ok: false, error: 'Fayl topilmadi: ' + (error?.message || '') });
      const mp4 = path.endsWith('.mp4');
      const form = new FormData();
      form.append('chat_id', String(user.id));
      form.append(mp4 ? 'video' : 'document', file, `Registan_video_${new Date(Date.now() + TZ).toISOString().slice(0, 16).replace(/[-:T]/g, '')}.${mp4 ? 'mp4' : 'webm'}`);
      form.append('caption', caption);
      if (mp4) { form.append('supports_streaming', 'true'); if (body.width) form.append('width', String(body.width)); if (body.height) form.append('height', String(body.height)); if (body.duration) form.append('duration', String(Math.round(body.duration))); }
      const r = await tg(token, mp4 ? 'sendVideo' : 'sendDocument', form);
      await admin.storage.from('edu-media').remove([path]).catch(() => {});
      if (!r?.ok) return json({ ok: false, error: `Telegram: ${r?.description || 'yuborilmadi'}` });
      return json({ ok: true });
    }
    if (body.action === 'attendance') {
      if (role === 'media') return json({ ok: false, error: 'Davomat media roli uchun yopiq' }, 403);
      const kind = body.kind === 'juft' ? 'juft' : 'toq';
      const today = localYmd(Date.now());
      let day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.day || '')) ? String(body.day) : lastDayOf(kind);
      if (day > today) day = lastDayOf(kind);
      if (!(PATTERNS[kind] as readonly number[]).includes(eduDay(day))) day = lastDayOf(kind, new Date(day + 'T12:00:00Z').getTime() - TZ);
      const teacherId = role === 'teacher' ? (u?.employee_id || '__none__') : undefined;
      const data = await attendanceFor(day, kind, teacherId);
      return json({ ok: true, role, name: u?.full_name || user.first_name || '', today, ...data });
    }
    return json({ ok: false, error: 'Noma’lum amal' }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) });
  }
});
