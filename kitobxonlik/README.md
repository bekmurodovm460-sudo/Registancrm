# 📚 Laylo Pardayeva Kitobxonlik Akademiyasi

**Telegram bot + Mini App + CRM**. Registan CRM bilan umumiy kodi yo‘q va alohida bot ishlatadi. Bepul Supabase loyiha chegarasi sabab jadvallar (`ka_*`), funksiyalar (`ka-*`) va storage (`ka-books`, `ka-covers`) Registan bilan **bitta Supabase loyihada** (`bbnakgvgoydahagiwltn`) joylashgan; Supabase Auth umumiy, lekin Akademiya xodimlari alohida `ka_staff` jadvalida — Registan hisobi bilan kirgan odam Akademiyada “kutilmoqda” bo‘ladi va admin rol bermaguncha hech narsa ko‘rmaydi.

## A’zo yo‘li (botda)

```
/start → ro‘yxat (ism, yosh, shahar, telefon)
📚 Kitoblar → 📄 PDF · 🎧 Audio · 📘 Qo‘llanma
      → 📝 Kitob testi (avtomatik, o‘tish chegarasi, urinishlar soni)
      → 🎙 Audio taqriz (ovozli xabar, 60–120 soniya)
      → moderator baholaydi (0–10) → 🎓 sertifikat rasmi botga keladi
🏆 Tanlovlar → yakuniy yopiq test: belgilangan vaqtda ochiladi, vaqt cheklovli, bitta urinish;
               natijalar e’lon qilinganda hammaga sertifikat, TOP-3 ga g‘olib diplomi
👥 Guruhlarim → 💬 guruh chati (Mini App) · 🎥 Jitsi uchrashuvlari (30 daqiqa oldin eslatma)
🎓 Natijalarim → ball, reyting, sertifikatlarni qayta olish
💳 A’zolik (ixtiyoriy) → karta ma’lumoti → chek rasmi → kassir tasdiqlaydi
```

Buyruqlar: `/kitoblar /testlar /guruhlar /tanlovlar /natijalar /reyting /azolik /yordam /cancel`.
Guruhga havola orqali qo‘shilish: `https://t.me/<bot>?start=g_<KOD>` yoki `/guruh KOD`.

**Ball:** kitob = test% / 10 + taqriz bahosi (maks. 20); tanlov = test% / 10 + 30/20/10 (1–3-o‘rin).

## CRM (`web/index.html`)

| Bo‘lim | Admin | Moderator | Kassir |
|---|:-:|:-:|:-:|
| 📊 Dashboard, 👤 A’zolar | ✅ | ✅ | ✅ |
| 📚 Kitoblar (PDF/audio/muqova yuklash, qo‘llanma) | ✅ | ✅ | |
| 📝 Kitob testlari, 🏆 Tanlovlar | ✅ | ✅ | |
| 🎙 Audio taqrizlar (tinglash, baholash, qayta so‘rash) | ✅ | ✅ | |
| 👥 Guruhlar: chat, uchrashuv, a’zolar | ✅ hammasi | o‘z guruhlari | |
| 💳 Kassa (cheklar, naqd to‘lov, Excel) | ✅ | | ✅ |
| 📢 Xabar yuborish, ⚙️ Sozlamalar, xodimlar | ✅ | | |

- **Birinchi ro‘yxatdan o‘tgan xodim — admin.** Keyingilari “kutilmoqda”; admin ⚙️ Sozlamalar → Xodimlar’da rol beradi.
- Test savollari matndan kiritiladi — to‘g‘ri javob oldiga `*`:
  ```
  1. «O‘tkan kunlar» muallifi kim?
  A) Oybek
  *B) Abdulla Qodiriy
  C) Cho‘lpon
  ```
- To‘g‘ri javoblar a’zoga hech qachon yuborilmaydi — baholash serverda.
- **🔗 Profil va bot** → kod → botga `/ulash KOD`: yangi taqrizlar/cheklar Telegram’ga keladi; admin/moderator `/yukla` bilan 50 MB dan katta kitob fayllarini to‘g‘ridan-to‘g‘ri Telegram’ga biriktiradi.

## Tuzilma

```
web/                    Netlify (publish = web)
  index.html, app.js    CRM
  miniapp.html          Telegram Mini App (chat, uchrashuvlar, guruhga qo‘shilish)
  config.js             Supabase URL + publishable kalit
supabase/
  migrations/001_schema.sql   jadvallar, RLS, triggerlar, RPC, storage
  migrations/002_cron.sql     har 5 daqiqada eslatmalar (pg_cron + pg_net)
  functions/ka-bot            Telegram webhook
  functions/ka-admin          CRM amallari + cron
  functions/ka-miniapp        Mini App API (initData HMAC tekshiruvi)
  functions/_shared           common.ts, academy.ts, cert.ts (sertifikat: resvg-wasm)
```

## Joriy holat

- ✅ Baza: `001_schema.sql`, `002_cron.sql` qo‘llangan; `functions_url` yozilgan, `ka-cron` har 5 daqiqada ishlaydi.
- ✅ Funksiyalar: `ka-bot`, `ka-admin`, `ka-miniapp` joylangan (`--no-verify-jwt`).
- ⏳ Sayt: Netlify loyihasi `kitobxonlik-akademiya` yaratilgan, lekin hisobdagi Netlify kreditlari tugagani uchun joylash to‘xtatilgan.
- ⏳ Bot: @BotFather tokeni CRM’ga kiritilishi kerak.

## Joylash (yangi loyihaga ko‘chirish uchun)

1. **Supabase:** yangi loyiha → `001_schema.sql`, `002_cron.sql` ni SQL Editor’da ishga tushiring, so‘ng:
   ```sql
   insert into ka_secrets(key, value) values ('functions_url', 'https://<REF>.supabase.co/functions/v1')
   on conflict (key) do update set value = excluded.value;
   ```
2. **Funksiyalar** (uchalasi ham o‘z tekshiruviga ega, shuning uchun JWT tekshiruvi o‘chiq):
   ```
   supabase functions deploy ka-bot --no-verify-jwt
   supabase functions deploy ka-admin --no-verify-jwt
   supabase functions deploy ka-miniapp --no-verify-jwt
   ```
3. **Sayt:** `web/config.js` ga loyiha URL va publishable kalitni yozing → Netlify’da yangi sayt, base directory `kitobxonlik`. Supabase → Authentication → URL Configuration → Site URL = Netlify manzili.
4. **Bot:** @BotFather → yangi bot → CRM ⚙️ Sozlamalar → token → “Saqlash va botni ulash” (webhook, buyruqlar, 📱 Ilova tugmasi avtomatik o‘rnatiladi).

## Eslatmalar

- `meet.jit.si` hozir xonani ochish uchun birinchi kirgan odamdan (moderator) Google/GitHub orqali kirishni so‘raydi; a’zolar keyin oddiy kiradi. Boshqa Jitsi server (masalan o‘zingizniki yoki 8x8.vc) ⚙️ Sozlamalar → Jitsi domeni’da o‘zgartiriladi.
- Bot kitob fayllarini `protect_content` bilan yuboradi (forward/saqlash cheklanadi). Faqat tarqatishga huquqingiz bor kitoblarni yuklang.
- Bepul Supabase: Storage 1 GB, edge function so‘rovi ~150 s — juda ko‘p qatnashchili tanlovda sertifikatlar yuborilishi uzilsa, “↻ Qayta e’lon” bosing (qayta yuborishda ballar takrorlanmaydi).
