-- Kids Mock: 2-fan darajasi (Oson / Qiyin)
alter table public.crm_mock_registrations add column if not exists level2 text;
update public.crm_mock_registrations set level2 = 'Oson' where level2 is null;
