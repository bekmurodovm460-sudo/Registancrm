// Telegram botni boshqarish (faqat CRM xodimlari): holat, webhook o'rnatish, karta rasmini yuborish
import { callerRole, cors, getSecret, json, SUPABASE_URL, tg, webhookSecret } from '../_shared/common.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const role = await callerRole(req);
  if (!['admin', 'operator'].includes(role)) return json({ ok: false, error: 'Ruxsat yo‘q' }, 403);

  const body = await req.json().catch(() => ({}));
  const token = await getSecret('telegram_bot_token');
  if (!token) return json({ ok: false, error: 'Bot tokeni kiritilmagan (Telegram Bot bo‘limi → admin)' });

  try {
    switch (body.action) {
      case 'status': {
        const me = await tg(token, 'getMe', {});
        const wh = await tg(token, 'getWebhookInfo', {});
        const adminChat = await getSecret('telegram_admin_chat_id');
        return json({ ok: me.ok, bot: me.result, webhook: wh.result, adminChatSet: !!adminChat, error: me.ok ? undefined : me.description });
      }
      case 'setWebhook': {
        if (role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        const url = `${SUPABASE_URL}/functions/v1/telegram-bot`;
        const r = await tg(token, 'setWebhook', {
          url,
          secret_token: await webhookSecret(token),
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true
        });
        await tg(token, 'setMyCommands', {
          commands: [
            { command: 'start', description: 'Bosh menyu' },
            { command: 'cancel', description: 'Bekor qilish' },
            { command: 'id', description: 'Chat ID ni ko‘rish' }
          ]
        });
        return json({ ok: r.ok, url, error: r.ok ? undefined : r.description });
      }
      case 'sendPhoto': {
        const chatId = String(body.chatId || '').trim() || await getSecret('telegram_admin_chat_id');
        if (!chatId) return json({ ok: false, error: 'Chat ID kiritilmagan' });
        const b64 = String(body.photoBase64 || '').replace(/^data:image\/\w+;base64,/, '');
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', new Blob([bytes], { type: 'image/png' }), body.fileName || 'card.png');
        if (body.caption) form.append('caption', String(body.caption).slice(0, 1000));
        const r = await tg(token, 'sendPhoto', form);
        return json({ ok: r.ok, error: r.ok ? undefined : r.description });
      }
      case 'sendMessage': {
        const chatId = Number(body.chatId);
        if (!chatId || !body.text) return json({ ok: false, error: 'chatId va text kerak' });
        const r = await tg(token, 'sendMessage', { chat_id: chatId, text: String(body.text).slice(0, 4000) });
        return json({ ok: r.ok, error: r.ok ? undefined : r.description });
      }
      default:
        return json({ ok: false, error: 'Noma’lum amal' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});



