-- Ko'p maktab: maktablar jadvali, sinf/o'quvchilarni maktabga bog'lash
create table if not exists public.crm_schools (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
insert into public.crm_schools(id, data)
values ('12-maktab', '{"id":"12-maktab","name":"12-Maktab","shortName":"12-Maktab","city":"Qarshi"}')
on conflict (id) do nothing;

alter table public.crm_schools enable row level security;
drop trigger if exists crm_schools_touch on public.crm_schools;
create trigger crm_schools_touch before insert or update on public.crm_schools for each row execute function public.crm_touch();

drop policy if exists crm_schools_select on public.crm_schools;
create policy crm_schools_select on public.crm_schools for select to authenticated
  using ((select public.crm_role()) in ('admin','operator','teacher'));
drop policy if exists crm_schools_write on public.crm_schools;
create policy crm_schools_write on public.crm_schools for all to authenticated
  using ((select public.crm_role()) = 'admin') with check ((select public.crm_role()) = 'admin');

-- Sinflar: (maktab, nom) bo'yicha noyob
alter table public.crm_classes add column if not exists school_id text
  generated always as (coalesce(data->>'schoolId', '12-maktab')) stored;
alter table public.crm_classes drop constraint if exists crm_classes_pkey;
alter table public.crm_classes add primary key (school_id, name);

-- O'quvchilar
alter table public.crm_students add column if not exists school_id text
  generated always as (coalesce(data->>'schoolId', '12-maktab')) stored;
create index if not exists crm_students_school_idx on public.crm_students (school_id, class_name);

-- Xodim (o'qituvchi) maktabga biriktiriladi
alter table public.crm_profiles add column if not exists school_id text;

create or replace function public.crm_teacher_school()
returns text language sql stable security definer set search_path = public as $$
  select school_id from public.crm_profiles where id = auth.uid();
$$;

drop policy if exists crm_students_teacher_update on public.crm_students;
create policy crm_students_teacher_update on public.crm_students for update to authenticated
  using ((select public.crm_role()) = 'teacher'
         and class_name = (select public.crm_teacher_class())
         and school_id = coalesce((select public.crm_teacher_school()), '12-maktab'))
  with check ((select public.crm_role()) = 'teacher'
         and class_name = (select public.crm_teacher_class())
         and school_id = coalesce((select public.crm_teacher_school()), '12-maktab'));

-- Maktablar bo'yicha statistika
create or replace function public.crm_school_stats()
returns table(school_id text, students bigint, classes bigint)
language sql stable security definer set search_path = public as $$
  select s.id,
         (select count(*) from public.crm_students st where st.school_id = s.id),
         (select count(*) from public.crm_classes c where c.school_id = s.id)
  from public.crm_schools s
  where coalesce(public.crm_role(), '') in ('admin','operator','teacher');
$$;
revoke all on function public.crm_school_stats() from public, anon;
grant execute on function public.crm_school_stats() to authenticated;

-- Ota-ona qidiruvi: reyting har bir maktab + parallel ichida
drop function if exists public.crm_parent_lookup(text);
create or replace function public.crm_parent_lookup(p_query text)
returns table(id bigint, full_name text, class_name text, school_name text, score numeric, grade_key text, rank bigint, total bigint)
language sql stable security definer set search_path = public as $$
  with q as (
    select lower(trim(p_query)) as t, regexp_replace(p_query, '\D', '', 'g') as digits
  ),
  ranked as (
    select s.id,
           s.data->>'fullName' as full_name,
           s.class_name,
           s.school_id,
           coalesce((s.data->>'score')::numeric, 0) as score,
           coalesce(substring(s.class_name from '\d+') || '-sinflar', 'Boshqa sinflar') as grade_key,
           regexp_replace(coalesce(s.data->>'phone',''), '\D', '', 'g') as phone_digits,
           row_number() over (partition by s.school_id, coalesce(substring(s.class_name from '\d+'), 'x')
                              order by coalesce((s.data->>'score')::numeric, 0) desc) as rank,
           count(*) over (partition by s.school_id, coalesce(substring(s.class_name from '\d+'), 'x')) as total
    from public.crm_students s
  )
  select r.id, r.full_name, r.class_name, coalesce(sc.data->>'name', r.school_id), r.score, r.grade_key, r.rank, r.total
  from ranked r
  cross join q
  left join public.crm_schools sc on sc.id = r.school_id
  where (length(q.t) >= 4 and lower(r.full_name) like '%' || q.t || '%')
     or (length(q.digits) >= 9 and r.phone_digits like '%' || right(q.digits, 9))
  order by r.full_name
  limit 10;
$$;
revoke all on function public.crm_parent_lookup(text) from public;
grant execute on function public.crm_parent_lookup(text) to anon, authenticated;

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_schools') then
    alter publication supabase_realtime add table public.crm_schools;
  end if;
end $$;
-- DELETE hodisalarida (school_id, name) kelishi uchun
alter table public.crm_classes replica identity full;
alter table public.crm_students replica identity full;
