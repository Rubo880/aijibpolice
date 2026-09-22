const API = (token) => `https://api.telegram.org/bot${token}`;

export async function botCall(method, payload = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const r = await fetch(`${API(token)}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || r.status}`);
  return data.result;
}

export const sendBotMessage = (chatId, text, extra = {}) => botCall('sendMessage', {
  chat_id: chatId,
  text,
  parse_mode: 'HTML',
  disable_web_page_preview: true,
  ...extra
});

export const answerCallback = (callbackQueryId, text = '') => botCall('answerCallbackQuery', {
  callback_query_id: callbackQueryId,
  text,
  show_alert: false
});
