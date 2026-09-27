import 'server-only';

import { z } from 'zod';

import { chatJson } from '@/server/llm/xai';

/**
 * Contact extraction: a captured message (typed text or a voice-note transcript) → the person it
 * describes. Runs on every capture with text, independent of the graph8 extract skill.
 */

export interface ExtractedContact {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
}

const nullableString = { type: ['string', 'null'] };

const CONTACT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    email: nullableString,
    firstName: nullableString,
    lastName: nullableString,
    jobTitle: nullableString,
    company: nullableString,
  },
  required: ['email', 'firstName', 'lastName', 'jobTitle', 'company'],
  additionalProperties: false,
};

const contactSchema = z.object({
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  company: z.string().nullable(),
});

const SYSTEM_PROMPT = `You extract contact details from a short note a salesperson or recruiter posted after meeting someone. The note may be a typed Slack message or a speech-to-text transcript of a voice note, so expect filler words, spelled-out emails ("jane dot doe at acme dot com"), and transcription errors.

Extract the person the note is ABOUT — the contact they met — not the author of the note. If the author only introduces themselves (e.g. "my name is ..."), treat them as the contact.

Return:
- email: their WORK email address. Rebuild spoken emails into normal form. Return null for personal addresses (gmail, yahoo, outlook, hotmail, icloud, proton, etc.) or if none is stated.
- firstName / lastName: split the full name. Use null for any part not stated.
- jobTitle: their role as stated (e.g. "VP of Sales"). Null if not stated.
- company: the organisation they work for. Null if not stated.

Never guess or invent values. Ignore hashtags such as #add-contact.`;

/** Personal mailbox providers — not a work email, whatever the model says. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'mail.com',
  'zoho.com',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;

/** Lowercased work email, or null if it's malformed or a personal mailbox. */
function toWorkEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  const domain = email.split('@')[1];
  if (FREE_MAIL_DOMAINS.has(domain) || [...FREE_MAIL_DOMAINS].some((d) => domain.endsWith(`.${d}`))) {
    return null;
  }
  return email;
}

const clean = (value: string | null) => value?.trim() || null;

/** Asks Grok for the contact in `text`. Throws on API/config errors — callers decide how to degrade. */
export async function extractContact(text: string): Promise<ExtractedContact> {
  const raw = await chatJson({
    system: SYSTEM_PROMPT,
    user: text,
    schemaName: 'contact',
    jsonSchema: CONTACT_JSON_SCHEMA,
    zodSchema: contactSchema,
  });

  return {
    email: toWorkEmail(raw.email),
    firstName: clean(raw.firstName),
    lastName: clean(raw.lastName),
    jobTitle: clean(raw.jobTitle),
    company: clean(raw.company),
  };
}
