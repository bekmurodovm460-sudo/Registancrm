-- Registan · Markaz boti: Claude AI yordamchi (kalit crm_secrets'da, suhbat tarixi va kunlik hisob)
create or replace function public.crm_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  if p_key not in ('telegram_bot_token','telegram_admin_chat_id','edutizim_base_url','edutizim_site_url','edutizim_login','edutizim_password','edu_bot_token','anthropic_api_key') then
    raise exception 'noma''lum kalit';
  end if;
  if coalesce(p_value,'') = '' then
    delete from public.crm_secrets where key = p_key;
  else
    insert into public.crm_secrets(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;
create table if not exists crm_ai_chats (
  tg_id bigint primary key,
  history jsonb not null default '[]'::jsonb,
  day text,
  day_count int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table crm_ai_chats enable row level security;
revoke all on crm_ai_chats from anon, authenticated;
