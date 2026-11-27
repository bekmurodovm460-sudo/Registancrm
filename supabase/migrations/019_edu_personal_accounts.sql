-- Xodimlarning shaxsiy Edutizim akkauntlari (izoh/amallar o'z nomidan tushishi uchun).
-- RLS yoqilgan, policy yo'q va anon/authenticated huquqlari olingan: faqat service role (edge function) o'qiydi.
create table if not exists public.crm_edu_accounts (
  phone_digits text primary key,
  phone text not null,
  password text not null,
  full_name text,
  edu_user_id text,
  tg_id bigint,
  ok boolean,
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.crm_edu_accounts enable row level security;
revoke all on public.crm_edu_accounts from anon, authenticated;
