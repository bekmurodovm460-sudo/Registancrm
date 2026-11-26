-- Alohida "Registan Edutizim" boti: token kaliti va sessiyalar jadvali
create or replace function public.crm_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  if p_key not in ('telegram_bot_token','telegram_admin_chat_id','edutizim_base_url','edutizim_site_url','edutizim_login','edutizim_password','edu_bot_token') then
    raise exception 'noma''lum kalit';
  end if;
  if coalesce(p_value,'') = '' then
    delete from public.crm_secrets where key = p_key;
  else
    insert into public.crm_secrets(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

create table if not exists public.crm_edu_bot_sessions (
  chat_id bigint primary key,
  step text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.crm_edu_bot_sessions enable row level security;
-- policy yo'q: faqat service role (edge function)
