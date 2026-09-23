import { neon } from '@neondatabase/serverless';

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}

export async function getProfile() {
  const sql = db();
  const rows = await sql`SELECT * FROM profile WHERE id = 1`;
  return rows[0] || null;
}

export async function getSources(kind) {
  const sql = db();
  return kind
    ? await sql`SELECT * FROM sources WHERE enabled = TRUE AND kind = ${kind} ORDER BY id`
    : await sql`SELECT * FROM sources WHERE enabled = TRUE ORDER BY id`;
}

export async function upsertOpportunity(o) {
  const sql = db();
  const rows = await sql`
    INSERT INTO opportunities (
      source_id, external_id, source_url, title, company, opportunity_type,
      raw_text, contact_username, contact_email, compensation_text, location_text,
      remote, match_score, match_reason, requested_fields, parsed_data, published_at
    ) VALUES (
      ${o.sourceId}, ${o.externalId}, ${o.sourceUrl || null}, ${o.title || null}, ${o.company || null},
      ${o.opportunityType || 'unknown'}, ${o.rawText}, ${o.contactUsername || null}, ${o.contactEmail || null},
      ${o.compensationText || null}, ${o.locationText || null}, ${o.remote ?? null},
      ${o.matchScore ?? null}, ${o.matchReason || null}, ${JSON.stringify(o.requestedFields || [])}::jsonb,
      ${JSON.stringify(o.parsedData || {})}::jsonb, ${o.publishedAt || null}
    )
    ON CONFLICT (source_id, external_id) DO UPDATE SET
      source_url = EXCLUDED.source_url,
      title = COALESCE(EXCLUDED.title, opportunities.title),
      company = COALESCE(EXCLUDED.company, opportunities.company),
      opportunity_type = EXCLUDED.opportunity_type,
      raw_text = EXCLUDED.raw_text,
      contact_username = COALESCE(EXCLUDED.contact_username, opportunities.contact_username),
      contact_email = COALESCE(EXCLUDED.contact_email, opportunities.contact_email),
      compensation_text = COALESCE(EXCLUDED.compensation_text, opportunities.compensation_text),
      location_text = COALESCE(EXCLUDED.location_text, opportunities.location_text),
      remote = COALESCE(EXCLUDED.remote, opportunities.remote),
      match_score = EXCLUDED.match_score,
      match_reason = EXCLUDED.match_reason,
      requested_fields = EXCLUDED.requested_fields,
      parsed_data = EXCLUDED.parsed_data
    RETURNING *, (xmax = 0) AS inserted
  `;
  return rows[0];
}

export async function getOpportunity(id) {
  const sql = db();
  const rows = await sql`
    SELECT o.*, s.name AS source_name, s.kind AS source_kind
    FROM opportunities o
    LEFT JOIN sources s ON s.id = o.source_id
    WHERE o.id = ${id}
  `;
  return rows[0] || null;
}

export async function listNewOpportunities(limit = 20) {
  const sql = db();
  return await sql`
    SELECT o.*, s.name AS source_name, s.kind AS source_kind
    FROM opportunities o
    LEFT JOIN sources s ON s.id = o.source_id
    WHERE o.status = 'new'
    ORDER BY o.match_score DESC NULLS LAST, o.discovered_at DESC
    LIMIT ${limit}
  `;
}

export async function markOpportunityStatus(id, status) {
  const sql = db();
  await sql`UPDATE opportunities SET status = ${status} WHERE id = ${id}`;
}

export async function createApplication({ opportunityId, channel, destination, messageText, answers = {}, status = 'draft' }) {
  const sql = db();
  const rows = await sql`
    INSERT INTO applications(opportunity_id, channel, destination, message_text, answers, status)
    VALUES (${opportunityId}, ${channel}, ${destination || null}, ${messageText || null}, ${JSON.stringify(answers)}::jsonb, ${status})
    RETURNING *
  `;
  return rows[0];
}

export async function markApplicationSent(id, externalApplicationId = null, externalStatus = null) {
  const sql = db();
  await sql`
    UPDATE applications
    SET status = 'sent', sent_at = NOW(), external_application_id = ${externalApplicationId}, external_status = ${externalStatus}
    WHERE id = ${id}
  `;
}

export async function logActivity({ opportunityId = null, applicationId = null, eventType, details = {} }) {
  const sql = db();
  await sql`
    INSERT INTO activity_log(opportunity_id, application_id, event_type, details)
    VALUES (${opportunityId}, ${applicationId}, ${eventType}, ${JSON.stringify(details)}::jsonb)
  `;
}

export async function getDashboardStats() {
  const sql = db();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE discovered_at >= NOW() - INTERVAL '24 hours')::int AS found_24h,
      COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
      COUNT(*) FILTER (WHERE match_score >= 80 AND status = 'new')::int AS strong_new,
      (SELECT COUNT(*)::int FROM applications WHERE sent_at >= NOW() - INTERVAL '24 hours') AS applied_24h,
      (SELECT COUNT(*)::int FROM applications WHERE status = 'sent') AS applied_total
    FROM opportunities
  `;
  return rows[0];
}


export async function listOpportunitiesByStatus(status, limit = 5) {
  const sql = db();
  return await sql`
    SELECT o.*, s.name AS source_name, s.kind AS source_kind
    FROM opportunities o
    LEFT JOIN sources s ON s.id = o.source_id
    WHERE o.status = ${status}
    ORDER BY o.match_score DESC NULLS LAST, o.discovered_at DESC
    LIMIT ${limit}
  `;
}

export async function listLatestOpportunities(limit = 5) {
  const sql = db();
  return await sql`
    SELECT o.*, s.name AS source_name, s.kind AS source_kind
    FROM opportunities o
    LEFT JOIN sources s ON s.id = o.source_id
    WHERE o.status NOT IN ('skipped', 'closed')
    ORDER BY o.discovered_at DESC
    LIMIT ${limit}
  `;
}

export async function listApplications(limit = 10) {
  const sql = db();
  return await sql`
    SELECT
      a.*,
      o.title,
      o.company,
      o.source_url,
      o.match_score,
      s.name AS source_name,
      s.kind AS source_kind
    FROM applications a
    JOIN opportunities o ON o.id = a.opportunity_id
    LEFT JOIN sources s ON s.id = o.source_id
    ORDER BY COALESCE(a.sent_at, a.created_at) DESC
    LIMIT ${limit}
  `;
}


export async function setApplicationMode(mode) {
  const allowed = ['watch', 'approve', 'auto'];
  if (!allowed.includes(mode)) throw new Error('Invalid application mode');
  const sql = db();
  const rows = await sql`
    UPDATE profile
    SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{application_mode}', to_jsonb(${mode}::text), true),
        updated_at = NOW()
    WHERE id = 1
    RETURNING *
  `;
  return rows[0] || null;
}


