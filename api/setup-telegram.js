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
        { command: 'menu', description: 'Открыть главное меню' },
        { command: 'scan', description: 'Найти новые вакансии и проекты' },
        { command: 'latest', description: 'Показать последние находки' },
        { command: 'saved', description: 'Показать избранное' },
        { command: 'applied', description: 'История откликов' },
        { command: 'status', description: 'Статистика AI Job Police' },
        { command: 'sources', description: 'Источники поиска' },
        { command: 'settings', description: 'Текущие настройки' },
        { command: 'mode', description: 'Режим отклика WATCH / APPROVE / AUTO' },
        { command: 'tgstatus', description: 'Проверить личный Telegram' },
        { command: 'help', description: 'Справка по командам' }
      ]
    });

    const menuButton = await botCall('setChatMenuButton', {
      menu_button: { type: 'commands' }
    });

    const info = await botCall('getWebhookInfo');

    res.status(200).json({
      ok: true,
      webhookUrl,
      webhook,
      commands,
      menuButton,
      pending_update_count: info.pending_update_count,
      last_error_message: info.last_error_message || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
