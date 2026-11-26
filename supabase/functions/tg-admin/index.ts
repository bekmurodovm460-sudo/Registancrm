// Telegram botni boshqarish (faqat CRM xodimlari): holat, webhook o'rnatish, karta rasmini yuborish
import { callerRole, cors, getSecret, getSetting, json, SUPABASE_URL, tg, webhookSecret } from '../_shared/common.ts';

const DEFAULT_MINIAPP_URL = 'https://registanglobusmaktablar.netlify.app/miniapp.html';

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
        const commands = [
          { command: 'start', description: '🏠 Bosh menyu' },
          { command: 'javoblar', description: '🔑 Imtihon javoblari' },
          { command: 'top', description: '🏆 TOP-3 sovrindorlar' },
          { command: 'natija', description: '🔍 Farzandim natijasi' },
          { command: 'karta', description: '🏅 Yutuqli karta' },
          { command: 'tekshir', description: '📸 Varaqni tekshirish' },
          { command: 'royxat', description: '🧒 Kids Mock’ga yozilish' },
          { command: 'mening', description: '📋 Mening arizalarim' },
          { command: 'aloqa', description: '📞 Aloqa' },
          { command: 'yordam', description: 'ℹ️ Yordam' },
          { command: 'cancel', description: '❌ Bekor qilish' }
        ];
        const cmd = await tg(token, 'setMyCommands', { commands });
        // Admin chatida qo'shimcha /hisobot va /id
        const adminChat = await getSecret('telegram_admin_chat_id');
        let adminCmd: any = null;
        if (adminChat) {
          adminCmd = await tg(token, 'setMyCommands', {
            commands: [{ command: 'hisobot', description: '📊 Kunlik statistika' }, { command: 'id', description: '🆔 Chat ID' }, ...commands],
            scope: { type: 'chat', chat_id: Number(adminChat) || adminChat }
          });
        }
        // Mini App: botning menyu tugmasi ("📱 Ilova")
        const miniAppUrl = String(body.miniAppUrl || await getSetting<string>('miniAppUrl', '') || DEFAULT_MINIAPP_URL);
        const menu = await tg(token, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '📱 Ilova', web_app: { url: miniAppUrl } } });
        if (!r.ok || !cmd.ok) return json({ ok: false, url, error: r.description || cmd.description });
        return json({ ok: true, url, commands: cmd.ok, adminCommands: adminCmd ? adminCmd.ok : null, miniApp: menu.ok ? miniAppUrl : null, miniAppError: menu.ok ? undefined : menu.description });
      }
      // ---- Alohida Edutizim boti ----
      case 'eduStatus': {
        const t = await getSecret('edu_bot_token');
        if (!t) return json({ ok: false, error: 'Edutizim boti tokeni kiritilmagan' });
        const me = await tg(t, 'getMe', {});
        const wh = await tg(t, 'getWebhookInfo', {});
        return json({ ok: me.ok, bot: me.result, webhook: wh.result, error: me.ok ? undefined : me.description });
      }
      case 'setEduWebhook': {
        if (role !== 'admin') return json({ ok: false, error: 'Faqat admin' }, 403);
        const t = await getSecret('edu_bot_token');
        if (!t) return json({ ok: false, error: 'Edutizim boti tokeni kiritilmagan' });
        const url = `${SUPABASE_URL}/functions/v1/edu-bot`;
        const r = await tg(t, 'setWebhook', { url, secret_token: await webhookSecret(t), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
        await tg(t, 'setMyCommands', { commands: [
          { command: 'start', description: 'Bosh menyu' }, { command: 'kirim', description: 'Kassaga kirim' }, { command: 'chiqim', description: 'Kassadan chiqim' },
          { command: 'qidir', description: 'O‘quvchini qidirish' }, { command: 'qarz', description: 'Qarzdorlar' }, { command: 'lid', description: 'Yangi lid' },
          { command: 'hisobot', description: 'Hisobot' }, { command: 'sinxron', description: 'Edutizim sinxroni' }, { command: 'cancel', description: 'Bekor qilish' }
        ] });
        await tg(t, 'setMyDescription', { description: 'Registan LC xodimlari uchun: Edutizim kassasiga kirim/chiqim, o‘quvchi balansi, qarzdorlar, lidlar va hisobot. Bot faqat ruxsat berilgan xodimlarga ochiladi.' });
        await tg(t, 'setMyShortDescription', { short_description: 'Registan LC · Edutizim boshqaruvi (faqat xodimlar)' });
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



