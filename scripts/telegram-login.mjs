import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const apiId = Number(process.env.TG_USER_API_ID);
const apiHash = process.env.TG_USER_API_HASH;
const phone = process.env.TG_PHONE;

if (!apiId || !apiHash) {
  throw new Error('Set TG_USER_API_ID and TG_USER_API_HASH first');
}
if (!phone) {
  throw new Error('Set TG_PHONE first, for example +447700900123');
}

const rl = readline.createInterface({ input, output });
const client = new TelegramClient(
  new StringSession(''),
  apiId,
  apiHash,
  { connectionRetries: 5 }
);

try {
  await client.start({
    phoneNumber: async () => phone,
    password: async () => await rl.question('2FA password (if enabled): '),
    phoneCode: async () => await rl.question('Telegram login code: '),
    onError: (err) => console.error('Telegram login error:', err?.message || err)
  });

  console.log('\nTG_USER_SESSION=');
  console.log(client.session.save());
} finally {
  rl.close();
  await client.disconnect();
}
