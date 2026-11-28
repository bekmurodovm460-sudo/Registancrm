-- Kitob buyurtmasi qaysi yetkazuvchiga (@MarsKitob, @zomaxcom ...) borishi
alter table public.crm_edu_book_orders add column if not exists supplier text;
update public.crm_edu_book_orders set supplier = 'MarsKitob' where unit_price is not null and supplier is null and out_tx is null;
