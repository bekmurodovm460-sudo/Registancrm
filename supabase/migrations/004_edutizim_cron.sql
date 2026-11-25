-- Edutizim'ni har soatda avtomatik sinxronlash (pg_cron)
create extension if not exists pg_cron;
select cron.unschedule('crm-edutizim-sync') where exists (select 1 from cron.job where jobname = 'crm-edutizim-sync');
select cron.schedule('crm-edutizim-sync', '17 * * * *', $$select public.crm_run_edutizim_sync()$$);
