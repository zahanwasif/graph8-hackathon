import 'server-only';

import { graph8 } from './client';
import { extractLead, type CaptureExtraction } from './extract';
import type { EnrichedContact, EnrichmentStatus } from '@/lib/types/capture';

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

/** graph8's contact read nests the company; the flat company_* fields are usually empty. */
type ContactRecord = Awaited<ReturnType<ReturnType<typeof graph8>['contacts']['get']>> & {
  company?: { name?: string | null; domain?: string | null } | null;
};

function toSnapshot(c: ContactRecord): EnrichedContact {
  return {
    email: c.work_email,
    linkedinUrl: c.linkedin_url,
    directPhone: c.direct_phone,
    mobilePhone: c.mobile_phone,
    seniority: c.seniority_level,
    companyName: c.company?.name ?? c.company_name,
    companyDomain: c.company?.domain ?? c.company_domain,
    city: c.city,
    state: c.state,
    country: c.country,
  };
}

/** Snapshot a graph8 contact's (enriched) standard fields for display. Best-effort → null on error. */
export async function getContactSnapshot(contactId: string): Promise<EnrichedContact | null> {
  try {
    return toSnapshot((await graph8().contacts.get(Number(contactId))) as ContactRecord);
  } catch (error) {
    console.error('getContactSnapshot failed', error);
    return null;
  }
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Find the contact's work email (+ LinkedIn, phone, location) with graph8's person lookup and
 * write what's found back to the graph8 contact. The intake workflow's own enrich_contact node
 * tries no providers for API-created workflows (`providers_tried: 0`), so the app does it here.
 *
 * The lookup needs a LinkedIn URL, or first name + last name + company domain — otherwise the
 * lead is `skipped` with the reason. ⚠️ Costs 1 graph8 credit per lookup; callers must make sure
 * it runs once per lead. Never throws — the outcome is in `enrichment`.
 */
export async function enrichContactPerson(contactId: string): Promise<EnrichedContact | null> {
  let contact: ContactRecord;
  try {
    contact = (await graph8().contacts.get(Number(contactId))) as ContactRecord;
  } catch (error) {
    console.error('enrichContactPerson: contact read failed', error);
    return null;
  }
  const snapshot = toSnapshot(contact);
  const done = (status: EnrichmentStatus, reason: string | null = null): EnrichedContact => ({
    ...snapshot,
    enrichment: { status, reason, checkedAt: new Date().toISOString() },
  });

  if (snapshot.email) return done('found');

  const firstName = str(contact.first_name);
  const lastName = str(contact.last_name);
  // Older contacts carry a company NAME in the domain slot; resolve either to a real domain.
  const domain = await resolveCompanyDomain(snapshot.companyDomain ?? snapshot.companyName);
  const linkedinUrl = snapshot.linkedinUrl ?? null;
  if (!linkedinUrl && !(firstName && lastName && domain)) {
    const missing = [
      !firstName || !lastName ? 'a full name (first + last)' : null,
      !domain ? 'a company domain' : null,
    ].filter(Boolean);
    return done('skipped', `Needs ${missing.join(' and ')} to look up an email.`);
  }

  try {
    const result = await graph8().enrich.person(
      linkedinUrl
        ? { linkedin_url: linkedinUrl }
        : { first_name: firstName!, last_name: lastName!, company_domain: domain! },
    );
    if (!result.found) return done('not_found', 'No match in graph8 for this person.');

    const d = result.data ?? {};
    const found = {
      work_email: str(d.work_email) ?? str(d.email),
      linkedin_url: str(d.linkedin_url),
      mobile_phone: str(d.mobile_phone),
      direct_phone: str(d.direct_phone) ?? str(d.phone),
      city: str(d.city),
      state: str(d.state),
      country: str(d.country),
    };
    // Only fill what the contact is missing.
    const updates = Object.fromEntries(
      Object.entries(found).filter(([key, value]) => value && !contact[key as keyof ContactRecord]),
    ) as Record<string, string>;
    if (Object.keys(updates).length) {
      try {
        await graph8().contacts.update(Number(contactId), updates);
      } catch (error) {
        console.error('enrichContactPerson: contact update failed', error);
      }
    }

    const merged: EnrichedContact = {
      ...snapshot,
      email: snapshot.email ?? found.work_email,
      linkedinUrl: snapshot.linkedinUrl ?? found.linkedin_url,
      mobilePhone: snapshot.mobilePhone ?? found.mobile_phone,
      directPhone: snapshot.directPhone ?? found.direct_phone,
      seniority: snapshot.seniority ?? str(d.seniority_level),
      companyDomain: domain ?? snapshot.companyDomain,
      city: snapshot.city ?? found.city,
      state: snapshot.state ?? found.state,
      country: snapshot.country ?? found.country,
    };
    return {
      ...merged,
      enrichment: {
        status: merged.email ? 'found' : 'not_found',
        reason: merged.email ? null : 'Person matched, but no work email is on record.',
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('enrichContactPerson: lookup failed', error);
    return done('failed', error instanceof Error ? error.message.slice(0, 200) : 'Lookup failed.');
  }
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

export interface IntakeWorkflowInput {
  eventName: string;
  eventGoal?: string | null;
  /** The persona's target-profile text, baked into the score step as `{target_profile}`. */
  targetProfile?: string | null;
  /** The event's audience list id — where scored contacts land. */
  listId: string;
  /** The `debrief_extract` LLM skill id — the scorer. */
  scoreSkillId: string;
}

/** The fields the intake form / manual "Add lead" supplies to the workflow trigger. */
export interface IntakeLead {
  email?: string;
  first_name?: string;
  last_name?: string;
  company_domain?: string;
  /** Company name as written (e.g. in the Slack note) — kept on the contact alongside the domain. */
  company_name?: string;
  job_title?: string;
  /** Pre-composed lead description for the scorer — Graph8 only interpolates single `${ref}`s,
   *  so the score node reads `${trigger.lead_text}` rather than a composite template. */
  lead_text?: string;
}

/**
 * The intake workflow's enrich step. Without `provider_sequence` graph8 tries no provider at all
 * (`providers_tried: 0`) and every field comes back empty. All four providers are graph8-funded:
 * no org keys needed, but each lookup CHARGES graph8 credits per contact. Email finders need the
 * contact's name + company domain (see `resolveCompanyDomain`).
 */
const INTAKE_ENRICH_CONFIG = {
  fields: ['CONTACT_WORK_EMAIL', 'CONTACT_LINKEDIN_URL', 'CONTACT_MOBILE_PHONE'],
  provider_sequence: ['graph8', 'prospeo', 'hunter', 'leadmagic'],
};

const DOMAIN_RE = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/i;
const normalizeCompany = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Company name → website domain, so email finders have something to search. A value that is
 * already a domain is returned as-is; otherwise graph8's open-data company search is queried by
 * name and only an exact (normalized) name match with a domain is accepted — no guessing.
 * Best-effort: null on no match or error.
 */
export async function resolveCompanyDomain(company: string | null | undefined): Promise<string | null> {
  const value = company?.trim();
  if (!value) return null;
  const asDomain = DOMAIN_RE.exec(value);
  if (asDomain) return asDomain[1].toLowerCase();

  try {
    const { data } = await graph8().search.companies({
      filters: [{ field: 'name', operator: 'contains', value: [value] }],
      limit: 10,
    });
    const wanted = normalizeCompany(value);
    const match = data.find((c) => c.domain && c.name && normalizeCompany(c.name) === wanted);
    return match?.domain?.toLowerCase() ?? null;
  } catch (error) {
    console.error('resolveCompanyDomain failed', error);
    return null;
  }
}

/** Workflow ids already brought up to date in this server process — checked once each. */
const upgradedIntakeWorkflows = new Set<string>();

/**
 * Bring an existing intake workflow up to the current enrich step (work email + provider
 * waterfall) and pass the company name to create_contact. Patches only those two nodes in place,
 * so any other edits made to the workflow in graph8 are kept. Best-effort; never throws.
 */
export async function ensureIntakeWorkflowUpToDate(workflowId: string): Promise<void> {
  if (upgradedIntakeWorkflows.has(workflowId)) return;
  try {
    const res = (await graph8().workflows.get(workflowId)) as unknown as {
      action?: { skill_config?: { nodes?: Array<{ node_type?: string; config?: Record<string, unknown> }> } };
    };
    const config = res.action?.skill_config;
    const nodes = config?.nodes ?? [];
    const enrich = nodes.find((n) => n.node_type === 'enrich_contact');
    const create = nodes.find((n) => n.node_type === 'create_contact');
    const trigger = nodes.find((n) => n.node_type === 'trigger');

    const enrichOk =
      !enrich ||
      (Array.isArray(enrich.config?.provider_sequence) &&
        (enrich.config?.fields as string[] | undefined)?.includes('CONTACT_WORK_EMAIL'));
    const createOk = !create || create.config?.company_name != null;
    if (enrichOk && createOk) {
      upgradedIntakeWorkflows.add(workflowId);
      return;
    }

    if (enrich) enrich.config = { ...enrich.config, ...INTAKE_ENRICH_CONFIG };
    if (create) create.config = { ...create.config, company_name: '${trigger.company_name}' };
    const formFields = trigger?.config?.form_fields;
    if (trigger && Array.isArray(formFields) && !formFields.includes('company_name')) {
      trigger.config = { ...trigger.config, form_fields: [...formFields, 'company_name'] };
    }

    await graph8().workflows.update(workflowId, { config: config as never });
    upgradedIntakeWorkflows.add(workflowId);
    console.log('[graph8] intake workflow upgraded (work email + provider waterfall)', { workflowId });
  } catch (error) {
    console.error(`[graph8] intake workflow ${workflowId} upgrade failed`, error);
  }
}

/** Compose the single-string lead description the score node scores against. */
export function composeLeadText(lead: {
  first_name?: string | null;
  last_name?: string | null;
  job_title?: string | null;
  company_domain?: string | null;
  email?: string | null;
}): string {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
  return `Name: ${name}. Title: ${lead.job_title ?? ''}. Company: ${lead.company_domain ?? ''}. Email: ${lead.email ?? ''}.`;
}

/**
 * Build the intake workflow graph (canonical snake_case shape, validated against
 * `g8_workflow_validate`): form submit → create contact → enrich → LLM score →
 * parse JSON → write `criteria_score` → add to the event's list.
 *
 * The event's name/goal/target-profile and list id are baked in as literals, so the
 * workflow is per-event. The scorer reads the composed lead text as `{input_text}`.
 */
function buildIntakeWorkflowConfig(input: IntakeWorkflowInput): Record<string, unknown> {
  const listId = Number(input.listId);
  return {
    metadata: {},
    settings: {},
    start_node_id: 'trigger-1',
    nodes: [
      {
        node_id: 'trigger-1',
        node_type: 'trigger',
        name: 'Form submitted',
        config: {
          trigger_type: 'new_form_submitted',
          form_fields: [
            'email',
            'first_name',
            'last_name',
            'company_domain',
            'company_name',
            'job_title',
            'lead_text',
          ],
        },
        position: { x: 0, y: 0 },
        connections: ['create_contact-1'],
      },
      {
        node_id: 'create_contact-1',
        node_type: 'create_contact',
        name: 'Create contact',
        config: {
          email: '${trigger.email}',
          first_name: '${trigger.first_name}',
          last_name: '${trigger.last_name}',
          job_title: '${trigger.job_title}',
          company_domain: '${trigger.company_domain}',
          company_name: '${trigger.company_name}',
          list_id: listId,
        },
        position: { x: 250, y: 0 },
        connections: ['enrich_contact-1'],
      },
      {
        node_id: 'enrich_contact-1',
        node_type: 'enrich_contact',
        name: 'Enrich contact',
        config: {
          contact_id: '${create_contact-1.contact_id}',
          ...INTAKE_ENRICH_CONFIG,
          input_mappings: [
            { target_field: 'contact_id', source_expression: '${create_contact-1.contact_id}' },
          ],
        },
        position: { x: 500, y: 0 },
        connections: ['score-1'],
      },
      {
        node_id: 'score-1',
        node_type: 'action',
        name: 'LLM score',
        config: {
          action_id: input.scoreSkillId,
          input_mappings: [
            // Single `${ref}` — Graph8 does not interpolate composite template strings.
            { target_field: 'input_text', source_expression: '${trigger.lead_text}' },
            { target_field: 'event_name', source_expression: input.eventName },
            { target_field: 'event_goal', source_expression: input.eventGoal ?? '' },
            { target_field: 'target_profile', source_expression: input.targetProfile ?? '' },
          ],
        },
        position: { x: 750, y: 0 },
        connections: ['parse_score-1'],
      },
      {
        // Parses the LLM score JSON so the app can read ${parse_score-1.result.fitScore} from the
        // execution output. The app writes criteria_score itself (set_record_field needs a workflow
        // owner that API-created workflows lack), so there is no set_record_field node here.
        node_id: 'parse_score-1',
        node_type: 'parse_json',
        name: 'Parse score',
        config: { input: '${score-1.result}', on_error: 'continue' },
        position: { x: 1000, y: 0 },
        connections: ['add_list-1'],
      },
      {
        node_id: 'add_list-1',
        node_type: 'add_to_list',
        name: 'Add to event list',
        config: {
          list_id: listId,
          input_mappings: [
            { target_field: 'contact_ids', source_expression: '${create_contact-1.contact_id}' },
          ],
        },
        position: { x: 1250, y: 0 },
        connections: [],
      },
    ],
    edges: [
      { id: 'edge-trigger-1-create_contact-1', source: 'trigger-1', target: 'create_contact-1' },
      { id: 'edge-create_contact-1-enrich_contact-1', source: 'create_contact-1', target: 'enrich_contact-1' },
      { id: 'edge-enrich_contact-1-score-1', source: 'enrich_contact-1', target: 'score-1' },
      { id: 'edge-score-1-parse_score-1', source: 'score-1', target: 'parse_score-1' },
      { id: 'edge-parse_score-1-add_list-1', source: 'parse_score-1', target: 'add_list-1' },
    ],
  };
}

/**
 * Create the per-event intake workflow in graph8 and return its id. Created
 * disabled (paused) — the "Add lead" button drives it via `executeIntakeWorkflow`,
 * and enabling the form trigger is a later step.
 */
export async function createIntakeWorkflow(input: IntakeWorkflowInput): Promise<string> {
  const config = buildIntakeWorkflowConfig(input);
  // The graph8 backend accepts the canonical snake_case graph (verified via
  // g8_workflow_validate); the SDK's typed WorkflowConfig differs, so pass it loosely.
  const created = (await graph8().workflows.create({
    name: `Intake: ${input.eventName}`,
    description: 'Debrief lead intake — create contact, enrich, score, add to list.',
    config: config as never,
  })) as unknown as { id?: string | number; data?: { id?: string | number } };
  // graph8 workflow ids are numeric (e.g. 695); we store them as strings.
  const id = created.id ?? created.data?.id;
  if (id == null) throw new Error('graph8 workflows.create returned no id');
  return String(id);
}

/**
 * Run the intake workflow for one lead (the "Add lead" button / a form submission).
 * The lead fields become the trigger payload (`${trigger.<field>}`). Returns the
 * execution id for status polling.
 */
function graph8Rest(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.GRAPH8_API_KEY;
  if (!apiKey) throw new Error('GRAPH8_API_KEY is not set; graph8 features are unavailable.');
  const baseUrl = (process.env.GRAPH8_API_URL ?? 'https://be.graph8.com').replace(/\/+$/, '');
  return { apiKey, baseUrl };
}

export async function executeIntakeWorkflow(
  workflowId: string,
  lead: IntakeLead,
): Promise<{ executionId: string }> {
  const { apiKey, baseUrl } = graph8Rest();

  // The graph8 executor maps `input_data` onto the workflow's ${trigger.<field>} refs. The SDK's
  // workflows.execute sends `trigger_payload` instead, which the executor ignores (the run then
  // fails at create_contact with "No contact fields provided"), so we POST the endpoint directly.
  const resp = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input_data: lead }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`graph8 workflow execute failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as {
    execution_id?: string | number;
    id?: string | number;
    data?: { execution_id?: string | number; id?: string | number };
  };
  const executionId =
    json.execution_id ?? json.data?.execution_id ?? json.id ?? json.data?.id;
  if (executionId == null) throw new Error('graph8 workflow execute returned no execution id');
  return { executionId: String(executionId) };
}

/** The subset of a workflow execution payload the intake flow reads. */
interface ExecutionPayload {
  status?: string;
  error_message?: string | null;
  output_data?: {
    status?: string;
    error?: string | null;
    node_results?: Record<string, { output?: Record<string, unknown> | null }>;
  };
}

async function getWorkflowExecution(executionId: string): Promise<ExecutionPayload> {
  const { apiKey, baseUrl } = graph8Rest();
  const resp = await fetch(`${baseUrl}/api/v1/workflows/executions/${executionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`graph8 get execution failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const json = (await resp.json()) as { data?: ExecutionPayload } & ExecutionPayload;
  return json.data ?? json;
}

export interface IntakeCheckResult {
  /** 'running' while in flight; 'completed' | 'failed' once terminal. */
  status: 'running' | 'completed' | 'failed';
  contactId: string | null;
  fitScore: number | null;
  disposition: string | null;
  error: string | null;
}

/**
 * Check an intake workflow execution ONCE (no polling). The lead pipeline runs on graph8's side
 * after `executeIntakeWorkflow`; the app finalizes each lead on read by calling this. The score is
 * read from the execution output (`parse_score-1`) so the app can write `criteria_score` itself —
 * the in-workflow set_record_field needs an owner API-created workflows don't have.
 */
export async function checkIntakeExecution(executionId: string): Promise<IntakeCheckResult> {
  const ex = await getWorkflowExecution(executionId);
  const raw = ex.status ?? ex.output_data?.status ?? 'running';
  const status = raw === 'completed' || raw === 'failed' ? raw : 'running';

  if (status === 'running') {
    return { status, contactId: null, fitScore: null, disposition: null, error: null };
  }

  const nodes = ex.output_data?.node_results ?? {};
  const contactIdRaw = nodes['create_contact-1']?.output?.contact_id as string | number | undefined;
  const parsed = nodes['parse_score-1']?.output?.result as
    | { fitScore?: unknown; disposition?: unknown }
    | undefined;
  const fitScore = typeof parsed?.fitScore === 'number' ? Math.round(parsed.fitScore) : null;
  const disposition = typeof parsed?.disposition === 'string' ? parsed.disposition : null;
  return {
    status,
    contactId: contactIdRaw == null ? null : String(contactIdRaw),
    fitScore,
    disposition,
    error: ex.error_message ?? ex.output_data?.error ?? null,
  };
}

/**
 * Launch an event's campaign in graph8 — turns the dormant campaign into a running
 * sequence and starts sending. ⚠️ Real outreach: the caller must confirm first.
 */
export async function launchCampaign(campaignId: string): Promise<{ sequenceId: string | null }> {
  const res = (await graph8().campaigns.launch(campaignId)) as unknown as {
    sequence_id?: string;
    data?: { sequence_id?: string };
  };
  return { sequenceId: res.sequence_id ?? res.data?.sequence_id ?? null };
}

/** A cadence step from the workflow builder, with any preceding "wait" nodes folded into `waitDays`. */
export interface CadenceStepInput {
  /** 'wait' nodes are folded into the next step's delay, never passed here. */
  type: 'email' | 'call' | 'sms';
  /** Step-type-specific literal content. */
  subject: string;
  content: string;
  /** Days to wait before this step runs (sum of the immediately preceding wait nodes). */
  waitDays: number;
}

/** A sending mailbox to attach to the sequence as an email channel (what it sends from). */
export interface SequenceChannelInput {
  /** graph8 mailbox id (numeric). */
  mailboxId: string;
  /** The mailbox address, used as the channel value. */
  email: string;
  /** graph8 mailbox provider; maps to the channel type (SMTP/GMAIL/INBOXKIT). */
  provider?: string | null;
}

export interface CreateSequenceInput {
  eventName: string;
  /** The sequence owner in graph8 — the signed-in user's email. */
  ownerEmail: string;
  /** Link the sequence to the event's dormant campaign. */
  campaignId: string;
  /** The event's audience list, so enrollment/launch target the right contacts. */
  listId?: string | null;
  /** End remaining steps once a lead replies (the builder's "Stop on reply" rule). */
  finishOnReply: boolean;
  steps: CadenceStepInput[];
  /**
   * Email sending channels (mailboxes) the sequence sends from. Without at least one, launching a
   * sequence with EMAIL steps fails with "no email channels configured".
   */
  channels: SequenceChannelInput[];
}

/** Map a graph8 mailbox provider to a sequence channel type. SMTP/IMAP mailboxes send over SMTP. */
function channelTypeForProvider(provider?: string | null): 'SMTP' | 'GMAIL' | 'INBOXKIT' {
  const value = (provider ?? '').toLowerCase();
  if (value.includes('gmail') || value.includes('google')) return 'GMAIL';
  if (value.includes('inboxkit')) return 'INBOXKIT';
  return 'SMTP';
}

/** builder node type → graph8 `SequenceStepType`. Calls run as manual dialer tasks. */
const STEP_TYPE: Record<CadenceStepInput['type'], 'EMAIL' | 'SMS' | 'PHONE'> = {
  email: 'EMAIL',
  sms: 'SMS',
  call: 'PHONE',
};

/** Shape a builder step's literal content into graph8's `step_data` for its channel. */
function stepData(step: CadenceStepInput): Record<string, unknown> {
  switch (step.type) {
    case 'email':
      return { subject: step.subject, body: step.content };
    case 'sms':
      return { message_body: step.content };
    case 'call':
      return { instructions: step.content };
  }
}

/**
 * Create a DRAFTED graph8 sequence from the workflow builder's cadence — linked to the
 * event's campaign and audience list. Nothing is sent: `sequences.create` drafts the
 * sequence; `runSequence` (from the confirmed Launch step) starts the outreach.
 *
 * Wait nodes are not steps in graph8 — each step carries the delay before it runs as
 * `time_interval` (seconds), so the caller folds preceding waits into `waitDays`. Steps
 * use `MANUAL_TEMPLATE` since the builder supplies literal subject/body/instructions.
 */
export async function createEventSequence(
  input: CreateSequenceInput,
): Promise<{ sequenceId: string }> {
  const steps = input.steps.map((step, index) => ({
    step_order: index + 1,
    step_type: STEP_TYPE[step.type],
    input_type: 'MANUAL_TEMPLATE' as const,
    time_interval: Math.round(step.waitDays) * 86_400,
    step_data: stepData(step),
  }));

  const channels = input.channels.map((channel) => ({
    channel_id: Number(channel.mailboxId),
    channel_value: channel.email,
    channel_type: channelTypeForProvider(channel.provider),
  }));

  const created = (await graph8().sequences.create({
    name: `Event follow-up: ${input.eventName}`,
    user_email: input.ownerEmail,
    finish_on_reply: input.finishOnReply,
    campaign_id: input.campaignId,
    ...(input.listId ? { associated_list_id: Number(input.listId) } : {}),
    steps,
    ...(channels.length ? { channels } : {}),
  })) as unknown as { id?: string | number; data?: { id?: string | number } };

  const id = created.id ?? created.data?.id;
  if (id == null) throw new Error('graph8 sequences.create returned no id');
  return { sequenceId: String(id) };
}

/**
 * Run a DRAFTED sequence — starts real outreach. ⚠️ The caller must confirm first.
 * Used by the event launch step once the builder has published a sequence.
 */
export async function runSequence(sequenceId: string): Promise<void> {
  await graph8().sequences.run(sequenceId);
}

/**
 * A connected sending mailbox, trimmed to the fields the UI shows. graph8 is the source of truth;
 * SMTP/IMAP passwords are write-only and never returned, so they never appear here.
 */
export interface MailboxSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  provider: string | null;
  connectionStatus: string | null;
  dailyLimit: number | null;
  createdAt: string | null;
}

/** SMTP/IMAP mailbox connection details. Google/Microsoft mailboxes need OAuth and aren't connectable here. */
export interface ConnectMailboxInput {
  email: string;
  displayName?: string | null;
  smtpAddress: string;
  smtpPort?: number | null;
  smtpUsername: string;
  smtpPassword: string;
  imapAddress: string;
  imapPort?: number | null;
  imapUsername: string;
  imapPassword: string;
  dailyLimit?: number | null;
}

/** graph8's mailbox list row (duck-typed — we only read the fields we surface). */
interface RawMailbox {
  id: string | number;
  email?: string | null;
  display_name?: string | null;
  provider?: string | null;
  connection_status?: string | null;
  daily_limit?: number | null;
  created_at?: string | null;
}

/**
 * List the graph8 org's connected sending mailboxes. Mailboxes are org-wide in graph8 (one org
 * per deployment — see `client.ts`), so this is not workspace-scoped; the route enforces access.
 */
export async function listMailboxes(): Promise<MailboxSummary[]> {
  const res = (await graph8().mailboxes.list({ include_archived: false })) as unknown as
    | RawMailbox[]
    | { data?: RawMailbox[]; mailboxes?: RawMailbox[]; items?: RawMailbox[] };
  const rows = Array.isArray(res) ? res : (res.data ?? res.mailboxes ?? res.items ?? []);
  return rows.map((m) => ({
    id: String(m.id),
    email: m.email ?? null,
    displayName: m.display_name ?? null,
    provider: m.provider ?? null,
    connectionStatus: m.connection_status ?? null,
    dailyLimit: m.daily_limit ?? null,
    createdAt: m.created_at ?? null,
  }));
}

/**
 * Connect an SMTP/IMAP sending mailbox in graph8. This is what a launched sequence sends from —
 * without at least one email channel, `runSequence` fails with "no email channels configured".
 * Passwords are forwarded straight to graph8 and never stored in this app's DB.
 */
export async function createMailbox(input: ConnectMailboxInput): Promise<{ id: string }> {
  const created = (await graph8().mailboxes.create({
    email: input.email,
    smtp_address: input.smtpAddress,
    smtp_username: input.smtpUsername,
    smtp_password: input.smtpPassword,
    imap_address: input.imapAddress,
    imap_username: input.imapUsername,
    imap_password: input.imapPassword,
    ...(input.displayName ? { display_name: input.displayName } : {}),
    ...(input.smtpPort ? { smtp_port: input.smtpPort } : {}),
    ...(input.imapPort ? { imap_port: input.imapPort } : {}),
    ...(input.dailyLimit ? { daily_limit: input.dailyLimit } : {}),
  })) as unknown as { id?: string | number; data?: { id?: string | number } };
  const id = created.id ?? created.data?.id;
  if (id == null) throw new Error('graph8 mailboxes.create returned no id');
  return { id: String(id) };
}

/** Disconnect (delete) a sending mailbox in graph8. Mailbox ids are numeric; we store them as strings. */
export async function deleteMailbox(mailboxId: string): Promise<void> {
  await graph8().mailboxes.delete(Number(mailboxId));
}
