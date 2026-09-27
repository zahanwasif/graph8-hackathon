import 'server-only';

import type { Lead, Prisma } from '@prisma/client';

import { db } from '@/server/db';
import {
  checkIntakeExecution,
  enrichContactPerson,
  ensureCriteriaScoreField,
  setCriteriaScore,
} from '@/server/graph8/glue';
import { notFound } from '@/server/http';
import type { EnrichedContact, LeadListItem } from '@/lib/types/capture';

/** Match events for this workspace, plus seeded/unassigned ones. Mirrors `capture/read.ts`. */
const scope = (workspaceId: string) => ({ OR: [{ workspaceId }, { workspaceId: null }] });

/**
 * The Leads tab. Leads are local rows tracking each intake run's pipeline status (graph8's list
 * only holds finished contacts, so processing/failed states have no graph8 home). graph8 stays the
 * source of truth for the contact + criteria_score; this row caches the person + score for display.
 * Any still-PROCESSING lead is finalized here by checking its graph8 execution once.
 */
export async function listEventLeads(workspaceId: string, eventId: string): Promise<LeadListItem[]> {
  const event = await db().event.findFirst({
    where: { id: eventId, ...scope(workspaceId) },
    select: { id: true },
  });
  if (!event) throw notFound('Event not found');

  const leads = await db().lead.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
  const settled = await Promise.all(
    leads.map(async (lead) => enrichLeadIfNeeded(await finalizeLead(lead))),
  );
  return settled.map(toLeadItem);
}

/**
 * If a lead is still processing, check its graph8 execution once and settle it (score / failure).
 * The Leads tab polls, so requests overlap: the PROCESSING → terminal transition is claimed with a
 * conditional update and only the winner does the follow-up work.
 */
async function finalizeLead(lead: Lead): Promise<Lead> {
  if (lead.status !== 'PROCESSING' || !lead.graph8ExecutionId) return lead;

  try {
    const result = await checkIntakeExecution(lead.graph8ExecutionId);
    if (result.status === 'running') return lead;

    const claimed = await db().lead.updateMany({
      where: { id: lead.id, status: 'PROCESSING' },
      data:
        result.status === 'failed'
          ? {
              status: 'FAILED',
              error: result.error ?? 'The intake workflow failed.',
              graph8ContactId: result.contactId ?? lead.graph8ContactId,
            }
          : {
              status: 'COMPLETED',
              fitScore: result.fitScore,
              disposition: result.disposition,
              graph8ContactId: result.contactId ?? lead.graph8ContactId,
              error: null,
            },
    });
    const settled = await db().lead.findUniqueOrThrow({ where: { id: lead.id } });
    if (claimed.count === 0 || result.status === 'failed') return settled;

    // Completed and ours: write criteria_score to the contact (graph8 SoT), best-effort.
    if (result.contactId && result.fitScore != null) {
      try {
        const { fieldId } = await ensureCriteriaScoreField();
        await setCriteriaScore({ fieldId, contactId: result.contactId, score: result.fitScore });
      } catch (error) {
        console.error('finalizeLead: criteria_score write failed', error);
      }
    }
    return settled;
  } catch (error) {
    console.error('finalizeLead: execution check failed', error);
    return lead; // leave PROCESSING; the next read retries
  }
}

/** A `running` claim older than this is treated as abandoned (the request died) and retried. */
const STALE_ENRICHMENT_MS = 3 * 60 * 1000;

function needsEnrichment(lead: Lead): boolean {
  if (lead.status !== 'COMPLETED' || !lead.graph8ContactId) return false;
  const outcome = (lead.enriched as EnrichedContact | null)?.enrichment;
  if (!outcome) return true; // never looked up (incl. leads from before lookups existed)
  return (
    outcome.status === 'running' && Date.now() - Date.parse(outcome.checkedAt) > STALE_ENRICHMENT_MS
  );
}

/**
 * Look up the completed lead's work email once (1 graph8 credit) and cache the result + status
 * on the lead. The claim is an optimistic update on `updatedAt`, so overlapping polls can't pay
 * for the same lookup twice.
 */
async function enrichLeadIfNeeded(lead: Lead): Promise<Lead> {
  if (!needsEnrichment(lead)) return lead;
  const current = (lead.enriched as EnrichedContact | null) ?? {};
  const outcome = (status: EnrichedContact['enrichment']) =>
    ({ ...current, enrichment: status }) as unknown as Prisma.InputJsonValue;

  const claimed = await db().lead.updateMany({
    where: { id: lead.id, updatedAt: lead.updatedAt },
    data: {
      enriched: outcome({ status: 'running', reason: null, checkedAt: new Date().toISOString() }),
    },
  });
  if (claimed.count === 0) return db().lead.findUniqueOrThrow({ where: { id: lead.id } });

  const enriched = await enrichContactPerson(lead.graph8ContactId!);
  return db().lead.update({
    where: { id: lead.id },
    data: {
      email: lead.email ?? enriched?.email ?? null,
      enriched: enriched
        ? (enriched as unknown as Prisma.InputJsonValue)
        : outcome({
            status: 'failed',
            reason: "Couldn't read the contact from graph8.",
            checkedAt: new Date().toISOString(),
          }),
    },
  });
}

function toLeadItem(lead: Lead): LeadListItem {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    title: lead.title,
    company: lead.company,
    status: lead.status,
    fitScore: lead.fitScore,
    disposition: lead.disposition,
    error: lead.error,
    enriched: (lead.enriched as EnrichedContact | null) ?? null,
    contactId: lead.graph8ContactId,
    createdAt: lead.createdAt.toISOString(),
  };
}
