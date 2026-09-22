export default async function handler(req, res) {
  res.status(200).json({ ok: true, service: 'aijibpolice', time: new Date().toISOString() });
}
