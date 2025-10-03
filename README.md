This app lets patients track habits (steps, water, sleep) and vitals (glucose, blood pressure, heart rate, temperature), and lets doctors view data for patients who mutually consent. Auth uses Supabase email/password with email verification.

- `src/App.jsx`: React UI with auth, onboarding, habits/vitals tracking, doctor/patient linking, and doctor view.
- `src/supabaseClient.js`: Supabase client.
- `src/App.css`: Styles.
- `api/health.js`: Vercel serverless function using Supabase service role to implement API actions.

- Patients can write their own habits/vitals. Doctors can view a patient only if both have mutually selected each other.
- Doctors are discoverable in the “All doctors” list (public doctor profiles).
- Data is stored in normalized columns, not as a single JSON object, as requested.