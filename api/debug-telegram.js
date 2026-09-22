import { botCall } from '../lib/telegram-bot.js';

export default async function handler(req, res) {
  try {
    const [me, webhook] = await Promise.all([
      botCall('getMe'),
      botCall('getWebhookInfo')
    ]);

    res.status(200).json({
      ok: true,
      bot: {
        id: me.id,
        username: me.username,
        first_name: me.first_name
      },
      webhook: {
        url: webhook.url,
        pending_update_count: webhook.pending_update_count,
        last_error_date: webhook.last_error_date || null,
        last_error_message: webhook.last_error_message || null,
        max_connections: webhook.max_connections
      },
      env: {
        database_url: Boolean(process.env.DATABASE_URL),
        owner_user_id: Boolean(process.env.TELEGRAM_OWNER_USER_ID),
        owner_chat_id: Boolean(process.env.TELEGRAM_OWNER_CHAT_ID),
        cron_secret: Boolean(process.env.CRON_SECRET)
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
