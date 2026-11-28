-- Kitob buyurtmasi: to'lov turi (naqd — tasdiqda Edutizimdan chiqim; qarzga — to'lash sanasi bilan, keyin "To'landi")
alter table public.crm_edu_book_orders add column if not exists pay_type text not null default 'cash';
alter table public.crm_edu_book_orders add column if not exists due_date date;
alter table public.crm_edu_book_orders add column if not exists paid_at timestamptz;
do $$ begin
  alter table public.crm_edu_book_orders add constraint crm_edu_book_orders_pay_type_chk check (pay_type in ('cash', 'debt'));
exception when duplicate_object then null; end $$;
create index if not exists crm_edu_book_orders_debt on public.crm_edu_book_orders (supplier, due_date) where pay_type = 'debt' and out_tx is null;
