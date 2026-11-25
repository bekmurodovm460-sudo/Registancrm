-- Sinf rahbarini xodim hisobi sifatida biriktirish

-- Xodimlar ro'yxati (admin va operator uchun; sinf rahbari tanlash ro'yxati)
create or replace function public.crm_staff_list()
returns table(id uuid, full_name text, email text, role text, school_id text, class_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') not in ('admin','operator') then raise exception 'ruxsat yo''q'; end if;
  return query
    select p.id, p.full_name, p.email, p.role, p.school_id, p.class_name
    from public.crm_profiles p
    where p.role <> 'pending' or public.crm_role() = 'admin'
    order by p.full_name;
end $$;
revoke all on function public.crm_staff_list() from public, anon;
grant execute on function public.crm_staff_list() to authenticated;

-- Sinfga rahbar biriktirish (faqat admin). p_user = null — sinfdan rahbarni olib tashlash.
-- Biriktirilgan xodim "o'qituvchi" roliga o'tadi (admin/operator bo'lsa roli saqlanadi)
-- va shu sinf o'quvchilarini tahrirlash huquqini oladi.
create or replace function public.crm_assign_homeroom(p_user uuid, p_school text, p_class text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.crm_role(), '') <> 'admin' then raise exception 'faqat admin'; end if;
  -- shu sinfning avvalgi rahbari(lari)ni bo'shatish
  update public.crm_profiles
     set class_name = null
   where school_id = p_school and class_name = p_class
     and (p_user is null or id <> p_user);
  if p_user is not null then
    update public.crm_profiles
       set school_id = p_school,
           class_name = p_class,
           role = case when role in ('pending','teacher') then 'teacher' else role end
     where id = p_user;
  end if;
end $$;
revoke all on function public.crm_assign_homeroom(uuid, text, text) from public, anon;
grant execute on function public.crm_assign_homeroom(uuid, text, text) to authenticated;
