# graph8-hackathon

A Next.js 16 dashboard and API in one app. Users sign in with Clerk, create workspaces (Clerk
Organizations), invite teammates, and connect a Slack channel. Data lives in Neon Postgres,
accessed through Prisma. Pushing to `main` deploys it to Vercel.

## Setup

1. `npm install`. This also runs `prisma generate`.
2. `cp .env.example .env.local` and fill it in:
   - **Clerk:** create an app at [dashboard.clerk.com](https://dashboard.clerk.com) and turn on
     **Organizations** (Configure → Organizations). Copy the publishable key and secret key.
   - **Neon:** set `DATABASE_URL` to the pooled URL and `DIRECT_URL` to the unpooled one. Then
     run `npm run db:migrate:deploy`.
   - **Slack:** create an app at [api.slack.com/apps](https://api.slack.com/apps).
     - Under *OAuth & Permissions*, add these **bot** scopes: `chat:write`, `chat:write.public`,
       `channels:read`, `groups:read`, `channels:join`.
     - Also under *OAuth & Permissions*, add the redirect URL
       `<NEXT_PUBLIC_APP_URL>/api/integrations/slack/callback`. Slack only accepts HTTPS, so use
       ngrok locally, or your Vercel URL.
     - Copy the Client ID and Client Secret.
   - **`CREDENTIALS_ENCRYPTION_KEY`:** generate one with `openssl rand -base64 32`.
3. `npm run dev`

## Deploying

Import the repo into Vercel. Add the same environment variables there, and set
`NEXT_PUBLIC_APP_URL` to the production URL. If the schema has changed, run
`npm run db:migrate:deploy` against the production database.

See [CLAUDE.md](CLAUDE.md) for the architecture and conventions, and [THEME.md](THEME.md) for the
design system.
