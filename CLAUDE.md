@AGENTS.md

# graph8-hackathon

One Next.js 16 app (App Router, `src/`) serving both the dashboard and its API (route handlers).
Users sign in with Clerk, create workspaces, invite teammates, and connect a Slack channel.
UI semantics, theme and component library are ported from the sibling Veleads project
(`../veleads/veleads-frontend`); when in doubt about a UI pattern, do what Veleads does.

Deploys to Vercel on every push to `main` (previews for other branches). Package manager: **npm**.

## Commands

```bash
npm run dev              # localhost:3000
npm run build            # production build — run before calling work done
npm run lint
npm run typecheck        # next typegen + tsc (route types are generated)
npm run db:migrate       # prisma migrate dev — create/apply a migration after editing the schema
npm run db:migrate:deploy
npm run db:studio
npm run theme:build      # regenerate src/app/globals.css from scripts/theme/palette.mjs
npm run theme:check      # WCAG contrast assertions for the palette
```

## Architecture

- **`src/proxy.ts` is Clerk middleware** (Next 16's name for middleware), not an API proxy.
  It only attaches the session. Auth is checked where the data is (Clerk deprecated
  path-matching auth): `auth.protect()` in `src/app/(app)/layout.tsx` and `/onboarding`, and
  `requireUser`/`requireWorkspace`/`requireAdmin` in every API route. A new page outside the
  `(app)` group must protect itself.
- **Workspace = Clerk Organization.** The workspace id *is* the Clerk `org_...` id. There is no
  local users/workspaces table; Clerk is the source of truth for members and invitations
  (Clerk sends invitation emails).
- **`src/app/(app)/layout.tsx`** is the shell (sidebar + header). It redirects to `/onboarding`
  when there is no active workspace.
- **API routes** live under `src/app/api/workspaces/[workspaceId]/...`. Every handler:
  1. is wrapped in `route()` from `src/server/http.ts` (throw `HttpError`s / zod errors → JSON),
  2. calls `requireWorkspace(workspaceId)` or `requireAdmin(workspaceId)` from
     `src/server/auth.ts`, which checks the id in the URL matches the caller's *active* org.
  Business logic goes in `src/server/<domain>/`, not in the route file.
- **Server-only code** is in `src/server/` (`import 'server-only'`). Client code never imports it.
- **DB:** Prisma 7 + `@prisma/adapter-neon` on Neon Postgres (same stack as the Veleads backend).
  Client: `db()` from `src/server/db.ts`. Schema: `prisma/schema.prisma`. Every table carries a
  `workspace_id` and **every query is scoped by it**.
- **Secrets at rest** (integration tokens) are encrypted with `src/server/crypto/secret-box.ts`
  and never returned to the client.

## Slack integration

- Bot install via OAuth v2; scopes in `src/server/slack/oauth.ts`. One connection per workspace
  (`slack_connections`), posting to one chosen channel.
- Flow: `POST .../integrations/slack/authorize-url` (admin) → Slack consent →
  `GET /api/integrations/slack/callback` (verifies the HMAC-signed `state` *and* that the
  signed-in user started the install) → redirect to `/integrations?connected=1|0&reason=…`.
  Failure copy for each `reason` lives in `src/components/integrations/integrations-client.tsx`.
- Slack requires an **HTTPS** redirect URL registered in the Slack app:
  `<NEXT_PUBLIC_APP_URL>/api/integrations/slack/callback`. Locally, use a tunnel (ngrok) and set
  `NEXT_PUBLIC_APP_URL` to it, or test on a Vercel preview.
- **Incoming messages (Events API):** Slack POSTs to `/api/integrations/slack/events`
  (Slack app → Event Subscriptions; bot events `message.channels`, `message.groups`). The route
  authenticates by `SLACK_SIGNING_SECRET` HMAC over the *raw* body (no Clerk session), answers
  the `url_verification` challenge, acks retries without reprocessing, and must reply within 3s.
  The work runs in `after()` (download + transcription outlive Slack's 3s), `maxDuration = 300`.
- **Capture rules** (`handleMessageEvent`, `src/server/slack/events.ts`): only the workspace's
  connected channel; only messages carrying one of `SlackConnection.captureTags` (default
  `add-contact`; matching in `src/server/slack/tags.ts`). Text needs `#tag` written. Voice/video
  files are downloaded with the bot token and transcribed by Deepgram
  (`src/server/transcription/deepgram.ts`, one string per file); they match on the caption *or*
  the spoken tag ("hashtag add contact"). Matches become a `Capture` (one per Slack thread; later
  tagged messages in the thread append) under an `Event` per channel, which carries `workspaceId`.
  Shown at `/messages` (`GET /api/workspaces/[id]/messages`). Admins edit tags in the Slack
  settings panel (`PUT .../integrations/slack/tags`).
- **Contact extraction (Groq):** after a capture is saved, `enrichCaptureContact`
  (`src/server/capture/service.ts`) sends its `rawText` to Groq (`src/server/llm/groq.ts`, model
  `GROQ_MODEL` or `openai/gpt-oss-20b`, JSON mode + zod validation) via `extractContact`
  (`src/server/capture/contact.ts`) and stores `personEmail` (work emails only),
  `personFirstName`, `personLastName`, `personTitle`, `personCompany`, `personName`. Best effort —
  failures are logged, never fatal. graph8 extraction, when configured, overrides non-null fields.
- New bot scopes only apply after a workspace reconnects Slack.
- To add an integration: an entry in `src/lib/integrations/catalog.ts`, a logo in
  `src/components/integrations/logos`, server code in `src/server/<name>/`, a hooks file.

## Frontend conventions (from Veleads)

- **Read `THEME.md` before touching UI.** Theme tokens only — never raw hex or Tailwind palette
  colours (`text-emerald-600`). Status = `success|warning|info|danger|neutral` + an icon.
- Page anatomy: `PageHeader` (primary action in `actions`, `gradient` variant, once per page) →
  optional toolbar → content (table wrapper or `EmptyState`). Server `page.tsx` exports
  `metadata = { title: pageTitle('X') }` and wraps a client component in `<Suspense>`.
- Admin-only actions are hidden (or disabled with an explanation) for members; the API
  enforces it regardless.
- **React Query** for all client data: one `src/hooks/use-<entity>.ts` per entity with a
  hierarchical key factory (`slackKeys`, `workspaceMemberKeys`), `workspaceId` from
  `useOrganization()`, `enabled: !!workspaceId`, and invalidate/optimistic-update on mutation.
- Client → API calls go through `apiFetch` (`src/lib/api.ts`) with per-domain wrappers in
  `src/lib/api/` or `src/lib/integrations/`. Same origin, so the Clerk cookie authenticates.
- `src/components/ui/*` are shadcn (base-nova, Base UI primitives; Radix only for dropdown-menu
  and select). Add components with the shadcn CLI, then fix its `import { cn } from "cn"` to
  `@/lib/utils` and re-apply local edits if it overwrote button/dialog/input/textarea.
- Product name/mark live in `src/lib/app-config.ts`.

## Environment

See `.env.example`. Required: Clerk keys (with **Organizations enabled** in the Clerk dashboard),
`DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled, for migrations), `SLACK_CLIENT_ID`,
`SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `CREDENTIALS_ENCRYPTION_KEY` (`openssl rand -base64 32`),
`NEXT_PUBLIC_APP_URL`. The same variables must be set in Vercel.
