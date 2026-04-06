-- Projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  roll_width int default 630,
  price_per_m numeric(10,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Designs (uploaded SVG/PDF files)
create table designs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  colors jsonb,
  width_mm numeric(10,2),
  height_mm numeric(10,2),
  created_at timestamptz default now()
);

-- Previews (building photo + perspective corners)
create table previews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid unique references projects(id) on delete cascade,
  photo_path text not null,
  corners jsonb,
  export_path text
);

-- Cut steps (per kleur, voortgang bijhouden)
create table cut_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  color text not null,
  order_num int not null,
  length_mm numeric(10,2),
  status text default 'pending',
  cut_at timestamptz
);

-- Storage buckets (run these in Supabase SQL editor)
-- insert into storage.buckets (id, name, public) values ('designs', 'designs', true);
-- insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
-- insert into storage.buckets (id, name, public) values ('exports', 'exports', true);
