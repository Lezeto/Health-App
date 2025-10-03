# Health Tracker (Vite + Supabase + Vercel Functions)

This app lets patients track habits (steps, water, sleep) and vitals (glucose, blood pressure, heart rate, temperature), and lets doctors view data for patients who mutually consent. Auth uses Supabase email/password with email verification.

## Environment variables

Create a `.env.local` in the project root (same folder as `package.json`):

```
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

On Vercel project settings (Environment Variables):
- SUPABASE_URL = YOUR_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY = YOUR_SUPABASE_SERVICE_ROLE (service_role) key

Note: Do NOT expose the service role key in client-side code; only in Vercel serverless env.

If you see module import issues in the Vercel function, set `"type": "module"` in `package.json` or rename `api/health.js` to `api/health.mjs`.

## Local development

Option A (Vite only, functions disabled): use the deployed Vercel URL in `apiFetch` if desired.

Option B (Vercel dev):
- Install Vercel CLI
- Run `vercel dev` to run the Vite app and serverless functions locally under the same origin.

## Deploying to Vercel

- Create a new Vercel project and set the project root to this folder.
- Ensure the `api/` directory is included (contains `api/health.js`).
- Add environment variables under Project Settings → Environment Variables.
- Deploy.

## Supabase schema (SQL)

Run the following in Supabase SQL editor:

```sql
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

-- Baseline restrictive policies (service role bypasses RLS)
create policy if not exists "profiles self read" on public.profiles
  for select using (auth.uid() = id);
create policy if not exists "profiles self write" on public.profiles
  for update using (auth.uid() = id);

create policy if not exists "patient_profiles self" on public.patient_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists "doctor_profiles public read" on public.doctor_profiles
  for select using (true);
create policy if not exists "doctor_profiles self write" on public.doctor_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists "habits self" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists "vitals self" on public.vitals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists "links self" on public.doctor_patient_links
  for all using (auth.uid() = patient_id or auth.uid() = doctor_id)
  with check (auth.uid() = patient_id or auth.uid() = doctor_id);
```

## What’s inside

- `src/App.jsx`: React UI with auth, onboarding, habits/vitals tracking, doctor/patient linking, and doctor view.
- `src/supabaseClient.js`: Supabase client.
- `src/App.css`: Styles.
- `api/health.js`: Vercel serverless function using Supabase service role to implement API actions.

## Notes

- Patients can write their own habits/vitals. Doctors can view a patient only if both have mutually selected each other.
- Doctors are discoverable in the “All doctors” list (public doctor profiles).
- Data is stored in normalized columns, not as a single JSON object, as requested.