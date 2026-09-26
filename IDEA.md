# Debrief — Event-to-Pipeline Slack Bot (Implementation Spec)

> Hand this file to Claude Code as the build spec. Build for a **hackathon demo first** (milestones 1–8 + `/summary`), keeping adapters clean so it can grow into a product. "Debrief" is the working name.

---

## 1. Summary

Debrief turns in-person conversations at tech events and hackathons into pipeline inside **graph8**. Right after meeting someone, the operator posts a **Slack audio clip** (or text, photo, or LinkedIn link) in an event channel. Debrief:

1. Transcribes and understands the note (who, company, role, pains, intent, next step, hotness).
2. Resolves the person in graph8 (lookup and enrichment), with a disambiguation prompt using Slack buttons if needed.
3. Records everything in graph8: contact, company, note, event list, custom fields, and a deal for hot leads.
4. Drafts a personalized follow-up and shows it in the Slack thread with **Send / Edit / Skip** buttons, then sends it via graph8 (email; LinkedIn optional).
5. Hands hot leads to a graph8 workflow that schedules a voice-agent call and alerts the team.
6. Reports event results with `/debrief summary`.

**Design principle:** graph8 is the brain and the system of record (LLM skills, CRM, search, sequences, voice, workflows). Debrief's own code stays thin. It handles the Slack channel, speech-to-text, conversation state, and orchestration glue.

### Goals
- Capture a lead in **under 15 seconds** of operator effort (one audio clip).
- A personalized follow-up goes out **within minutes**, referencing the actual conversation.
- The whole booth team shares one Slack channel. Each lead gets its own thread, visible to managers.

### Non-goals (hackathon)
- No custom web or mobile UI (Slack is the operator UI; graph8 is the dashboard).
- No pre-event attendee import (stub only).
- Single workspace, single graph8 org. Multiple operators are allowed (any member of the event channel).
- No WhatsApp. Keep an `OperatorChannel` interface so WhatsApp (via Unipile) can be added later.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| API server | NestJS |
| DB | PostgreSQL + Prisma |
| Operator channel | Slack app (Events API + Interactivity + Slash command), `@slack/bolt` or `@slack/web-api` |
| GTM system / brain | graph8 REST API / `@graph8/sdk` (OpenAPI 3.1 in graph8 docs): LLM skills, CRM, search, enrichment, sequences, workflows, voice agents, webhooks |
| Speech-to-text | OpenAI Whisper API or Deepgram (behind `Transcriber` interface). graph8 has no standalone STT API |
| Vision (card/badge photos) | Claude vision directly (behind `VisionExtractor`). graph8 LLM skills are assumed text-only |
| LLM fallback | Anthropic Claude (behind `LLM` interface) if a graph8 skill is slow or unreliable |
| Delays / scheduling | **graph8 workflows** (delay → voice call). Fallback: BullMQ + Redis behind a `Scheduler` interface |
| LinkedIn invite (optional) | Unipile API |
| Local dev | Docker Compose (postgres, redis), ngrok or cloudflared for Slack and graph8 webhooks, ffmpeg installed |

---

## 3. Architecture

```
Slack (operators)
  │ audio clip / text / photo / link / button click / slash command
  ▼
NestJS API
  ├─ /slack/events        (Events API: message, file_shared)
  ├─ /slack/interactions  (button clicks, modal submits)
  ├─ /slack/commands      (/debrief ...)
  ├─ /graph8/webhooks     (optional: meeting booked, reply received)
  │
  ├─ OperatorChannel (Slack impl)   ← posts thread replies, buttons, modals
  ├─ ConversationService            ← per-thread state machine
  ├─ CaptureService                 ← pipeline below
  ├─ Transcriber (Whisper/Deepgram) + ffmpeg
  ├─ VisionExtractor (Claude vision)
  ├─ Graph8Client                   ← skills, lookup, CRM, lists, fields, deals,
  │                                   tasks, sequences, email send, workflows
  ├─ UnipileClient (optional)       ← LinkedIn invite
  └─ Prisma / Postgres              ← events, captures, thread state
```

### Brain placement
| Task | Where it runs |
|---|---|
| Extraction (transcript → structured lead) | **graph8 LLM skill** `debrief_extract` |
| Follow-up email draft | **graph8 LLM skill** `debrief_draft_followup` |
| Pain normalization for summary | **graph8 LLM skill** `debrief_normalize_pains` |
| Photo → text (card/badge/screenshot) | Claude vision (Debrief code) |
| Disambiguation dialog | Debrief code (Slack buttons) |
| Hot-lead routing, delays, voice call, Slack team alert | **graph8 workflow** `debrief_hot_lead` |
| Warm nurture | **graph8 sequence** per event |

