import { scanHHNow, pushNewNow } from '../lib/scanners.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (!authorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!chatId) {
    return res.status(500).json({ error: 'TELEGRAM_OWNER_CHAT_ID is not configured' });
  }

  try {
    const hh = await scanHHNow();
    const pushed = await pushNewNow(chatId, 2, 'headhunter');

    return res.status(200).json({
      ok: true,
      source: hh.source,
      scanned: hh.scanned,
      relevant: hh.relevant,
      inserted: hh.inserted,
      pushed: pushed.sent,
      feed_errors: hh.errors?.length || 0
    });
  } catch (e) {
    console.error('Fast HH watcher failed', e);
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e).slice(0, 800)
    });
  }
}
