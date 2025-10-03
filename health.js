// Vercel Serverless Function: Health API
// Endpoints are action-based via query param `action`.
// Requires environment variables on Vercel:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (service_role)
//
// Notes: Data is stored in normalized columns across these tables:
// profiles (id uuid PK = auth.users.id, email text, name text, role text)
// patient_profiles (user_id uuid PK/FK, age int, weight float, height float, gender text, nationality text, medical_history text, current_medications text, allergies text, family_history text, lifestyle_factors text)
// doctor_profiles (user_id uuid PK/FK, gender text, age int, nationality text, level_of_education text, medical_school text, year_of_education int, medical_license_number text, license_region text, speciality text, years_of_experience int, current_workplace text, languages_spoken text)
// habits (id uuid, user_id uuid, date date, steps int, water_cups int, sleep_hours float)
// vitals (id uuid, user_id uuid, date date, blood_glucose int, blood_pressure_sys int, blood_pressure_dia int, heart_rate int, body_temperature float)
// doctor_patient_links (id uuid, patient_id uuid, doctor_id uuid, patient_selected boolean, doctor_selected boolean, created_at timestamptz)

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(supabaseUrl, supabaseServiceKey);

function json(res, status, body) {
	res.status(status).setHeader('Content-Type', 'application/json');
	// Basic CORS for local dev with Vite
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
	res.end(JSON.stringify(body));
}

async function getAuthUser(req) {
	const auth = req.headers['authorization'] || req.headers['Authorization'];
	if (!auth) return null;
	const token = auth.replace('Bearer ', '').trim();
	if (!token) return null;
	const { data, error } = await sb.auth.getUser(token);
	if (error) return null;
	return data.user || null;
}

async function getProfile(userId) {
	const { data: prof, error } = await sb
		.from('profiles')
		.select('*')
		.eq('id', userId)
		.single();
	if (error) return null;
	return prof;
}

async function ensureProfile(userId, email, payload) {
	// Upsert basic profile
	const base = { id: userId, email, name: payload.name, role: payload.role };
	const { error: pErr } = await sb.from('profiles').upsert(base, { onConflict: 'id' });
	if (pErr) throw pErr;

	if (payload.role === 'patient') {
		const p = payload.patient || {};
		const row = {
			user_id: userId,
			age: toInt(p.age),
			weight: toFloat(p.weight),
			height: toFloat(p.height),
			gender: p.gender || null,
			nationality: p.nationality || null,
			medical_history: p.medical_history || null,
			current_medications: p.current_medications || null,
			allergies: p.allergies || null,
			family_history: p.family_history || null,
			lifestyle_factors: p.lifestyle_factors || null,
		};
		const { error } = await sb.from('patient_profiles').upsert(row, { onConflict: 'user_id' });
		if (error) throw error;
	} else if (payload.role === 'doctor') {
		const d = payload.doctor || {};
		const row = {
			user_id: userId,
			gender: d.gender || null,
			age: toInt(d.age),
			nationality: d.nationality || null,
			level_of_education: d.level_of_education || null,
			medical_school: d.medical_school || null,
			year_of_education: toInt(d.year_of_education),
			medical_license_number: d.medical_license_number || null,
			license_region: d.license_region || null,
			speciality: d.speciality || null,
			years_of_experience: toInt(d.years_of_experience),
			current_workplace: d.current_workplace || null,
			languages_spoken: d.languages_spoken || null,
		};
		const { error } = await sb.from('doctor_profiles').upsert(row, { onConflict: 'user_id' });
		if (error) throw error;
	}
}

