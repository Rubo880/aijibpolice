import { botCall } from '../lib/telegram-bot.js';

export default async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const webhookUrl = `${proto}://${host}/api/telegram`;

    const webhook = await botCall('setWebhook', {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false
    });

    const commands = await botCall('setMyCommands', {
      commands: [
        { command: 'start', description: 'Запустить AI Job Police' },
        { command: 'scan', description: 'Найти новые вакансии и проекты' },
        { command: 'status', description: 'Показать статистику' },
        { command: 'tgstatus', description: 'Проверить личный Telegram' }
      ]
    });

    res.status(200).json({
      ok: true,
      webhookUrl,
      webhook,
      commands
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
