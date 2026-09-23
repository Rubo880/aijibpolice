import { getHHSettings, saveHHAuth } from './db.js';

const HH_BASE = 'https://api.hh.ru';
const UA = () => process.env.HH_USER_AGENT || 'AIJobPolice/1.0 (configure-contact-email)';

const queries = [
  'AI creator',
  'AI креатор',
  'AI video creator',
  'AI video editor',
  'AI видеомейкер',
  'нейрокреатор',
  'нейровидео',
  'Generative AI designer',
  'AI designer',
  'Kling Veo Runway'
];

async function rawHHFetch(path, { token, method = 'GET', body } = {}) {
  const headers = { 'HH-User-Agent': UA(), 'Accept': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/x-www-form-urlencoded';

  const r = await fetch(`${HH_BASE}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(10000)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`HH ${r.status}: ${JSON.stringify(data)}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function exchangeHHCode({ code, redirectUri }) {
  const clientId = process.env.HH_CLIENT_ID;
  const clientSecret = process.env.HH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('HH_CLIENT_ID / HH_CLIENT_SECRET are not configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  });

  const r = await fetch(`${HH_BASE}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'HH-User-Agent': UA(),
      'Accept': 'application/json'
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HH OAuth ${r.status}: ${JSON.stringify(data)}`);

  await saveHHAuth({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type
  });

  return data;
}

async function refreshHHAccessToken(oauth) {
  const clientId = process.env.HH_CLIENT_ID;
  const clientSecret = process.env.HH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !oauth?.refresh_token) {
    throw new Error('HeadHunter refresh token is unavailable');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: oauth.refresh_token,
    client_id: clientId,
    client_secret: clientSecret
  });

  const r = await fetch(`${HH_BASE}/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'HH-User-Agent': UA(),
      'Accept': 'application/json'
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HH refresh ${r.status}: ${JSON.stringify(data)}`);

  await saveHHAuth({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type
  });

  return data.access_token;
}

export async function getHHAccessToken() {
  if (process.env.HH_ACCESS_TOKEN) return process.env.HH_ACCESS_TOKEN;

  const { oauth } = await getHHSettings();
  if (!oauth?.access_token) throw new Error('HeadHunter is not connected');

  const expiresAt = oauth.expires_at ? new Date(oauth.expires_at).getTime() : null;
  if (expiresAt && Date.now() >= expiresAt) {
    return await refreshHHAccessToken(oauth);
  }

  return oauth.access_token;
}

async function hhFetch(path, { token, method = 'GET', body } = {}) {
  const actualToken = token === undefined ? null : token;
  return rawHHFetch(path, { token: actualToken, method, body });
}

async function hhUserFetch(path, opts = {}) {
  const token = await getHHAccessToken();
  try {
    return await rawHHFetch(path, { ...opts, token });
  } catch (e) {
    // If local expiry time and HH disagree, do not blindly rotate a still-valid refresh token.
    // The user can reconnect via OAuth if authorization was revoked.
    throw e;
  }
}

export async function searchHH({ perPage = 10 } = {}) {
  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const p = new URLSearchParams({
        text: q,
        per_page: String(perPage),
        page: '0',
        order_by: 'publication_time'
      });
      return await hhFetch(`/vacancies?${p}`);
    })
  );

  const found = new Map();
  const errors = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const item of r.value.items || []) {
        found.set(String(item.id), item);
      }
    } else {
      errors.push({ query: queries[i], error: r.reason?.message || String(r.reason) });
    }
  });

  return { items: [...found.values()], errors };
}

export async function getHHMe() {
  return await hhUserFetch('/me');
}

export async function getHHResumes() {
  const data = await hhUserFetch('/resumes/mine');
  return data.items || [];
}

export async function getHHVacancy(vacancyId) {
  const token = await getHHAccessToken().catch(() => null);
  return await rawHHFetch(`/vacancies/${encodeURIComponent(vacancyId)}`, { token });
}

export async function applyHH({ vacancyId, resumeId, message }) {
  if (!resumeId) throw new Error('HH resume is not selected');

  const vacancy = await getHHVacancy(vacancyId);
  if (vacancy?.test?.required) {
    throw new Error('Vacancy requires an HH test; manual action is required');
  }
  if (vacancy?.response_letter_required && !String(message || '').trim()) {
    throw new Error('Vacancy requires a cover letter');
  }

  const p = new URLSearchParams({
    vacancy_id: String(vacancyId),
    resume_id: String(resumeId)
  });
  if (message) p.set('message', message);

  return await hhUserFetch('/negotiations', {
    method: 'POST',
    body: p.toString()
  });
}

export async function listHHNegotiations() {
  return await hhUserFetch('/negotiations?status=active&per_page=50');
}
