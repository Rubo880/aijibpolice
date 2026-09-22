import { getSources, upsertOpportunity } from '../lib/db.js';
import { searchHH } from '../lib/hh.js';
import { scoreOpportunity, detectOpportunityType, extractRequestedFields } from '../lib/scoring.js';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}` || req.query?.secret === secret;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const sources = await getSources('headhunter');
    const source = sources.find(s => s.external_id === 'hh');
    if (!source) throw new Error('HH source not configured');
    const items = await searchHH({ perPage: 20 });
    let inserted = 0, relevant = 0;
    const min = Number(process.env.MIN_MATCH_SCORE || 65);
    for (const v of items) {
      const raw = [v.name, v.snippet?.requirement, v.snippet?.responsibility].filter(Boolean).join('\n');
      const { score, reason } = scoreOpportunity(raw, v.name);
      if (score >= min) relevant++;
      const row = await upsertOpportunity({
        sourceId: source.id,
        externalId: String(v.id),
        sourceUrl: v.alternate_url,
        title: v.name,
        company: v.employer?.name || null,
        opportunityType: detectOpportunityType(raw),
        rawText: raw,
        compensationText: v.salary ? `${v.salary.from ?? ''}${v.salary.from && v.salary.to ? '–' : ''}${v.salary.to ?? ''} ${v.salary.currency || ''}`.trim() : null,
        locationText: v.area?.name || null,
        remote: /удален|remote/i.test(raw),
        matchScore: score,
        matchReason: reason,
        requestedFields: extractRequestedFields(raw),
        parsedData: { hh_id: v.id, employment: v.employment?.name, schedule: v.schedule?.name },
        publishedAt: v.published_at || null
      });
      if (row.inserted) inserted++;
    }
    res.status(200).json({ ok: true, scanned: items.length, inserted, relevant, minScore: min });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
