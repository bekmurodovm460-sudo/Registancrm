-- O'quvchining faol guruhlari: 1 dars narxi va dars kunlari (har soatlik Edutizim sinxronida yangilanadi).
-- Bot shu asosda "oy oxirigacha qancha to'lashi kerak"ni hisoblaydi.
create table if not exists crm_edu_pay_plan (
  student_id text primary key,
  groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table crm_edu_pay_plan enable row level security;
revoke all on crm_edu_pay_plan from anon, authenticated;
