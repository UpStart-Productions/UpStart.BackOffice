import type { Booking } from '@prisma/client';
import { buildBookingIcs } from './booking-ics.util';
import { formatSlotLabel } from './booking-slots.util';

/** What a guest confirmation needs, shared by Back Office's own email and the service API the website uses. */
export type BookingGuestDetails = {
  /** e.g. "Tue, Nov 10, 2026 at 10:00 AM PST" in the guest's time zone (or the booking type's). */
  when: string;
  timeZone: string;
  /** Short zone name for the booking date, e.g. "PST" or "EST". */
  timeZoneLabel: string;
  cancelUrl: string;
  hostName: string;
  /** The calendar file attached to the guest confirmation. */
  ics: string;
  calendarLinks: { google: string; outlook: string };
};

export function normalizePublicPageUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function zoneLabel(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function googleUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function bookingGuestDetails(params: {
  booking: Pick<Booking, 'id' | 'startAt' | 'endAt' | 'guestName' | 'guestEmail' | 'guestMessage' | 'guestTimezone' | 'cancelToken'>;
  type: {
    name: string;
    timezone: string;
    publicPageUrl: string;
    calendarEventTitle: string;
    host: { name: string | null; firstName: string | null };
  };
  fromEmail: string;
}): BookingGuestDetails {
  const { booking, type, fromEmail } = params;
  const timeZone = booking.guestTimezone ?? type.timezone;
  const cancelUrl = `${normalizePublicPageUrl(type.publicPageUrl)}?cancel=${booking.cancelToken}`;
  const hostName = type.host.name ?? type.host.firstName ?? 'Host';
  const title = type.calendarEventTitle;
  const details = `${type.name} with ${hostName}.\n\nCancel or rebook: ${cancelUrl}`;

  const ics = buildBookingIcs({
    uid: `booking-${booking.id}@${fromEmail.split('@')[1] ?? 'example.com'}`,
    startAt: booking.startAt,
    endAt: booking.endAt,
    title,
    description: booking.guestMessage ?? type.name,
    organizerEmail: fromEmail,
    organizerName: hostName,
    attendeeEmail: booking.guestEmail,
    attendeeName: booking.guestName,
  });

  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${googleUtc(booking.startAt)}/${googleUtc(booking.endAt)}`,
    details,
  }).toString()}`;
  const outlook = `https://outlook.office.com/calendar/0/deeplink/compose?${new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: booking.startAt.toISOString(),
    enddt: booking.endAt.toISOString(),
    body: details,
  }).toString()}`;

  return { when: formatSlotLabel(booking.startAt, timeZone), timeZone, timeZoneLabel: zoneLabel(booking.startAt, timeZone), cancelUrl, hostName, ics, calendarLinks: { google, outlook } };
}
