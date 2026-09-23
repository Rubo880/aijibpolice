import {
  getOpportunity,
  markOpportunityStatus,
  createApplication,
  markApplicationSent,
  logActivity,
  getDashboardStats,
  getSources,
  getProfile,
  listLatestOpportunities,
  listOpportunitiesByStatus,
  listApplications,
  setApplicationMode,
  getHHSettings,
  setHHResumeId
} from '../lib/db.js';
import { sendBotMessage, answerCallback } from '../lib/telegram-bot.js';
import { buildTelegramApplication } from '../lib/application.js';
import { sendFromUserAccount, getUserAccountStatus, sendTestToSavedMessages } from '../lib/tg-user.js';
import { applyHH, getHHMe, getHHResumes } from '../lib/hh.js';
import { scanTelegramNow, scanHHNow, pushNewNow } from '../lib/scanners.js';
import { opportunityCard } from '../lib/cards.js';

function allowed(userId) {
  const owner = process.env.TELEGRAM_OWNER_USER_ID;
  return !owner || String(userId) === String(owner);
}

function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function mainMenu() {
  return {
    inline_keyboard: [
      [
        { text: '🔎 Найти сейчас', callback_data: 'menu:scan' },
        { text: '🆕 Последние', callback_data: 'menu:latest' }
      ],
      [
        { text: '⭐ Избранное', callback_data: 'menu:saved' },
        { text: '📨 Отклики', callback_data: 'menu:applied' }
      ],
      [
        { text: '📊 Статистика', callback_data: 'menu:status' },
        { text: '⚙️ Настройки', callback_data: 'menu:settings' }
      ],
      [
        { text: '📡 Источники', callback_data: 'menu:sources' },
        { text: '💼 HeadHunter', callback_data: 'menu:hhstatus' }
      ],
      [
        { text: '📱 Telegram', callback_data: 'menu:tgstatus' },
        { text: '🎛 Режим отклика', callback_data: 'menu:mode' }
      ],
      [
        { text: '❓ Помощь', callback_data: 'menu:help' }
      ]
    ]
  };
}

async function showMenu(chatId) {
  await sendBotMessage(
    chatId,
    '👮 <b>AI Job Police</b>\n\nВыбери действие:',
    { reply_markup: mainMenu() }
  );
}

async function showOpportunityRows(chatId, rows, emptyText) {
  if (!rows.length) {
    await sendBotMessage(chatId, emptyText);
    return;
  }

  for (const o of rows) {
    const card = opportunityCard(o);
    await sendBotMessage(chatId, card.text, { reply_markup: card.reply_markup });
  }
}

async function handleScan(chatId) {
  await sendBotMessage(chatId, '🔎 Запускаю поиск. Сначала Telegram, затем HeadHunter.');

  let tg = null;
  let hh = null;
  let pushedTg = { sent: 0 };
  let pushedHh = { sent: 0 };

  try {
    tg = await scanTelegramNow();
    pushedTg = await pushNewNow(chatId, 5);
    await sendBotMessage(
      chatId,
      `✅ <b>Telegram готов</b>\nПросмотрено: ${tg.scanned}\nРелевантных: ${tg.relevant}\nНовых: ${tg.inserted}\nКарточек: ${pushedTg.sent}\nВремя: ${Math.round(tg.durationMs / 1000)} сек.`
    );
  } catch (e) {
    await sendBotMessage(chatId, `⚠️ Ошибка Telegram-скана: ${esc(String(e.message).slice(0, 500))}`);
  }

  try {
    hh = await scanHHNow();
    pushedHh = await pushNewNow(chatId, 5);
    await sendBotMessage(
      chatId,
      `✅ <b>HeadHunter готов</b>\nПросмотрено: ${hh.scanned}\nРелевантных: ${hh.relevant}\nНовых: ${hh.inserted}\nКарточек: ${pushedHh.sent}\nВремя: ${Math.round(hh.durationMs / 1000)} сек.`
    );
  } catch (e) {
    await sendBotMessage(chatId, `⚠️ Ошибка HeadHunter-скана: ${esc(String(e.message).slice(0, 500))}`);
  }

  await sendBotMessage(
    chatId,
    `🏁 <b>Скан завершён</b>\nВсего карточек отправлено: ${pushedTg.sent + pushedHh.sent}`,
    { reply_markup: mainMenu() }
  );
}

