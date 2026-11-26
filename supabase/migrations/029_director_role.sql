-- Registan · Markaz boti: "Rahbar" roli (hammasini ko'radi, barcha hisobotlar unga boradi; kassa/SMS o'zgartirmaydi)
alter table public.crm_edu_bot_users drop constraint if exists crm_edu_bot_users_role_check;
alter table public.crm_edu_bot_users add constraint crm_edu_bot_users_role_check check (role in ('pending','top','senior','director','service','teacher','media','blocked'));
-- Top menejer oldindan ruxsat bergan rahbar(lar) — botga raqamini yuborganda avtomatik "Rahbar" bo'ladi
insert into crm_settings(key, value) values ('directorUsernames', '["shahboz_toshpulatov"]'::jsonb) on conflict (key) do nothing;
