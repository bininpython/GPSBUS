-- Execute este arquivo no SQL Editor do Supabase.
create table if not exists public.bus_locations (
  id uuid primary key,
  route_name text not null default 'Ônibus em operação',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.bus_locations enable row level security;
create policy "authenticated users read bus" on public.bus_locations for select to authenticated using (true);
create policy "authenticated users update bus" on public.bus_locations for all to authenticated using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'driver') with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'driver');
alter publication supabase_realtime add table public.bus_locations;
