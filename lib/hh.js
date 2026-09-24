const HH_RSS = 'https://hh.ru/search/vacancy/rss';
const UA = () => process.env.HH_USER_AGENT || 'AIJobPolice/1.0 (+https://github.com/Rubo880/aijibpolice)';
const PAUSE_MS = 4500;
const RETRIES = 2;

// Frequent watcher: keep each pass light to reduce HH RSS rate limiting.
// Two broad title searches catch most naming variants; a third query rotates
// through creative-AI tools to catch generic titles whose description contains the stack.
const deepTerms = ['Kling', 'Veo', 'Seedance', 'Runway', 'Nano Banana', 'Midjourney'];

function queryPlans() {
  const slot = Math.floor(Date.now() / (10 * 60 * 1000));
  const deep = deepTerms[slot % deepTerms.length];
  return [
    { text: 'AI', searchField: 'name' },
    { text: 'нейро', searchField: 'name' },
    { text: deep, searchField: null }
  ];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decode(s = '') {
  return String(s)
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
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

    if (r.ok) {
      const body = await r.text();
      if (!/<rss[\s>]|<channel[\s>]/i.test(body)) {
        throw new Error('HH RSS returned a non-RSS response');
      }
      return body;
    }

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

  const plans = queryPlans();

  for (let i = 0; i < plans.length; i++) {
    if (i > 0) await sleep(PAUSE_MS);

    const plan = plans[i];
    const params = new URLSearchParams({
      text: plan.text,
      order_by: 'publication_time',
      search_period: '7'
    });
    if (plan.searchField) params.set('search_field', plan.searchField);

    try {
      const xml = await fetchFeed(`${HH_RSS}?${params.toString()}`);
      for (const item of parseItems(xml)) {
        found.set(String(item.id), item);
      }
    } catch (e) {
      errors.push({
        query: plan.text,
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
