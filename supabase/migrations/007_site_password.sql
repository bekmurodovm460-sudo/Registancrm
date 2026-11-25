-- Saytga kirish rejimi: "open" (loginsiz) yoki "locked" (bitta umumiy parol bilan)
-- Umumiy "Platforma" hisobi: ochiq rejimda sayt shu hisob bilan avtomatik kiradi,
-- yopiq rejimda kirish oynasi faqat shu hisobning parolini so'raydi.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  kid uuid := '00000000-0000-4000-a000-00000000c0de';
  kmail text := 'platforma@registan-crm.local';
  pw text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not exists (select 1 from auth.users where id = kid) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', kid, 'authenticated', 'authenticated', kmail,
            extensions.crypt(pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{"full_name":"Platforma (umumiy)"}', now(), now(),
            '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), kid, kid::text, jsonb_build_object('sub', kid::text, 'email', kmail, 'email_verified', true),
            'email', now(), now(), now());
  end if;
  insert into public.crm_profiles (id, email, full_name, role)
  values (kid, kmail, 'Platforma (umumiy)', 'admin')
  on conflict (id) do update set role = 'admin', full_name = 'Platforma (umumiy)';
  insert into public.crm_secrets(key, value) values ('kiosk_password', pw)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.crm_secrets(key, value) values ('access_mode', 'open')
  on conflict (key) do nothing;
end $$;

-- Login sahifasi uchun (anon): rejim va umumiy hisob emaili
create or replace function public.crm_access_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mode', coalesce((select value from public.crm_secrets where key = 'access_mode'), 'open'),
    'email', 'platforma@registan-crm.local'
  );
$$;

-- Ochiq rejimda avtomatik kirish uchun ma'lumot (yopiq bo'lsa null)
create or replace function public.crm_open_login()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m text; p text;
begin
  select value into m from public.crm_secrets where key = 'access_mode';
  if coalesce(m, 'open') <> 'open' then return null; end if;
  select value into p from public.crm_secrets where key = 'kiosk_password';
  if p is null then return null; end if;
  return jsonb_build_object('email', 'platforma@registan-crm.local', 'password', p);
end $$;

-- Parol o'rnatish (sayt yopiladi). Faqat admin.
create or replace function public.crm_set_site_password(p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare kid uuid := '00000000-0000-4000-a000-00000000c0de';
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Parol kamida 6 belgi bo''lsin'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = kid;
  delete from public.crm_secrets where key = 'kiosk_password';
  insert into public.crm_secrets(key, value) values ('access_mode', 'locked')
  on conflict (key) do update set value = 'locked', updated_at = now();
  -- ochiq rejimda kirgan qurilmalarning seanslarini bekor qilish (joriy seansdan tashqari)
  delete from auth.sessions
   where user_id = kid
     and id::text <> coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'session_id', '');
end $$;

-- Saytni yana ochiq qilish. Faqat admin.
create or replace function public.crm_open_site()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare kid uuid := '00000000-0000-4000-a000-00000000c0de'; pw text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now()
   where id = kid;
  insert into public.crm_secrets(key, value) values ('kiosk_password', pw)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.crm_secrets(key, value) values ('access_mode', 'open')
  on conflict (key) do update set value = 'open', updated_at = now();
end $$;

revoke all on function public.crm_access_info() from public;
grant execute on function public.crm_access_info() to anon, authenticated;
revoke all on function public.crm_open_login() from public;
grant execute on function public.crm_open_login() to anon, authenticated;
revoke all on function public.crm_set_site_password(text) from public, anon;
grant execute on function public.crm_set_site_password(text) to authenticated;
revoke all on function public.crm_open_site() from public, anon;
grant execute on function public.crm_open_site() to authenticated;
