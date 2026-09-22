import { scanTelegramNow, scanHHNow, pushNewNow } from '../lib/scanners.js';
import { sendBotMessage } from '../lib/telegram-bot.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!chatId) return res.status(500).json({ error: 'TELEGRAM_OWNER_CHAT_ID is not configured' });

  const result = {
    telegram: null,
    hh: null,
    pushed: 0,
    errors: []
  };

  try {
    result.telegram = await scanTelegramNow();
    const pushed = await pushNewNow(chatId, 6);
    result.pushed += pushed.sent;
  } catch (e) {
    result.errors.push({ source: 'telegram', error: e.message });
  }

  try {
    result.hh = await scanHHNow();
    const pushed = await pushNewNow(chatId, 6);
    result.pushed += pushed.sent;
  } catch (e) {
    result.errors.push({ source: 'headhunter', error: e.message });
  }

  if (result.pushed > 0 || result.errors.length > 0) {
    const lines = [
      '🤖 <b>Автопоиск завершён</b>',
      '',
      result.telegram
        ? `Telegram: ${result.telegram.relevant} релевантных, ${result.telegram.inserted} новых`
        : 'Telegram: ошибка',
      result.hh
        ? `HeadHunter: ${result.hh.relevant} релевантных, ${result.hh.inserted} новых`
        : 'HeadHunter: ошибка',
      `Карточек отправлено: ${result.pushed}`
    ];

    if (result.errors.length) {
      lines.push('', `⚠️ Ошибок: ${result.errors.length}`);
    }

    await sendBotMessage(chatId, lines.join('\n'));
  }

  res.status(200).json({ ok: true, ...result });
}
