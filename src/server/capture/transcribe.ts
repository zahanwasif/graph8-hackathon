import 'server-only';

import type { SlackConnection as SlackConnectionRow } from '@prisma/client';

import { db } from '@/server/db';
import { decryptSecret } from '@/server/crypto/secret-box';
import { clientFor } from '@/server/slack/service';
import type { SlackFile } from '@/server/slack/events';
import { transcribe } from '@/server/transcription/deepgram';

/** Voice/video note input for the capture pipeline: Slack file → Deepgram → one string. */

export interface TranscribedFile {
  file: SlackFile;
  transcript: string;
  durationSec: number | null;
}

/** Deepgram needs a real media type; Slack sometimes only gives the file extension. */
function mimeTypeOf(file: SlackFile): string {
  if (file.mimetype) return file.mimetype;
  const ext = (file.filetype ?? '').toLowerCase();
  return ext === 'mp4' ? 'video/mp4' : `audio/${ext || 'webm'}`;
}

/**
 * Downloads a Slack file with the bot token. Without `files:read` Slack answers with its HTML
 * sign-in page rather than an error status, so check the content type too.
 */
async function downloadSlackFile(file: SlackFile, accessToken: string): Promise<ArrayBuffer> {
  if (!file.url_private_download) throw new Error(`Slack file ${file.id} has no download URL yet`);

  const token = decryptSecret(accessToken, process.env.CREDENTIALS_ENCRYPTION_KEY);
  const response = await fetch(file.url_private_download, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(
      `Could not download Slack file ${file.id} (${response.status}). Is the files:read scope granted? Reconnect Slack.`,
    );
  }
  return response.arrayBuffer();
}

/** Transcribes each file in order. One string per file; callers join them. */
export async function transcribeSlackFiles(
  files: SlackFile[],
  connection: Pick<SlackConnectionRow, 'accessToken'>,
): Promise<TranscribedFile[]> {
  const results: TranscribedFile[] = [];
  for (const file of files) {
    const audio = await downloadSlackFile(file, connection.accessToken);
    const { transcript, durationSec } = await transcribe(audio, mimeTypeOf(file));
    results.push({ file, transcript, durationSec });
  }
  return results;
}

/** Best-effort display name for captures, cached on `OperatorMap`. Needs `users:read`. */
export async function rememberSlackUser(
  connection: Pick<SlackConnectionRow, 'accessToken'>,
  slackUserId: string,
): Promise<void> {
  try {
    const { user } = await clientFor(connection).users.info({ user: slackUserId });
    const displayName =
      user?.profile?.display_name || user?.profile?.real_name || user?.real_name || user?.name;
    if (!displayName) return;
    await db().operatorMap.upsert({
      where: { slackUserId },
      create: { slackUserId, displayName },
      update: { displayName },
    });
  } catch (error) {
    // Missing `users:read` or a transient Slack error — views fall back to the user id.
    console.warn('[capture] could not look up Slack user', slackUserId, (error as Error).message);
  }
}
