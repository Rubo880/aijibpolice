import { botCall } from '../lib/telegram-bot.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}` || req.query?.secret === secret;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const webhookUrl = `${proto}://${host}/api/telegram`;
    const result = await botCall('setWebhook', {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    });
    res.status(200).json({ ok: true, webhookUrl, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
