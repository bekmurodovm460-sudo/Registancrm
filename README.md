# Registan LC — CRM platformasi

12-maktab (711 o‘quvchi), Kids Mock, kassa va yutuqli kartalar CRM’i. Endi u **bulutli baza**, **login va rollar**, **Telegram bot (OMR bilan natija tekshirish va Kids Mock ro‘yxati)** hamda **Registan.edutizim.uz** bilan bog‘langan web platforma.

## Tuzilma

```
web/                      statik sayt (Netlify shu papkani joylaydi)
  index.html              asosiy CRM (asl dizayn saqlangan)
  app.js                  asl CRM mantig'i (sinflar, TOP-3, kartalar, kassa, Excel…)
  db.js                   Supabase qatlami: login, yuklash, diff-sinxronlash, realtime
  platform.js             yangi bo'limlar: Testlar & OMR, Bot arizalari, Edutizim, Xodimlar, Telegram
  omr.js                  javoblar varaqasini o'qish (klassik OMR) + varaq shablonini chizish
  parent.html             ota-onalar uchun ochiq natija qidiruvi
  config.js               Supabase URL va publishable kalit
supabase/
  migrations/             jadvallar, RLS, RPC funksiyalar
  functions/telegram-bot  Telegram webhook (OMR + ro'yxatdan o'tish)
  functions/tg-admin      bot holati, webhook ulash, karta rasmini yuborish
  functions/edutizim-sync edutizimga login qilib o'quvchi/guruhlarni olib kelish
  functions/_shared       umumiy kod (omr.js — web/omr.js nusxasi)
netlify.toml
```

## Birinchi ishga tushirish

1. **Admin hisobi.** Saytni oching → “Yangi xodim — ro‘yxatdan o‘tish”. **Birinchi ro‘yxatdan o‘tgan foydalanuvchi avtomatik admin bo‘ladi**, keyingilari “kutilmoqda” holatida bo‘ladi va admin ularga “👥 Xodimlar” bo‘limida rol beradi. Shuning uchun saytni ishga tushirgan zahoti birinchi bo‘lib o‘zingiz ro‘yxatdan o‘ting.
   Agar Supabase’da email tasdiqlash yoqilgan bo‘lsa, kelgan xatdagi havolani bosing. Supabase → Authentication → URL Configuration bo‘limida **Site URL** ni Netlify manzilingizga qo‘ying.
2. Baza bo‘sh bo‘lsa, admin birinchi kirganda standart 711 o‘quvchi va 25 sinf bulutga yuklanadi.
3. **Telegram bot.** @BotFather’dan bot yarating → “🤖 Telegram Bot” bo‘limida tokenni kiriting → “Saqlash va botni ulash”. Admin xabarnomalari uchun botni guruhga qo‘shib, `/id` yozing va chiqqan Chat ID ni kiriting.
4. **Testlar.** “📝 Testlar & OMR” → test yarating (kod, savollar soni, javob kaliti, ball tizimi) → “🖨️ Varaq” bilan A4 javoblar varaqasini chop eting.
   O‘quvchi botda “📝 Natijani tekshirish” → testni tanlaydi → ismini yozadi → to‘ldirilgan varaq rasmini yuboradi → bot darhol ball va xatolarni qaytaradi. Kids Mock testlari natijasi CRM’dagi Kids Mock ro‘yxatiga ham tushadi.
5. **Kids Mock ro‘yxati.** Ota-onalar botda “🧒 Kids Mock ro‘yxatdan o‘tish” orqali yoziladi; xona avtomatik beriladi. Arizalar “🧒 Bot arizalari” bo‘limida real vaqtda ko‘rinadi. Sessiya va xona sig‘imini shu bo‘limda sozlang.
6. **Edutizim.** “🔗 Edutizim” bo‘limida edutizim xodim hisobining telefon raqami va parolini kiriting → “Ulanishni tekshirish” → “Sinxronlash”. Hisobda SMS orqali 2 bosqichli tasdiqlash o‘chiq bo‘lishi kerak (alohida integratsiya hisobi tavsiya etiladi).
   Sinxronlash **har soatda avtomatik** ishlaydi (pg_cron `crm-edutizim-sync`, har soatning 17-daqiqasida). Tashkilot `Origin: https://registan.edutizim.uz` orqali, filial esa login javobidagi `branches` dan aniqlanadi.