### Capture pipeline (core loop)
```
Slack event (message in an event channel, incl. file_shared audio/image)
  → ack 200 within 3s; process async
  → dedupe by Slack event_id / message ts
  → ignore bot messages, edits, and threads that are not capture roots
  → resolve Event from channel id
  → post thread reply: "⏳ Debriefing…"
  → normalize input:
       audio → download (bot token) → ffmpeg → STT → transcript
       image → Claude vision → text
       text / LinkedIn URL → as is
  → graph8 skill debrief_extract → CaptureExtraction (JSON)
  → missing name/company? → ask in thread (state AWAITING_INFO)
  → graph8 resolve person (lookup_person / find_contacts)
       many → buttons (state AWAITING_DISAMBIGUATION)
       none → create from extraction
  → graph8 writes: contact + company, note, add to event list, custom fields
  → route by hotness:
       HOT  → create deal + task; skill debrief_draft_followup → thread card with
              [Send] [Edit] [Skip] (state AWAITING_APPROVAL)
       WARM → enroll in event nurture sequence
       COLD → done
  → update the thread card (replace "⏳" with the result card)
```

---

## 4. Data model (Prisma)

```prisma
model Event {
  id                String   @id @default(cuid())
  name              String
  date              DateTime?
  goal              String?
  slackChannelId    String   @unique
  graph8ListId      String?
  graph8SequenceId  String?   // warm nurture
  graph8HotWorkflowId String? // debrief_hot_lead
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  captures          Capture[]
}

model Capture {
  id               String   @id @default(cuid())
  eventId          String
  event            Event    @relation(fields: [eventId], references: [id])
  slackChannelId   String
  slackThreadTs    String   // root message ts = thread id
  slackUserId      String   // operator who captured
  slackEventId     String   @unique
  inputType        InputType
  rawText          String?  // transcript or text
  extraction       Json?
  status           CaptureStatus @default(RECEIVED)
  hotness          Hotness?
  graph8ContactId  String?
  graph8CompanyId  String?
  graph8DealId     String?
  followUpSubject  String?
  followUpBody     String?
  followUpSentAt   DateTime?
  linkedinInviteSentAt DateTime?
  error            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([slackChannelId, slackThreadTs])
}

model ThreadState {
  id          String    @id @default(cuid())
  captureId   String    @unique
  state       ConvState @default(IDLE)
  payload     Json?     // e.g. disambiguation candidates
  updatedAt   DateTime  @updatedAt
}

model OperatorMap {
  slackUserId    String @id
  graph8UserId   String?  // owner for contacts/deals/tasks
  displayName    String?
  signature      String?  // email sign-off
}

enum InputType { VOICE TEXT IMAGE LINK }
enum Hotness { HOT WARM COLD }
enum CaptureStatus { RECEIVED EXTRACTED AWAITING_INFO AWAITING_DISAMBIGUATION RECORDED AWAITING_APPROVAL FOLLOWED_UP FAILED }
enum ConvState { IDLE AWAITING_INFO AWAITING_DISAMBIGUATION AWAITING_APPROVAL AWAITING_EDIT }
```

---

## 5. Environment variables

```
DATABASE_URL=
SLACK_BOT_TOKEN=            # xoxb-
SLACK_SIGNING_SECRET=
GRAPH8_API_KEY=
GRAPH8_BASE_URL=
GRAPH8_VOICE_AGENT_ID=
GRAPH8_DEFAULT_MAILBOX=     # sender for follow-up emails
OPENAI_API_KEY=             # Whisper (or DEEPGRAM_API_KEY)
ANTHROPIC_API_KEY=          # vision + LLM fallback
UNIPILE_DSN=                # optional (LinkedIn)
UNIPILE_API_KEY=
UNIPILE_LINKEDIN_ACCOUNT_ID=
PRODUCT_ONE_LINER=          # used in follow-up drafts
PUBLIC_BASE_URL=
TIMEZONE=Asia/Karachi
```

---

## 6. Integrations

> **Verify every endpoint and payload against the official docs before coding** (Slack API docs, graph8 OpenAPI spec, Unipile docs). Wrap each vendor in a typed client with an interface so it can be mocked. Do not guess field names. Log raw payloads in dev.

### 6.1 Slack app
**Scopes (bot):** `channels:history`, `groups:history`, `chat:write`, `files:read`, `commands`, `users:read`, `channels:read`, `reactions:write`.
**Features:**
- Events API subscriptions: `message.channels`, `message.groups`, `file_shared` → `POST /slack/events` (verify the signing secret; handle `url_verification`).
- Interactivity → `POST /slack/interactions` (buttons, modal submits).
- Slash command `/debrief` → `POST /slack/commands`.

