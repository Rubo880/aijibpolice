import * as cheerio from 'cheerio';

const HH_RSS = 'https://hh.ru/search/vacancy/rss';
const UA = () => process.env.HH_USER_AGENT || 'AIJobPolice/1.0 (+https://github.com/Rubo880/aijibpolice)';
const PAUSE_MS = 4500;
const RETRIES = 2;

// Frequent watcher: avoid one overly broad "AI" feed because RSS only exposes
// a limited slice of the newest results. Narrow title queries give much better
// recall for creative roles; one title family and one tool query rotate each run.
const titleTerms = [
  'AI video',
  'AI artist',
  'AI designer',
  'AI content',
  'ИИ контент',
  'ИИ видео',
  'ИИ дизайнер',
  'нейрокреатор',
  'нейродизайнер',
  'нейровидео'
];
const deepTerms = ['Kling', 'Veo', 'Seedance', 'Runway', 'Nano Banana', 'Midjourney'];

function queryPlans() {
  const slot = Math.floor(Date.now() / (10 * 60 * 1000));
  const title = titleTerms[slot % titleTerms.length];
  const deep = deepTerms[slot % deepTerms.length];

  return [
    { text: 'AI-креатор', searchField: 'name' },
    { text: 'AI creator', searchField: 'name' },
    { text: 'ИИ генерации', searchField: 'name' },
    { text: title, searchField: 'name' },
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


function cleanText(s = '') {
  return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchSearchHtml(plan, searchPeriod) {
  const params = new URLSearchParams({
    text: plan.text,
    order_by: 'publication_time',
    search_period: String(searchPeriod),
    page: '0'
  });
  if (plan.searchField) params.set('search_field', plan.searchField);

  const url = `https://hh.ru/search/vacancy?${params.toString()}`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA(),
      'Accept': 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!r.ok) throw new Error(`HH HTML ${r.status}`);

  const html = await r.text();
  if (/showcaptcha|captcha/i.test(html)) {
    throw new Error('HH HTML CAPTCHA');
  }

  const $ = cheerio.load(html);
  const found = new Map();

  const cards = $('[data-qa="vacancy-serp__vacancy"], [data-qa*="vacancy-serp__vacancy"]');

  cards.each((_, el) => {
    const card = $(el);
    const titleAnchor = card.find('a[data-qa="serp-item__title"], a[href*="/vacancy/"]').first();
    const href = titleAnchor.attr('href') || '';
    const id = (href.match(/vacancy\/(\d+)/) || [])[1];
    const title = cleanText(titleAnchor.text());

    if (!id || !title || /откликнуться|отклик/i.test(title)) return;

    const company = cleanText(
      card.find('[data-qa="vacancy-serp__vacancy-employer"], [data-qa*="vacancy-employer"]').first().text()
    );
    const salary = cleanText(
      card.find('[data-qa="vacancy-serp__vacancy-compensation"], [data-qa*="vacancy-compensation"]').first().text()
    );
    const location = cleanText(
      card.find('[data-qa="vacancy-serp__vacancy-address"], [data-qa*="vacancy-address"]').first().text()
    );
    const cardText = cleanText(card.text());

    found.set(id, {
      id,
      alternate_url: href.startsWith('http') ? href : `https://hh.ru${href}`,
      name: title,
      employer: company ? { name: company } : null,
      snippet: {
        requirement: cardText || null,
        responsibility: null
      },
      salary: salary ? { from: salary, to: null, currency: '' } : null,
      area: location ? { name: location } : null,
      published_at: null,
      _html: true
    });
  });

  // Fallback for layout changes: collect title-like vacancy links even if card selectors changed.
  if (!found.size) {
    $('a[href*="/vacancy/"]').each((_, el) => {
      const a = $(el);
      const href = a.attr('href') || '';
      const id = (href.match(/vacancy\/(\d+)/) || [])[1];
      const title = cleanText(a.text());
      if (!id || title.length < 6 || /откликнуться|отклик|чат|контакт/i.test(title)) return;
      if (found.has(id)) return;

      found.set(id, {
        id,
        alternate_url: href.startsWith('http') ? href : `https://hh.ru${href}`,
        name: title,
        employer: null,
        snippet: { requirement: title, responsibility: null },
        salary: null,
        area: null,
        published_at: null,
        _html: true
      });
    });
  }

  return [...found.values()];
}

async function searchHHHtmlFallback(searchPeriod) {
  const found = new Map();
  const errors = [];
  const plans = [
    { text: 'AI-креатор', searchField: 'name' },
    { text: 'AI creator', searchField: 'name' },
    { text: 'ИИ генерации', searchField: 'name' },
    { text: 'ИИ контент', searchField: 'name' },
    { text: 'AI video', searchField: 'name' },
    { text: 'AI designer', searchField: 'name' }
  ];

  const settled = await Promise.allSettled(
    plans.map(async (plan) => ({
      plan,
      items: await fetchSearchHtml(plan, searchPeriod)
    }))
  );

  for (const result of settled) {
    if (result.status === 'rejected') {
      errors.push({ query: 'html-fallback', error: result.reason?.message || String(result.reason) });
      continue;
    }

    for (const item of result.value.items) {
      found.set(String(item.id), item);
    }
  }

  return { items: [...found.values()], errors };
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

export async function searchHH({ searchPeriod = 30 } = {}) {
  const found = new Map();
  const errors = [];

  const plans = queryPlans();

  for (let i = 0; i < plans.length; i++) {
    if (i > 0) await sleep(PAUSE_MS);

    const plan = plans[i];
    const params = new URLSearchParams({
      text: plan.text,
      order_by: 'publication_time',
      search_period: String(searchPeriod)
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

  // Manual/deep scans cover older active vacancies through HH's public HTML search too.
  // The fast watcher uses a short search period and stays RSS-only to minimize load.
  if (searchPeriod > 3) {
    const html = await searchHHHtmlFallback(searchPeriod);
    for (const item of html.items) {
      found.set(String(item.id), item);
    }
    errors.push(...html.errors);
  }

  return {
    items: [...found.values()],
    errors,
    source: searchPeriod > 3 ? 'rss+html' : 'rss'
  };
}
