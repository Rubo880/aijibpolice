const HH_RSS = 'https://hh.ru/search/vacancy/rss';
const UA = () => process.env.HH_USER_AGENT || 'AIJobPolice/1.0 (+https://github.com/Rubo880/aijibpolice)';
const PAUSE_MS = 4500;
const RETRIES = 2;

// Keep the list short: HH RSS can temporarily return 451 when requests are too frequent.
// Each feed contains the latest ~20 vacancies for the query.
const queries = [
  'AI creator',
  'AI video',
  'нейрокреатор',
  'нейровидео',
  'Generative AI designer'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(s = '') {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
  return m?.[1]?.trim() || '';
}

function field(desc, label) {
  const m = desc.match(new RegExp(`${label}:\\s*([^<]*)`, 'i'));
  return m?.[1]?.trim() || '';
}

function stripHtml(html = '') {
  return decode(
    String(html)
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

async function fetchFeed(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA(),
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (r.ok) return await r.text();

    if (r.status === 451 && attempt < RETRIES) {
      await sleep(PAUSE_MS * (attempt + 2));
      continue;
    }

    throw new Error(`HH RSS ${r.status}`);
  }
}

function parseItems(xml) {
  const out = [];

  for (const block of String(xml || '').split('<item>').slice(1)) {
    const linkRaw = decode(tag(block, 'link'));
    const id = (linkRaw.match(/vacancy\/(\d+)/) || [])[1];
    if (!id) continue;

    const desc =
      (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || [])[1] ||
      tag(block, 'description') ||
      '';

    const title = decode(tag(block, 'title'));
    const company = decode(field(desc, 'Вакансия компании'));
    const salary = decode(field(desc, 'Предполагаемый уровень месячного дохода'));
    const location = decode(field(desc, 'Регион'));
    const pubDate = decode(tag(block, 'pubDate'));

    let publishedAt = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    const plainDesc = stripHtml(desc);

    out.push({
      id,
      alternate_url: linkRaw,
      name: title,
      employer: company ? { name: company } : null,
      snippet: {
        requirement: plainDesc || null,
        responsibility: null
      },
      salary: salary && !/не указан/i.test(salary)
        ? { from: salary, to: null, currency: '' }
        : null,
      area: location ? { name: location } : null,
      published_at: publishedAt,
      _rss: true
    });
  }

  return out;
}

export async function searchHH() {
  const found = new Map();
  const errors = [];

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(PAUSE_MS);

    const query = queries[i];
    const params = new URLSearchParams({
      text: query,
      search_field: 'name',
      order_by: 'publication_time',
      search_period: '7'
    });

    try {
      const xml = await fetchFeed(`${HH_RSS}?${params.toString()}`);
      for (const item of parseItems(xml)) {
        found.set(String(item.id), item);
      }
    } catch (e) {
      errors.push({
        query,
        error: e?.message || String(e)
      });
    }
  }

  return {
    items: [...found.values()],
    errors,
    source: 'rss'
  };
}
