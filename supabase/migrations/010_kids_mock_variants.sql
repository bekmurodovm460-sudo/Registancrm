-- Kids Mock: 1-fan (Matematika / Rus tili) + daraja (Oson / Qiyin), 2-fan Ingliz tili.
-- Har fandan 40 savol (jami 80): 1-fan 1.5 ball, Ingliz tili 1 ball.

-- 80 savollik testlar (OMR varaqasi 4 ustun)
alter table public.crm_tests drop constraint if exists crm_tests_num_questions_check;
alter table public.crm_tests add constraint crm_tests_num_questions_check check (num_questions between 1 and 100);

-- Kids Mock testining varianti: MAT-OSON, MAT-QIYIN, RUS-OSON, RUS-QIYIN
alter table public.crm_tests add column if not exists variant text;

-- Arizada tanlangan 1-fan va daraja
alter table public.crm_mock_registrations add column if not exists subject1 text;
alter table public.crm_mock_registrations add column if not exists level text;

-- Kids Mock ball tizimi
insert into public.crm_settings(key, value) values ('mockRules', '{"q1":40,"w1":1.5,"q2":40,"w2":1}')
on conflict (key) do update set value = excluded.value, updated_at = now();
