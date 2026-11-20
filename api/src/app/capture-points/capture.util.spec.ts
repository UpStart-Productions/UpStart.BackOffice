import { describe, expect, it, vi } from 'vitest';
import { captureToPipeline } from './capture.util';

/** A fake transaction: one lane, optionally one open card on its pipeline. */
function fakeTx(openCard: { id: string } | null) {
  return {
    pipelineStage: { findUnique: vi.fn().mockResolvedValue({ id: 'lane-1', pipelineId: 'pipe-1', legacyKey: null }) },
    lead: {
      findFirst: vi.fn().mockResolvedValue(openCard),
      create: vi.fn().mockResolvedValue({ id: 'new-card', clientId: null }),
      update: vi.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id, clientId: null })),
    },
    interaction: { create: vi.fn().mockResolvedValue({}) },
    capturePoint: { update: vi.fn().mockResolvedValue({}) },
  };
}

const cp = { id: 'cp-1', name: 'Contact form', stageId: 'lane-1', isActive: true };

describe('captureToPipeline', () => {
  it('creates a card in the lane for someone new', async () => {
    const tx = fakeTx(null);
    const r = await captureToPipeline(tx as never, cp, { name: 'Pat Lee', email: 'Pat@Example.org', message: 'Hi there' });
    expect(r).toEqual({ leadId: 'new-card', matched: false });
    const data = tx.lead.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ pipelineId: 'pipe-1', stageId: 'lane-1', capturePointId: 'cp-1', organization: 'Pat Lee', email: 'pat@example.org', source: 'INBOUND' });
    expect(tx.interaction.create).toHaveBeenCalledTimes(1);
    expect(tx.capturePoint.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cp-1' } }));
  });

  it('logs the touch on an open card instead of adding a second one', async () => {
    const tx = fakeTx({ id: 'old-card' });
    const r = await captureToPipeline(tx as never, cp, { name: 'Pat Lee', email: 'pat@example.org' });
    expect(r).toEqual({ leadId: 'old-card', matched: true });
    expect(tx.lead.create).not.toHaveBeenCalled();
    expect(tx.lead.update.mock.calls[0][0].data).not.toHaveProperty('stageId');
    expect(tx.interaction.create.mock.calls[0][0].data.bodyText).toContain('came in again');
  });

  it('uses the organization when given, and makes a new card when there is no email to match', async () => {
    const tx = fakeTx({ id: 'old-card' });
    await captureToPipeline(tx as never, cp, { name: 'Pat Lee', organization: 'Example Org' });
    expect(tx.lead.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.create.mock.calls[0][0].data.organization).toBe('Example Org');
  });
});
