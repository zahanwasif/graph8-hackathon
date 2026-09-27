import 'server-only';

import type { InputType } from '@prisma/client';

import { db } from '@/server/db';
import { extractContact } from '@/server/capture/contact';
import { rememberSlackUser, transcribeSlackFiles, type TranscribedFile } from '@/server/capture/transcribe';
import { extractLead, type CaptureExtraction } from '@/server/graph8/extract';
import {
  claimOrphanedChannelEvent,
  getConnectionRowByTeam,
  postThreadReply,
} from '@/server/slack/service';
import { DEFAULT_CAPTURE_TAGS, matchSpokenTag, matchTextTag } from '@/server/slack/tags';
import { ensureCriteriaScoreField, setCriteriaScore, upsertContact } from '@/server/graph8/glue';
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
 * `event_id`), the capture-hashtag gate, voice transcription, and the ⏳ ack live here.
 *
 * Only messages carrying one of the workspace's capture hashtags (`SlackConnection.captureTags`,
 * default `add-contact`) are captured. Text must have `#tag` written; voice/video notes are
 * transcribed with Deepgram first and match on the typed caption *or* the spoken tag
 * ("hashtag add contact"). The transcript becomes the capture's `rawText`.
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

/** Voice notes, audio recordings and video clips — anything with speech to transcribe. */
const isAudio = (file: SlackFile): boolean =>
  (file.mimetype ?? '').startsWith('audio/') ||
  (file.mimetype ?? '').startsWith('video/') ||
  AUDIO_FILETYPES.has((file.filetype ?? '').toLowerCase());

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

  // The workspace's Slack install: its capture hashtags, and the bot token to fetch voice files.
  let connection = mappedEvent.workspaceId
    ? await db().slackConnection.findUnique({ where: { workspaceId: mappedEvent.workspaceId } })
    : null;
  if (!connection) {
    // The Event's workspace has no Slack install (unassigned, or Slack was reconnected from another
    // workspace). If the team's current install watches this channel, it owns the Event now.
    connection = await getConnectionRowByTeam(teamId);
    if (connection?.channelId === channelId) {
      await claimOrphanedChannelEvent(connection.workspaceId, channelId);
    }
  }
  const tags = connection?.captureTags.length ? connection.captureTags : DEFAULT_CAPTURE_TAGS;

  const inputType = classifyInput(event);
  const caption = event.text?.trim() || null;

  // Voice: transcribe first — the tag may only be spoken. Image text still arrives later (vision).
  let transcribed: TranscribedFile[] = [];
  if (inputType === 'VOICE') {
    if (!connection) {
      console.warn(`[capture] no Slack connection for team ${teamId}; cannot fetch voice note`);
      return;
    }
    transcribed = await transcribeSlackFiles((event.files ?? []).filter(isAudio), connection);
  }
  const transcript = transcribed.map((t) => t.transcript).filter(Boolean).join('\n\n');

  const matchedTag =
    matchTextTag(event.text, tags) ?? (inputType === 'VOICE' ? matchSpokenTag(transcript, tags) : null);
  if (!matchedTag) {
    console.log('[capture] ignored (no capture hashtag)', {
      channel: channelId,
      inputType,
      tags,
      ...(inputType === 'VOICE' ? { transcript } : {}),
    });
    return;
  }

  const rawText =
    inputType === 'VOICE'
      ? transcript
      : inputType === 'TEXT' || inputType === 'LINK'
        ? (event.text ?? null)
        : null;
  const durations = transcribed.map((t) => t.durationSec).filter((d): d is number => d !== null);

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
        caption: inputType === 'VOICE' ? caption : null,
        matchedTag,
        slackFileId: transcribed[0]?.file.id ?? null,
        mediaMimeType: transcribed[0]?.file.mimetype ?? null,
        mediaDurationSec: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
        status: 'RECEIVED',
      },
    });
    captureId = capture.id;
  } catch {
    // A racing retry won the unique(slackEventId) / unique(channel,threadTs) — already handled.
    return;
  }

  console.log('[capture] captured', { captureId, channel: channelId, inputType, tag: matchedTag, text: rawText });
  if (connection) await rememberSlackUser(connection, event.user as string);

  const thread: ThreadContext = { teamId, channel: channelId, threadTs: event.ts as string };

  // Acknowledge inside this capture's own thread. Non-fatal if it fails (e.g. bot not in channel).
  await safePost(thread, '⏳ Debriefing…', captureId);

  // Contact fields (email, name, title, company) via Groq — for every capture with text, whether
  // or not the Event has a graph8 skill. Never throws.
  await enrichCaptureContact(captureId);

  // Extraction runs in the same post-response context. Text, link and (transcribed) voice
  // captures run now; images wait for vision (not yet wired) — see runExtraction.
  await runExtraction(captureId, thread);
}