## Rollar

| Rol | Imkoniyat |
|---|---|
| Admin | hammasi: sozlamalar, ball tizimi, o‘chirish, bot/edutizim kalitlari, xodimlar |
| Operator | o‘quvchi, qo‘ng‘iroq, kassa, test, ariza qo‘shish/tahrirlash (o‘chirishsiz) |
| O‘qituvchi | ko‘rish va faqat o‘ziga biriktirilgan sinf o‘quvchilarini tahrirlash |

Himoya ma’lumotlar bazasi darajasida (Row Level Security). Bot tokeni va edutizim paroli `crm_secrets` jadvalida turadi va brauzerga hech qachon qaytmaydi — ularni faqat edge functionlar o‘qiydi.

## OMR varaq qoidalari

- Varaq faqat platformadan chop etilgan shablon bo‘lsin (4 burchakda qora kvadrat, yuqori-chapda kichik yo‘nalish belgisi).
- Doirachani qora yoki ko‘k ruchka bilan to‘liq bo‘yash; ikki belgi “*” (xato) deb, bo‘sh “-” deb hisoblanadi.
- Rasm: varaq to‘liq kadrda, tekis, yorug‘. Aylantirilgan (90°/180°) va biroz qiyshiq rasmlar ham o‘qiladi.

## Yangilash

- Sayt: `web/` dagi o‘zgarishlar Netlify’ga joylanadi.
- Baza: `supabase/migrations/*.sql` tartib bilan qo‘llanadi.
- Funksiyalar: `supabase functions deploy telegram-bot --no-verify-jwt`, `supabase functions deploy tg-admin`, `supabase functions deploy edutizim-sync`.
- `web/omr.js` o‘zgarsa, `supabase/functions/_shared/omr.js` ga ham nusxa ko‘chiring.

## Ko‘p maktab

- **🏫 Maktablar** bo‘limida admin maktab qo‘shadi, tahrirlaydi va bo‘sh maktabni o‘chiradi. Ular orasida yuqoridagi tanlagich yoki “✅ Tanlash” tugmasi bilan o‘tiladi.
- Sinflar, o‘quvchilar, ball tizimi va parallel TOP-3 (150k/100k/75k) **har bir maktab ichida alohida**. Kids Mock, kassa, testlar va bot umumiy.
- O‘qituvchiga “👥 Xodimlar” bo‘limida maktab va sinf biriktiriladi; u faqat o‘sha maktabni ko‘radi va faqat o‘z sinfini tahrirlaydi.
- “711 bazani tiklash” faqat 12-Maktab uchun ishlaydi.

## Maktab → sinf → o‘quvchi

- **Sinf qo‘shish:** 🏫 Maktablar kartasidagi “➕ Sinf qo‘shish” yoki 🗂️ Sinflari → “➕ Yangi sinf qo‘shish”. Sinf yaratilgach darhol uning ichki oynasi ochiladi.
- **O‘quvchi qo‘shish:** sinf ichki oynasidagi “2-Oyna” formasi. Jadvaldagi ✏️ tugmasi bilan o‘quvchi tahrirlanadi yoki boshqa sinfga ko‘chiriladi.
- **Sinf rahbari:** sinf qo‘shishda yoki sinf ichida (“👩‍🏫 Sinf rahbari (tizim hisobi)”) xodim hisobi biriktiriladi. Xodim avtomatik o‘qituvchi bo‘ladi va faqat shu sinf o‘quvchilarini tahrirlay oladi. Biriktirishni admin bajaradi.
- Sinfni qayta nomlash (o‘quvchilar va rahbar ham ergashadi) va o‘chirish (admin) sinf oynasi sarlavhasida.

## Saytga kirish: ochiq yoki parol bilan

