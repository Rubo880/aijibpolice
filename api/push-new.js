import { listNewOpportunities, markOpportunityStatus } from '../lib/db.js';
import { sendBotMessage } from '../lib/telegram-bot.js';
import { opportunityCard } from '../lib/cards.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}` || req.query?.secret === secret;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!chatId) return res.status(500).json({ error: 'TELEGRAM_OWNER_CHAT_ID is not configured' });
  try {
    const min = Number(process.env.MIN_MATCH_SCORE || 65);
    const rows = (await listNewOpportunities(25)).filter(x => (x.match_score ?? 0) >= min);
    let sent = 0;
    for (const o of rows) {
      const card = opportunityCard(o);
      await sendBotMessage(chatId, card.text, { reply_markup: card.reply_markup });
      await markOpportunityStatus(o.id, 'notified');
      sent++;
    }
    res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
