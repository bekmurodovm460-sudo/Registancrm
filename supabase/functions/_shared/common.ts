// Edge functionlar uchun umumiy yordamchilar
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export async function getSecret(key: string): Promise<string> {
  const { data } = await admin.from('crm_secrets').select('value').eq('key', key).maybeSingle();
  return (data?.value as string) || '';
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('crm_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

/** Chaqiruvchining CRM rolini aniqlash (JWT orqali) */
export async function callerRole(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return '';
  const { data: u } = await admin.auth.getUser(auth.slice(7));
  if (!u?.user) return '';
  const { data } = await admin.from('crm_profiles').select('role').eq('id', u.user.id).maybeSingle();
  return (data?.role as string) || '';
}

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Telegram webhook secret_token — bot tokenidan hosil qilinadi */
export async function webhookSecret(token: string) {
  return (await sha256Hex('registan-crm:' + token)).slice(0, 48);
}

export async function tg(token: string, method: string, body: Record<string, unknown> | FormData) {
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body)
  });
  const out = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  // Telegram rad etgan so'rovlarni logga yozamiz (aks holda bot "jim" qoladi va sababi ko'rinmaydi)
  if (!out.ok) console.error(`tg ${method} failed:`, out.error_code ?? '', out.description ?? '');
  return out;
}
