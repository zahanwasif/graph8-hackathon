/**
 * Capture hashtags: a Slack message is captured only when it carries one of the workspace's
 * tags (stored lowercase, without `#`, on `SlackConnection.captureTags`). Pure functions, no I/O.
 */

export const DEFAULT_CAPTURE_TAGS = ['add-contact'];
export const MAX_CAPTURE_TAGS = 10;

const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;

/** `#Add-Contact ` → `add-contact`; `null` when it isn't a usable tag. */
export function normalizeTag(input: string): string | null {
  const tag = input.trim().replace(/^#+/, '').toLowerCase();
  return TAG_PATTERN.test(tag) ? tag : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The first tag written in message text, or `null`.
 *
 * Matches `#tag` as a whole token (so `#add-contacts` does not match `add-contact`). If the Slack
 * workspace happens to have a channel with the tag's name, Slack rewrites `#tag` to a channel
 * link — `<#C0123|tag>` — so that form counts too.
 */
export function matchTextTag(text: string | undefined, tags: string[]): string | null {
  if (!text) return null;
  for (const tag of tags) {
    const t = escapeRegExp(tag);
    const plain = new RegExp(`(^|[^\\w#-])#${t}(?![\\w-])`, 'i');
    const channelLink = new RegExp(`<#[A-Z0-9]+\\|${t}>`, 'i');
    if (plain.test(text) || channelLink.test(text)) return tag;
  }
  return null;
}

/** Lowercase, punctuation stripped, `-`/`_` as spaces, single-spaced — for phrase matching. */
function toWords(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first tag *spoken* in a transcript, or `null`. People say "hashtag add contact" (or just
 * "add contact"), and Deepgram writes words, not `#add-contact` — so compare word sequences.
 */
export function matchSpokenTag(transcript: string, tags: string[]): string | null {
  const spoken = ` ${toWords(transcript)} `;
  for (const tag of tags) {
    const phrase = toWords(tag);
    if (phrase && spoken.includes(` ${phrase} `)) return tag;
  }
  return null;
}
