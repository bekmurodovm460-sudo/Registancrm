-- Registan.edutizim.uz dan sinxronlanadigan o'quvchilar va guruhlar
create table if not exists public.crm_edu_students (
  id text primary key,                 -- edutizim _id
  full_name text,
  phone text,
  phone_digits text generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)) stored,
  groups text,
  data jsonb not null,
  synced_at timestamptz not null default now()
);
create index if not exists crm_edu_students_phone_idx on public.crm_edu_students (phone_digits);

create table if not exists public.crm_edu_groups (
  id text primary key,
  name text,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

alter table public.crm_edu_students enable row level security;
alter table public.crm_edu_groups enable row level security;

drop policy if exists crm_edu_students_select on public.crm_edu_students;
create policy crm_edu_students_select on public.crm_edu_students for select to authenticated
  using ((select public.crm_role()) in ('admin','operator','teacher'));
drop policy if exists crm_edu_groups_select on public.crm_edu_groups;
create policy crm_edu_groups_select on public.crm_edu_groups for select to authenticated
  using ((select public.crm_role()) in ('admin','operator','teacher'));
-- Yozish faqat edge function (service role) orqali.
