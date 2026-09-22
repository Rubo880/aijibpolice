import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

export async function sendFromUserAccount(username, message) {
  const apiId = Number(process.env.TG_USER_API_ID);
  const apiHash = process.env.TG_USER_API_HASH;
  const session = process.env.TG_USER_SESSION;
  if (!apiId || !apiHash || !session) throw new Error('Telegram user session is not configured');
  const target = username.startsWith('@') ? username : `@${username}`;
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 });
  await client.connect();
  try {
    const result = await client.sendMessage(target, { message });
    return { id: String(result.id) };
  } finally {
    await client.disconnect();
  }
}