- Boshlang‘ich holatda sayt **ochiq**: kim ochsa, umumiy “Platforma” hisobi bilan avtomatik kiradi (login oynasi chiqmaydi).
- Admin “👥 Xodimlar → 🔒 Sayt kirish paroli” bo‘limida parol o‘rnatadi — sayt darhol yopiladi va kirishda **faqat shu parol** so‘raladi (email kerak emas). Ochiq rejimda kirgan boshqa qurilmalar seanslari bekor qilinadi.
- Shu yerda parolni almashtirish yoki olib tashlash (saytni yana ochiq qilish) mumkin.
- Shaxsiy xodim hisoblari (email + parol) “Xodim hisobi (email) bilan kirish” havolasi orqali ishlashda davom etadi.
- Texnik: `supabase/migrations/007_site_password.sql` — `crm_access_info`, `crm_open_login`, `crm_set_site_password`, `crm_open_site`.

## Telegram bot bo‘limlari

```
📚 Maktab imtihonlari javoblari
   ├ 🔑 Javoblar kaliti      — CRM’da “🔓 E’lon qilingan” testlar (📝 Testlar & OMR jadvali)
   └ 📸 Varaqni tekshirish   — OMR
🧒 Kids Mock’ga ro‘yxatdan o‘tish
   ├ 📝 Ro‘yxatdan o‘tish
   └ 📋 Mening arizalarim
📊 Natijalar ro‘yxati
   ├ 🔍 Farzandim natijasi
   ├ 🏆 TOP-3 sovrindorlar   — maktab → parallel
   └ 🏅 Yutuqli karta
📞 Aloqa · ℹ️ Yordam
```

## Telegram bot buyruqlari

| Buyruq | Kim uchun | Nima qiladi |
|---|---|---|
| `/start` | hamma | bosh menyu |
| `/javoblar` | hamma | e’lon qilingan imtihon javoblari kaliti |
| `/top` | hamma | maktab → parallel bo‘yicha TOP-3 sovrindorlar |
| `/natija` | ota-ona | ism (≥4 harf) yoki telefon bo‘yicha ball, maktab, parallel TOP-3 o‘rni |
| `/karta` | ota-ona | “📱 Raqamni yuborish” orqali **o‘z** raqami tasdiqlanadi; farzand TOP-3 bo‘lsa yutuqli karta **rasmi** yuboriladi |
| `/tekshir` | o‘quvchi | javoblar varaqasi rasmi orqali natija (OMR) |
| `/royxat` | ota-ona | Kids Mock’ga yozilish |
| `/mening` | ota-ona | shu Telegram hisobidagi arizalar va tekshirilgan varaqlar |
| `/aloqa` | hamma | markaz ma’lumoti — CRM “🤖 Telegram Bot → 📞 /aloqa matni”da tahrirlanadi |
| `/hisobot` | admin | kunlik statistika — faqat CRM’da kiritilgan admin chat/guruhda ishlaydi |
| `/id` | admin | chat ID |

Karta rasmi serverda (`supabase/functions/_shared/card.ts`, resvg-wasm + Inter shrifti) CRM’dagi dizayn bilan bir xil yasaladi.

## Telegram Mini App (`web/miniapp.html`)

Botning chap pastki burchagidagi **📱 Ilova** tugmasi ochadi (`setChatMenuButton`, manzil: `https://registanglobusmaktablar.netlify.app/miniapp.html`, `crm_settings.miniAppUrl` bilan o‘zgartiriladi).

- **🧒 Kids Mock** — forma (ism, sinf, telefon/“📱 Raqamim”, sessiya) → `crm_mock_registrations`, xona avtomatik; “Mening arizalarim”.
- **📸 Tekshirish** — test → maktab → sinf → ism → kamera. Varaq telefonda o‘qiladi (`omr.js`), baholash serverda; natija sinfdagi o‘quvchiga yoziladi.
- **🔑 Javoblar** — faqat e’lon qilingan kalitlar.

Backend: `supabase/functions/miniapp` — har bir so‘rov Telegram `initData` HMAC imzosi bilan tekshiriladi (24 soat); kalit e’lon qilinmaguncha mijozga yuborilmaydi.
