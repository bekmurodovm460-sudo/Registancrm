-- Kids Mock: 2-fan tanlanadi (Ingliz tili / Rus tili / Matematika, 1-fandan farqli)
-- va farzandning o'qituvchisi (ota-ona yozadi, ixtiyoriy).
alter table public.crm_mock_registrations add column if not exists subject2 text;
alter table public.crm_mock_registrations add column if not exists teacher text;
update public.crm_mock_registrations set subject2 = 'Ingliz tili' where subject2 is null;
