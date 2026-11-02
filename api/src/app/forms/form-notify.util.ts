import { Logger } from '@nestjs/common';
import { normalizeFormSettings } from '@upstart/back-office/shared';
import type { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import type { PrismaService } from '../prisma/prisma.service';
import { sanitizeFormAccess } from './form-access.util';

const logger = new Logger('FormNotify');

type Actor = { id: string; name?: string | null; firstName?: string | null; lastName?: string | null; email: string };
type Form = { name: string; access: unknown; settings: unknown };

function actorName(a: Actor) {
  return a.name || [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
}

/** Where a result opens: client forms on their result page, other forms on the submission page. */
function route(form: Form, responseId: string) {
  return normalizeFormSettings(form.settings).client.enabled ? ['forms', 'results', responseId] : ['forms', 'submissions', responseId];
}

async function staff(db: PrismaService) {
  return db.user.findMany({
    where: { isActive: true, OR: [{ role: 'ADMIN' }, { role: 'USER' }] },
    select: { id: true, role: true, roleId: true, tenantRole: { select: { permissions: true } } },
  });
}

/**
 * Staff clicked Submit on a result: tell the people who can edit that form for that client (admins, roles with Edit
 * who reach the client), not the person who submitted it.
 */
export async function notifyFormSubmitted(
  db: PrismaService,
  delivery: NotificationDeliveryService,
  args: { form: Form; responseId: string; clientId: string; actor: Actor },
) {
  try {
    const access = sanitizeFormAccess(args.form.access);
    const [users, assigned, client] = await Promise.all([
      staff(db),
      db.clientAssignment.findMany({ where: { clientId: args.clientId }, select: { userId: true } }),
      db.client.findUnique({ where: { id: args.clientId }, select: { name: true } }),
    ]);
    const onClient = new Set(assigned.map((a) => a.userId));
    const targets = users.filter((u) => {
      if (u.id === args.actor.id) return false;
      if (u.role === 'ADMIN') return true;
      if (!u.roleId || access[u.roleId] !== 'edit') return false;
      const perms = (u.tenantRole?.permissions as Record<string, unknown> | null) ?? {};
      return perms['clients'] === 'all' || onClient.has(u.id);
    });
    const clientName = client?.name ?? 'a client';
    await delivery.deliverMany(
      targets.map((u) => ({
        userId: u.id,
        type: 'client_form_submitted' as const,
        title: `${args.form.name} submitted: ${clientName}`,
        body: `${actorName(args.actor)} submitted ${args.form.name} for ${clientName}.`,
        meta: { entityType: 'form_response', entityId: args.responseId, route: route(args.form, args.responseId), actionLabel: 'Open' },
      })),
    );
  } catch (err) {
    logger.warn(`Form notification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * A result was attached to (or moved onto) a client or organization: tell the staff assigned to it who can see the
 * answers, not the person who did it.
 */
export async function notifyFormAttached(
  db: PrismaService,
  delivery: NotificationDeliveryService,
  args: { form: Form; responseId: string; clientId: string; actor: Actor; moved?: boolean },
) {
  try {
    const isClientForm = normalizeFormSettings(args.form.settings).client.enabled;
    const access = sanitizeFormAccess(args.form.access);
    const [assigned, client] = await Promise.all([
      db.clientAssignment.findMany({
        where: { clientId: args.clientId, user: { isActive: true } },
        select: { user: { select: { id: true, role: true, roleId: true, tenantRole: { select: { permissions: true } } } } },
      }),
      db.client.findUnique({ where: { id: args.clientId }, select: { name: true } }),
    ]);
    const targets = assigned
      .map((a) => a.user)
      .filter((u) => {
        if (u.id === args.actor.id) return false;
        if (u.role === 'ADMIN') return true;
        if (u.role !== 'USER') return false;
        if (isClientForm) return !!(u.roleId && access[u.roleId]);
        return !!(u.tenantRole?.permissions as Record<string, unknown> | null)?.['forms'];
      });
    const clientName = client?.name ?? 'a client';
    const verb = args.moved ? 'moved to' : 'added to';
    await delivery.deliverMany(
      targets.map((u) => ({
        userId: u.id,
        type: 'form_attached' as const,
        title: `${args.form.name} ${verb} ${clientName}`,
        body: `${actorName(args.actor)} ${args.moved ? 'moved' : 'attached'} ${args.form.name} to ${clientName}.`,
        meta: { entityType: 'form_response', entityId: args.responseId, route: route(args.form, args.responseId), actionLabel: 'Open' },
      })),
    );
  } catch (err) {
    logger.warn(`Form notification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
