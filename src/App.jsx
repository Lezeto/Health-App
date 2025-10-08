import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, LabelList } from 'recharts';
import './App.css';
import { supabase, getAccessToken } from './supabaseClient';

// Custom label renderer: place label above the point; shift last label slightly left
const makeTopLabelRenderer = (len) => (props) => {
  const { x, y, value, index } = props;
  if (x == null || y == null) return null;
  const dy = -10; // above the point
  const dx = index === len - 1 ? -12 : 0; // nudge last label left
  return (
    <text x={x + dx} y={y + dy} fill="#e6eef6" fontSize={12} textAnchor="middle" style={{ pointerEvents: 'none' }}>
      {value}
    </text>
  );
};

function useAuth() {
	const [session, setSession] = useState(null);
	const user = useMemo(() => session?.user ?? null, [session]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			const { data } = await supabase.auth.getSession();
			if (mounted) setSession(data.session ?? null);
		})();
		const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
			setSession(s ?? null);
		});
		return () => {
			sub.subscription?.unsubscribe?.();
			mounted = false;
		};
	}, []);

	return { session, user };
}

async function apiFetch(action, opts = {}) {
	const token = await getAccessToken();
	const url = `/api/health?action=${encodeURIComponent(action)}${opts.query ? `&${opts.query}` : ''}`;
	const res = await fetch(url, {
		method: opts.method || 'GET',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: opts.body ? JSON.stringify(opts.body) : undefined,
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const message = data?.error || `Request failed: ${res.status}`;
		throw new Error(message);
	}
	return data;
}

function AuthForms() {
	const [mode, setMode] = useState('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState('');

	const onSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setMessage('');
		try {
			if (mode === 'signup') {
				const { error } = await supabase.auth.signUp({
					email,
					password,
					options: { emailRedirectTo: window.location.origin },
				});
				if (error) throw error;
				setMessage('Revisa tu correo para verificar tu dirección y luego inicia sesión.');
			} else {
				const { error } = await supabase.auth.signInWithPassword({ email, password });
				if (error) throw error;
			}
		} catch (err) {
			setMessage(err.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="auth-card">
			<h1>Rastreador de Salud</h1>
			<form onSubmit={onSubmit}>
				<label>
					Correo electrónico
					<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
				</label>
				<label>
					Contraseña
					<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
				</label>
				<button className="primary" disabled={loading} type="submit">
					{loading ? 'Por favor espera…' : mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
				</button>
			</form>
			<div className="muted">
				{mode === 'signup' ? (
					<span>
						¿Ya tienes cuenta?{' '}
						<button className="link" onClick={() => setMode('signin')}>Inicia sesión</button>
					</span>
				) : (
					<span>
						¿Eres nuevo?{' '}
						<button className="link" onClick={() => setMode('signup')}>Crear cuenta</button>
					</span>
				)}
			</div>
			{message && <div className="alert">{message}</div>}
		</div>
	);
}

function Onboarding({ onDone }) {
	const [role, setRole] = useState('patient');
	const [name, setName] = useState('');
	const [patient, setPatient] = useState({
		age: '', weight: '', height: '', gender: 'other', nationality: '',
		medical_history: '', current_medications: '', allergies: '', family_history: '', lifestyle_factors: '',
	});
	const [doctor, setDoctor] = useState({
		gender: 'other', age: '', nationality: '', level_of_education: '', medical_school: '', year_of_education: '',
		medical_license_number: '', license_region: '', speciality: '', years_of_experience: '', current_workplace: '', languages_spoken: '',
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const submit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setError('');
		try {
			await apiFetch('profile.upsert', {
				method: 'POST',
				body: { role, name, patient, doctor },
			});
			onDone?.();
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="card">
			<h2>¡Bienvenido! Cuéntanos sobre ti</h2>
			<form onSubmit={submit} className="grid">
				<label className="col-span-2">
					Nombre completo
					<input value={name} onChange={(e) => setName(e.target.value)} required />
				</label>
				<label>
					Soy
					<select value={role} onChange={(e) => setRole(e.target.value)}>
						<option value="patient">Paciente</option>
						<option value="doctor">Médico</option>
					</select>
				</label>
				{role === 'patient' ? (
					<div className="col-span-2">
						<h3>Datos del paciente</h3>
						<div className="grid">
							<label>
								Edad
								<input type="number" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value })} required />
							</label>
							<label>
								Género
								<select value={patient.gender} onChange={(e) => setPatient({ ...patient, gender: e.target.value })}>
									<option value="male">Masculino</option>
									<option value="female">Femenino</option>
									<option value="other">Otro</option>
								</select>
							</label>
							<label>
								Peso (kg)
								<input type="number" step="0.1" value={patient.weight} onChange={(e) => setPatient({ ...patient, weight: e.target.value })} required />
							</label>
							<label>
								Altura (cm)
								<input type="number" step="0.1" value={patient.height} onChange={(e) => setPatient({ ...patient, height: e.target.value })} required />
							</label>
							<label>
								Nacionalidad
								<input value={patient.nationality} onChange={(e) => setPatient({ ...patient, nationality: e.target.value })} />
							</label>
							<label className="col-span-2">
								Historial médico
								<textarea value={patient.medical_history} onChange={(e) => setPatient({ ...patient, medical_history: e.target.value })} />
							</label>
							<label className="col-span-2">
								Medicación actual
								<textarea value={patient.current_medications} onChange={(e) => setPatient({ ...patient, current_medications: e.target.value })} />
							</label>
							<label className="col-span-2">
								Alergias
								<textarea value={patient.allergies} onChange={(e) => setPatient({ ...patient, allergies: e.target.value })} />
							</label>
							<label className="col-span-2">
								Antecedentes familiares
								<textarea value={patient.family_history} onChange={(e) => setPatient({ ...patient, family_history: e.target.value })} />
							</label>
							<label className="col-span-2">
								Estilo de vida
								<textarea value={patient.lifestyle_factors} onChange={(e) => setPatient({ ...patient, lifestyle_factors: e.target.value })} />
							</label>
						</div>
					</div>
				) : (
					<div className="col-span-2">
						<h3>Datos del médico</h3>
						<div className="grid">
							<label>
								Edad
								<input type="number" value={doctor.age} onChange={(e) => setDoctor({ ...doctor, age: e.target.value })} required />
							</label>
							<label>
								Género
								<select value={doctor.gender} onChange={(e) => setDoctor({ ...doctor, gender: e.target.value })}>
									<option value="male">Masculino</option>
									<option value="female">Femenino</option>
									<option value="other">Otro</option>
								</select>
							</label>
							<label>
								Nacionalidad
								<input value={doctor.nationality} onChange={(e) => setDoctor({ ...doctor, nationality: e.target.value })} />
							</label>
							<label>
								Nivel educativo
								<input value={doctor.level_of_education} onChange={(e) => setDoctor({ ...doctor, level_of_education: e.target.value })} />
							</label>
							<label className="col-span-2">
								Escuela de medicina
								<input value={doctor.medical_school} onChange={(e) => setDoctor({ ...doctor, medical_school: e.target.value })} />
							</label>
							<label>
								Año de formación
								<input type="number" value={doctor.year_of_education} onChange={(e) => setDoctor({ ...doctor, year_of_education: e.target.value })} />
							</label>
							<label className="col-span-2">
								Número de licencia médica
								<input value={doctor.medical_license_number} onChange={(e) => setDoctor({ ...doctor, medical_license_number: e.target.value })} />
							</label>
							<label>
								País/Región de licencia
								<input value={doctor.license_region} onChange={(e) => setDoctor({ ...doctor, license_region: e.target.value })} />
							</label>
							<label>
								Especialidad
								<input value={doctor.speciality} onChange={(e) => setDoctor({ ...doctor, speciality: e.target.value })} />
							</label>
							<label>
								Años de experiencia
								<input type="number" value={doctor.years_of_experience} onChange={(e) => setDoctor({ ...doctor, years_of_experience: e.target.value })} />
							</label>
							<label className="col-span-2">
								Centro de trabajo actual
								<input value={doctor.current_workplace} onChange={(e) => setDoctor({ ...doctor, current_workplace: e.target.value })} />
							</label>
							<label className="col-span-2">
								Idiomas
								<input value={doctor.languages_spoken} onChange={(e) => setDoctor({ ...doctor, languages_spoken: e.target.value })} placeholder="p. ej., Español, Inglés" />
							</label>
						</div>
					</div>
				)}
				{error && <div className="alert">{error}</div>}
				<div className="actions col-span-2">
					<button className="primary" disabled={loading} type="submit">{loading ? 'Guardando…' : 'Continuar'}</button>
				</div>
			</form>
		</div>
	);
}

function Table({ rows, columns, emptyText = 'Sin datos' }) {
	if (!rows?.length) return <div className="muted">{emptyText}</div>;
	return (
		<div className="table">
			<div className="thead">
				{columns.map((c) => (
					<div className="th" key={c.key}>{c.header}</div>
				))}
			</div>
			{rows.map((r, i) => (
				<div className="tr" key={i}>
					{columns.map((c) => (
						<div className="td" key={c.key}>{c.render ? c.render(r[c.key], r) : r[c.key]}</div>
					))}
				</div>
			))}
		</div>
	);
}

function HabitsCard({ canWrite = true, targetUserId }) {
	const todayISO = new Date().toISOString().slice(0, 10);
	const [form, setForm] = useState({ date: todayISO, steps: '', water_cups: '', sleep_hours: '' });
	const [range, setRange] = useState(7);
	const [data, setData] = useState([]);
	const [view, setView] = useState('table'); // 'table' | 'chart'
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const load = async () => {
		setLoading(true);
		try {
			const q = `rangeDays=${range}${targetUserId ? `&user_id=${encodeURIComponent(targetUserId)}` : ''}`;
			const res = await apiFetch('habits.fetch', { query: q });
			setData(res.items || []);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, [range, targetUserId]);

	const submit = async (e) => {
		e.preventDefault();
		setSaving(true);
		try {
			await apiFetch('habits.upsert', {
				method: 'POST',
				body: {
					...form,
					steps: Number(form.steps || 0),
					water_cups: Number(form.water_cups || 0),
					sleep_hours: Number(form.sleep_hours || 0),
				},
			});
			await load();
		} catch (e) {
			console.error(e);
		} finally {
			setSaving(false);
		}
	};

	// Use reversed data once for all charts and compute length for label positioning
	const revData = useMemo(() => [...data].reverse(), [data]);
	const len = revData.length;

	return (
		<div className="card">
			<div className="card-header">
				<h3>Hábitos saludables</h3>
				<div className="row">
					<label className="row">
						Rango
						<select value={range} onChange={(e) => setRange(Number(e.target.value))}>
							<option value={7}>Últimos 7 días</option>
							<option value={30}>Últimos 30 días</option>
						</select>
					</label>
					<button onClick={load}>Actualizar</button>
				</div>
			</div>

			<div className="row between" style={{ marginTop: 8 }}>
				<div className="row">
					<button onClick={() => setView('table')} className={view === 'table' ? 'primary' : ''}>Tabla</button>
					<button onClick={() => setView('chart')} className={view === 'chart' ? 'primary' : ''}>Gráfico</button>
				</div>
			</div>

			{canWrite && (
				<form onSubmit={submit} className="row wrap gap">
					<label>
						Fecha
						<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
					</label>
					<label>
						Pasos
						<input type="number" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} />
					</label>
					<label>
						Agua (tazas)
						<input type="number" value={form.water_cups} onChange={(e) => setForm({ ...form, water_cups: e.target.value })} />
					</label>
					<label>
						Sueño (horas)
						<input type="number" step="0.1" value={form.sleep_hours} onChange={(e) => setForm({ ...form, sleep_hours: e.target.value })} />
					</label>
					<button className="primary" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar día'}</button>
				</form>
			)}

			{loading ? (
				<div className="muted">Cargando…</div>
			) : view === 'table' ? (
				<Table
					rows={data}
					columns={[
						{ key: 'date', header: 'Fecha' },
						{ key: 'steps', header: 'Pasos' },
						{ key: 'water_cups', header: 'Agua (tazas)' },
						{ key: 'sleep_hours', header: 'Sueño (h)' },
					]}
				/>
			) : (
				<div className="grid">
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>Pasos</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revData} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="steps" name="Pasos" stroke="#4f8cff" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="steps" content={makeTopLabelRenderer(len)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>Agua (tazas)</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revData} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="water_cups" name="Agua (tazas)" stroke="#00c2a8" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="water_cups" content={makeTopLabelRenderer(len)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>Sueño (h)</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revData} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="sleep_hours" name="Sueño (h)" stroke="#ffb74d" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="sleep_hours" content={makeTopLabelRenderer(len)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function VitalsCard({ canWrite = true, targetUserId }) {
	const todayISO = new Date().toISOString().slice(0, 10);
	const [form, setForm] = useState({
		date: todayISO,
		blood_glucose: '',
		blood_pressure_sys: '',
		blood_pressure_dia: '',
		heart_rate: '',
		body_temperature: '',
	});
	const [range, setRange] = useState(7);
	const [data, setData] = useState([]);
	const [view, setView] = useState('table');
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const load = async () => {
		setLoading(true);
		try {
			const q = `rangeDays=${range}${targetUserId ? `&user_id=${encodeURIComponent(targetUserId)}` : ''}`;
			const res = await apiFetch('vitals.fetch', { query: q });
			setData(res.items || []);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, [range, targetUserId]);

	const submit = async (e) => {
		e.preventDefault();
		setSaving(true);
		try {
			const body = {
				...form,
				blood_glucose: form.blood_glucose ? Number(form.blood_glucose) : null,
				blood_pressure_sys: form.blood_pressure_sys ? Number(form.blood_pressure_sys) : null,
				blood_pressure_dia: form.blood_pressure_dia ? Number(form.blood_pressure_dia) : null,
				heart_rate: form.heart_rate ? Number(form.heart_rate) : null,
				body_temperature: form.body_temperature ? Number(form.body_temperature) : null,
			};
			await apiFetch('vitals.upsert', { method: 'POST', body });
			await load();
		} catch (e) {
			console.error(e);
		} finally {
			setSaving(false);
		}
	};

	// Use reversed data once for all vitals charts
	const revVitals = useMemo(() => [...data].reverse(), [data]);
	const vlen = revVitals.length;

	return (
		<div className="card">
			<div className="card-header">
				<h3>Signos vitales</h3>
				<div className="row">
					<label className="row">
						Rango
						<select value={range} onChange={(e) => setRange(Number(e.target.value))}>
							<option value={7}>Últimos 7 días</option>
							<option value={30}>Últimos 30 días</option>
						</select>
					</label>
					<button onClick={load}>Actualizar</button>
				</div>
			</div>

			<div className="row between" style={{ marginTop: 8 }}>
				<div className="row">
					<button onClick={() => setView('table')} className={view === 'table' ? 'primary' : ''}>Tabla</button>
					<button onClick={() => setView('chart')} className={view === 'chart' ? 'primary' : ''}>Gráfico</button>
				</div>
			</div>

			{canWrite && (
				<form onSubmit={submit} className="row wrap gap">
					<label>
						Fecha
						<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
					</label>
					<label>
						Glucosa (mg/dL)
						<input type="number" value={form.blood_glucose} onChange={(e) => setForm({ ...form, blood_glucose: e.target.value })} />
					</label>
					<label>
						PA Sist
						<input type="number" value={form.blood_pressure_sys} onChange={(e) => setForm({ ...form, blood_pressure_sys: e.target.value })} />
					</label>
					<label>
						PA Diast
						<input type="number" value={form.blood_pressure_dia} onChange={(e) => setForm({ ...form, blood_pressure_dia: e.target.value })} />
					</label>
					<label>
						Frecuencia (lpm)
						<input type="number" value={form.heart_rate} onChange={(e) => setForm({ ...form, heart_rate: e.target.value })} />
					</label>
					<label>
						Temperatura (°C)
						<input type="number" step="0.1" value={form.body_temperature} onChange={(e) => setForm({ ...form, body_temperature: e.target.value })} />
					</label>
					<button className="primary" disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar día'}</button>
				</form>
			)}

			{loading ? (
				<div className="muted">Cargando…</div>
			) : view === 'table' ? (
				<Table
					rows={data}
					columns={[
						{ key: 'date', header: 'Fecha' },
						{ key: 'blood_glucose', header: 'Glucosa' },
						{ key: 'blood_pressure_sys', header: 'PA Sist' },
						{ key: 'blood_pressure_dia', header: 'PA Diast' },
						{ key: 'heart_rate', header: 'FC' },
						{ key: 'body_temperature', header: 'Temp' },
					]}
				/>
			) : (
				<div className="grid">
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>Glucosa (mg/dL)</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revVitals} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="blood_glucose" name="Glucosa" stroke="#4f8cff" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="blood_glucose" content={makeTopLabelRenderer(vlen)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>PA Sist</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revVitals} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="blood_pressure_sys" name="PA Sist" stroke="#ef5350" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="blood_pressure_sys" content={makeTopLabelRenderer(vlen)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>PA Diast</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revVitals} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="blood_pressure_dia" name="PA Diast" stroke="#ab47bc" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="blood_pressure_dia" content={makeTopLabelRenderer(vlen)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>Frecuencia (lpm)</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revVitals} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="heart_rate" name="FC" stroke="#26c6da" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="heart_rate" content={makeTopLabelRenderer(vlen)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
					<div>
						<div className="muted sm" style={{ marginBottom: 6 }}>Temperatura (°C)</div>
						<div style={{ width: '100%', height: 220 }}>
							<ResponsiveContainer>
								<LineChart data={revVitals} margin={{ top: 20 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<Tooltip />
									<Line type="monotone" dataKey="body_temperature" name="Temp" stroke="#ffb74d" dot={{ r: 3 }} activeDot={{ r: 5 }}>
										<LabelList dataKey="body_temperature" content={makeTopLabelRenderer(vlen)} />
									</Line>
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function DoctorsDirectory({ onSelect }) {
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(false);

	const load = async () => {
		setLoading(true);
		try {
			const res = await apiFetch('doctors.list');
			setItems(res.items || []);
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	return (
		<div className="card">
			<div className="card-header row between">
				<h3>Todos los médicos</h3>
				<button onClick={load}>Actualizar</button>
			</div>
			{loading ? <div className="muted">Cargando…</div> : (
				<div className="list">
					{items.map((d) => (
						<div className="list-item" key={d.id}>
							<div>      
								<div className="title">{d.name}</div>      
								<div className="muted sm">{d.speciality || 'General'} · {d.languages_spoken ||       '—'}</div>
							</div>      
							{onSelect && <button onClick={() => onSelect(d)}>Compartir datos</button>}      
						</div>      
					))}      
				</div>      
			)}      
		</div>      
	);      
}

function LinksPanel({ role }) {
	const [mutual, setMutual] = useState([]);
	const [patientEmail, setPatientEmail] = useState('');
	const [message, setMessage] = useState('');

	const load = async () => {
		try {
			const res = await apiFetch('link.list');
			setMutual(res.items || []);
		} catch (e) { console.error(e); }
	};

	useEffect(() => { load(); }, []);

	const patientSelect = async () => {
		setMessage('');
		try {
			await apiFetch('link.select', { method: 'POST', body: { patient_email: patientEmail } });
			setMessage('Seleccionado. Esperando selección mutua (si es necesario).');
			await load();
		} catch (e) { setMessage(e.message); }
	};

	const shareWithDoctor = async (doctor) => {
		setMessage('');
		try {
			await apiFetch('link.select', { method: 'POST', body: { doctor_id: doctor.id } });
			setMessage('Médico seleccionado. También debe seleccionarte para ver tus datos.');
			await load();
		} catch (e) { setMessage(e.message); }
	};

	return (
		<div className="grid two">
			{role === 'patient' ? (
				<>
					<DoctorsDirectory onSelect={shareWithDoctor} />
					<div className="card">
						<h3>Médicos con acceso mutuo</h3>
						<ul>
							{mutual.map((m) => (
								<li key={m.id}>{m.name} · {m.speciality || 'General'}</li>
							))}
						</ul>
					</div>
				</>
			) : (
				<>
					<div className="card">
						<h3>Selecciona un paciente por correo</h3>
						<div className="row">
							<input placeholder="paciente@ejemplo.com" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} />
							<button onClick={patientSelect}>Seleccionar</button>
						</div>
						<div className="muted sm">El paciente también debe seleccionarte para compartir sus datos.</div>
					</div>
					<div className="card">
						<h3>Pacientes con acceso mutuo</h3>
						<ul>
							{mutual.map((p) => (
								<li key={p.id}>{p.name || p.email}</li>
							))}
						</ul>
					</div>
				</>
			)}
			{message && <div className="alert col-span-2">{message}</div>}
		</div>
	);
}

function Dashboard({ profile }) {
	const [tab, setTab] = useState('overview');
	const isPatient = profile?.role === 'patient';
	const isDoctor = profile?.role === 'doctor';
	const [patients, setPatients] = useState([]);
	const [selectedPatient, setSelectedPatient] = useState(null);
	const [selectedPatientProfile, setSelectedPatientProfile] = useState(null);

	// For doctors, we need to pick a patient to view
	useEffect(() => {
		const load = async () => {
			if (!isDoctor) return;
			const res = await apiFetch('link.list');
			setPatients(res.items || []);
		};
		load();
	}, [isDoctor]);

	useEffect(() => {
		const loadPatientProfile = async () => {
			if (!isDoctor || !selectedPatient?.id) { setSelectedPatientProfile(null); return; }
			try {
				const res = await apiFetch('profile.get', { query: `user_id=${encodeURIComponent(selectedPatient.id)}` });
				setSelectedPatientProfile(res);
			} catch (e) {
				console.error(e);
				setSelectedPatientProfile(null);
			}
		};
		loadPatientProfile();
	}, [isDoctor, selectedPatient?.id]);

	return (
		<div className="container">
			<header className="topbar">
				<div className="brand">Rastreador de Salud</div>
				<div className="row gap">
					<div className="muted">{profile?.name} · {profile?.role}</div>
					<button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
				</div>
			</header>
			<nav className="tabs">
				<button className={tab==='overview'?'active':''} onClick={() => setTab('overview')}>Resumen</button>
				<button className={tab==='habits'?'active':''} onClick={() => setTab('habits')}>Hábitos</button>
				<button className={tab==='vitals'?'active':''} onClick={() => setTab('vitals')}>Signos vitales</button>
				<button className={tab==='links'?'active':''} onClick={() => setTab('links')}>{isPatient ? 'Médicos' : 'Pacientes'}</button>
			</nav>
			<main className="main">
				{tab === 'overview' && (
					<div className="grid two">
						{isDoctor && (
							<div className="card">
								<h3>Elige un paciente</h3>
								<select value={selectedPatient?.id || ''} onChange={(e) => setSelectedPatient(patients.find(p => p.id === e.target.value))}>
									<option value="">—</option>
									{patients.map((p) => (
										<option key={p.id} value={p.id}>{p.name || p.email}</option>
									))}
								</select>
								{selectedPatient && <div className="muted">Viendo: {selectedPatient.name || selectedPatient.email}</div>}
								{selectedPatientProfile?.patient && (
									<div className="grid" style={{marginTop: 12}}>
										<div>Edad: {selectedPatientProfile.patient.age ?? '—'}</div>
										<div>Género: {selectedPatientProfile.patient.gender ?? '—'}</div>
										<div>Altura: {selectedPatientProfile.patient.height ?? '—'} cm</div>
										<div>Peso: {selectedPatientProfile.patient.weight ?? '—'} kg</div>
										<div className="col-span-2 muted sm">Alergias: {selectedPatientProfile.patient.allergies || '—'}</div>
									</div>
								)}
							</div>
						)}
						<HabitsCard canWrite={isPatient} targetUserId={isDoctor ? selectedPatient?.id : undefined} />
						<VitalsCard canWrite={isPatient} targetUserId={isDoctor ? selectedPatient?.id : undefined} />
					</div>
				)}
				{tab === 'habits' && (
					<HabitsCard canWrite={isPatient} targetUserId={isDoctor ? selectedPatient?.id : undefined} />
				)}
				{tab === 'vitals' && (
					<VitalsCard canWrite={isPatient} targetUserId={isDoctor ? selectedPatient?.id : undefined} />
				)}
				{tab === 'links' && (
					<LinksPanel role={profile?.role} />
				)}
			</main>
		</div>
	);
}

export default function App() {
	const { user } = useAuth();
	const [profile, setProfile] = useState(null);
	const [loading, setLoading] = useState(true);

	const loadProfile = async () => {
		if (!user) { setProfile(null); setLoading(false); return; }
		setLoading(true);
		try {
			const res = await apiFetch('me');
			setProfile(res.profile || null);
		} catch (e) {
			console.error(e);
			setProfile(null);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { loadProfile(); }, [user?.id]);

	if (!user) return <div className="page"><AuthForms /></div>;
	if (loading) return <div className="page center">Cargando…</div>;
	if (!profile) return <div className="page"><Onboarding onDone={loadProfile} /></div>;
	return <Dashboard profile={profile} />;
}
