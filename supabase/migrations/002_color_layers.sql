-- Maten per kleurlaag + aantal stuks per ontwerp
alter table designs add column if not exists quantity int not null default 1 check (quantity >= 1);
alter table designs add column if not exists excluded_colors jsonb not null default '[]'::jsonb;
-- Snapshot of the measurements at upload time (LayerMeasurement[])
alter table designs add column if not exists color_layers jsonb;
