import crypto from 'node:crypto';

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const clientId = process.env.HH_CLIENT_ID;
  if (!clientId) {
    return res.status(503).send('HeadHunter client is not configured yet.');
  }

  const state = crypto.randomBytes(24).toString('hex');
  const redirectUri = `${baseUrl(req)}/api/hh-callback`;

  res.setHeader(
    'Set-Cookie',
    `hh_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=600`
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri
  });

  res.statusCode = 302;
  res.setHeader('Location', `https://hh.ru/oauth/authorize?${params.toString()}`);
  res.end();
}
