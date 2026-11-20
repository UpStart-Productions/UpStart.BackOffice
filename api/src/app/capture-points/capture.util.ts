import type { Prisma } from '@prisma/client';
import { findOpenCardForGuest } from '../booking/booking.service';
import { createLeadActivityNote } from '../leads/lead-activity.util';
import { escapeHtml } from '../mail/email-layout';
import { findLane, laneFields } from '../pipelines/pipeline-lanes.util';

/** The capture point fields the routine needs. */
export type CaptureTarget = { id: string; name: string; stageId: string; isActive: boolean };

/** Who came in and what they said. Everything is optional except some way to name them. */
export type CaptureInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
  website?: string | null;
  /** What they wrote (a message, a summary of answers). Logged on the card's Activity. */
  message?: string | null;
  /** Title for that Activity note. Defaults to the capture point's name. */
  subject?: string | null;
  /** Links kept on the card's Notes (e.g. the form response). */
  links?: { title: string; url: string }[];
  /** Extra lines for the Lead Source note on a new card (e.g. a score). */
  details?: string[];
};

export type CaptureResult = { leadId: string; matched: boolean };

const clean = (v?: string | null) => v?.trim() || undefined;

/**
 * Put someone on the capture point's pipeline. If they already have an open card there (matched by email),
 * the touch is logged on that card and nothing moves. Otherwise a new card goes in the capture point's lane.
 * Every capture point uses this, whether a UBO form, an outside form (/leads/ingest) or a QR code form.
 */
export async function captureToPipeline(tx: Prisma.TransactionClient, cp: CaptureTarget, input: CaptureInput): Promise<CaptureResult> {
  const lane = await findLane(tx, cp.stageId);
  if (!lane) throw new Error(`Capture point "${cp.name}" points at a lane that no longer exists`);

  const email = clean(input.email)?.toLowerCase();
  const name = clean(input.name);
  const subject = clean(input.subject) ?? cp.name;
  const message = clean(input.message);
  const now = new Date();

  const existing = email ? await findOpenCardForGuest(tx, lane.pipelineId, email) : null;
  let lead: { id: string; clientId: string | null };
  if (existing) {
    lead = await tx.lead.update({
      where: { id: existing.id },
      data: {
        lastContactDate: now,
        ...(input.links?.length && { artifacts: { create: input.links.map((l) => ({ type: 'LINK' as const, title: l.title, url: l.url })) } }),
      },
      select: { id: true, clientId: true },
    });
  } else {
    const nextActionDate = new Date(now);
    nextActionDate.setDate(nextActionDate.getDate() + 1);
    const sourceNote = [`Came in through ${cp.name} on ${now.toISOString().slice(0, 10)}.`, ...(input.details ?? [])].join('\n');
    lead = await tx.lead.create({
      data: {
        ...laneFields(lane),
        capturePointId: cp.id,
        organization: clean(input.organization) ?? name ?? email ?? cp.name,
        primaryContact: name,
        email,
        phone: clean(input.phone),
        website: clean(input.website),
        source: 'INBOUND',
        nextAction: `Follow up: ${cp.name}`,
        nextActionDate,
        lastContactDate: now,
        artifacts: {
          create: [
            { type: 'NOTE' as const, title: 'Lead Source', content: sourceNote.split('\n').map((l) => `<p>${escapeHtml(l)}</p>`).join('') },
            ...(input.links ?? []).map((l) => ({ type: 'LINK' as const, title: l.title, url: l.url })),
          ],
        },
      },
      select: { id: true, clientId: true },
    });
  }

  const body = message ?? (existing ? `${name ?? email ?? 'They'} came in again through ${cp.name}.` : null);
  if (body) await createLeadActivityNote(tx, lead, subject, body);

  await tx.capturePoint.update({ where: { id: cp.id }, data: { captureCount: { increment: 1 }, lastCapturedAt: now } });
  return { leadId: lead.id, matched: !!existing };
}
