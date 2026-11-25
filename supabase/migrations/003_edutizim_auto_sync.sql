-- Edutizim: qo'shimcha maxfiy kalitlar va avtomatik (soatlik) sinxronlash
create or replace function public.crm_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  if p_key not in ('telegram_bot_token','telegram_admin_chat_id','edutizim_base_url','edutizim_site_url','edutizim_login','edutizim_password') then
    raise exception 'noma''lum kalit';
  end if;
  if coalesce(p_value,'') = '' then
    delete from public.crm_secrets where key = p_key;
  else
    insert into public.crm_secrets(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

-- Cron chaqiruvi uchun tasodifiy maxfiy kalit (faqat bazada, hech kimga ko'rinmaydi)
insert into public.crm_secrets(key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Edge functionni pg_net orqali chaqiruvchi yordamchi
create or replace function public.crm_run_edutizim_sync()
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select value into s from public.crm_secrets where key = 'cron_secret';
  return net.http_post(
    url := 'https://bbnakgvgoydahagiwltn.supabase.co/functions/v1/edutizim-sync',
    body := '{"action":"sync"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.crm_run_edutizim_sync() from public, anon, authenticated;
