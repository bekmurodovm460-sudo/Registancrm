-- Imtihon boti: ustozlar (Edutizim bilan bog'langan) va Kids Mock darajasini ustoz belgilashi
create table if not exists crm_exam_teachers (
  tg_id bigint primary key,
  chat_id bigint not null,
  edu_teacher_id text not null,
  full_name text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'pending', 'blocked')),
  session text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_exam_teachers_edu on crm_exam_teachers (edu_teacher_id);
alter table crm_exam_teachers enable row level security;
revoke all on crm_exam_teachers from anon, authenticated;
grant select on crm_exam_teachers to authenticated;
drop policy if exists crm_exam_teachers_read on crm_exam_teachers;
create policy crm_exam_teachers_read on crm_exam_teachers for select to authenticated using (crm_role() = 'admin');

alter table crm_mock_registrations
  add column if not exists edu_student_id text,
  add column if not exists level_by text,
  add column if not exists level2_by text,
  add column if not exists source text not null default 'parent';
create index if not exists crm_mock_reg_edu on crm_mock_registrations (session, edu_student_id);

-- Kids Mock fani Edutizim kurs nomidan
create or replace function crm_mock_subject(p_course text) returns text
language sql immutable as $$
  select case
    when p_course ilike '%matem%' then 'Matematika'
    when p_course ilike '%rus%' then 'Rus tili'
    when p_course ilike '%ingliz%' or p_course ilike '%english%' or p_course ilike '%ielts%' then 'Ingliz tili'
  end
$$;

-- O'quvchi ↔ aktiv guruh ↔ ustoz ↔ fan (Edutizim nusxasidan, har soatda yangilanadi)
create or replace function crm_edu_links(p_teacher text default null, p_student text default null)
returns table (student_id text, student_name text, phone text, parent_phone text, group_id text, group_name text,
               teacher_id text, teacher_name text, course text, subject text)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name, s.phone,
         coalesce(nullif(s.data->'parent'->>'motherPhoneNumber', ''), nullif(s.data->'parent'->>'fatherPhoneNumber', '')),
         g.id, g.name, g.data->>'teacherId',
         trim(coalesce(g.data->'teacher'->>'firstName', '') || ' ' || coalesce(g.data->'teacher'->>'lastName', '')),
         g.data->'course'->>'name', crm_mock_subject(g.data->'course'->>'name')
  from crm_edu_students s
  cross join lateral jsonb_array_elements(coalesce(s.data->'groupsList', '[]'::jsonb)) gl
  join crm_edu_groups g on g.id = gl->>'_id'
  where gl->>'state' = 'active' and coalesce(g.data->>'state', 'active') = 'active'
    and (p_teacher is null or g.data->>'teacherId' = p_teacher)
    and (p_student is null or s.id = p_student)
$$;
revoke all on function crm_edu_links(text, text) from public, anon, authenticated;

-- Telefon bo'yicha Edutizim o'quvchilari (o'quvchi yoki ota-ona raqami)
create or replace function crm_edu_by_phone(p_digits text)
returns table (id text, full_name text, phone text)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name, s.phone from crm_edu_students s
  where length(p_digits) = 9 and (
    s.phone_digits like '%' || p_digits
    or regexp_replace(coalesce(s.data->'parent'->>'motherPhoneNumber', ''), '\D', '', 'g') like '%' || p_digits
    or regexp_replace(coalesce(s.data->'parent'->>'fatherPhoneNumber', ''), '\D', '', 'g') like '%' || p_digits)
  limit 20
$$;
revoke all on function crm_edu_by_phone(text) from public, anon, authenticated;
