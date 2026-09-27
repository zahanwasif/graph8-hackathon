import 'server-only';

import type { InputType, Prisma } from '@prisma/client';

import { db } from '@/server/db';
import { extractLead, type CaptureExtraction } from '@/server/graph8/extract';
import { postThreadReply } from '@/server/slack/service';
import type { SlackEventEnvelope, SlackFile, SlackMessageEvent } from '@/server/slack/events';

/** Where a thread reply goes. The Events API is keyed by team, not our workspace. */
interface ThreadContext {
  teamId: string;
  channel: string;
  threadTs: string;
}

/**
 * Capture pipeline — ingestion stage.
 *
 * Turns a Slack message in a mapped event channel into a `Capture` row and acknowledges it in
 * its own thread. Routing (find the Event by channel), dedupe (Slack retries the same
 * `event_id`), and the ⏳ ack live here.
 *
 * The next stage — normalize input (STT/vision) → run graph8 `debrief_extract` → record in
 * graph8 → route by disposition — hangs off `runExtraction` once a runtime graph8 client
 * exists. See the TODO at the bottom.
 */

/** Subtypes that are never a capture: the bot's own posts, edits, deletes, joins, etc. */
const IGNORED_SUBTYPES = new Set([
  'bot_message',
  'message_changed',
  'message_deleted',
  'channel_join',
  'channel_leave',
  'channel_topic',
  'channel_purpose',
  'thread_broadcast',
]);

const AUDIO_FILETYPES = new Set(['m4a', 'mp3', 'mp4', 'webm', 'wav', 'ogg', 'aac', 'flac']);

const isAudio = (file: SlackFile): boolean =>
  (file.mimetype ?? '').startsWith('audio/') || AUDIO_FILETYPES.has((file.filetype ?? '').toLowerCase());

const isImage = (file: SlackFile): boolean => (file.mimetype ?? '').startsWith('image/');

const LINKEDIN_RE = /https?:\/\/(?:[a-z]+\.)?linkedin\.com\//i;

function classifyInput(event: SlackMessageEvent): InputType {
  const files = event.files ?? [];
  if (files.some(isAudio)) return 'VOICE';
  if (files.some(isImage)) return 'IMAGE';
  if (event.text && LINKEDIN_RE.test(event.text)) return 'LINK';
  return 'TEXT';
}

/** A top-level message we should capture — not a reply, an edit, or a bot post. */
function isCaptureRoot(event: SlackMessageEvent): boolean {
  if (event.type !== 'message') return false;
  if (event.bot_id) return false;
  if (event.subtype && IGNORED_SUBTYPES.has(event.subtype)) return false; // 'file_share' is allowed
  if (!event.channel || !event.ts || !event.user) return false;
  if (event.thread_ts && event.thread_ts !== event.ts) return false; // a reply, not a root
  return true;
}

/**
 * Ingest one `event_callback`. Safe to call for any event — it filters down to capture roots in
 * mapped channels and no-ops otherwise. Idempotent across Slack retries.
 */
export async function ingestSlackEvent(envelope: SlackEventEnvelope): Promise<void> {
  const event = envelope.event;
  const teamId = envelope.team_id;
  const slackEventId = envelope.event_id;
  if (!event || !teamId || !slackEventId) return;
  if (!isCaptureRoot(event)) return;

  const channelId = event.channel as string;

  // Only channels bound to an Event are processed.
  const mappedEvent = await db().event.findUnique({ where: { slackChannelId: channelId } });
  if (!mappedEvent || !mappedEvent.isActive) return;

  // Dedupe on Slack's event_id (retries reuse it, flagged by X-Slack-Retry-Num).
  const existing = await db().capture.findUnique({ where: { slackEventId } });
  if (existing) return;

  const inputType = classifyInput(event);
  // Voice/image text arrives later from STT/vision; store raw text only for text/link now.
  const rawText = inputType === 'TEXT' || inputType === 'LINK' ? (event.text ?? null) : null;

  let captureId: string;
  try {
    const capture = await db().capture.create({
      data: {
        eventId: mappedEvent.id,
        slackChannelId: channelId,
        slackThreadTs: event.ts as string,
        slackUserId: event.user as string,
        slackEventId,
        inputType,
        rawText,
        status: 'RECEIVED',
      },
    });
    captureId = capture.id;
  } catch {
    // A racing retry won the unique(slackEventId) / unique(channel,threadTs) — already handled.
    return;
  }

  const thread: ThreadContext = { teamId, channel: channelId, threadTs: event.ts as string };

  // Acknowledge inside this capture's own thread. Non-fatal if it fails (e.g. bot not in channel).
  await safePost(thread, '⏳ Debriefing…', captureId);

  // Extraction runs in the same post-response context. Text/link captures run now; voice/image
  // wait for STT/vision (not yet wired) — see runExtraction.
  await runExtraction(captureId, thread);
}

