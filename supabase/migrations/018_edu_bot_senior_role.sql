-- Edutizim boti: "Katta menejer" roli (hammasini ko'radi, top imtiyozlarisiz)
alter table public.crm_edu_bot_users drop constraint if exists crm_edu_bot_users_role_check;
alter table public.crm_edu_bot_users add constraint crm_edu_bot_users_role_check check (role in ('pending','top','senior','service','teacher','blocked'));
