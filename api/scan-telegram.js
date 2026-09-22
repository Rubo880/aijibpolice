import { scanTelegramNow } from '../lib/scanners.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}` || req.query?.secret === secret;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const result = await scanTelegramNow();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
