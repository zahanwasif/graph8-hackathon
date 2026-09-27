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
  /** Work email found in the message (Groq). */
  personEmail: string | null;
  personFirstName: string | null;
  personLastName: string | null;
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

/** Enriched contact fields snapshotted from graph8 when the intake run completes. */
/** Where a lead's email lookup stands. `running` = claimed by a request, not finished yet. */
export type EnrichmentStatus = 'running' | 'found' | 'not_found' | 'skipped' | 'failed';

export interface EnrichmentOutcome {
  status: EnrichmentStatus;
  /** Why it was skipped / not found / failed — shown on the lead. */
  reason: string | null;
  checkedAt: string;
}

export interface EnrichedContact {
  /** Outcome of the email lookup; absent on leads enriched before it existed. */
  enrichment?: EnrichmentOutcome;
  /** Work email — found by enrichment, or the one the lead was submitted with. */
  email?: string | null;
  linkedinUrl?: string | null;
  directPhone?: string | null;
  mobilePhone?: string | null;
  seniority?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

/** A lead in the Leads tab — an intake run with its pipeline status + cached score. */
export interface LeadListItem {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  /** Pipeline status of the intake run. */
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fitScore: number | null;
  disposition: string | null;
  error: string | null;
  /** graph8 contact's enriched fields, once the run completes. */
  enriched: EnrichedContact | null;
  createdAt: string;
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
  /** Present once graph8 provisioning succeeded; gates the "Launch event" action. */
  graph8CampaignId: string | null;
  /** Present once the workflow builder has published a cadence; Launch runs this sequence. */
  graph8SequenceId: string | null;
  /** graph8 mailbox ids chosen as this event's sending accounts (Sending tab). Empty = use all. */
  senderMailboxIds: string[];
  captureCount: number;
  captures: CaptureListItem[];
}
