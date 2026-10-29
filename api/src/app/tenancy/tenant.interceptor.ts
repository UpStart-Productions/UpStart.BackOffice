import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from '../communications/communications.constants';
import { runUnscoped, runWithTenant } from './tenant-context';
import { routeModules } from '../access/route-modules';

export const TENANT_SLUG_HEADER = 'x-tenant-slug';

/**
 * Puts the request's tenant into context so the Prisma extension can scope every query.
 *  - Regular users: the tenant of the user row the auth guard picked (User.tenantId). A person with
 *    rows in several tenants chooses among them via the header, which the guard validates against
 *    their rows (resolveUserForRequest); here it is ignored.
 *  - Super users (platform operators): the tenant named by x-tenant-slug.
 *  - Service key / portal session: the tenant their guard put on the request.
 *  - Anonymous public routes (booking, forms): x-tenant-slug header, else the default tenant.
 *    Token routes (pay, invites, booking cancel) re-scope from the token's row via PublicTenantService.
 * Also enforces modules: a route that belongs to a module (see routeModules) answers 404 when the
 * tenant has that module off.
 * Runs after guards, so request.user is already populated.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;

    return new Observable((subscriber) => {
      const start = async () => {
        let tenantId: string | null = req.tenantId ?? user?.tenantId ?? null;

        const anonymous = !user && !tenantId;
        if (user?.isSuper || anonymous) {
          const slug = (req.headers[TENANT_SLUG_HEADER] as string | undefined)?.trim();
          if (slug) {
            const tenant = await runUnscoped(() =>
              this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
            );
            if (!tenant) throw new BadRequestException(`Unknown tenant "${slug}"`);
            tenantId = tenant.id;
          }
        }
        if (anonymous && !tenantId) tenantId = DEFAULT_TENANT_ID;

        // A route of a module that is off for this tenant doesn't exist (404, also for admins).
        const needs = routeModules(this.reflector, context);
        if (needs.length && tenantId) {
          const tenant = await runUnscoped(() =>
            this.prisma.tenant.findUnique({ where: { id: tenantId! }, select: { modules: true } }),
          );
          if (!needs.some((m) => tenant?.modules.includes(m))) throw new NotFoundException('Not found');
        }

        const handle = () => next.handle().subscribe(subscriber);
        // Subscribe inside the ALS scope so the handler (and everything it awaits) inherits it.
        const sub = tenantId ? runWithTenant(tenantId, handle) : handle();
        return sub;
      };
      let inner: { unsubscribe(): void } | undefined;
      start().then((s) => (inner = s), (err) => subscriber.error(err));
      return () => inner?.unsubscribe();
    });
  }
}