async function handleTgTest(chatId) {
  try {
    const sent = await sendTestToSavedMessages();
    await sendBotMessage(
      chatId,
      `✅ <b>Тест отправки прошёл</b>\nСообщение отправлено только в твои Saved Messages.\nMessage ID: <code>${esc(sent.id)}</code>`,
      { reply_markup: mainMenu() }
    );
  } catch (e) {
    await sendBotMessage(
      chatId,
      `⚠️ <b>Тест отправки не прошёл</b>\n${esc(String(e.message).slice(0, 700))}`,
      { reply_markup: mainMenu() }
    );
  }
}

async function handleTgStatus(chatId) {
  try {
    const tg = await getUserAccountStatus();
    const name = [tg.firstName, tg.lastName].filter(Boolean).join(' ');
    await sendBotMessage(
      chatId,
      `✅ <b>Личный Telegram подключён</b>\nАккаунт: ${esc(name || 'без имени')}${tg.username ? ` (@${esc(tg.username)})` : ''}\nID: <code>${esc(tg.id)}</code>\n\nНикаких сообщений работодателям не отправлялось.`,
      { reply_markup: mainMenu() }
    );
  } catch (e) {
    await sendBotMessage(
      chatId,
      `⚠️ <b>Личный Telegram не подключился</b>\n${esc(String(e.message).slice(0, 700))}`,
      { reply_markup: mainMenu() }
    );
  }
}

async function handleStatus(chatId) {
  const s = await getDashboardStats();
  await sendBotMessage(
    chatId,
    `📊 <b>AI Job Police</b>\n\nЗа 24 часа найдено: <b>${s.found_24h}</b>\nНовых: <b>${s.new_count}</b>\nСильных совпадений: <b>${s.strong_new}</b>\nОткликов за 24ч: <b>${s.applied_24h}</b>\nОткликов всего: <b>${s.applied_total}</b>`,
    { reply_markup: mainMenu() }
  );
}

async function handleLatest(chatId) {
  const rows = await listLatestOpportunities(5);
  await showOpportunityRows(chatId, rows, 'Пока подходящих возможностей в базе нет.');
}

async function handleSaved(chatId) {
  const rows = await listOpportunitiesByStatus('saved', 10);
  await showOpportunityRows(chatId, rows, '⭐ В избранном пока ничего нет.');
}

async function handleApplied(chatId) {
  const rows = await listApplications(10);
  if (!rows.length) {
    await sendBotMessage(chatId, '📨 Откликов пока нет.', { reply_markup: mainMenu() });
    return;
  }

  const lines = ['📨 <b>Последние отклики</b>', ''];
  for (const a of rows) {
    const title = a.title || a.company || 'Возможность';
    const when = a.sent_at ? 'отправлен' : 'черновик';
    lines.push(
      `• <b>${esc(title)}</b> — ${esc(a.status || when)}${a.source_name ? ` · ${esc(a.source_name)}` : ''}`
    );
  }

  await sendBotMessage(chatId, lines.join('\n'), { reply_markup: mainMenu() });
}

async function handleSources(chatId) {
  const rows = await getSources();
  const lines = ['📡 <b>Источники поиска</b>', ''];
  for (const s of rows) {
    lines.push(`• ${s.kind === 'headhunter' ? '💼' : '✈️'} ${esc(s.name)} — включён`);
  }
  await sendBotMessage(chatId, lines.join('\n'), { reply_markup: mainMenu() });
}

