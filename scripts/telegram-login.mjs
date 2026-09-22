import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';

const apiId = Number(process.env.TG_USER_API_ID);
const apiHash = process.env.TG_USER_API_HASH;
if (!apiId || !apiHash) throw new Error('Set TG_USER_API_ID and TG_USER_API_HASH first');
const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
await client.start({
  phoneNumber: async () => input.text('Phone number: '),
  password: async () => input.text('2FA password (if enabled): '),
  phoneCode: async () => input.text('Telegram login code: '),
  onError: (err) => console.error(err)
});
console.log('\nTG_USER_SESSION=');
console.log(client.session.save());
await client.disconnect();
