-- Har 5 daqiqada: uchrashuv eslatmalari (30 daqiqa oldin), tanlov ochilishi xabari,
-- a'zolik muddati tugashi haqida eslatma. ka-admin functionni pg_net orqali chaqiradi.
-- `functions_url` joylashda yoziladi: insert into ka_secrets values ('functions_url','https://<ref>.supabase.co/functions/v1')
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.ka_run_cron()
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare s text; u text;
begin
  select value into s from public.ka_secrets where key = 'cron_secret';
  select value into u from public.ka_secrets where key = 'functions_url';
  if u is null then return null; end if;
  return net.http_post(
    url := u || '/ka-admin',
    body := '{"action":"cron"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function public.ka_run_cron() from public, anon, authenticated;

select cron.unschedule('ka-cron') where exists (select 1 from cron.job where jobname = 'ka-cron');
select cron.schedule('ka-cron', '*/5 * * * *', $$select public.ka_run_cron()$$);
