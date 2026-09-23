import { getProfile } from './db.js';

export async function buildTelegramApplication(opportunity) {
  const p = await getProfile();
  if (!p) throw new Error('Profile is not configured');
  const requested = Array.isArray(opportunity.requested_fields) ? opportunity.requested_fields : [];
  const settings = p.settings || {};
  const missing = [];
  const dynamic = [];

  if (requested.includes('price')) {
    const price = settings.default_price_text;
    if (price) dynamic.push(`По стоимости: ${price}`); else missing.push('стоимость');
  }
  if (requested.includes('timing')) {
    const timing = settings.default_timing_text;
    if (timing) dynamic.push(`По срокам: ${timing}`); else missing.push('сроки');
  }
  if (requested.includes('availability')) {
    const availability = settings.availability_text;
    if (availability) dynamic.push(availability); else missing.push('доступность/дата старта');
  }
  if (requested.includes('experience') && settings.experience_text) dynamic.push(settings.experience_text);

  const parts = [p.base_telegram_message];
  if (dynamic.length) parts.push(dynamic.join('\n'));
  parts.push(`Примеры работ: 👇\n${p.portfolio_url}`);
  parts.push(`Instagram-портфолио:\n${p.instagram_url}`);

  return { text: parts.join('\n\n'), missing };
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function relevantToolLine(text) {
  const tools = [];

  const add = (label, terms) => {
    if (includesAny(text, terms) && !tools.includes(label)) tools.push(label);
  };

  add('Kling 3', ['kling']);
  add('Veo', ['veo']);
  add('Seedance 2.5', ['seedance']);
  add('Runway', ['runway']);
  add('Nano Banana Pro', ['nano banana', 'nano-banana']);
  add('DaVinci Resolve', ['davinci', 'монтаж', 'video editing', 'video editor']);

  if (!tools.length) {
    return 'В работе использую Kling 3, Seedance 2.5, Veo, Runway и DaVinci Resolve.';
  }

  return `Из указанного в вакансии стека работаю с: ${tools.slice(0, 5).join(', ')}.`;
}

function roleFitLine(text) {
  if (includesAny(text, ['avatar', 'аватар'])) {
    return 'Есть опыт создания контента с AI-аватарами и дальнейшей сборки ролика под задачу бренда.';
  }

  if (
    includesAny(text, ['product visual', 'product video', 'товар', 'карточк', 'e-commerce', 'ecommerce'])
  ) {
    return 'Делаю AI-визуалы и рекламные ролики для продуктовых задач — от концепта и генерации кадров до финальной сборки.';
  }

  if (
    includesAny(text, ['reels', 'shorts', 'tiktok', '9:16', 'вертикальн'])
  ) {
    return 'Основной формат работы — короткие вертикальные AI-ролики: идея, генерация, анимация и монтаж под 9:16.';
  }

  if (
    includesAny(text, ['visual', 'визуал', 'designer', 'дизайн', 'image', 'изображен'])
  ) {
    return 'Работаю с AI-визуалами и генеративным дизайном: собираю концепт, создаю изображения и довожу их до готового коммерческого материала.';
  }

  return 'Мой основной фокус — AI-видео: от идеи и генерации кадров до анимации и финального монтажа.';
}

export async function buildHHCoverLetter(opportunity) {
  const p = await getProfile();
  if (!p) throw new Error('Profile is not configured');

  const title = String(opportunity.title || '').trim();
  const company = String(opportunity.company || '').trim();
  const sourceText = [
    title,
    company,
    opportunity.raw_text || ''
  ].join('\n').toLowerCase();

  const intro = title
    ? `Меня заинтересовала вакансия «${title}»${company ? ` в ${company}` : ''}.`
    : 'Меня заинтересовала ваша вакансия в направлении AI-контента.';

  const lines = [
    'Здравствуйте!',
    '',
    intro,
    roleFitLine(sourceText),
    relevantToolLine(sourceText),
    '',
    'Буду рад обсудить задачи и при необходимости выполнить тестовое задание.',
    '',
    `Портфолио: ${p.portfolio_url}`,
    `Instagram-портфолио: ${p.instagram_url}`
  ];

  return {
    text: lines.join('\n'),
    portfolioUrl: p.portfolio_url,
    instagramUrl: p.instagram_url
  };
}
