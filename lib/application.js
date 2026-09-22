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
