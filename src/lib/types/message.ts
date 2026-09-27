/** A Slack message captured by a hashtag — typed text, or a transcribed voice/video note. */
export interface CapturedMessage {
  id: string;
  inputType: 'VOICE' | 'TEXT' | 'IMAGE' | 'LINK';
  /** The message text, or the voice note's transcript (one string per note). */
  content: string;
  /** Text typed alongside a voice note, if any. */
  caption: string | null;
  matchedTag: string | null;
  slackUserId: string;
  authorName: string | null;
  channelName: string;
  status: string;
  mediaDurationSec: number | null;
  createdAt: string;
}
