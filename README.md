# AI Job Police

Personal Telegram agent for finding and tracking AI-creator work: full-time jobs, projects, freelance, one-off gigs and commercial leads.

## MVP

- Scans public Telegram channels:
  - @aivacancychannel
  - @neurodromo
  - @vakansii_ai
  - @rabota_freelancee
- Searches HeadHunter for AI creator / AI video / Creative SMM roles
- Scores relevance and removes duplicates through Neon
- Sends opportunity cards to @aijobpolicebot
- Supports Open / Apply / Save / Skip buttons
- Builds Telegram application drafts from the saved portfolio + Instagram links
- Detects requested price/timing fields and refuses to invent missing values
- Optional sending from the user's own Telegram account via MTProto
- HH auto-apply hook is prepared for OAuth + resume ID

## Required environment variables

See `.env.example`.

For the basic bot: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `TELEGRAM_OWNER_CHAT_ID`, `CRON_SECRET`.

## Deploy

Deploy this repository as a completely separate Vercel project. Do not reuse the older Smartbot project or database.

After deploy, configure environment variables and call:

`/api/setup-telegram`

to register the Telegram webhook.

## Notes

HeadHunter search works without OAuth. Auto-apply needs an approved HH API application, applicant OAuth token and `HH_RESUME_ID`.

Sending a Telegram application from the user's personal account requires Telegram API credentials and a `TG_USER_SESSION`. Never commit sessions, bot tokens, OAuth tokens or database credentials.