/**
 * Extraction stage: run graph8 `debrief_extract` on the capture's text, persist the structured
 * result + disposition + fit score, and post the outcome to the thread.
 *
 * Still to come (next stage): normalize voice/image via STT/vision, record the contact/company/
 * note in graph8, and route by disposition (deal/task/draft for a strong fit; nurture otherwise).
 */
export async function runExtraction(captureId: string, thread: ThreadContext): Promise<void> {
  const capture = await db().capture.findUnique({ where: { id: captureId }, include: { event: true } });
  if (!capture) return;
  const { event } = capture;

  const skillId = event.graph8ExtractSkillId;
  if (!skillId) {
    console.warn(`capture ${captureId}: event ${event.id} has no graph8ExtractSkillId; skipping extraction`);
    return;
  }

  // Voice/image text isn't available until STT/vision runs (not yet wired).
  if (!capture.rawText) {
    console.info(`capture ${captureId}: ${capture.inputType} needs transcription before extraction`);
    return;
  }

  const outcome = await extractLead(skillId, {
    input_text: capture.rawText,
    event_name: event.name,
    event_goal: event.goal ?? '',
    target_profile: event.targetProfile ?? '',
  });

  if (!outcome.ok || !outcome.extraction) {
    await db().capture.update({
      where: { id: captureId },
      data: {
        status: 'FAILED',
        error: outcome.error ?? 'extraction failed',
        graph8ExecutionId: outcome.executionId ?? null,
      },
    });
    await safePost(thread, `⚠️ Couldn't read that one: ${outcome.error ?? 'extraction failed'}`, captureId);
    return;
  }

  const extraction = outcome.extraction;
  const fitScore = typeof extraction.fitScore === 'number' ? Math.round(extraction.fitScore) : null;

  await db().capture.update({
    where: { id: captureId },
    data: {
      extraction: outcome.json as Prisma.InputJsonValue,
      disposition: extraction.disposition,
      fitScore,
      status: 'EXTRACTED',
      graph8ExecutionId: outcome.executionId ?? null,
    },
  });

  await safePost(thread, formatResultCard(extraction, fitScore), captureId);
}

/** A short Block-Kit-free result summary for the thread. */
function formatResultCard(extraction: CaptureExtraction, fitScore: number | null): string {
  const name = extraction.person?.fullName ?? 'Unknown contact';
  const who = [extraction.person?.title, extraction.person?.company].filter(Boolean).join(' @ ');
  const scoreSuffix = fitScore != null ? ` (${fitScore})` : '';
  const lines = [`✅ ${name}${who ? ` · ${who}` : ''} · ${extraction.disposition}${scoreSuffix}`];

  const skills = extraction.signals?.skills ?? [];
  if (skills.length) lines.push(`Skills: ${skills.slice(0, 5).join(', ')}`);
  if (extraction.nextStep) lines.push(`Next: ${extraction.nextStep}`);
  if (extraction.summary) lines.push(extraction.summary);
  return lines.join('\n');
}

/** Post a thread reply, swallowing Slack errors (a failed post must not fail the capture). */
async function safePost(thread: ThreadContext, text: string, captureId: string): Promise<void> {
  try {
    await postThreadReply({ teamId: thread.teamId, channel: thread.channel, threadTs: thread.threadTs, text });
  } catch (error) {
    console.error(`capture ${captureId}: failed to post thread message`, error);
  }
}