**Rules:**
- Respond within 3s. Process asynchronously.
- Dedupe on `event_id` (Slack retries with the `X-Slack-Retry-Num` header).
- Only process top-level messages in channels mapped to an Event. Replies inside a capture thread are routed to that capture's state machine (answers to "which company?", edits).
- Audio clips arrive as files (often `webm` or `mp4`/`m4a`). Download with `Authorization: Bearer SLACK_BOT_TOKEN` from `url_private_download`, then convert to 16 kHz mono WAV/MP3 via ffmpeg if needed.
- Add a ⏳ reaction on receive, and replace it with ✅ or ⚠️ when done.

### 6.2 graph8

**Bootstrap on startup (idempotent):**
- Custom fields: `debrief_event` (text), `debrief_hotness` (text), `debrief_next_step` (text), `debrief_captured_at` (datetime), `debrief_source` (text, default "debrief").
- LLM skills (create if missing, via the skills API): `debrief_extract`, `debrief_draft_followup`, `debrief_normalize_pains` (prompts in §7). Store their ids.

**Per event (on `/debrief event`):**
- Create a contact list `Event: <name>`.
- Create a warm nurture sequence (3 steps; see §9).
- Create or clone the `debrief_hot_lead` workflow (see §9) and store its id.

**Operations used** (names mirror graph8 MCP tools; map to REST from the OpenAPI spec):

| Need | graph8 operation |
|---|---|
| Run LLM skill | `workflow_skill_execute` (input_data = skill variables) |
| Create/update skill | `workflow_skill_create_llm` / `update_llm` |
| Find person | `lookup_person`, `find_contacts` |
| Company | `lookup_company`, `create_company` |
| Enrich | `enrich_contacts` + `get_enrichment_job` (async; never block the Slack reply) |
| Contact CRUD | `create_contact`, `update_contact` |
| Note | `create_note` |
| List | `create_list`, `add_to_list` |
| Fields | `create_fields`, `set_field_values` |
| Deal / task | `create_deal`, `create_task` |
| Warm nurture | `gtm_create_campaign` + steps + `gtm_attach_audience` / enroll contact (confirm the per-contact enrollment endpoint) |
| Send hot follow-up email | one-off send if the API supports it (`send_reply` supports email/sms/linkedin but needs a thread id; confirm). Fallback: a 1-step campaign for that contact |
| Hot-lead workflow | `workflow_create`, `workflow_add_node`, `workflow_connect_nodes`, `workflow_validate`, `workflow_execute` (input: contact_id, deal_id, capture summary) |
| Voice agent | referenced inside the workflow (voice call node) using `GRAPH8_VOICE_AGENT_ID` |
| Team alert | workflow Slack node (graph8 can post to Slack channels/users) |
| Summary stats | `get_lists`, `get_deals`, `list_meetings`, `gtm_get_campaign_metrics`, appointments insights |
| Outbound events (optional) | graph8 webhooks → `/graph8/webhooks` (meeting booked, reply received) → post an update in the capture thread |

> Check early at the hackathon: (1) latency and output quality of `workflow_skill_execute` with a sample transcript; (2) the email-send path for a single contact; (3) that the workflow node catalog (`workflow_list_node_types`) includes delay, voice call, and Slack nodes. If (1) is too slow or unreliable, switch the `LLM` interface to Claude directly without touching the pipeline.

### 6.3 Speech-to-text
Whisper or Deepgram with language auto-detect. Delete raw audio after transcription.

### 6.4 Unipile (optional, LinkedIn only)
Resolve the LinkedIn profile from a URL, name, or company, then send an invitation with a note of 280 characters or less. Limit to 20 per day.

---

## 7. LLM contracts (graph8 skills)

Skills use single-brace `{variable}` placeholders. Ask for **JSON only**, and validate every response with zod. Retry once with a "return valid JSON" repair prompt, then fall back to Claude.

### 7.1 `debrief_extract`
Variables: `{input_text}`, `{event_name}`, `{event_goal}`
Output (`CaptureExtraction`):
```ts
interface CaptureExtraction {
  person: { fullName: string|null; firstName: string|null; lastName: string|null;
            title: string|null; linkedinUrl: string|null; email: string|null; phone: string|null };
  company: { name: string|null; domain: string|null; sizeHint: string|null };
  conversation: { summary: string; pains: string[]; interests: string[];
                  nextStep: string|null; timeline: string|null };
  tags: string[];              // e.g. ["enterprise"] | ["developer"] | ["talent"] | ["partner"]
  hotness: 'HOT'|'WARM'|'COLD';
  hotnessReason: string;
  confidence: number;          // 0–1 identity confidence
  missing: string[];           // e.g. ["company"]
}
```
Hotness rules:
- **HOT:** explicit next step (demo, call, pilot, intro), or strong pain plus authority.
- **WARM:** relevant role or company with interest, but no next step.
- **COLD:** networking, student, not a fit.
- If `talent` or `partner` is tagged, route to a task and do **not** send sales follow-ups.

