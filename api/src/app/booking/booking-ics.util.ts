function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIcsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildBookingIcs(params: {
  uid: string;
  startAt: Date;
  endAt: Date;
  title: string;
  description: string;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName: string;
}): string {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UpStart Productions//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(params.startAt)}`,
    `DTEND:${formatIcsUtc(params.endAt)}`,
    `SUMMARY:${escapeIcs(params.title)}`,
    `DESCRIPTION:${escapeIcs(params.description)}`,
    `ORGANIZER;CN=${escapeIcs(params.organizerName)}:mailto:${params.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcs(params.attendeeName)};RSVP=TRUE:mailto:${params.attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