async function handleHHStatus(chatId) {
  if (!process.env.HH_CLIENT_ID || !process.env.HH_CLIENT_SECRET) {
    return sendBotMessage(
      chatId,
      '💼 <b>HeadHunter ещё не настроен</b>\n\nСначала нужно зарегистрировать приложение в кабинете разработчика HH и добавить Client ID / Client Secret в Vercel. После этого здесь появится кнопка подключения.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🧩 Открыть кабинет разработчика HH', url: 'https://dev.hh.ru/admin' }],
            [{ text: '⬅️ Меню', callback_data: 'menu:menu' }]
          ]
        }
      }
    );
  }

  const settings = await getHHSettings();
  if (!settings.oauth?.access_token && !process.env.HH_ACCESS_TOKEN) {
    return sendBotMessage(
      chatId,
      '💼 <b>HeadHunter готов к подключению</b>\n\nНажми кнопку ниже, войди в свой HH-аккаунт и разреши доступ AI Job Police.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔐 Подключить HeadHunter', url: 'https://aijibpolice.vercel.app/api/hh-connect' }],
            [{ text: '⬅️ Меню', callback_data: 'menu:menu' }]
          ]
        }
      }
    );
  }

  try {
    const [me, resumes] = await Promise.all([getHHMe(), getHHResumes()]);
    const name = [me?.first_name, me?.last_name].filter(Boolean).join(' ');
    const current = settings.resumeId;
    const rows = resumes.slice(0, 8).map((r) => [{
      text: `${String(r.id) === String(current) ? '✅ ' : ''}${String(r.title || 'Резюме').slice(0, 48)}`,
      callback_data: `hhresume:${r.id}`
    }]);

    rows.push([{ text: '⬅️ Меню', callback_data: 'menu:menu' }]);

    return sendBotMessage(
      chatId,
      `✅ <b>HeadHunter подключён</b>\nАккаунт: ${esc(name || 'подключён')}\nРезюме: <b>${resumes.length}</b>\n\n${current ? 'Активное резюме отмечено ✅. Нажми другое, чтобы переключить.' : 'Выбери резюме для откликов:'}`,
      { reply_markup: { inline_keyboard: rows } }
    );
  } catch (e) {
    return sendBotMessage(
      chatId,
      `⚠️ Не удалось проверить HeadHunter: ${esc(String(e.message).slice(0, 600))}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Подключить заново', url: 'https://aijibpolice.vercel.app/api/hh-connect' }],
            [{ text: '⬅️ Меню', callback_data: 'menu:menu' }]
          ]
        }
      }
    );
  }
}

async function handleSettings(chatId) {
  const p = await getProfile();
  const threshold = Number(process.env.MIN_MATCH_SCORE || p?.minimum_match_score || 65);
  const mode = p?.settings?.application_mode || 'approve';
  const hhAuto = String(process.env.AUTO_APPLY_HH).toLowerCase() === 'true' || Boolean(p?.auto_apply_hh);

  await sendBotMessage(
    chatId,
    `⚙️ <b>Настройки</b>\n\nМинимальный Match: <b>${threshold}%</b>\nАвтопоиск: <b>включён</b>\nРежим Telegram-отклика: <b>${esc(mode.toUpperCase())}</b>\nHH автоотклик: <b>${hhAuto ? 'включён' : 'выключен'}</b>`,
    { reply_markup: mainMenu() }
  );
}

async function handleMode(chatId) {
  const p = await getProfile();
  const mode = p?.settings?.application_mode || 'approve';
  const labels = {
    watch: 'WATCH — только черновики, без отправки',
    approve: 'APPROVE — отправка после отдельного подтверждения',
    auto: 'AUTO — кнопка «Откликнуться» отправляет сразу'
  };

  await sendBotMessage(
    chatId,
    `🎛 <b>Режим отклика</b>\n\nСейчас: <b>${esc(labels[mode] || labels.approve)}</b>\n\nAUTO здесь пока означает отправку сразу после нажатия «🚀 Откликнуться». Полностью автоматическую рассылку по найденным вакансиям отдельно не включаю без твоего решения.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: mode === 'watch' ? '✅ WATCH' : 'WATCH', callback_data: 'mode:watch' },
            { text: mode === 'approve' ? '✅ APPROVE' : 'APPROVE', callback_data: 'mode:approve' },
            { text: mode === 'auto' ? '✅ AUTO' : 'AUTO', callback_data: 'mode:auto' }
          ],
          [
            { text: '⬅️ Меню', callback_data: 'menu:menu' }
          ]
        ]
      }
    }
  );
}

async function handleHelp(chatId) {
  await sendBotMessage(
    chatId,
    '❓ <b>Команды AI Job Police</b>\n\n' +
      '/menu — открыть кнопочное меню\n' +
      '/scan — запустить поиск сейчас\n' +
      '/latest — последние найденные возможности\n' +
      '/saved — избранные вакансии/проекты\n' +
      '/applied — история откликов\n' +
      '/status — общая статистика\n' +
      '/sources — источники поиска\n' +
      '/settings — текущие настройки\n' +
      '/hhstatus — подключение HH и выбор резюме\n' +
      '/mode — режим отклика WATCH / APPROVE / AUTO\n' +
      '/tgstatus — проверить личный Telegram\n' +
      '/tgtest — тест в Saved Messages\n' +
      '/help — эта справка',
    { reply_markup: mainMenu() }
  );
}

