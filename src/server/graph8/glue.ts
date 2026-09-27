import 'server-only';

import { graph8 } from './client';
import { extractLead, type CaptureExtraction } from './extract';

/**
 * The Graph8 glue: a small, typed facade over the graph8 SDK for the two flows
 * this app orchestrates.
 *
 *   Event provisioning — on a new event, create the audience List and cadence
 *     Campaign, and make sure the `criteria_score` custom field exists.
 *   Lead lifecycle — create the contact, (optionally) enrich, score it with the
 *     `debrief_extract` skill, write the score to the criteria field, add it to
 *     the event's list, and (explicitly) enroll it in the cadence.
 *
 * graph8 remains the source of truth for CRM data (contacts, scores, campaigns);
 * this app's DB only owns Event + Persona. Every graph8 id returned here comes
 * from a graph8 response — none are guessed.
 *
 * graph8 ids are numeric for contacts/companies/lists/fields and string for
 * campaigns/sequences. We accept/return strings at the boundary (our DB stores
 * them as strings) and coerce to Number() only at the SDK call.
 *
 * ⚠️ `enrollInCadence` sends real messages to real people and `enrichContact`
 * (the CRM variant) spends credits — callers MUST confirm with the user before
 * invoking them. `provisionEvent` / `upsertContact` / `scoreLead` /
 * `setCriteriaScore` / `addToList` are non-sending and safe to call directly.
 */

const CRITERIA_SCORE_FIELD_TITLE = 'criteria_score';

export interface ProvisionEventInput {
  /** Event name — used to title the persona, list and campaign. */
  name: string;
  /** The target-profile text: the studio persona body + the campaign's `target_persona`. */
  targetProfile?: string | null;
  /** The event goal, passed as the campaign's `goal`. */
  goal?: string | null;
}

export interface ProvisionEventResult {
  /** Studio persona id — best-effort (null if persona creation failed). */
  personaId: string | null;
  listId: string;
  campaignId: string;
}

/**
 * Create a graph8 studio persona for the event's target profile. Best-effort:
 * the scorer reads the cached target-profile text as a skill variable, not this
 * object, so a failure returns null rather than aborting provisioning.
 */
async function createStudioPersona(input: ProvisionEventInput): Promise<string | null> {
  try {
    const res = (await graph8().studio.createPersona({
      title: `${input.name} — target profile`,
      website_url: 'https://graph8.com',
      ...(input.goal ? { why_target: input.goal } : {}),
      ...(input.targetProfile ? { campaign_approach: input.targetProfile } : {}),
      source: 'debrief',
    })) as unknown as { data?: { id?: string }; id?: string };
    return res.data?.id ?? res.id ?? null;
  } catch (error) {
    console.error('provisionEvent: studio persona create failed', error);
    return null;
  }
}

export interface LeadInput {
  /** graph8 requires a work email to create a contact. */
  workEmail: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  companyDomain?: string | null;
  linkedinUrl?: string | null;
  /** Add the contact to this list on creation (skips a second addToList call). */
  listId?: string | null;
}

export interface ScoreLeadInput {
  /** The event's `graph8ExtractSkillId`. */
  skillId: string;
  text: string;
  eventName: string;
  eventGoal?: string | null;
  targetProfile?: string | null;
}

export interface ScoreLeadResult {
  ok: boolean;
  criteriaScore: number | null;
  disposition: string | null;
  extraction?: CaptureExtraction;
  raw: string | null;
  error?: string;
  executionId?: string;
}

/**
 * Provision the graph8 objects a new event needs: an audience List and a
 * cadence Campaign. Both are created (not launched) — enrollment and launch are
 * separate, confirmed steps.
 */
export async function provisionEvent(input: ProvisionEventInput): Promise<ProvisionEventResult> {
  const g8 = graph8();
  const title = `Event: ${input.name}`;

  const personaId = await createStudioPersona(input);
  const list = await g8.lists.create(title, 'contacts');
  const campaign = await g8.campaigns.create({
    name: title,
    ...(input.goal ? { goal: input.goal } : {}),
    ...(input.targetProfile ? { target_persona: input.targetProfile } : {}),
  });

  return { personaId, listId: String(list.id), campaignId: String(campaign.id) };
}

/**
 * Ensure the org-wide `criteria_score` contact field exists and return its
 * column id. Idempotent: reuses the field if it is already there.
 */
