import * as cheerio from 'cheerio';
import { getSources, upsertOpportunity } from '../lib/db.js';
import {
  scoreOpportunity, detectOpportunityType, extractRequestedFields,
  extractContactUsername, extractEmail, extractCompensation
} from '../lib/scoring.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}` || req.query?.secret === secret;
}

function normalizeText(s = '') {
  return s.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function readPublicChannel(username) {
  const r = await fetch(`https://t.me/s/${username}`, {
    headers: { 'user-agent': 'Mozilla/5.0 AIJobPolice/0.1' }
  });
  if (!r.ok) throw new Error(`Telegram public page ${username}: ${r.status}`);
  const html = await r.text();
  const $ = cheerio.load(html);
  const out = [];
  $('.tgme_widget_message').each((_, el) => {
    const post = $(el).attr('data-post');
    if (!post) return;
    const externalId = post.split('/').pop();
    const text = normalizeText($(el).find('.tgme_widget_message_text').text());
    if (!text) return;
    const date = $(el).find('time').attr('datetime') || null;
    out.push({ externalId, text, date, url: `https://t.me/${post}` });
  });
  return out;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const sources = await getSources('telegram_channel');
    const min = Number(process.env.MIN_MATCH_SCORE || 65);
    let scanned = 0, inserted = 0, relevant = 0;
    const errors = [];

    for (const source of sources) {
      try {
        const posts = await readPublicChannel(source.external_id);
        scanned += posts.length;
        for (const p of posts) {
          const { score, reason } = scoreOpportunity(p.text);
          if (score >= min) relevant++;
          const row = await upsertOpportunity({
            sourceId: source.id,
            externalId: p.externalId,
            sourceUrl: p.url,
            opportunityType: detectOpportunityType(p.text),
            rawText: p.text,
            contactUsername: extractContactUsername(p.text),
            contactEmail: extractEmail(p.text),
            compensationText: extractCompensation(p.text),
            remote: /удален|remote|дистанц/i.test(p.text),
            matchScore: score,
            matchReason: reason,
            requestedFields: extractRequestedFields(p.text),
            parsedData: {},
            publishedAt: p.date
          });
          if (row.inserted) inserted++;
        }
      } catch (e) {
        errors.push({ source: source.external_id, error: e.message });
      }
    }

    res.status(200).json({ ok: true, scanned, inserted, relevant, minScore: min, errors });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