async function onApply(chatId, opportunityId) {
  const o = await getOpportunity(opportunityId);
  if (!o) return sendBotMessage(chatId, 'Не нашёл эту возможность в базе.');

  if (o.source_kind === 'telegram_channel') {
    if (!o.contact_username) {
      return sendBotMessage(chatId, 'В посте не найден @username для отклика. Открой исходный пост вручную.');
    }

    const built = await buildTelegramApplication(o);
    if (built.missing.length) {
      return sendBotMessage(
        chatId,
        `⚠️ Для этого отклика автор просит: <b>${esc(built.missing.join(', '))}</b>.\nЯ не буду придумывать эти данные.\n\n<b>Черновик:</b>\n${esc(built.text)}`
      );
    }

    const app = await createApplication({
      opportunityId: o.id,
      channel: 'telegram',
      destination: o.contact_username,
      messageText: built.text,
      status: 'draft'
    });

    const profile = await getProfile();
    const mode = profile?.settings?.application_mode || 'approve';

    if (mode === 'watch') {
      return sendBotMessage(
        chatId,
        `📝 <b>Черновик для ${esc(o.contact_username)}</b>\n\n${esc(built.text)}\n\nРежим WATCH: отправка из бота отключена.`,
        { reply_markup: mainMenu() }
      );
    }

    if (mode !== 'auto') {
      return sendBotMessage(
        chatId,
        `📝 <b>Черновик для ${esc(o.contact_username)}</b>\n\n${esc(built.text)}\n\nРежим APPROVE: отправлю только после отдельного подтверждения.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📤 Отправить сейчас', callback_data: `sendtg:${app.id}:${o.id}` }
            ], [
              { text: '⬅️ Меню', callback_data: 'menu:menu' }
            ]]
          }
        }
      );
    }

    const sent = await sendFromUserAccount(o.contact_username, built.text);
    await markApplicationSent(app.id, sent.id, 'sent');
    await markOpportunityStatus(o.id, 'applied');
    await logActivity({
      opportunityId: o.id,
      applicationId: app.id,
      eventType: 'telegram_application_sent'
    });
    return sendBotMessage(chatId, `✅ Отклик отправлен ${esc(o.contact_username)}`);
  }

  if (o.source_kind === 'headhunter') {
    const hhSettings = await getHHSettings();
    const resumeId = process.env.HH_RESUME_ID || hhSettings.resumeId;
    if (!resumeId) {
      return sendBotMessage(
        chatId,
        '💼 Сначала подключи HeadHunter и выбери резюме через /hhstatus.'
      );
    }

    const profile = await getProfile();
    const mode = profile?.settings?.application_mode || 'approve';

    if (mode === 'watch') {
      return sendBotMessage(
        chatId,
        '👀 Режим WATCH: вакансия подходит, но отклик на HH не отправляю.',
        { reply_markup: mainMenu() }
      );
    }

    const app = await createApplication({
      opportunityId: o.id,
      channel: 'headhunter',
      destination: o.source_url,
      status: 'draft'
    });

    if (mode !== 'auto') {
      return sendBotMessage(
        chatId,
        `📝 <b>Подтверждение HH-отклика</b>\n\n<b>${esc(o.title || 'Вакансия')}</b>${o.company ? `\n${esc(o.company)}` : ''}\n\nРезюме выбрано. Отклик уйдёт только после кнопки ниже.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Подтвердить отклик на HH', callback_data: `sendhh:${app.id}:${o.id}` }],
              [{ text: '⬅️ Меню', callback_data: 'menu:menu' }]
            ]
          }
        }
      );
    }

    try {
      const result = await applyHH({
        vacancyId: o.external_id,
        resumeId,
        message: ''
      });
      await markApplicationSent(app.id, result?.id ? String(result.id) : null, 'sent');
      await markOpportunityStatus(o.id, 'applied');
      return sendBotMessage(chatId, '✅ Отклик на HeadHunter отправлен.');
    } catch (e) {
      return sendBotMessage(chatId, `⚠️ HH не принял отклик: ${esc(String(e.message).slice(0, 500))}`);
    }
  }
}