export async function ensureCriteriaScoreField(): Promise<{ fieldId: string }> {
  const g8 = graph8();
  const existing = await g8.fields.listContactFields();
  const found = existing.data.find(
    (field) => field.title === CRITERIA_SCORE_FIELD_TITLE && field.id != null,
  );
  if (found?.id != null) return { fieldId: String(found.id) };

  const created = await g8.fields.create({
    title: CRITERIA_SCORE_FIELD_TITLE,
    entity: 'contacts',
    data_type: 'text',
  });
  return { fieldId: String(created.id) };
}

/** Create a contact in graph8's CRM. Returns the new contact id (as a string). */
export async function upsertContact(lead: LeadInput): Promise<{ contactId: string }> {
  if (!lead.workEmail) {
    throw new Error('upsertContact requires a work email (graph8 keys contacts on work_email).');
  }
  const contact = await graph8().contacts.create({
    work_email: lead.workEmail,
    ...(lead.firstName ? { first_name: lead.firstName } : {}),
    ...(lead.lastName ? { last_name: lead.lastName } : {}),
    ...(lead.jobTitle ? { job_title: lead.jobTitle } : {}),
    ...(lead.companyDomain ? { company_domain: lead.companyDomain } : {}),
    ...(lead.linkedinUrl ? { linkedin_url: lead.linkedinUrl } : {}),
    ...(lead.listId ? { list_id: Number(lead.listId) } : {}),
  });
  return { contactId: String(contact.id) };
}

/**
 * Open-data enrichment lookup for a person (email or LinkedIn). This is the
 * NON-credit-spending lookup (`enrich.person`), not the CRM `g8_enrich_contacts`
 * bulk job — use this to backfill fields before scoring.
 */
export async function enrichContact(params: {
  email?: string;
  linkedinUrl?: string;
}): Promise<{ found: boolean; confidence: number; data: Record<string, unknown> }> {
  return graph8().enrich.person({
    ...(params.email ? { email: params.email } : {}),
    ...(params.linkedinUrl ? { linkedin_url: params.linkedinUrl } : {}),
  });
}

/**
 * Score a lead with the event's `debrief_extract` skill (the LLM scorer). Thin
 * semantic wrapper over `extractLead` that surfaces the fit score + disposition.
 */
export async function scoreLead(input: ScoreLeadInput): Promise<ScoreLeadResult> {
  const outcome = await extractLead(input.skillId, {
    input_text: input.text,
    event_name: input.eventName,
    event_goal: input.eventGoal ?? '',
    target_profile: input.targetProfile ?? '',
  });

  if (!outcome.ok || !outcome.extraction) {
    return {
      ok: false,
      criteriaScore: null,
      disposition: null,
      raw: outcome.raw,
      error: outcome.error,
      executionId: outcome.executionId,
    };
  }

  const { extraction } = outcome;
  const criteriaScore = typeof extraction.fitScore === 'number' ? Math.round(extraction.fitScore) : null;
  return {
    ok: true,
    criteriaScore,
    disposition: extraction.disposition,
    extraction,
    raw: outcome.raw,
    executionId: outcome.executionId,
  };
}

/** Write a lead's criteria score to the graph8 `criteria_score` contact field. */
export async function setCriteriaScore(params: {
  fieldId: string;
  contactId: string;
  score: number;
}): Promise<void> {
  await graph8().fields.setValue(Number(params.fieldId), {
    record_id: Number(params.contactId),
    value: String(params.score),
    entity: 'contacts',
  });
}

/** Add a contact to an event's audience list. */
export async function addToList(params: { listId: string; contactId: string }): Promise<void> {
  await graph8().lists.addContacts(Number(params.listId), [Number(params.contactId)]);
}

/**
 * Enroll a contact into a cadence sequence. ⚠️ This SENDS real messages — the
 * caller must confirm with the user first. The campaign's sequence id comes from
 * launching the campaign (`campaigns.launch` → `sequence_id`).
 */
export async function enrollInCadence(params: {
  sequenceId: string;
  listId: string;
  contactId: string;
}): Promise<void> {
  await graph8().sequences.add({
    sequenceId: params.sequenceId,
    contactIds: [Number(params.contactId)],
    listId: Number(params.listId),
  });
}
