-- Core tables for EV Slot Booking & Drive Mode

-- Users are primarily managed by Supabase auth.users.
-- This shadow table stores profile-level metadata if needed.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- 4-digit PIN for fast login, associated with a user.
-- Store as a hash in the application; database treats it as opaque text.
create table if not exists public.pins (
  user_id uuid primary key references public.users(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- Vehicles owned by a user.
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  nickname text not null,
  license_plate text not null,
  ev_model text not null,
  battery_capacity_kwh numeric(6,2) not null,
  supported_ports text[] not null, -- e.g. '{\"Type 2\",\"CCS\"}'
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Charging stations; seeded with ~10 rows in the app / SQL seed.
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  distance_km numeric(6,2), -- precomputed from a fixed city center
  is_supercharger boolean default false,
  cost_per_kwh numeric(6,2) not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Individual charging ports at each station.
create table if not exists public.ports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  port_type text not null, -- e.g. 'Type 2', 'CCS', 'CHAdeMO'
  power_kw numeric(6,2) not null,
  is_available boolean default true,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Bookings link a user & vehicle to a specific port in a time window.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete set null,
  port_id uuid not null references public.ports(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  status text not null default 'confirmed' -- e.g. confirmed, cancelled, completed
);

-- Prevent overlapping bookings on the same port.
create unique index if not exists bookings_no_overlap_idx
on public.bookings (port_id, start_time, end_time);

-- Basic Row Level Security scaffolding (to be refined per feature).
alter table public.users enable row level security;
alter table public.pins enable row level security;
alter table public.vehicles enable row level security;
alter table public.stations enable row level security;
alter table public.ports enable row level security;
alter table public.bookings enable row level security;

