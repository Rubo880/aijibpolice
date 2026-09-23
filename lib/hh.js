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

async function hhFetch(path) {
  const r = await fetch(`${HH_BASE}${path}`, {
    headers: {
      'HH-User-Agent': UA(),
      'Accept': 'application/json'
    },
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
      errors.push({
        query: queries[i],
        error: r.reason?.message || String(r.reason)
      });
    }
  });

  return { items: [...found.values()], errors };
}

export async function getHHVacancy(vacancyId) {
  return await hhFetch(`/vacancies/${encodeURIComponent(vacancyId)}`);
}
