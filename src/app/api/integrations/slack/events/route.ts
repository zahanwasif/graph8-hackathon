import { NextResponse, type NextRequest } from 'next/server';

import {
  handleMessageEvent,
  verifySlackSignature,
  type SlackEventEnvelope,
  type SlackMessageEvent,
} from '@/server/slack/events';

/**
 * Slack Events API request URL. Configure it in the Slack app under Event Subscriptions as
 * `<NEXT_PUBLIC_APP_URL>/api/integrations/slack/events`.
 *
 * Called by Slack, not a signed-in user, so there is no Clerk session: the Slack signature is
 * the authentication. Slack expects a 2xx within 3 seconds or it retries.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let verified: boolean;
  try {
    verified = verifySlackSignature(
      rawBody,
      request.headers.get('x-slack-request-timestamp'),
      request.headers.get('x-slack-signature'),
    );
  } catch (error) {
    console.error('[slack] cannot verify event:', (error as Error).message);
    return NextResponse.json({ message: 'Slack events are not configured' }, { status: 503 });
  }
  if (!verified) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as
    | { type: 'url_verification'; challenge: string }
    | SlackEventEnvelope;

  // One-off handshake when the Request URL is saved in the Slack app settings.
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // A retry means an earlier delivery was slow or failed after we may have handled it. Logging
  // twice is harmless, but acknowledge without reprocessing so handlers needn't be idempotent.
  if (request.headers.get('x-slack-retry-num')) {
    return new Response(null, { status: 200 });
  }

  if (payload.type === 'event_callback' && payload.event.type === 'message') {
    try {
      await handleMessageEvent(payload.team_id, payload.event as SlackMessageEvent);
    } catch (error) {
      // Still 200: a retry won't fix a bug on our side, it would just repeat it.
      console.error('[slack] failed to handle message event', payload.event_id, error);
    }
  }

  return new Response(null, { status: 200 });
}
