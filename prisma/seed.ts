/**
 * Seed: the "SWE Lead" event, wired to the real graph8 objects created during the
 * prototype (org "Hackathon abdullah liaqat9010" / org_c6caca77d387).
 *
 * These ids are live in graph8:
 *   - Persona (target profile):     ff8699b2-7eef-47d6-aa22-0bae41f877c7
 *   - Skill debrief_extract:        8247806d-8d66-4e47-97c5-8a34d97fccc5
 *   - Skill debrief_draft_followup: 02289930-dca8-4b49-ab40-27a4f9efbc00
 *   - Sample extract execution:     ae081281-487e-49e6-b247-9371afbb51c6
 *
 * Run: `npm run db:seed`. Idempotent — safe to run repeatedly (upserts on unique keys).
 *
 * Instantiates PrismaClient the same way as src/server/db.ts (driver adapter), since the
 * schema datasource has no inline url. Local Postgres → PrismaPg over TCP.
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

config({ path: ['.env.local', '.env'], quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed (set it in .env or .env.local).');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Placeholder Slack channel — no real channel is bound yet. `/debrief event` will
// rebind a real channel id to this event later.
const SLACK_CHANNEL_ID = 'C-SEED-SWE-LEAD';
const OPERATOR_SLACK_ID = 'U-SEED-OPERATOR';

// The exact target-profile text fed to debrief_extract as {target_profile}.
const TARGET_PROFILE =
  '6+ yrs software engineering; backend/distributed systems depth; system design & ' +
  'architecture ownership; tech lead / team leadership; shipped production at scale; ' +
  'open to new roles. Must-have: senior+ and leadership signal.';

// Verbatim structured output from the debrief_extract run on the Maya Chen note.
const MAYA_EXTRACTION = {
  person: {
    fullName: 'Maya Chen',
    title: 'Senior Backend Engineer',
    company: 'Stripe',
    email: 'maya.chen@example.com',
    linkedinUrl: null,
  },
  signals: {
    skills: ['Go', 'Rust', 'distributed systems', 'backend engineering', 'payments systems', 'system architecture'],
    seniority: 'Senior',
    yearsExperience: 9,
    highlights: [
      'Led payments ledger rewrite at Stripe — production-scale distributed systems',
      'Mentors and leads a team of five engineers',
      'Deep backend depth in Go and Rust',
      'Explicitly open to a founding-engineer type role',
    ],
    availability: 'Open to new roles; requested a follow-up conversation next week',
  },
  summary:
    'Maya Chen is a senior backend engineer at Stripe with 9 years of experience and a strong ' +
    'distributed systems background. She owned Stripe’s payments ledger rewrite (Go and Rust) and ' +
    'mentors a team of five. She is interested in a founding-engineer role and asked to connect next week.',
  fitScore: 94,
  disposition: 'STRONG_FIT',
  dispositionReason:
    'Exceeds the 6+ year threshold (9 yrs), distributed-systems and architecture ownership at scale, ' +
    'clear leadership signal (team of five), and an explicit next step.',
  nextStep: 'Email maya.chen@example.com to schedule the follow-up she requested next week. Prioritize.',
  missing: ['linkedinUrl'],
};

async function main() {
  // Operator mapping (Slack → graph8 owner; Clerk link filled in when they sign in on the web).
  await prisma.operatorMap.upsert({
    where: { slackUserId: OPERATOR_SLACK_ID },
    update: {},
    create: {
      slackUserId: OPERATOR_SLACK_ID,
      displayName: 'Seed Operator',
      signature: '— Sent via Debrief',
    },
  });

  // The SWE-lead event, pointing at the live graph8 objects.
  const event = await prisma.event.upsert({
    where: { slackChannelId: SLACK_CHANNEL_ID },
    update: {
      name: 'graph8 Hackathon — SWE Lead Hunt',
      goal: 'Find the best software engineering lead to hire for graph8',
      targetProfile: TARGET_PROFILE,
      graph8PersonaId: 'ff8699b2-7eef-47d6-aa22-0bae41f877c7',
      graph8ExtractSkillId: '8247806d-8d66-4e47-97c5-8a34d97fccc5',
      graph8DraftSkillId: '02289930-dca8-4b49-ab40-27a4f9efbc00',
      isActive: true,
    },
    create: {
      name: 'graph8 Hackathon — SWE Lead Hunt',
      goal: 'Find the best software engineering lead to hire for graph8',
      slackChannelId: SLACK_CHANNEL_ID,
      targetProfile: TARGET_PROFILE,
      graph8PersonaId: 'ff8699b2-7eef-47d6-aa22-0bae41f877c7',
      graph8ExtractSkillId: '8247806d-8d66-4e47-97c5-8a34d97fccc5',
      graph8DraftSkillId: '02289930-dca8-4b49-ab40-27a4f9efbc00',
      // list / pipeline / sequence / hot-workflow: authored later, left null for now.
    },
  });

  // A demo capture: the real STRONG_FIT extraction run from the prototype.
  await prisma.capture.upsert({
    where: { slackEventId: 'seed-maya-strong-fit' },
    update: {
      extraction: MAYA_EXTRACTION,
      disposition: MAYA_EXTRACTION.disposition,
      fitScore: MAYA_EXTRACTION.fitScore,
      status: 'EXTRACTED',
    },
    create: {
      eventId: event.id,
      slackChannelId: SLACK_CHANNEL_ID,
      slackThreadTs: 'seed-thread-maya',
      slackUserId: OPERATOR_SLACK_ID,
      slackEventId: 'seed-maya-strong-fit',
      inputType: 'VOICE',
      rawText:
        'Met Maya Chen, senior backend engineer at Stripe, around 9 years experience. She led ' +
        'their payments ledger rewrite - heavy distributed systems, Go and Rust. Mentors a team of ' +
        'five. Said she is open to a founding-engineer type role and wants to chat next week. Her ' +
        'email is maya.chen@example.com.',
      extraction: MAYA_EXTRACTION,
      status: 'EXTRACTED',
      disposition: MAYA_EXTRACTION.disposition,
      fitScore: MAYA_EXTRACTION.fitScore,
      graph8ExecutionId: 'ae081281-487e-49e6-b247-9371afbb51c6',
    },
  });

  console.log(`Seeded event "${event.name}" (${event.id}) with 1 demo capture and 1 operator.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
