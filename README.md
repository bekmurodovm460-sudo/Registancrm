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
