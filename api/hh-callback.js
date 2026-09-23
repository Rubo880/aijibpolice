import { exchangeHHCode, getHHMe, getHHResumes } from '../lib/hh.js';
import { setHHResumeId } from '../lib/db.js';
import { sendBotMessage } from '../lib/telegram-bot.js';

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function esc(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export default async function handler(req, res) {
  const code = String(req.query?.code || '');
  const state = String(req.query?.state || '');
  const error = String(req.query?.error || '');
  const expectedState = readCookie(req, 'hh_oauth_state');

  res.setHeader(
    'Set-Cookie',
    'hh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=0'
  );

  if (error) {
    return res.status(400).send('<h2>HeadHunter connection was cancelled.</h2>');
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.status(400).send('<h2>HeadHunter OAuth state check failed.</h2>');
  }

  try {
    const redirectUri = `${baseUrl(req)}/api/hh-callback`;
    await exchangeHHCode({ code, redirectUri });

    const [me, resumes] = await Promise.all([
      getHHMe(),
      getHHResumes()
    ]);

    if (resumes.length === 1) {
      await setHHResumeId(resumes[0].id);
    }

    const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
    if (chatId) {
      const name = [me?.first_name, me?.last_name].filter(Boolean).join(' ');
      const lines = [
        '✅ <b>HeadHunter подключён</b>',
        name ? `Аккаунт: ${esc(name)}` : null,
        `Резюме найдено: <b>${resumes.length}</b>`
      ].filter(Boolean);

      const extra = {};
      if (resumes.length > 1) {
        extra.reply_markup = {
          inline_keyboard: resumes.slice(0, 8).map((r) => [{
            text: String(r.title || r.first_name || 'Резюме').slice(0, 50),
            callback_data: `hhresume:${r.id}`
          }])
        };
      }

      await sendBotMessage(chatId, lines.join('\n'), extra);
    }

    return res.status(200).send(
      '<!doctype html><meta charset="utf-8"><title>AI Job Police</title>' +
      '<style>body{font-family:system-ui;max-width:680px;margin:70px auto;padding:24px;line-height:1.5}</style>' +
      '<h1>✅ HeadHunter подключён</h1>' +
      '<p>Можно вернуться в Telegram к AI Job Police.</p>'
    );
  } catch (e) {
    console.error('HH OAuth callback failed', e);
    return res.status(500).send(
      '<h2>Не удалось подключить HeadHunter</h2><p>Вернись в Telegram и попробуй /hhstatus.</p>'
    );
  }
}