async function dispatch(chatId, action) {
  if (action === 'menu') return showMenu(chatId);
  if (action === 'scan') return handleScan(chatId);
  if (action === 'latest') return handleLatest(chatId);
  if (action === 'saved') return handleSaved(chatId);
  if (action === 'applied') return handleApplied(chatId);
  if (action === 'status') return handleStatus(chatId);
  if (action === 'sources') return handleSources(chatId);
  if (action === 'settings') return handleSettings(chatId);
  if (action === 'hhstatus') return handleHHStatus(chatId);
  if (action === 'mode') return handleMode(chatId);
  if (action === 'tgstatus') return handleTgStatus(chatId);
  if (action === 'tgtest') return handleTgTest(chatId);
  if (action === 'help') return handleHelp(chatId);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const u = req.body || {};

    if (u.message) {
      const { chat, from, text = '' } = u.message;
      const command = String(text).trim().split(/\s+/)[0].toLowerCase().split('@')[0];

      if (command === '/start') {
        await sendBotMessage(
          chat.id,
          `👮 <b>AI Job Police</b>\n\nЯ собираю AI-вакансии, проекты и фриланс-заказы, оцениваю релевантность и помогаю откликаться.\n\nТвой Telegram user ID: <code>${from.id}</code>\nТвой chat ID: <code>${chat.id}</code>`,
          { reply_markup: mainMenu() }
        );
      } else if (!allowed(from?.id)) {
        return res.status(200).json({ ok: true });
      } else {
        const map = {
          '/menu': 'menu',
          '/scan': 'scan',
          '/latest': 'latest',
          '/saved': 'saved',
          '/applied': 'applied',
          '/status': 'status',
          '/sources': 'sources',
          '/settings': 'settings',
          '/hhstatus': 'hhstatus',
          '/mode': 'mode',
          '/tgstatus': 'tgstatus',
          '/tgtest': 'tgtest',
          '/help': 'help'
        };
        if (map[command]) await dispatch(chat.id, map[command]);
      }
    }

    if (u.callback_query) {
      const q = u.callback_query;
      if (!allowed(q.from?.id)) return res.status(200).json({ ok: true });
      const chatId = q.message?.chat?.id;
      const [action, a, b] = String(q.data || '').split(':');

      if (!['mode', 'hhresume'].includes(action)) await answerCallback(q.id, 'Принято');

      if (action === 'menu') {
        await dispatch(chatId, a);
      } else if (action === 'mode') {
        await setApplicationMode(a);
        await answerCallback(q.id, 'Режим изменён');
        await handleMode(chatId);
      } else if (action === 'hhresume') {
        await setHHResumeId(a);
        await answerCallback(q.id, 'Резюме выбрано');
        await handleHHStatus(chatId);
      } else if (action === 'skip') {
        await markOpportunityStatus(a, 'skipped');
        await sendBotMessage(chatId, '❌ Пропустил.', { reply_markup: mainMenu() });
      } else if (action === 'save') {
        await markOpportunityStatus(a, 'saved');
        await sendBotMessage(chatId, '⭐ Сохранил в избранное.', { reply_markup: mainMenu() });
      } else if (action === 'apply') {
        await onApply(chatId, a);
      } else if (action === 'sendhh') {
        const appId = a;
        const opportunityId = b;
        const o = await getOpportunity(opportunityId);
        if (!o || o.source_kind !== 'headhunter') throw new Error('HH opportunity is missing');

        const hhSettings = await getHHSettings();
        const resumeId = process.env.HH_RESUME_ID || hhSettings.resumeId;
        if (!resumeId) {
          await sendBotMessage(chatId, 'Сначала выбери резюме через /hhstatus.');
        } else {
          try {
            const result = await applyHH({
              vacancyId: o.external_id,
              resumeId,
              message: ''
            });
            await markApplicationSent(appId, result?.id ? String(result.id) : null, 'sent');
            await markOpportunityStatus(o.id, 'applied');
            await sendBotMessage(chatId, '✅ Отклик на HeadHunter отправлен.', { reply_markup: mainMenu() });
          } catch (e) {
            await sendBotMessage(chatId, `⚠️ HH не принял отклик: ${esc(String(e.message).slice(0, 500))}`);
          }
        }
      } else if (action === 'sendtg') {
        const appId = a;
        const opportunityId = b;
        const o = await getOpportunity(opportunityId);
        if (!o?.contact_username) throw new Error('Telegram contact is missing');

        const built = await buildTelegramApplication(o);
        if (built.missing.length) {
          await sendBotMessage(chatId, `Нельзя отправить: не заполнены ${esc(built.missing.join(', '))}.`);
        } else {
          const sent = await sendFromUserAccount(o.contact_username, built.text);
          await markApplicationSent(appId, sent.id, 'sent');
          await markOpportunityStatus(o.id, 'applied');
          await sendBotMessage(chatId, `✅ Отправлено ${esc(o.contact_username)}`, { reply_markup: mainMenu() });
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(200).json({ ok: false, error: e.message });
  }
}