/**
 * Pulls the contact out of the capture's text with Groq and stores it on the capture. Best
 * effort: a missing key or a Groq error is logged, never fatal to the capture.
 */
export async function enrichCaptureContact(captureId: string): Promise<void> {
  const capture = await db().capture.findUnique({
    where: { id: captureId },
    select: { rawText: true },
  });
  const text = capture?.rawText?.trim();
  if (!text) return; // image, or a voice note with no speech

  try {
    const contact = await extractContact(text);
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null;
    await db().capture.update({
      where: { id: captureId },
      data: {
        personEmail: contact.email,
        personFirstName: contact.firstName,
        personLastName: contact.lastName,
        personTitle: contact.jobTitle,
        personCompany: contact.company,
        personName: fullName,
      },
    });
    console.log('[capture] contact extracted', { captureId, ...contact });
  } catch (error) {
    console.error(`[capture] contact extraction failed for ${captureId}:`, (error as Error).message);
  }
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

  // Image text isn't available until vision runs (not yet wired); a silent voice note has none.
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

  // Push the lead to graph8 (best-effort) — graph8 is the source of truth for the contact + score.
  const recorded = await recordLeadInGraph8(event, extraction, fitScore, capture.personEmail);

  await db().capture.update({
    where: { id: captureId },
    data: {
      // Display cache — the graph8 contact + criteria_score field are the source of truth.
      // graph8's values win; fall back to what Groq found (enrichCaptureContact) when it has none.
      personName: extraction.person?.fullName ?? capture.personName,
      personTitle: extraction.person?.title ?? capture.personTitle,
      personCompany: extraction.person?.company ?? capture.personCompany,
      summary: extraction.summary || null,
      nextStep: extraction.nextStep ?? null,
      disposition: extraction.disposition,
      fitScore,
      graph8ContactId: recorded.contactId,
      graph8ExecutionId: outcome.executionId ?? null,
      status: recorded.status,
    },
  });

  await safePost(thread, formatResultCard(extraction, fitScore), captureId);
}

/**
 * Push an extracted lead into graph8 (best-effort): create the contact in the event's
 * audience list and mirror the fit score to the `criteria_score` field. graph8 is the
 * source of truth for the contact + score. A lead with no email can't become a graph8
 * contact, so it stays local-only (status EXTRACTED); a graph8 failure is non-fatal.
 */
async function recordLeadInGraph8(
  event: { graph8ListId: string | null },
  extraction: CaptureExtraction,
  fitScore: number | null,
  /** Work email Groq found in the message, used when graph8's extraction has none. */
  fallbackEmail: string | null = null,
): Promise<{ contactId: string | null; status: 'EXTRACTED' | 'RECORDED' }> {
  const email = extraction.person?.email ?? fallbackEmail;
  if (!email) return { contactId: null, status: 'EXTRACTED' };

  try {
    const [firstName, ...rest] = (extraction.person?.fullName ?? '').trim().split(/\s+/);
    const { contactId } = await upsertContact({
      workEmail: email,
      firstName: firstName || null,
      lastName: rest.length ? rest.join(' ') : null,
      jobTitle: extraction.person?.title ?? null,
      linkedinUrl: extraction.person?.linkedinUrl ?? null,
      listId: event.graph8ListId,
    });

    if (fitScore != null) {
      const { fieldId } = await ensureCriteriaScoreField();
      await setCriteriaScore({ fieldId, contactId, score: fitScore });
    }

    return { contactId, status: 'RECORDED' };
  } catch (error) {
    console.error('capture: graph8 lead record failed', error);
    return { contactId: null, status: 'EXTRACTED' };
  }
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
