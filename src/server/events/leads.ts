import 'server-only';

import type { Lead, Prisma } from '@prisma/client';

import { db } from '@/server/db';
import {
  checkIntakeExecution,
  ensureCriteriaScoreField,
  getContactSnapshot,
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
  const finalized = await Promise.all(leads.map(finalizeLead));
  return finalized.map(toLeadItem);
}

/** If a lead is still processing, check its graph8 execution once and settle it (score / failure). */
async function finalizeLead(lead: Lead): Promise<Lead> {
  if (lead.status !== 'PROCESSING' || !lead.graph8ExecutionId) return lead;

  try {
    const result = await checkIntakeExecution(lead.graph8ExecutionId);
    if (result.status === 'running') return lead;

    if (result.status === 'failed') {
      return db().lead.update({
        where: { id: lead.id },
        data: {
          status: 'FAILED',
          error: result.error ?? 'The intake workflow failed.',
          graph8ContactId: result.contactId ?? lead.graph8ContactId,
        },
      });
    }

    // Completed: write criteria_score to the contact (graph8 SoT), best-effort, then cache it locally.
    let enriched: EnrichedContact | null = null;
    if (result.contactId) {
      if (result.fitScore != null) {
        try {
          const { fieldId } = await ensureCriteriaScoreField();
          await setCriteriaScore({ fieldId, contactId: result.contactId, score: result.fitScore });
        } catch (error) {
          console.error('finalizeLead: criteria_score write failed', error);
        }
      }
      // Snapshot the contact's enriched fields so the Leads tab can show them.
      enriched = await getContactSnapshot(result.contactId);
    }
    return db().lead.update({
      where: { id: lead.id },
      data: {
        status: 'COMPLETED',
        fitScore: result.fitScore,
        disposition: result.disposition,
        graph8ContactId: result.contactId ?? lead.graph8ContactId,
        enriched: enriched ? (enriched as unknown as Prisma.InputJsonValue) : undefined,
        error: null,
      },
    });
  } catch (error) {
    console.error('finalizeLead: execution check failed', error);
    return lead; // leave PROCESSING; the next read retries
  }
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
