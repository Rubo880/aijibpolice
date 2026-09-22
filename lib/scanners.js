import * as cheerio from 'cheerio';
import { getSources, upsertOpportunity, listNewOpportunities, markOpportunityStatus } from './db.js';
import { searchHH } from './hh.js';
import {
  scoreOpportunity, detectOpportunityType, extractRequestedFields,
  extractContactUsername, extractEmail, extractCompensation
} from './scoring.js';
import { sendBotMessage } from './telegram-bot.js';
import { opportunityCard } from './cards.js';

function normalizeText(s = '') {
  return s.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let index = 0;

  async function run() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      result[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

async function readPublicChannel(username) {
  const r = await fetch(`https://t.me/s/${username}`, {
    headers: { 'user-agent': 'Mozilla/5.0 AIJobPolice/0.1' },
    signal: AbortSignal.timeout(8000)
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
    out.push({
      externalId,
      text,
      date,
      url: `https://t.me/${post}`
    });
  });

  return out.slice(-15);
}

export async function scanTelegramNow() {
  const sources = await getSources('telegram_channel');
  const min = Number(process.env.MIN_MATCH_SCORE || 65);
  const started = Date.now();

  const channelResults = await Promise.allSettled(
    sources.map(async (source) => ({
      source,
      posts: await readPublicChannel(source.external_id)
    }))
  );

  let scanned = 0;
  let relevant = 0;
  let inserted = 0;
  const errors = [];
  const candidates = [];

  for (const result of channelResults) {
    if (result.status === 'rejected') {
      errors.push({ source: 'unknown', error: result.reason?.message || String(result.reason) });
      continue;
    }

    const { source, posts } = result.value;
    scanned += posts.length;

    for (const p of posts) {
      const { score, reason } = scoreOpportunity(p.text);
      if (score < min) continue;

      relevant++;
      candidates.push({
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
    }
  }

  await mapLimit(candidates, 6, async (candidate) => {
    const row = await upsertOpportunity(candidate);
    if (row.inserted) inserted++;
  });

  return {
    scanned,
    inserted,
    relevant,
    minScore: min,
    errors,
    durationMs: Date.now() - started
  };
}

export async function scanHHNow() {
  const sources = await getSources('headhunter');
  const source = sources.find(s => s.external_id === 'hh');
  if (!source) throw new Error('HH source not configured');

  const started = Date.now();
  const { items, errors } = await searchHH({ perPage: 10 });
  const min = Number(process.env.MIN_MATCH_SCORE || 65);

  let relevant = 0;
  let inserted = 0;
  const candidates = [];

  for (const v of items) {
    const raw = [
      v.name,
      v.snippet?.requirement,
      v.snippet?.responsibility
    ].filter(Boolean).join('\n');

    const { score, reason } = scoreOpportunity(raw, v.name);
    if (score < min) continue;

    relevant++;
    candidates.push({
      sourceId: source.id,
      externalId: String(v.id),
      sourceUrl: v.alternate_url,
      title: v.name,
      company: v.employer?.name || null,
      opportunityType: detectOpportunityType(raw),
      rawText: raw,
      compensationText: v.salary
        ? `${v.salary.from ?? ''}${v.salary.from && v.salary.to ? '–' : ''}${v.salary.to ?? ''} ${v.salary.currency || ''}`.trim()
        : null,
      locationText: v.area?.name || null,
      remote: /удален|remote/i.test(raw),
      matchScore: score,
      matchReason: reason,
      requestedFields: extractRequestedFields(raw),
      parsedData: {
        hh_id: v.id,
        employment: v.employment?.name,
        schedule: v.schedule?.name
      },
      publishedAt: v.published_at || null
    });
  }

  await mapLimit(candidates, 6, async (candidate) => {
    const row = await upsertOpportunity(candidate);
    if (row.inserted) inserted++;
  });

  return {
    scanned: items.length,
    inserted,
    relevant,
    minScore: min,
    errors,
    durationMs: Date.now() - started
  };
}

export async function pushNewNow(chatId, limit = 8) {
  const min = Number(process.env.MIN_MATCH_SCORE || 65);
  const rows = (await listNewOpportunities(limit))
    .filter(x => (x.match_score ?? 0) >= min);

  let sent = 0;

  for (const o of rows) {
    const card = opportunityCard(o);
    await sendBotMessage(chatId, card.text, {
      reply_markup: card.reply_markup
    });
    await markOpportunityStatus(o.id, 'notified');
    sent++;
  }

  return { sent };
}
