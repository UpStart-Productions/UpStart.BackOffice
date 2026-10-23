import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped, runWithTenant } from './tenant-context';

/**
 * For public, token-based routes (pay links, booking cancel links, invites, Stripe webhook):
 * the token identifies a row, and that row's tenant becomes the scope for the rest of the request.
 * Only the single token lookup runs unscoped.
 */
@Injectable()
export class PublicTenantService {
  constructor(private readonly prisma: PrismaService) {}

  private async inTenantOf<T>(
    find: () => Promise<{ tenantId: string } | null>,
    fn: () => Promise<T>,
    notFound: string,
  ): Promise<T> {
    const row = await runUnscoped(find);
    if (!row) throw new NotFoundException(notFound);
    return runWithTenant(row.tenantId, fn);
  }

  byPayableToken<T>(token: string, fn: () => Promise<T>) {
    return this.inTenantOf(
      () => this.prisma.payable.findFirst({ where: { token }, select: { tenantId: true } }),
      fn,
      'Payment link not found',
    );
  }

  byPayableId<T>(id: string, fn: () => Promise<T>) {
    return this.inTenantOf(
      () => this.prisma.payable.findFirst({ where: { id }, select: { tenantId: true } }),
      fn,
      'Payable not found',
    );
  }

  byBookingCancelToken<T>(cancelToken: string, fn: () => Promise<T>) {
    return this.inTenantOf(
      () => this.prisma.booking.findFirst({ where: { cancelToken }, select: { tenantId: true } }),
      fn,
      'Booking not found',
    );
  }

  /** OAuth redirects carry no user; the pending state saved on the integration row finds the tenant. */
  byAsanaOAuthState<T>(state: string, fn: () => Promise<T>) {
    return this.inTenantOf(
      () => this.prisma.asanaIntegration.findFirst({ where: { pendingOAuthState: state }, select: { tenantId: true } }),
      fn,
      'Invalid OAuth state',
    );
  }

  byCalendarOAuthState<T>(state: string, fn: () => Promise<T>) {
    return this.inTenantOf(
      () =>
        this.prisma.googleCalendarIntegration.findFirst({ where: { pendingOAuthState: state }, select: { tenantId: true } }),
      fn,
      'Invalid OAuth state',
    );
  }

  byInviteTokenHash<T>(tokenHash: string, fn: () => Promise<T>) {
    return this.inTenantOf(
      () => this.prisma.userInvite.findFirst({ where: { tokenHash }, select: { tenantId: true } }),
      fn,
      'Invite not found',
    );
  }
}
