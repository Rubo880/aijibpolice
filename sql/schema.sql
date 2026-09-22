CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('telegram_channel','headhunter')),
  name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(kind, external_id)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES sources(id) ON DELETE SET NULL,
  external_id TEXT,
  source_url TEXT,
  title TEXT,
  company TEXT,
  opportunity_type TEXT NOT NULL DEFAULT 'unknown',
  raw_text TEXT NOT NULL,
  contact_username TEXT,
  contact_email TEXT,
  compensation_text TEXT,
  location_text TEXT,
  remote BOOLEAN,
  match_score INTEGER CHECK (match_score BETWEEN 0 AND 100),
  match_reason TEXT,
  requested_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  published_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('telegram','headhunter','manual')),
  status TEXT NOT NULL DEFAULT 'draft',
  destination TEXT,
  message_text TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  external_application_id TEXT,
  external_status TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profile (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  display_name TEXT,
  headline TEXT,
  base_telegram_message TEXT NOT NULL,
  portfolio_url TEXT NOT NULL,
  instagram_url TEXT NOT NULL,
  cv_url TEXT,
  minimum_match_score INTEGER NOT NULL DEFAULT 75 CHECK (minimum_match_score BETWEEN 0 AND 100),
  auto_apply_hh BOOLEAN NOT NULL DEFAULT FALSE,
  auto_send_telegram BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  opportunity_id BIGINT REFERENCES opportunities(id) ON DELETE SET NULL,
  application_id BIGINT REFERENCES applications(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status_score
  ON opportunities(status, match_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_discovered_at
  ON opportunities(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status
  ON applications(status);
CREATE INDEX IF NOT EXISTS idx_activity_created_at
  ON activity_log(created_at DESC);

INSERT INTO sources(kind, name, external_id, url) VALUES
 ('telegram_channel','AI Vacancy Channel','aivacancychannel','https://t.me/aivacancychannel'),
 ('telegram_channel','Нейродром','neurodromo','https://t.me/neurodromo'),
 ('telegram_channel','Вакансии AI','vakansii_ai','https://t.me/vakansii_ai'),
 ('telegram_channel','Работа / Freelance','rabota_freelancee','https://t.me/rabota_freelancee'),
 ('headhunter','HeadHunter','hh','https://hh.ru')
ON CONFLICT(kind, external_id) DO NOTHING;

-- Insert the personal profile separately with real portfolio links.
-- Keep passwords/tokens/sessions out of SQL and out of Git.