### 7.2 `debrief_draft_followup`
Variables: `{first_name}`, `{company}`, `{summary}`, `{pains}`, `{next_step}`, `{event_name}`, `{product_one_liner}`, `{sender_name}`, `{signature}`
Output: `{ "subject": string, "body": string }`. Keep it to 90 words or fewer, reference one specific conversation detail, and give exactly one CTA matching `next_step`. Plain text only.

### 7.3 `debrief_normalize_pains`
Variables: `{pains_json}`. Output: `{ "labels": [{ "label": string, "count": number }] }`, grouping synonyms into short labels.

---

## 8. Slack UX

### Channel model
- One Slack channel per event (for example `#debrief-devsummit`), created by the operator.
- `/debrief event <name>[, <date>][, goal: <goal>]`, run inside that channel, links the channel to a new Event and bootstraps graph8.
- Every top-level post in the channel is a capture. Each capture lives in its own thread.

### Commands
| Command | Behavior |
|---|---|
| `/debrief event <name>, <date>, goal: <goal>` | Create an event bound to the current channel |
| `/debrief summary` | Post event stats (see §10) |
| `/debrief me <graph8 user email>` | Map the Slack user to a graph8 owner |
| `/debrief help` | Usage |

### Capture thread (hot lead), Block Kit
```
✅ Ali Raza · CTO @ Finlo · 🔥 Hot  (captured by @abdullah)
Pains: flaky CI, slow releases · Next: demo next week
Saved to graph8 · list: DevSummit · deal created   [Open in graph8]

✉️ Draft follow-up
Subject: Flaky CI at Finlo
"Hi Ali, great talking at DevSummit about…"
[Send]  [Edit]  [Skip]  [Send + LinkedIn]
```
- **Edit** opens a modal with the subject and body prefilled. Submitting it sends the email.
- After sending, the card updates to `✉️ Sent 18:42 by @abdullah`, and the buttons are removed.

### Disambiguation
```
Which Ali Raza?
[CTO · Finlo · Berlin]  [Engineer · Finlo Labs · Lahore]  [Create new]
```

### Missing info
The bot asks in the thread: "Which company is Sara at?" The operator's next thread reply is used as the answer.

### State machine (per capture thread)
`IDLE` → capture → `AWAITING_INFO` | `AWAITING_DISAMBIGUATION` | `AWAITING_APPROVAL` → `IDLE`. Because every capture has its own thread, multiple pending captures can coexist with no queueing. Pending approvals auto-skip after 12 hours.

---

## 9. Follow-up logic

| Hotness | Actions |
|---|---|
| HOT | Create a deal (first stage of the default pipeline) and a task for the owner. Post the draft card and send only on **Send**. Optionally send a LinkedIn invite via Unipile. Execute the graph8 workflow `debrief_hot_lead`. |
| WARM | Enroll in the event nurture sequence: day 0 thank-you referencing the conversation, day 3 value, day 7 soft CTA |
| COLD | Record only |
| Tag `talent` / `partner` | Create a task for the relevant owner. No sales follow-up |

**graph8 workflow `debrief_hot_lead`** (built via the workflow APIs at event setup):
```
trigger (API execute: contact_id, deal_id, summary)
  → Slack node: post "🔥 new hot lead" to #sales with summary
  → delay until next business morning 10:00
  → condition: meeting already booked for contact? → stop
  → voice call node: GRAPH8_VOICE_AGENT_ID, goal = book meeting, context = summary
```
If the node catalog lacks a delay or voice node, fall back to the `Scheduler` (BullMQ) plus a direct graph8 voice API call.

Every action must be idempotent per capture (check the stored ids and timestamps first).

---

## 10. `/debrief summary`

```
📊 DevSummit Berlin
Conversations: 34 · 🔥 9 · 🙂 15 · 🧊 10 · talent 5 · partners 2
Follow-ups sent: 8 · LinkedIn invites: 7
Meetings booked: 3 · Deals: 9
Top pains: flaky CI (6), onboarding speed (4), cloud cost (3)
Top capturers: @abdullah 20 · @sara 14
```
Sources: Postgres captures, graph8 deals and meetings, and the `debrief_normalize_pains` skill.

