-- GPS BUS — estrutura completa para Supabase
-- Execute este arquivo no SQL Editor de um projeto Supabase novo.

begin;

create table if not exists public.gps_bus_drivers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bus_label text not null default 'Ônibus em operação' check (char_length(bus_label) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gps_bus_trips (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.gps_bus_drivers(user_id) on delete restrict,
  bus_label text not null check (char_length(bus_label) between 2 and 80),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint ended_trip_has_time check (status = 'active' or ended_at is not null)
);

create table if not exists public.gps_bus_locations (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.gps_bus_trips(id) on delete cascade,
  driver_id uuid not null references public.gps_bus_drivers(user_id) on delete restrict,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  speed double precision check (speed is null or speed >= 0),
  heading double precision check (heading is null or heading between 0 and 360),
  recorded_at timestamptz not null default now()
);

create unique index if not exists gps_bus_one_active_trip_per_driver
  on public.gps_bus_trips (driver_id) where status = 'active';
create index if not exists gps_bus_trips_status_started_idx
  on public.gps_bus_trips (status, started_at desc);
create index if not exists gps_bus_trips_driver_idx
  on public.gps_bus_trips (driver_id);
create index if not exists gps_bus_locations_trip_time_idx
  on public.gps_bus_locations (trip_id, recorded_at asc);
create index if not exists gps_bus_locations_driver_idx
  on public.gps_bus_locations (driver_id);

alter table public.gps_bus_drivers enable row level security;
alter table public.gps_bus_trips enable row level security;
alter table public.gps_bus_locations enable row level security;

drop policy if exists "Driver reads own registration" on public.gps_bus_drivers;
create policy "Driver reads own registration" on public.gps_bus_drivers
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Public reads bus trips" on public.gps_bus_trips;
create policy "Public reads bus trips" on public.gps_bus_trips
  for select to anon, authenticated using (true);

drop policy if exists "Authorized driver starts trip" on public.gps_bus_trips;
create policy "Authorized driver starts trip" on public.gps_bus_trips
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and exists (
      select 1 from public.gps_bus_drivers driver
      where driver.user_id = (select auth.uid()) and driver.active
    )
  );

drop policy if exists "Authorized driver finishes own trip" on public.gps_bus_trips;
create policy "Authorized driver finishes own trip" on public.gps_bus_trips
  for update to authenticated
  using (
    driver_id = (select auth.uid())
    and exists (
      select 1 from public.gps_bus_drivers driver
      where driver.user_id = (select auth.uid()) and driver.active
    )
  )
  with check (driver_id = (select auth.uid()));

drop policy if exists "Public reads bus route" on public.gps_bus_locations;
create policy "Public reads bus route" on public.gps_bus_locations
  for select to anon, authenticated using (true);

drop policy if exists "Authorized driver publishes location" on public.gps_bus_locations;
create policy "Authorized driver publishes location" on public.gps_bus_locations
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and exists (
      select 1 from public.gps_bus_drivers driver
      where driver.user_id = (select auth.uid()) and driver.active
    )
    and exists (
      select 1 from public.gps_bus_trips trip
      where trip.id = trip_id
        and trip.driver_id = (select auth.uid())
        and trip.status = 'active'
    )
  );

revoke all on table public.gps_bus_drivers from anon, authenticated;
revoke all on table public.gps_bus_trips from anon, authenticated;
revoke all on table public.gps_bus_locations from anon, authenticated;
grant select on table public.gps_bus_drivers to authenticated;
grant select on table public.gps_bus_trips to anon, authenticated;
grant insert, update on table public.gps_bus_trips to authenticated;
grant select on table public.gps_bus_locations to anon, authenticated;
grant insert on table public.gps_bus_locations to authenticated;
grant usage, select on sequence public.gps_bus_locations_id_seq to authenticated;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array['gps_bus_trips', 'gps_bus_locations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;

comment on table public.gps_bus_locations is
  'Armazena somente o trajeto público do ônibus. Localizações de passageiros nunca são gravadas.';

-- Após criar o motorista em Authentication > Users, execute:
-- insert into public.gps_bus_drivers (user_id, bus_label)
-- values ('UUID_DO_USUARIO_MOTORISTA', 'Linha principal');

commit;
