import { DEFAULT_TIME_ZONE, isKnownTimeZone } from '@upstart/back-office/shared';
import { addDaysToDate, localDate } from '../visits/zoned-time.util';

export { DEFAULT_TIME_ZONE };

/** Anything with the tenant-scoped organizationProfile model: PrismaService or a transaction client. */
type ProfileReader = {
  organizationProfile: { findFirst(args: { select: { timeZone: true } }): Promise<{ timeZone: string } | null> };
};

/** The current tenant's time zone (Settings, Business), or the default when none is set. */
export async function tenantTimeZone(db: ProfileReader): Promise<string> {
  const row = await db.organizationProfile.findFirst({ select: { timeZone: true } });
  return isKnownTimeZone(row?.timeZone) ? row!.timeZone : DEFAULT_TIME_ZONE;
}

/**
 * A date-only field (Last Contact, Next Action date) for the local day of an instant. Dates typed in the app are
 * stored as midnight UTC of that day, so this stores the same; a raw timestamp would show the next day in the evening.
 */
export function dateOnlyOf(at: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  return new Date(`${localDate(at, timeZone)}T00:00:00.000Z`);
}

/** dateOnlyOf plus n calendar days. */
export function dateOnlyPlusDays(at: Date, n: number, timeZone: string = DEFAULT_TIME_ZONE): Date {
  return new Date(`${addDaysToDate(localDate(at, timeZone), n)}T00:00:00.000Z`);
}
