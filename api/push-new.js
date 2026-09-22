import { pushNewNow } from '../lib/scanners.js';

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
    const result = await pushNewNow(chatId);
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
