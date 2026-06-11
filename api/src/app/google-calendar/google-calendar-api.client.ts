import { BadGatewayException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { zonedLocalToUtc, type SlotWindow } from '../booking/booking-slots.util';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleCalendarResource = {
  id: string;
  summary: string;
  primary?: boolean;
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

type GoogleFreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: { start: string; end: string }[];
    }
  >;
};

type GoogleCalendarEvent = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { uri?: string }[];
  };
};

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function defaultGoogleCalendarRedirectUri(): string {
  const apiBase = process.env.API_BASE_URL?.trim().replace(/\/$/, '');
  if (apiBase) return `${apiBase}/google-calendar/callback`;
  const port = process.env.PORT?.trim() || '3001';
  return `http://localhost:${port}/api/google-calendar/callback`;
}

export function parseFreeBusyBlock(
  start: string,
  end: string,
  timeZone: string,
): SlotWindow {
  const startDateOnly = toCalendarDateKey(start);
  const endDateOnly = toCalendarDateKey(end);

  if (startDateOnly && endDateOnly) {
    return {
      startAt: zonedLocalToUtc(startDateOnly, 0, timeZone),
      // All-day events use an exclusive end date in Google Calendar.
      endAt: zonedLocalToUtc(endDateOnly, 0, timeZone),
    };
  }

  return { startAt: new Date(start), endAt: new Date(end) };
}

/** Date-only busy times from Google (`2026-06-14` or midnight UTC). */
function toCalendarDateKey(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(value)) return value.slice(0, 10);
  return null;
}

export function buildGoogleAuthorizeUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function parseGoogleError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; error_description?: string };
    return body.error_description ?? body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new BadGatewayException(`Google token exchange failed: ${await parseGoogleError(res)}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshGoogleToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new BadGatewayException(`Google token refresh failed: ${await parseGoogleError(res)}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export class GoogleCalendarApiClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Google Calendar API error: ${await parseGoogleError(res)}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async getUserEmail(): Promise<string> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(`Google userinfo failed: ${await parseGoogleError(res)}`);
    }
    const data = (await res.json()) as { email?: string };
    return data.email ?? '';
  }

  async listCalendars(): Promise<GoogleCalendarResource[]> {
    const data = await this.request<{ items?: GoogleCalendarResource[] }>(
      `${GOOGLE_CALENDAR_API}/users/me/calendarList`,
    );
    return (data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary,
    }));
  }

  async queryFreeBusy(
    calendarIds: string[],
    timeMin: Date,
    timeMax: Date,
    timeZone: string,
  ): Promise<SlotWindow[]> {
    const ids = [...new Set(calendarIds.filter(Boolean))];
    if (!ids.length) return [];

    const data = await this.request<GoogleFreeBusyResponse>(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: ids.map((id) => ({ id })),
      }),
    });

    const busy: SlotWindow[] = [];
    for (const entry of Object.values(data.calendars ?? {})) {
      for (const b of entry.busy ?? []) {
        busy.push(parseFreeBusyBlock(b.start, b.end, timeZone));
      }
    }
    return busy;
  }

  async createDiscoveryEvent(params: {
    calendarId: string;
    startAt: Date;
    endAt: Date;
    title: string;
    description: string;
    guestEmail: string;
    guestName: string;
    hostEmail: string;
    hostName: string;
    timeZone: string;
  }): Promise<GoogleCalendarEvent> {
    const requestId = randomUUID();
    return this.request<GoogleCalendarEvent>(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(params.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: params.title,
          description: params.description,
          start: {
            dateTime: params.startAt.toISOString(),
            timeZone: params.timeZone,
          },
          end: {
            dateTime: params.endAt.toISOString(),
            timeZone: params.timeZone,
          },
          attendees: [
            { email: params.guestEmail, displayName: params.guestName },
            { email: params.hostEmail, displayName: params.hostName, organizer: true },
          ],
          conferenceData: {
            createRequest: {
              requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      },
    );
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request<void>(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE' },
    );
  }
}
