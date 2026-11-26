// Kitobxonlik Akademiyasi — edge functionlar uchun umumiy yordamchilar
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const ACADEMY = 'Laylo Pardayeva Kitobxonlik Akademiyasi';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export async function getSecret(key: string): Promise<string> {
  const { data } = await admin.from('ka_secrets').select('value').eq('key', key).maybeSingle();
  return (data?.value as string) || '';
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('ka_settings').select('value').eq('key', key).maybeSingle();
  const v = data?.value as T | undefined;
  if (v && typeof v === 'object' && fallback && typeof fallback === 'object' && !Array.isArray(fallback)) return { ...fallback, ...v };
  return v ?? fallback;
}

export type Rules = { passPct: number; maxAttempts: number; audioMinSec: number; audioMaxSec: number; reviewPass: number };
export const DEFAULT_RULES: Rules = { passPct: 70, maxAttempts: 3, audioMinSec: 60, audioMaxSec: 120, reviewPass: 6 };
export type Membership = { enabled: boolean; price: number; days: number; card: string; cardOwner: string; note: string };
export const DEFAULT_MEMBERSHIP: Membership = { enabled: false, price: 50000, days: 30, card: '', cardOwner: '', note: '' };

/** Chaqiruvchi xodim (JWT orqali) */
export async function callerStaff(req: Request): Promise<{ id: string; role: string; full_name: string } | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const { data: u } = await admin.auth.getUser(auth.slice(7));
  if (!u?.user) return null;
  const { data } = await admin.from('ka_staff').select('id,role,full_name').eq('id', u.user.id).maybeSingle();
  return (data as any) || null;
}

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Telegram webhook secret_token — bot tokenidan hosil qilinadi */
export async function webhookSecret(token: string) {
  return (await sha256Hex('kitobxonlik-akademiya:' + token)).slice(0, 48);
}

let TOKEN = '';
let tokenAt = 0;
export async function botToken() {
  if (!TOKEN || Date.now() - tokenAt > 60_000) {
    TOKEN = await getSecret('telegram_bot_token');
    tokenAt = Date.now();
  }
  return TOKEN;
}

export async function tg(method: string, body: Record<string, unknown> | FormData, token?: string) {
  const t = token || await botToken();
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body)
  });
  return await res.json();
}

export const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

export async function send(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

/** Admin chati va botga ulangan admin/moderatorlarga xabar */
export async function notifyStaff(text: string, roles = ['admin', 'moderator'], extra: Record<string, unknown> = {}) {
  const chats = new Set<string>();
  const adminChat = await getSecret('telegram_admin_chat_id');
  if (adminChat) chats.add(adminChat);
  const { data } = await admin.from('ka_staff').select('tg_user_id').in('role', roles).not('tg_user_id', 'is', null);
  (data || []).forEach(s => chats.add(String(s.tg_user_id)));
  for (const c of chats) await send(c, text, extra).catch(() => {});
}

export async function sendPhotoBytes(chatId: number | string, png: Uint8Array, caption: string, extra: Record<string, unknown> = {}) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('caption', caption);
  fd.append('parse_mode', 'HTML');
  for (const [k, v] of Object.entries(extra)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  fd.append('photo', new Blob([png], { type: 'image/png' }), 'sertifikat.png');
  return tg('sendPhoto', fd);
}

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDay = (d: string | Date) =>
  new Date(d).toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' });
export const money = (n: number) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';

export function jitsiUrl(domain: string, room: string, name?: string) {
  const d = String(domain || 'meet.jit.si').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const hash = name ? `#userInfo.displayName=${encodeURIComponent(JSON.stringify(name))}` : '';
  return `https://${d}/${encodeURIComponent(room)}${hash}`;
}

/** A'zolik faolmi (yoqilmagan bo'lsa — hamma narsa ochiq) */
export function isPaid(member: { paid_until?: string | null }, ms: Membership) {
  if (!ms.enabled) return true;
  return !!member.paid_until && new Date(member.paid_until).getTime() > Date.now();
}

export function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
