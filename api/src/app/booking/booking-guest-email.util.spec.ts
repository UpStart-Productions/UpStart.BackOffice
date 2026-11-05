import { describe, expect, it } from 'vitest';
import { bookingGuestDetails } from './booking-guest-email.util';

const booking = {
  id: 'cmb123abc456',
  startAt: new Date('2026-11-10T18:00:00Z'),
  endAt: new Date('2026-11-10T18:30:00Z'),
  guestName: 'Pat Smith',
  guestEmail: 'pat@org.org',
  guestMessage: null,
  guestTimezone: 'America/New_York',
  cancelToken: 'tok999',
};
const type = {
  name: 'Discovery Chat',
  timezone: 'America/Los_Angeles',
  publicPageUrl: 'https://heyupstart.com/book-discovery-chat/',
  calendarEventTitle: 'UpStart discovery chat',
  host: { name: 'Jeff Denton', firstName: 'Jeff' },
};

describe('bookingGuestDetails', () => {
  const d = bookingGuestDetails({ booking, type, fromEmail: 'hello@heyupstart.com' });

  it('shows the time in the guest time zone, with a short zone name', () => {
    expect(d.timeZone).toBe('America/New_York');
    expect(d.when).toContain('1:00 PM');
    expect(d.timeZoneLabel).toBe('EST');
  });

  it('falls back to the booking type time zone', () => {
    const fallback = bookingGuestDetails({ booking: { ...booking, guestTimezone: null }, type, fromEmail: 'hello@heyupstart.com' });
    expect(fallback.timeZone).toBe('America/Los_Angeles');
    expect(fallback.when).toContain('10:00 AM');
    expect(fallback.timeZoneLabel).toBe('PST');
  });

  it('builds the cancel link from the public page URL', () => {
    expect(d.cancelUrl).toBe('https://heyupstart.com/book-discovery-chat?cancel=tok999');
  });

  it('builds a calendar file for the meeting', () => {
    expect(d.ics).toContain('DTSTART:20261110T180000Z');
    expect(d.ics).toContain('DTEND:20261110T183000Z');
    expect(d.ics).toContain('SUMMARY:UpStart discovery chat');
    expect(d.ics).toContain('ATTENDEE;CN=Pat Smith;RSVP=TRUE:mailto:pat@org.org');
  });

  it('builds Google and Outlook add-to-calendar links', () => {
    const google = new URL(d.calendarLinks.google);
    expect(google.searchParams.get('dates')).toBe('20261110T180000Z/20261110T183000Z');
    expect(google.searchParams.get('text')).toBe('UpStart discovery chat');
    const outlook = new URL(d.calendarLinks.outlook);
    expect(outlook.searchParams.get('startdt')).toBe('2026-11-10T18:00:00.000Z');
    expect(outlook.searchParams.get('subject')).toBe('UpStart discovery chat');
  });
});
