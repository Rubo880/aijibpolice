const positive = [
  ['ai creator', 28], ['ai-креатор', 28], ['ai креатор', 28], ['нейрокреатор', 28],
  ['ai video creator', 30], ['ai video editor', 30], ['ai video', 24], ['ai-видео', 24],
  ['нейровидео', 24], ['нейро видео', 24], ['ai videomaker', 26], ['ai видеомейкер', 26],
  ['generative ai creator', 28], ['generative ai designer', 26], ['genai creator', 26],
  ['ai visual content', 26], ['ai visual', 22], ['ai-визуал', 22], ['нейровизуал', 22],
  ['ai content creator', 28], ['ai content', 20], ['ai artist', 24], ['ai producer', 22],
  ['creative ai', 20], ['ai motion', 20], ['ai motion designer', 26],
  ['нейродизайнер', 26], ['нейро дизайнер', 26], ['нейроартист', 22], ['нейро артист', 22],
  ['ai designer', 20], ['ai-дизайнер', 20], ['генеративн', 14],
  ['kling', 14], ['veo', 14], ['seedance', 16], ['runway', 12], ['nano banana', 14],
  ['midjourney', 8], ['reels', 6], ['shorts', 6], ['vertical video', 8], ['вертикальн', 8],
  ['motion designer', 8], ['motion design', 8], ['моушн', 8],
  ['product visual', 12], ['product video', 12], ['рекламный ролик', 10], ['рекламные ролики', 10],
  ['ai avatar', 10], ['ai-аватар', 10], ['ai аватар', 10],
  ['фриланс', 8], ['проект', 8], ['проектная работа', 10], ['разовая работа', 10],
  ['удален', 5], ['remote', 5], ['part-time', 4]
];

const negative = [
  ['smm manager', -45], ['smm-менеджер', -45], ['smm менеджер', -45],
  ['смм менеджер', -45], ['смм-менеджер', -45], ['smm specialist', -40],
  ['ведение соцсетей', -28], ['ведение социальных сетей', -28], ['контент-план', -22],
  ['таргетолог', -30], ['таргетированная реклама', -22], ['комьюнити менеджер', -25],
  ['community manager', -25], ['копирайтер', -18], ['copywriter', -18],
  ['machine learning engineer', -40], ['ml engineer', -40], ['data scientist', -35],
  ['backend', -25], ['frontend', -20], ['devops', -35], ['python developer', -30],
  ['sales manager', -30], ['менеджер по продажам', -30], ['бухгалтер', -40], ['юрист', -35]
];

const creativeAiSignals = [
  'ai creator', 'ai-креатор', 'ai креатор', 'нейрокреатор',
  'ai video', 'ai-видео', 'нейровидео', 'нейро видео', 'ai videomaker', 'ai видеомейкер',
  'generative ai', 'genai', 'ai visual', 'ai-визуал', 'нейровизуал',
  'ai content', 'ai artist', 'ai producer', 'creative ai', 'ai motion',
  'нейродизайнер', 'нейро дизайнер', 'нейроартист', 'нейро артист',
  'ai designer', 'ai-дизайнер', 'kling', 'veo', 'seedance', 'runway',
  'nano banana', 'midjourney', 'ai avatar', 'ai-аватар', 'ai аватар'
];

const smmSignals = [
  'smm', 'смм', 'ведение соцсетей', 'ведение социальных сетей',
  'контент-план', 'таргетолог', 'таргетированная реклама'
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
  const hasCreativeAi = creativeAiSignals.some(key => t.includes(key));
  const hasSmm = smmSignals.some(key => t.includes(key));

  // Pure SMM is outside the user's target. AI creative roles may mention SMM incidentally,
  // so only hard-reject when there is no explicit creative-AI signal.
  if (hasSmm && !hasCreativeAi) {
    return {
      score: 0,
      reason: 'Исключено: SMM без явной AI-креативной / AI-видео составляющей'
    };
  }

  let score = 28;
  const hits = [];

  for (const [key, value] of positive) {
    if (t.includes(key)) {
      score += value;
      hits.push(key);
    }
  }

  for (const [key, value] of negative) {
    if (t.includes(key)) {
      score += value;
      hits.push(`−${key}`);
    }
  }

  if (/(ищу|ищем|нужен|нужна|нужны|ваканси|работа|заказ|проект)/.test(t)) score += 7;
  if (hasCreativeAi && /(видео|ролик|visual|визуал|дизайн|motion|моушн|avatar|аватар)/.test(t)) score += 18;
  if (hasCreativeAi && /(фриланс|проект|разов|contract|part[- ]time)/.test(t)) score += 8;

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    reason: hits.length
      ? `Совпадения: ${hits.slice(0, 7).join(', ')}`
      : 'Слабое совпадение с профилем AI Creator / AI Video'
  };
}
