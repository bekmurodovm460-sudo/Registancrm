-- Bot bo'limlari: javoblar kalitini e'lon qilish va TOP ro'yxati

-- Javoblar kaliti faqat admin/operator "e'lon qilish"ni bosgandan keyin botda ko'rinadi
alter table public.crm_tests add column if not exists answers_published boolean not null default false;

-- Parallel bo'yicha TOP ro'yxat (bot uchun; faqat service role chaqiradi)
create or replace function public.crm_top_list(p_school text, p_grade text default null, p_limit int default 3)
returns table(grade_key text, rank bigint, full_name text, class_name text, score numeric, total bigint)
language sql stable security definer set search_path = public as $$
  with r as (
    select coalesce(substring(s.class_name from '\d+'), 'x') as g,
           s.data->>'fullName' as full_name,
           s.class_name,
           coalesce((s.data->>'score')::numeric, 0) as score,
           row_number() over (partition by coalesce(substring(s.class_name from '\d+'), 'x')
                              order by coalesce((s.data->>'score')::numeric, 0) desc) as rk,
           count(*) over (partition by coalesce(substring(s.class_name from '\d+'), 'x')) as total
    from public.crm_students s
    where s.school_id = p_school
  )
  select case when g = 'x' then 'Boshqa sinflar' else g || '-sinflar' end, rk, full_name, class_name, score, total
  from r
  where rk <= greatest(1, least(coalesce(p_limit, 3), 20))
    and (p_grade is null or g = p_grade)
  order by (case when g = 'x' then 99 else g::int end), rk;
$$;
revoke all on function public.crm_top_list(text, text, int) from public, anon, authenticated;

-- Maktabdagi parallellar ro'yxati (bot tugmalari uchun)
create or replace function public.crm_school_grades(p_school text)
returns table(grade text, students bigint)
language sql stable security definer set search_path = public as $$
  select g, n from (
    select coalesce(substring(class_name from '\d+'), 'x') g, count(*) n
    from public.crm_students where school_id = p_school
    group by 1
  ) t
  order by (case when g = 'x' then 99 else g::int end);
$$;
revoke all on function public.crm_school_grades(text) from public, anon, authenticated;
