-- Imtihon boti: Excel ro'yxat → CRM. Maktab va sinf bo'yicha joylash (yo'q sinf/maktab yaratiladi),
-- shu sinfda shu ismli o'quvchi bo'lsa — takror yaratilmaydi (bo'sh telefon to'ldiriladi).
-- p_rows: [{ "school": "12-maktab", "schoolName": "12-Maktab", "cls": "5-A", "name": "...", "phone": "+998..." }]
create or replace function public.crm_bot_import_roster(p_rows jsonb, p_by text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; sid bigint; nm text; cls text; sch text; ph text;
  created int := 0; existed int := 0; phones int := 0; new_classes int := 0; new_schools int := 0;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    nm := regexp_replace(trim(coalesce(r->>'name', '')), '\s+', ' ', 'g');
    cls := trim(coalesce(r->>'cls', ''));
    sch := trim(coalesce(r->>'school', ''));
    ph := nullif(trim(coalesce(r->>'phone', '')), '');
    if nm = '' or cls = '' or sch = '' then continue; end if;
    if not exists (select 1 from crm_schools where id = sch) then
      insert into crm_schools (id, data) values (sch, jsonb_build_object('id', sch, 'name', coalesce(r->>'schoolName', sch), 'shortName', coalesce(r->>'schoolName', sch), 'city', ''));
      new_schools := new_schools + 1;
    end if;
    if not exists (select 1 from crm_classes where school_id = sch and name = cls) then
      -- crm_classes.school_id ham data->>'schoolId' dan hisoblanadi (generated)
      insert into crm_classes (name, data) values (cls, jsonb_build_object('name', cls, 'schoolId', sch, 'teacher', '', 'phone', '', 'expected', 0));
      new_classes := new_classes + 1;
    end if;
    select s.id into sid from crm_students s
     where s.school_id = sch and s.class_name = cls and crm_norm_name(s.data->>'fullName') = crm_norm_name(nm)
     order by s.id limit 1;
    if sid is not null then
      existed := existed + 1;
      if ph is not null then
        update crm_students set data = data || jsonb_build_object('phone', ph) where id = sid and coalesce(data->>'phone', '') = '';
        if found then phones := phones + 1; end if;
      end if;
    else
      sid := nextval('crm_bot_student_seq');
      -- class_name va school_id — data dan avtomatik hisoblanadigan ustunlar (generated), shuning uchun faqat data yoziladi
      insert into crm_students (id, data) values (sid, jsonb_build_object(
        'id', sid, 'fullName', nm, 'className', cls, 'schoolId', sch, 'phone', coalesce(ph, ''),
        'q1', null, 'q2', null, 'score', null, 'callStatus', case when ph is null then 'Raqamsiz' else 'Yangi' end,
        'note', 'Telegram bot: Excel ro‘yxatdan' || coalesce(' · ' || p_by, ''), 'source', 'telegram-roster'));
      created := created + 1;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'existed', existed, 'phones', phones, 'newClasses', new_classes, 'newSchools', new_schools);
end $$;
revoke all on function public.crm_bot_import_roster(jsonb, text) from public, anon, authenticated;
