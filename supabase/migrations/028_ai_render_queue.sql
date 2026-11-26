-- AI montaj: videoni GitHub Actions'dagi ffmpeg avtomatik yasaydi (navbat)
alter table crm_ai_projects
  add column if not exists status text not null default 'draft' check (status in ('draft','queued','rendering','done','error')),
  add column if not exists attempts int not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists error text,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists crm_ai_projects_queue on crm_ai_projects (status, created_at);
create or replace function public.crm_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  if p_key not in ('telegram_bot_token','telegram_admin_chat_id','edutizim_base_url','edutizim_site_url','edutizim_login','edutizim_password','edu_bot_token','anthropic_api_key','github_dispatch_token') then
    raise exception 'noma''lum kalit';
  end if;
  if coalesce(p_value,'') = '' then
    delete from public.crm_secrets where key = p_key;
  else
    insert into public.crm_secrets(key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;
-- Navbatdan bitta loyihani atomik olish (bir vaqtda ikki renderer bir loyihani olmaydi)
create or replace function public.crm_ai_render_next()
returns setof crm_ai_projects language sql security definer set search_path = public as $$
  update crm_ai_projects set status = 'rendering', attempts = attempts + 1, started_at = now(), updated_at = now()
  where id = (
    select id from crm_ai_projects
    where (status = 'queued') or (status = 'rendering' and started_at < now() - interval '20 minutes' and attempts < 3)
    order by created_at limit 1 for update skip locked)
  returning *;
$$;
revoke all on function public.crm_ai_render_next() from public, anon, authenticated;
