-- Testlarning asl fayllari (savollar kitobchasi PDF/rasm/Word): yopiq Storage bucket.
-- CRM'da admin/operator yuklaydi va ko'radi; nazoratchilar Mini App orqali
-- (miniapp edge function, service role) vaqtinchalik havola bilan yuklab oladi.

alter table public.crm_tests add column if not exists files jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-tests', 'crm-tests', false, 26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists crm_tests_files_select on storage.objects;
create policy crm_tests_files_select on storage.objects for select to authenticated
  using (bucket_id = 'crm-tests' and (select public.crm_role()) in ('admin', 'operator'));
drop policy if exists crm_tests_files_insert on storage.objects;
create policy crm_tests_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-tests' and (select public.crm_role()) in ('admin', 'operator'));
drop policy if exists crm_tests_files_delete on storage.objects;
create policy crm_tests_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'crm-tests' and (select public.crm_role()) in ('admin', 'operator'));
