import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

function credentials() {
  const apiId = Number(process.env.TG_USER_API_ID);
  const apiHash = process.env.TG_USER_API_HASH;
  const session = process.env.TG_USER_SESSION;
  if (!apiId || !apiHash || !session) {
    throw new Error('Telegram user session is not configured');
  }
  return { apiId, apiHash, session };
}

function makeClient() {
  const { apiId, apiHash, session } = credentials();
  return new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    { connectionRetries: 3 }
  );
}

export async function getUserAccountStatus() {
  const client = makeClient();
  await client.connect();

  try {
    const me = await client.getMe();
    return {
      ok: true,
      id: me?.id ? String(me.id) : null,
      username: me?.username || null,
      firstName: me?.firstName || null,
      lastName: me?.lastName || null
    };
  } finally {
    await client.disconnect();
  }
}

export async function sendFromUserAccount(username, message) {
  const target = username.startsWith('@') ? username : `@${username}`;
  const client = makeClient();
  await client.connect();

  try {
    const result = await client.sendMessage(target, { message });
    return { id: String(result.id) };
  } finally {
    await client.disconnect();
  }
}
