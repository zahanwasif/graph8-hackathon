import { after, NextResponse } from 'next/server';

import { ingestSlackEvent } from '@/server/capture/service';
import { verifySlackSignature, type SlackEventEnvelope } from '@/server/slack/events';

/**
 * The Slack Events API endpoint (one app-wide URL; set it as the Request URL in the Slack app).
 *
 * Slack requires a response within 3 seconds and retries on timeout, so we verify the signature,
 * ack immediately, and do the actual work in `after()` once the response is on the wire. Dedupe
 * on `event_id` in the pipeline makes the retries harmless.
 */

// Downloading + transcribing voice notes (Deepgram) and graph8 extraction run in `after()`,
// which gets the route's max duration.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const rawBody = await request.text();

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET is not set; cannot verify Slack events.');
    return new NextResponse('Slack events not configured', { status: 503 });
  }

  const valid = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    signingSecret,
  });
  if (!valid) return new NextResponse('Invalid signature', { status: 401 });

  // One-time handshake when you save the Request URL in the Slack app.
  if (envelope.type === 'url_verification') {
    return NextResponse.json({ challenge: envelope.challenge });
  }

  if (envelope.type === 'event_callback') {
    after(async () => {
      try {
        await ingestSlackEvent(envelope);
      } catch (error) {
        console.error('capture ingest failed', error);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
