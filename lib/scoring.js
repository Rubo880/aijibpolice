const positive = [
  ['ai creator', 24], ['ai-креатор', 24], ['ai креатор', 24], ['нейрокреатор', 24],
  ['ai video', 22], ['ai-видео', 22], ['нейровидео', 22], ['генератив', 12],
  ['kling', 14], ['veo', 14], ['seedance', 16], ['runway', 12], ['nano banana', 14],
  ['midjourney', 8], ['reels', 10], ['shorts', 8], ['vertical video', 10], ['вертикальн', 10],
  ['контент-креатор', 14], ['контент креатор', 14], ['content creator', 14],
  ['creative smm', 12], ['smm', 6], ['ai designer', 12], ['ai-дизайнер', 12],
  ['product visual', 10], ['product video', 10], ['реклам', 7], ['бренд', 5],
  ['фриланс', 7], ['проект', 7], ['удален', 5], ['remote', 5], ['part-time', 4]
];

const negative = [
  ['machine learning engineer', -35], ['ml engineer', -35], ['data scientist', -30],
  ['backend', -22], ['frontend', -18], ['devops', -30], ['python developer', -25],
  ['sales manager', -25], ['менеджер по продажам', -25], ['бухгалтер', -35], ['юрист', -30]
];

export function detectOpportunityType(text = '') {
  const t = text.toLowerCase();
  if (/разов|one[- ]off|одно видео|1 ролик|единичн/.test(t)) return 'one_off';
  if (/фриланс|freelance/.test(t)) return 'freelance';
  if (/part[- ]time|частичн|неполный день/.test(t)) return 'part_time';
  if (/проект|contract|контракт|на месяц|на \d+ мес/.test(t)) return 'project';
  if (/ваканси|full[- ]time|полный день|штат/.test(t)) return 'job';
  if (/ищу|нужен|нужна|нужны|кто может|посоветуйте/.test(t)) return 'lead';
  return 'unknown';
}

export function extractRequestedFields(text = '') {
  const t = text.toLowerCase();
  const fields = [];
  const add = (id, re) => { if (re.test(t)) fields.push(id); };
  add('price', /(стоимост|цена|прайс|ставк|rate|budget|бюджет)/);
  add('timing', /(срок|дедлайн|за сколько|timing|deadline|сроки)/);
  add('similar_work', /(похож|релевантн).*(работ|кейс)|примеры работ|кейсы/);
  add('portfolio', /(портфолио|portfolio)/);
  add('cv', /(резюме|cv)/);
  add('experience', /(опыт|experience)/);
  add('availability', /(готов.*начать|когда.*можете|availability|занятост)/);
  return [...new Set(fields)];
}

export function extractContactUsername(text = '') {
  const matches = [...text.matchAll(/(?:^|[\s(])@([a-zA-Z0-9_]{5,32})\b/g)];
  if (!matches.length) return null;
  const ignored = new Set(['aivacancychannel','neurodromo','vakansii_ai','rabota_freelancee']);
  const candidate = matches.map(m => m[1]).find(x => !ignored.has(x.toLowerCase()));
  return candidate ? `@${candidate}` : null;
}

export function extractEmail(text = '') {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

export function extractCompensation(text = '') {
  const patterns = [
    /(?:бюджет|оплата|зп|зарплата|salary|rate)\s*[:—-]?\s*([^\n]{1,60})/i,
    /\b\d{2,3}[\s\u00a0]?(?:000|к|k)\s*(?:₽|руб|rub)?(?:\s*[-–—]\s*\d{2,3}[\s\u00a0]?(?:000|к|k)\s*(?:₽|руб|rub)?)?/i,
    /[$€£]\s?\d[\d\s,.]*(?:\s*[-–—]\s*[$€£]?\s?\d[\d\s,.]*)?/
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[1] || m[0]).trim();
  }
  return null;
}

export function scoreOpportunity(text = '', title = '') {
  const t = `${title}\n${text}`.toLowerCase();
  let score = 28;
  const hits = [];
  for (const [key, value] of positive) {
    if (t.includes(key)) { score += value; hits.push(key); }
  }
  for (const [key, value] of negative) {
    if (t.includes(key)) { score += value; hits.push(`−${key}`); }
  }
  if (/(ищу|ищем|нужен|нужна|нужны|ваканси|работа|заказ|проект)/.test(t)) score += 7;
  if (/(ai|ии|нейро)/.test(t) && /(видео|ролик|контент|visual|визуал|дизайн|reels)/.test(t)) score += 14;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    reason: hits.length ? `Совпадения: ${hits.slice(0, 7).join(', ')}` : 'Слабое совпадение с профилем AI-креатора'
  };
}
