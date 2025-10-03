-- Supabase schema for Health Tracker
-- Safe to run multiple times: uses DROP POLICY IF EXISTS and IF NOT EXISTS for tables/indexes.
-- NOTE: No use of "CREATE POLICY IF NOT EXISTS" (unsupported by Postgres/Supabase).

begin;

-- For gen_random_uuid()
create extension if not exists pgcrypto;

-- profiles: basic account profile
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  role text check (role in ('patient','doctor')),
  created_at timestamptz default now()
);

-- patient profile
create table if not exists public.patient_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  age int,
  weight float8,
  height float8,
  gender text,
  nationality text,
  medical_history text,
  current_medications text,
  allergies text,
  family_history text,
  lifestyle_factors text
);

-- doctor profile (public)
create table if not exists public.doctor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gender text,
  age int,
  nationality text,
  level_of_education text,
  medical_school text,
  year_of_education int,
  medical_license_number text,
  license_region text,
  speciality text,
  years_of_experience int,
  current_workplace text,
  languages_spoken text
);

-- daily habits
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  steps int default 0,
  water_cups int default 0,
  sleep_hours float8 default 0,
  unique(user_id, date)
);
create index if not exists habits_user_date_idx on public.habits(user_id, date desc);

-- daily vitals
create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  blood_glucose int,
  blood_pressure_sys int,
  blood_pressure_dia int,
  heart_rate int,
  body_temperature float8,
  unique(user_id, date)
);
create index if not exists vitals_user_date_idx on public.vitals(user_id, date desc);

-- doctor-patient mutual selection
create table if not exists public.doctor_patient_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  patient_selected boolean default false,
  doctor_selected boolean default false,
  created_at timestamptz default now(),
  unique(patient_id, doctor_id)
);
create index if not exists doctor_patient_links_patient_idx on public.doctor_patient_links(patient_id);
create index if not exists doctor_patient_links_doctor_idx on public.doctor_patient_links(doctor_id);

-- RLS policies
alter table public.profiles enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.habits enable row level security;
alter table public.vitals enable row level security;
alter table public.doctor_patient_links enable row level security;

-- profiles policies
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self write" on public.profiles;
create policy "profiles self write" on public.profiles
  for update using (auth.uid() = id);

-- patient_profiles policies
drop policy if exists "patient_profiles self" on public.patient_profiles;
create policy "patient_profiles self" on public.patient_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- doctor_profiles policies
drop policy if exists "doctor_profiles public read" on public.doctor_profiles;
create policy "doctor_profiles public read" on public.doctor_profiles
  for select using (true);

drop policy if exists "doctor_profiles self write" on public.doctor_profiles;
create policy "doctor_profiles self write" on public.doctor_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- habits policies
drop policy if exists "habits self" on public.habits;
create policy "habits self" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- vitals policies
drop policy if exists "vitals self" on public.vitals;
create policy "vitals self" on public.vitals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- doctor_patient_links policies
drop policy if exists "links self" on public.doctor_patient_links;
create policy "links self" on public.doctor_patient_links
  for all using (auth.uid() = patient_id or auth.uid() = doctor_id)
  with check (auth.uid() = patient_id or auth.uid() = doctor_id);

commit;
