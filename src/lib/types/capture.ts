/** A captured lead, flattened for the Captures screen. The API derives the person fields from
 * the stored graph8 extraction JSON so the client doesn't have to know that shape. */
export interface CaptureListItem {
  id: string;
  inputType: 'VOICE' | 'TEXT' | 'IMAGE' | 'LINK';
  status: string;
  /** Free-text disposition returned by graph8 (e.g. STRONG_FIT / MAYBE / PASS). */
  disposition: string | null;
  fitScore: number | null;
  personName: string | null;
  personTitle: string | null;
  personCompany: string | null;
  summary: string | null;
  nextStep: string | null;
  rawText: string | null;
  error: string | null;
  slackChannelId: string;
  slackThreadTs: string;
  createdAt: string;
}

/** An event row for the Events list (no captures, just a count). */
export interface EventListItem {
  id: string;
  name: string;
  goal: string | null;
  slackChannelId: string;
  isActive: boolean;
  workspaceId: string | null;
  captureCount: number;
}

/** An event with its captures, for the event detail page. */
export interface EventWithCaptures {
  id: string;
  name: string;
  goal: string | null;
  slackChannelId: string;
  isActive: boolean;
  /** Owning workspace (Clerk org id); null for seeded/unassigned events. */
  workspaceId: string | null;
  captureCount: number;
  captures: CaptureListItem[];
}
