/** The person a captured message is about, extracted by Groq. Every field may be missing. */
export interface MessageContact {
  /** Work email only — personal mailboxes are dropped. */
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
}

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
  contact: MessageContact;
  createdAt: string;
}
