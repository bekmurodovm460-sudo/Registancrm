// =========================================================
// Mini App backend: guruh chati, uchrashuvlar (Jitsi), profil
// Har bir so'rov Telegram initData HMAC imzosi bilan tekshiriladi (bot tokeni).
// =========================================================
import { admin, botToken, cors, DEFAULT_MEMBERSHIP, getSetting, isPaid, json, jitsiUrl, Membership } from '../_shared/common.ts';

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
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

// Oddiy spam himoyasi: bir a'zo — 2 soniyada 1 xabar (funksiya nusxasi ichida)
const lastSent = new Map<number, number>();

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST kerak' }, 405);
  const body = await req.json().catch(() => ({}));
  const user = await verifyInitData(String(body.initData || ''), await botToken());
  if (!user?.id) return json({ ok: false, error: 'Ilovani Telegram bot ichidan oching' }, 401);

  const { data: member } = await admin.from('ka_members').select('*').eq('tg_user_id', user.id).maybeSingle();
  if (!member) return json({ ok: false, error: 'not_registered' });
  if (member.status === 'blocked') return json({ ok: false, error: 'Hisobingiz cheklangan' }, 403);

  const ms = await getSetting<Membership>('membership', DEFAULT_MEMBERSHIP);
  const paid = isPaid(member, ms);

  async function myGroup(groupId: number) {
    const { data } = await admin.from('ka_group_members').select('group:ka_groups(*)').eq('member_id', member.id).eq('group_id', groupId).maybeSingle();
    const g = data?.group as any;
    if (!g || !g.active) return null;
    if (g.premium && !paid) return null;
    return g;
  }

  switch (String(body.action || '')) {
    case 'me': {
      const { data: gm } = await admin.from('ka_group_members').select('group:ka_groups(id,name,description,active,premium,book:ka_books(title,author))').eq('member_id', member.id);
      const groups = (gm || []).map(x => x.group as any).filter(g => g?.active);
      const jitsi = await getSetting<{ domain: string }>('jitsi', { domain: 'meet.jit.si' });
      const { data: meets } = groups.length
        ? await admin.from('ka_meetings').select('id,group_id,title,notes,starts_at,duration_min,room').in('group_id', groups.map(g => g.id))
          .gte('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString()).order('starts_at').limit(30)
        : { data: [] };
      const { data: comps } = await admin.from('ka_completions').select('kind,points').eq('member_id', member.id);
      const { data: openGroups } = await admin.from('ka_groups').select('id,name,description,premium,book:ka_books(title)').eq('active', true).eq('is_open', true).order('id');
      const joined = new Set(groups.map(g => g.id));
      return json({
        ok: true,
        member: { id: member.id, full_name: member.full_name, city: member.city, paid_until: member.paid_until },
        membership: { enabled: ms.enabled, paid, price: ms.price, days: ms.days },
        stats: { points: (comps || []).reduce((s, c) => s + Number(c.points || 0), 0), books: (comps || []).filter(c => c.kind === 'book').length, contests: (comps || []).filter(c => c.kind === 'contest').length },
        groups: groups.map(g => ({ ...g, locked: g.premium && !paid })),
        openGroups: (openGroups || []).filter(g => !joined.has(g.id)),
        meetings: (meets || []).filter(x => new Date(x.starts_at).getTime() + x.duration_min * 60000 > Date.now())
          .map(x => ({ ...x, url: jitsiUrl(jitsi.domain, x.room, member.full_name), room: undefined }))
      });
    }
    case 'messages': {
      const g = await myGroup(Number(body.groupId));
      if (!g) return json({ ok: false, error: 'Guruhga kirish huquqi yo‘q' }, 403);
      const after = Number(body.after || 0);
      let q = admin.from('ka_messages').select('id,member_id,staff_id,author_name,text,deleted,created_at').eq('group_id', g.id);
      q = after ? q.gt('id', after).order('id').limit(100) : q.order('id', { ascending: false }).limit(60);
      const { data } = await q;
      const rows = (after ? data : (data || []).reverse()) || [];
      return json({
        ok: true, me: member.id,
        group: { id: g.id, name: g.name },
        messages: rows.map(r => ({ id: r.id, mine: r.member_id === member.id, staff: !!r.staff_id, author: r.author_name, text: r.deleted ? null : r.text, at: r.created_at }))
      });
    }
    case 'send': {
      const g = await myGroup(Number(body.groupId));
      if (!g) return json({ ok: false, error: 'Guruhga kirish huquqi yo‘q' }, 403);
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return json({ ok: false, error: 'Xabar bo‘sh' });
      const last = lastSent.get(member.id) || 0;
      if (Date.now() - last < 2000) return json({ ok: false, error: 'Biroz sekinroq 🙂' }, 429);
      lastSent.set(member.id, Date.now());
      const { data, error } = await admin.from('ka_messages').insert({ group_id: g.id, member_id: member.id, author_name: member.full_name, text }).select('id,created_at').single();
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, id: data.id, at: data.created_at });
    }
    case 'join': {
      const id = Number(body.groupId || 0);
      const code = String(body.code || '').trim().toUpperCase();
      let q = admin.from('ka_groups').select('*').eq('active', true);
      q = id ? q.eq('id', id).eq('is_open', true) : q.eq('invite_code', code);
      const { data: g } = await q.maybeSingle();
      if (!g) return json({ ok: false, error: code ? 'Bunday kodli guruh topilmadi' : 'Guruh topilmadi' });
      if (g.premium && !paid) return json({ ok: false, error: 'Bu guruh pullik a’zolar uchun (botda /azolik)' });
      await admin.from('ka_group_members').upsert({ group_id: g.id, member_id: member.id }, { onConflict: 'group_id,member_id', ignoreDuplicates: true });
      return json({ ok: true, groupId: g.id, name: g.name });
    }
  }
  return json({ ok: false, error: 'Noma’lum amal' }, 400);
});
