function esc(s = '') {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

const typeLabels = {
  job: '💼 JOB', project: '🎬 PROJECT', freelance: '🧑‍💻 FREELANCE',
  part_time: '📆 PART-TIME', one_off: '⚡ ONE-OFF', lead: '🤝 LEAD', unknown: '🔎 OPPORTUNITY'
};

export function opportunityCard(o) {
  const lines = [
    `<b>${typeLabels[o.opportunity_type] || typeLabels.unknown}</b>`,
    `<b>${esc(o.title || o.company || 'Новая возможность')}</b>`,
    o.company && o.title ? esc(o.company) : null,
    '',
    `Match: <b>${o.match_score ?? '?'}%</b>`,
    o.compensation_text ? `💰 ${esc(o.compensation_text)}` : null,
    o.location_text ? `📍 ${esc(o.location_text)}` : null,
    o.source_name ? `Источник: ${esc(o.source_name)}` : null,
    o.contact_username ? `Контакт: ${esc(o.contact_username)}` : null,
    '',
    o.match_reason ? `💡 ${esc(o.match_reason)}` : null
  ].filter(x => x !== null);

  const keyboard = [];
  const first = [];
  if (o.source_url) first.push({ text: '👀 Открыть', url: o.source_url });
  if (o.contact_username) first.push({ text: '🚀 Откликнуться', callback_data: `apply:${o.id}` });
  else if (o.source_kind === 'headhunter') first.push({ text: '✍️ Письмо + отклик', callback_data: `apply:${o.id}` });
  if (first.length) keyboard.push(first);
  keyboard.push([
    { text: '✅ В избранное', callback_data: `save:${o.id}` },
    { text: '❌ Пропустить', callback_data: `skip:${o.id}` }
  ]);

  return { text: lines.join('\n'), reply_markup: { inline_keyboard: keyboard } };
}
