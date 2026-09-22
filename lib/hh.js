const HH_BASE = 'https://api.hh.ru';
const UA = () => process.env.HH_USER_AGENT || 'AIJobPolice/0.1 (contact: configure-HH_USER_AGENT)';

const queries = [
  'AI creator', 'AI креатор', 'AI video', 'нейрокреатор',
  'AI content creator', 'creative SMM', 'Kling Veo', 'генеративный контент'
];

async function hhFetch(path, { token, method = 'GET', body } = {}) {
  const headers = { 'HH-User-Agent': UA(), 'Accept': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
  const r = await fetch(`${HH_BASE}${path}`, { method, headers, body });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`HH ${r.status}: ${JSON.stringify(data)}`);
    err.status = r.status; err.data = data; throw err;
  }
  return data;
}

export async function searchHH({ perPage = 20 } = {}) {
  const found = new Map();
  for (const q of queries) {
    const p = new URLSearchParams({ text: q, per_page: String(perPage), page: '0', order_by: 'publication_time' });
    const data = await hhFetch(`/vacancies?${p}`);
    for (const item of data.items || []) found.set(String(item.id), item);
  }
  return [...found.values()];
}

export async function applyHH({ vacancyId, resumeId, message }) {
  const token = process.env.HH_ACCESS_TOKEN;
  if (!token) throw new Error('HH_ACCESS_TOKEN is not configured');
  if (!resumeId) throw new Error('HH_RESUME_ID is not configured');
  const p = new URLSearchParams({ vacancy_id: String(vacancyId), resume_id: String(resumeId) });
  if (message) p.set('message', message);
  return await hhFetch('/negotiations', { token, method: 'POST', body: p.toString() });
}

export async function listHHNegotiations() {
  const token = process.env.HH_ACCESS_TOKEN;
  if (!token) throw new Error('HH_ACCESS_TOKEN is not configured');
  return await hhFetch('/negotiations?status=active&per_page=50', { token });
}
