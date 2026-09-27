import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { appBaseUrl, getSlackConfig, verifyState } from '@/server/slack/oauth';
import { completeInstall } from '@/server/slack/service';

/**
 * Where Slack sends the browser after the consent screen.
 *
 * The signed `state` is what authenticates it (Slack, not our UI, sends the browser here), and
 * it also checks that the signed-in user is the admin who started the install, so a leaked
 * install link can't attach someone else's Slack to the workspace. It always redirects back to the integrations
 * page with `?connected=1|0&reason=…`; the page owns the copy for each reason.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const done = (connected: boolean, reason?: string) => {
    // Back to the configured public URL, not the request origin: behind a tunnel (ngrok) the
    // origin reads as `https://localhost:3000` — HTTPS to a plain-HTTP server. See `appBaseUrl`.
    const url = new URL('/integrations', appBaseUrl(request.nextUrl.origin));
    url.searchParams.set('connected', connected ? '1' : '0');
    if (reason) url.searchParams.set('reason', reason);
    return NextResponse.redirect(url);
  };

  const slackError = params.get('error');
  if (slackError) return done(false, slackError === 'access_denied' ? 'cancelled' : 'denied');

  let config;
  try {
    config = getSlackConfig(request.nextUrl.origin);
  } catch {
    return done(false, 'not_configured');
  }

  const state = verifyState(params.get('state'), config.clientSecret);
  const { userId } = await auth();
  if (!state || state.userId !== userId) return done(false, 'invalid_state');

  const code = params.get('code');
  if (!code) return done(false, 'missing_code');

  try {
    await completeInstall({ ...state, code, ...config });
  } catch (error) {
    console.error('Slack install failed', error);
    return done(false, 'exchange_failed');
  }
  return done(true);
}