---

## 11. Project structure

```
src/
  main.ts
  app.module.ts
  config/                 # env validation (zod)
  channels/
    operator-channel.ts   # interface (post, update, ask, buttons)
    slack/                # events, interactions, commands controllers + Block Kit builders
  conversation/           # thread state machine
  capture/                # CaptureService pipeline
  integrations/
    graph8/               # client, bootstrap (fields, skills, workflow), types
    stt/                  # Transcriber interface + Whisper/Deepgram + ffmpeg util
    vision/               # Claude vision extractor
    llm/                  # LLM interface: Graph8SkillLLM + ClaudeLLM fallback
    unipile/              # optional LinkedIn client
  scheduler/              # fallback BullMQ scheduler
  summary/
  prisma/
test/
  fixtures/               # Slack event payloads, audio sample, graph8 responses
```

---

## 12. Error handling and reliability
- Ack Slack within 3 seconds. Process async with retry (max 3, exponential backoff).
- Every step updates `Capture.status`. On failure, set `FAILED` plus `error`, set a ⚠️ reaction, and post a thread message with a **[Retry]** button.
- Enrichment is async and never blocks the thread card. When it completes, edit the card to add the email or LinkedIn.
- Rate limits: respect Slack `Retry-After`; LinkedIn invites 20/day or fewer.
- Never send an email or LinkedIn invite without an explicit button click (warm nurture excepted).
- Structured logging (pino) with a `captureId` correlation id.

---

## 13. Security and compliance
- Verify the Slack signing secret on every request.
- Only process channels bound to an Event.
- Store secrets in env only. Delete raw audio after STT and store only transcripts.
- Follow-up emails include an opt-out line (graph8 settings).

---

## 14. Milestones (hackathon order)

1. **Skeleton:** NestJS, Prisma, Docker Compose, env validation, health endpoint.
2. **Slack loop:** app install, `url_verification`, receive a message, reply in the thread, dedupe.
3. **Audio → text:** download the clip, ffmpeg, STT, reply with the transcript.
4. **graph8 bootstrap:** fields, the three LLM skills, and `/debrief event` creating the list.
5. **Extraction:** `debrief_extract` via graph8 skill (Claude fallback) and zod validation; post a parsed card.
6. **graph8 writes:** resolve or create contact and company, note, list, fields.
7. **Disambiguation and missing-info** dialogs (buttons, thread replies).
8. **Hot path:** deal, task, draft card, Send/Edit/Skip, email via graph8.
9. **`/debrief summary`.**
10. **Warm nurture** sequence enrollment.
11. **Hot-lead workflow** in graph8 (Slack alert, delay, voice call).
12. **Photo input** (Claude vision) and **LinkedIn invite** (Unipile).
13. **Demo hardening:** seed data, cached fallbacks, rehearsal.

Stop after milestones 1–9 if time is short. That's the demo.

---

## 15. Testing
- **Unit:** extraction on fixture transcripts (hot, warm, cold, talent, missing company, ambiguous name); zod validation and repair path.
- **Integration:** mocked Slack and graph8 clients; a Slack event fixture leads to the expected graph8 calls and Block Kit payloads.
- **Manual E2E:** real Slack workspace and a real graph8 sandbox org.
- **Acceptance criteria:**
  - Audio clip → result card in the thread in under 20 seconds (excluding enrichment).
  - Contact, note, list membership, and custom fields are visible in graph8.
  - A hot lead gets a deal; the email is sent only after **Send**.
  - Slack retries create no duplicate records.
  - Two operators can capture simultaneously without state collisions.

---

## 16. Demo script (2 minutes)
1. In `#debrief-graph8-hackathon`, run `/debrief event Graph8 Hackathon, goal: book demos`. The bot confirms, and the list appears in graph8.
2. Talk to a judge for 20 seconds, then post a Slack audio clip: "Met Sara Klein, Head of Growth at Acme, slow follow-ups after events, wants a demo Friday."
3. The thread shows the card (🔥 Hot, pains, next step) and the draft. Click **Send**.
4. Show graph8: the contact, note, list, and deal. Show the judge's inbox. Show the `#sales` alert posted by the graph8 workflow.
5. Run `/debrief summary`.

---

## 17. Future
- A WhatsApp operator channel via Unipile, for real estate agents and GCC/PK markets, behind the same `OperatorChannel` interface.
- Event templates (`tech`, `real_estate`) with different extraction schemas and follow-up channels.
- Pre-event attendee import and ICP scoring against the graph8 ICP record.
- An event ROI view (cost → pipeline → revenue).
- Pain and objection trends across events.
