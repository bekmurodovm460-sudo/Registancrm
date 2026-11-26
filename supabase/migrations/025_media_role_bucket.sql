-- Moliya boti: "Media" roli va video montaj natijalari uchun yopiq bucket (50 MB gacha)
alter table public.crm_edu_bot_users drop constraint if exists crm_edu_bot_users_role_check;
alter table public.crm_edu_bot_users add constraint crm_edu_bot_users_role_check check (role in ('pending','top','senior','service','teacher','media','blocked'));
insert into storage.buckets (id, name, public, file_size_limit) values ('edu-media', 'edu-media', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
