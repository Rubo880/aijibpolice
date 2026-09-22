import {
  getOpportunity, markOpportunityStatus, createApplication, markApplicationSent,
  logActivity, getDashboardStats
} from '../lib/db.js';
import { sendBotMessage, answerCallback } from '../lib/telegram-bot.js';
import { buildTelegramApplication } from '../lib/application.js';
import { sendFromUserAccount } from '../lib/tg-user.js';
import { applyHH } from '../lib/hh.js';
import { scanTelegramNow, scanHHNow, pushNewNow } from '../lib/scanners.js';

function allowed(userId) {
  const owner = process.env.TELEGRAM_OWNER_USER_ID;
  return !owner || String(userId) === String(owner);
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
        `⚠️ Для этого отклика автор просит: <b>${built.missing.join(', ')}</b>.\nЯ не буду придумывать эти данные. Добавим их в профиль, после чего отклик можно будет отправлять автоматически.\n\n<b>Черновик:</b>\n${built.text}`
      );
    }

    const app = await createApplication({
      opportunityId: o.id,
      channel: 'telegram',
      destination: o.contact_username,
      messageText: built.text,
      status: 'draft'
    });

    if (String(process.env.AUTO_SEND_TELEGRAM).toLowerCase() !== 'true') {
      return sendBotMessage(
        chatId,
        `📝 <b>Черновик для ${o.contact_username}</b>\n\n${built.text}\n\nАвтоотправка пока выключена.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📤 Отправить сейчас', callback_data: `sendtg:${app.id}:${o.id}` }
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
    return sendBotMessage(chatId, `✅ Отклик отправлен ${o.contact_username}`);
  }

  if (o.source_kind === 'headhunter') {
    const resumeId = process.env.HH_RESUME_ID;
    if (!process.env.HH_ACCESS_TOKEN || !resumeId) {
      return sendBotMessage(
        chatId,
        'HH автоотклик ещё не подключён: нужны OAuth-токен и HH_RESUME_ID. Поиск вакансий при этом уже может работать.'
      );
    }

    try {
      const result = await applyHH({
        vacancyId: o.external_id,
        resumeId,
        message: ''
      });
      const app = await createApplication({
        opportunityId: o.id,
        channel: 'headhunter',
        destination: o.source_url,
        status: 'sent'
      });
      await markApplicationSent(app.id, result?.id ? String(result.id) : null, 'sent');
      await markOpportunityStatus(o.id, 'applied');
      return sendBotMessage(chatId, '✅ Отклик на HeadHunter отправлен.');
    } catch (e) {
      return sendBotMessage(chatId, `⚠️ HH не принял отклик: ${String(e.message).slice(0, 500)}`);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const u = req.body || {};

    if (u.message) {
      const { chat, from, text = '' } = u.message;

      if (text.startsWith('/start')) {
        await sendBotMessage(
          chat.id,
          `👮 <b>AI Job Police</b>\n\nЯ собираю AI-вакансии, проекты и фриланс-заказы, оцениваю релевантность и помогаю откликаться.\n\nТвой Telegram user ID: <code>${from.id}</code>\nТвой chat ID: <code>${chat.id}</code>\n\nКоманды:\n/scan — найти новые возможности сейчас\n/status — статистика`
        );
      } else if (!allowed(from?.id)) {
        return res.status(200).json({ ok: true });
      } else if (text.startsWith('/scan')) {
        await sendBotMessage(chat.id, '🔎 Запускаю поиск. Сначала Telegram, затем HeadHunter.');

        let tg = null;
        let hh = null;
        let pushedTg = { sent: 0 };
        let pushedHh = { sent: 0 };

        try {
          tg = await scanTelegramNow();
          pushedTg = await pushNewNow(chat.id, 5);
          await sendBotMessage(
            chat.id,
            `✅ <b>Telegram готов</b>\nПросмотрено: ${tg.scanned}\nРелевантных: ${tg.relevant}\nНовых: ${tg.inserted}\nКарточек: ${pushedTg.sent}\nВремя: ${Math.round(tg.durationMs / 1000)} сек.`
          );
        } catch (e) {
          await sendBotMessage(chat.id, `⚠️ Ошибка Telegram-скана: ${String(e.message).slice(0, 500)}`);
        }

        try {
          hh = await scanHHNow();
          pushedHh = await pushNewNow(chat.id, 5);
          await sendBotMessage(
            chat.id,
            `✅ <b>HeadHunter готов</b>\nПросмотрено: ${hh.scanned}\nРелевантных: ${hh.relevant}\nНовых: ${hh.inserted}\nКарточек: ${pushedHh.sent}\nВремя: ${Math.round(hh.durationMs / 1000)} сек.`
          );
        } catch (e) {
          await sendBotMessage(chat.id, `⚠️ Ошибка HeadHunter-скана: ${String(e.message).slice(0, 500)}`);
        }

        await sendBotMessage(
          chat.id,
          `🏁 <b>Скан завершён</b>\nВсего карточек отправлено: ${pushedTg.sent + pushedHh.sent}`
        );
      } else if (text.startsWith('/status')) {
        const s = await getDashboardStats();
        await sendBotMessage(
          chat.id,
          `📊 <b>AI Job Police</b>\nЗа 24 часа найдено: ${s.found_24h}\nНовых: ${s.new_count}\nСильных совпадений: ${s.strong_new}\nОткликов за 24ч: ${s.applied_24h}\nОткликов всего: ${s.applied_total}`
        );
      }
    }

    if (u.callback_query) {
      const q = u.callback_query;
      if (!allowed(q.from?.id)) return res.status(200).json({ ok: true });
      const chatId = q.message?.chat?.id;
      const [action, a, b] = String(q.data || '').split(':');

      await answerCallback(q.id, 'Принято');

      if (action === 'skip') {
        await markOpportunityStatus(a, 'skipped');
        await sendBotMessage(chatId, '❌ Пропустил.');
      } else if (action === 'save') {
        await markOpportunityStatus(a, 'saved');
        await sendBotMessage(chatId, '✅ Сохранил.');
      } else if (action === 'apply') {
        await onApply(chatId, a);
      } else if (action === 'sendtg') {
        const appId = a;
        const opportunityId = b;
        const o = await getOpportunity(opportunityId);
        if (!o?.contact_username) throw new Error('Telegram contact is missing');

        const built = await buildTelegramApplication(o);
        if (built.missing.length) {
          return sendBotMessage(chatId, `Нельзя отправить: не заполнены ${built.missing.join(', ')}.`);
        }

        const sent = await sendFromUserAccount(o.contact_username, built.text);
        await markApplicationSent(appId, sent.id, 'sent');
        await markOpportunityStatus(o.id, 'applied');
        await sendBotMessage(chatId, `✅ Отправлено ${o.contact_username}`);
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(200).json({ ok: false, error: e.message });
  }
}