function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function toFloat(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

async function getOrCreateLink(patientId, doctorId) {
	const { data: existing } = await sb
		.from('doctor_patient_links')
		.select('*')
		.eq('patient_id', patientId)
		.eq('doctor_id', doctorId)
		.maybeSingle();
	if (existing) return existing;
	const { data, error } = await sb
		.from('doctor_patient_links')
		.insert({ patient_id: patientId, doctor_id: doctorId, patient_selected: false, doctor_selected: false })
		.select()
		.single();
	if (error) throw error;
	return data;
}

function daysAgoISO(days) {
	const dt = new Date();
	dt.setDate(dt.getDate() - days);
	return dt.toISOString().slice(0, 10);
}

async function canDoctorView(doctorId, patientId) {
	const { data, error } = await sb
		.from('doctor_patient_links')
		.select('id, patient_selected, doctor_selected')
		.eq('doctor_id', doctorId)
		.eq('patient_id', patientId)
		.maybeSingle();
	if (error || !data) return false;
	return !!(data.patient_selected && data.doctor_selected);
}

export default async function handler(req, res) {
	if (req.method === 'OPTIONS') {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
		return res.status(204).end();
	}

	const user = await getAuthUser(req);
	if (!user) return json(res, 401, { error: 'Unauthorized' });

	const url = new URL(req.url, `http://${req.headers.host}`);
	const action = url.searchParams.get('action');
	const qp = Object.fromEntries(url.searchParams.entries());
	let body = {};
	if (req.method === 'POST') {
		try { body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}'); }
		catch { body = {}; }
	}

	try {
		switch (action) {
			case 'me': {
				const profile = await getProfile(user.id);
				return json(res, 200, { profile });
			}
				case 'profile.get': {
					const forUserId = qp.user_id;
					if (!forUserId) return json(res, 400, { error: 'user_id required' });
					if (forUserId !== user.id) {
						// must be doctor with mutual link
						const profile = await getProfile(user.id);
						if (profile?.role !== 'doctor') return json(res, 403, { error: 'Forbidden' });
						const can = await canDoctorView(user.id, forUserId);
						if (!can) return json(res, 403, { error: 'No permission' });
					}
					const { data: prof, error: pErr } = await sb.from('profiles').select('*').eq('id', forUserId).maybeSingle();
					if (pErr || !prof) return json(res, 404, { error: 'Not found' });
					if (prof.role === 'patient') {
						const { data: p } = await sb.from('patient_profiles').select('*').eq('user_id', forUserId).maybeSingle();
						return json(res, 200, { profile: prof, patient: p || null });
					} else if (prof.role === 'doctor') {
						const { data: d } = await sb.from('doctor_profiles').select('*').eq('user_id', forUserId).maybeSingle();
						return json(res, 200, { profile: prof, doctor: d || null });
					}
					return json(res, 200, { profile: prof });
				}
			case 'profile.upsert': {
				await ensureProfile(user.id, user.email, body);
				const profile = await getProfile(user.id);
				return json(res, 200, { ok: true, profile });
			}
			case 'habits.upsert': {
				const date = body.date || new Date().toISOString().slice(0, 10);
				// Manual upsert by (user_id, date)
				const { data: existing } = await sb
					.from('habits')
					.select('id')
					.eq('user_id', user.id)
					.eq('date', date)
					.maybeSingle();
				const row = {
					user_id: user.id,
					date,
					steps: toInt(body.steps) || 0,
					water_cups: toInt(body.water_cups) || 0,
					sleep_hours: toFloat(body.sleep_hours) || 0,
				};
				if (existing) {
					const { error } = await sb.from('habits').update(row).eq('id', existing.id);
					if (error) throw error;
				} else {
					const { error } = await sb.from('habits').insert(row);
					if (error) throw error;
				}
				return json(res, 200, { ok: true });
			}
			case 'habits.fetch': {
				const rangeDays = toInt(qp.rangeDays) || 7;
				const forUserId = qp.user_id || user.id;
				if (forUserId !== user.id) {
					// must be doctor with mutual link
					const profile = await getProfile(user.id);
					if (profile?.role !== 'doctor') return json(res, 403, { error: 'Forbidden' });
					const can = await canDoctorView(user.id, forUserId);
					if (!can) return json(res, 403, { error: 'No permission' });
				}
				const since = daysAgoISO(rangeDays);
				const { data, error } = await sb
					.from('habits')
					.select('date, steps, water_cups, sleep_hours')
					.eq('user_id', forUserId)
					.gte('date', since)
					.order('date', { ascending: false });
				if (error) throw error;
				return json(res, 200, { items: data });
			}
			case 'vitals.upsert': {
				const date = body.date || new Date().toISOString().slice(0, 10);
				const { data: existing } = await sb
					.from('vitals')
					.select('id')
					.eq('user_id', user.id)
					.eq('date', date)
					.maybeSingle();
				const row = {
					user_id: user.id,
					date,
					blood_glucose: toInt(body.blood_glucose),
					blood_pressure_sys: toInt(body.blood_pressure_sys),
					blood_pressure_dia: toInt(body.blood_pressure_dia),
					heart_rate: toInt(body.heart_rate),
					body_temperature: toFloat(body.body_temperature),
				};
				if (existing) {
					const { error } = await sb.from('vitals').update(row).eq('id', existing.id);
					if (error) throw error;
				} else {
					const { error } = await sb.from('vitals').insert(row);
					if (error) throw error;
				}
				return json(res, 200, { ok: true });
			}
			case 'vitals.fetch': {
				const rangeDays = toInt(qp.rangeDays) || 7;
				const forUserId = qp.user_id || user.id;
				if (forUserId !== user.id) {
					const profile = await getProfile(user.id);
					if (profile?.role !== 'doctor') return json(res, 403, { error: 'Forbidden' });
					const can = await canDoctorView(user.id, forUserId);
					if (!can) return json(res, 403, { error: 'No permission' });
				}
				const since = daysAgoISO(rangeDays);
				const { data, error } = await sb
					.from('vitals')
					.select('date, blood_glucose, blood_pressure_sys, blood_pressure_dia, heart_rate, body_temperature')
					.eq('user_id', forUserId)
					.gte('date', since)
					.order('date', { ascending: false });
				if (error) throw error;
				return json(res, 200, { items: data });
			}
			case 'doctors.list': {
				const { data, error } = await sb
					.from('profiles')
							.select('id, name, role, email, doctor_profiles!inner(speciality, languages_spoken)')
					.eq('role', 'doctor');
				if (error) throw error;
						const items = (data || []).map((d) => {
							const dp = Array.isArray(d.doctor_profiles) ? d.doctor_profiles[0] : d.doctor_profiles;
							return {
								id: d.id,
								name: d.name,
								email: d.email,
								speciality: dp?.speciality || null,
								languages_spoken: dp?.languages_spoken || null,
							};
						});
				return json(res, 200, { items });
			}
			case 'link.select': {
				// Patient selects doctor by doctor_id OR Doctor selects patient by email
				const myProfile = await getProfile(user.id);
				if (!myProfile) return json(res, 400, { error: 'Complete profile first' });
				if (myProfile.role === 'patient') {
					const doctorId = body.doctor_id;
					if (!doctorId) return json(res, 400, { error: 'doctor_id required' });
					const link = await getOrCreateLink(user.id, doctorId);
					const { error } = await sb
						.from('doctor_patient_links')
						.update({ patient_selected: true })
						.eq('id', link.id);
					if (error) throw error;
					return json(res, 200, { ok: true });
				} else if (myProfile.role === 'doctor') {
					const patientEmail = body.patient_email;
					if (!patientEmail) return json(res, 400, { error: 'patient_email required' });
					const { data: patient, error: pErr } = await sb
						.from('profiles').select('id, email').eq('email', patientEmail).eq('role', 'patient').maybeSingle();
					if (pErr || !patient) return json(res, 404, { error: 'Patient not found' });
					const link = await getOrCreateLink(patient.id, user.id);
					const { error } = await sb
						.from('doctor_patient_links')
						.update({ doctor_selected: true })
						.eq('id', link.id);
					if (error) throw error;
					return json(res, 200, { ok: true });
				} else {
					return json(res, 403, { error: 'Forbidden' });
				}
			}
			case 'link.list': {
				const myProfile = await getProfile(user.id);
				if (!myProfile) return json(res, 400, { error: 'No profile' });
				if (myProfile.role === 'patient') {
					const { data, error } = await sb
						.from('doctor_patient_links')
						.select('doctor_id, patient_selected, doctor_selected, profiles:doctor_id(name), doctor_profiles:doctor_id(speciality)')
						.eq('patient_id', user.id)
						.eq('patient_selected', true)
						.eq('doctor_selected', true);
					if (error) throw error;
					const items = (data || []).map((row) => ({
						id: row.doctor_id,
						name: row.profiles?.name || null,
						speciality: row.doctor_profiles?.speciality || null,
					}));
					return json(res, 200, { items });
				} else if (myProfile.role === 'doctor') {
					const { data, error } = await sb
						.from('doctor_patient_links')
						.select('patient_id, patient_selected, doctor_selected, profiles:patient_id(name, email)')
						.eq('doctor_id', user.id)
						.eq('patient_selected', true)
						.eq('doctor_selected', true);
					if (error) throw error;
					const items = (data || []).map((row) => ({
						id: row.patient_id,
						name: row.profiles?.name || null,
						email: row.profiles?.email || null,
					}));
					return json(res, 200, { items });
				} else {
					return json(res, 403, { error: 'Forbidden' });
				}
			}
			default:
				return json(res, 400, { error: 'Unknown action' });
		}
	} catch (e) {
		console.error(e);
		return json(res, 500, { error: e.message || 'Server error' });
	}
}

