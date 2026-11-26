-- Rahbarga hisobotlar SMS orqali (Eskiz.uz): kirish ma'lumotlari crm_secrets'da, raqam crm_settings'da
create or replace function public.crm_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  if p_key not in ('telegram_bot_token','telegram_admin_chat_id','edutizim_base_url','edutizim_site_url','edutizim_login','edutizim_password','edu_bot_token','anthropic_api_key','github_dispatch_token','eskiz_email','eskiz_password') then
    raise exception 'noma''lum kalit';
  end if;
  if coalesce(p_value,'') = '' then
    delete from public.crm_secrets where key = p_key;
  else
    insert into public.crm_secrets(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_key in ('eskiz_email','eskiz_password') then delete from public.crm_secrets where key = 'eskiz_token'; end if;
end $$;
insert into crm_settings(key, value) values ('directorSmsPhones', '["+998946996711"]'::jsonb)
on conflict (key) do update set value = excluded.value;
