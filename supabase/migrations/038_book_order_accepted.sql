-- Nashriyot buyurtmani "✅ Qabul qilindi" deb belgilagan vaqt (keyin "📦 Tayyor")
alter table public.crm_edu_book_orders add column if not exists accepted_at timestamptz;
