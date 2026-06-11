import { randomUUID } from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Booking } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { SlotWindow } from '../booking/booking-slots.util';
import { decryptSecret, encryptSecret } from '../asana/asana-crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildGoogleAuthorizeUrl,
  defaultGoogleCalendarRedirectUri,
  exchangeGoogleCode,
  GoogleCalendarApiClient,
  GoogleOAuthConfig,
  refreshGoogleToken,
} from './google-calendar-api.client';
import { UpdateGoogleCalendarConfigDto } from './dto/update-google-calendar-config.dto';

const INTEGRATION_ID = 'default';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const EVENT_TITLE = 'Discovery Chat with UpStart Productions';

export type GoogleCalendarStatusDto = {
  connected: boolean;
  configured: boolean;
  calendarId?: string | null;
  calendarSummary?: string | null;
  connectedByEmail?: string | null;
  connectedAt?: string | null;
};

export type GoogleCalendarConfigDto = {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  suggestedRedirectUri: string;
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<GoogleCalendarStatusDto> {
    const row = await this.ensureIntegrationRow();
    return {
      configured: await this.isConfigured(),
      connected: !!(row.accessTokenEnc && row.refreshTokenEnc),
      calendarId: row.calendarId,
      calendarSummary: row.calendarSummary,
      connectedByEmail: row.connectedByEmail,
      connectedAt: row.connectedAt?.toISOString() ?? null,
    };
  }

  async getConfig(): Promise<GoogleCalendarConfigDto> {
    const row = await this.ensureIntegrationRow();
    return {
      clientId: row.clientId ?? '',
      redirectUri: row.redirectUri ?? defaultGoogleCalendarRedirectUri(),
      hasClientSecret: !!row.clientSecretEnc,
      suggestedRedirectUri: defaultGoogleCalendarRedirectUri(),
    };
  }

  async saveConfig(dto: UpdateGoogleCalendarConfigDto) {
    const row = await this.ensureIntegrationRow();
    if (!dto.clientSecret?.trim() && !row.clientSecretEnc) {
      throw new BadRequestException('Client secret is required');
    }

    await this.prisma.googleCalendarIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        clientId: dto.clientId.trim(),
        redirectUri: dto.redirectUri.trim(),
        ...(dto.clientSecret?.trim()
          ? { clientSecretEnc: encryptSecret(dto.clientSecret.trim()) }
          : {}),
      },
    });

    return this.getConfig();
  }

  async isConfigured(): Promise<boolean> {
    const row = await this.ensureIntegrationRow();
    return !!(row.clientId?.trim() && row.clientSecretEnc && row.redirectUri?.trim());
  }

  async isConnected(): Promise<boolean> {
    const row = await this.ensureIntegrationRow();
    return !!(row.accessTokenEnc && row.refreshTokenEnc && row.calendarId);
  }

  async startConnect(connectedByEmail?: string): Promise<{ url: string }> {
    const config = await this.resolveOAuthConfig();
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    await this.ensureIntegrationRow();
    await this.prisma.googleCalendarIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        pendingOAuthState: state,
        pendingOAuthStateExpiresAt: expiresAt,
        connectedByEmail: connectedByEmail ?? null,
      },
    });
    return { url: buildGoogleAuthorizeUrl(config, state) };
  }

  async completeConnect(code: string, state: string) {
    const row = await this.ensureIntegrationRow();
    if (!row.pendingOAuthState || row.pendingOAuthState !== state) {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (
      !row.pendingOAuthStateExpiresAt ||
      row.pendingOAuthStateExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('OAuth state expired — try connecting again');
    }

    const config = await this.resolveOAuthConfig();
    const token = await exchangeGoogleCode(config, code);
    const refreshToken =
      token.refresh_token ??
      (row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : null);
    if (!refreshToken) {
      throw new BadGatewayException(
        'Google did not return a refresh token — revoke app access in your Google account and try again',
      );
    }

    const expiresAt = new Date(Date.now() + token.expires_in * 1000);
    const api = new GoogleCalendarApiClient(token.access_token);

    let calendarId = 'primary';
    let calendarSummary = 'Primary calendar';
    try {
      const calendars = await api.listCalendars();
      const primary = calendars.find((c) => c.primary) ?? calendars[0];
      if (primary) {
        calendarId = primary.id;
        calendarSummary = primary.summary;
      }
    } catch (err) {
      this.logger.warn(
        `Could not list Google calendars after connect; using primary: ${err instanceof Error ? err.message : err}`,
      );
    }

    await this.prisma.googleCalendarIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(refreshToken),
        tokenExpiresAt: expiresAt,
        calendarId,
        calendarSummary,
        connectedByEmail: row.connectedByEmail,
        connectedAt: new Date(),
        pendingOAuthState: null,
        pendingOAuthStateExpiresAt: null,
      },
    });
  }

  async disconnect() {
    await this.prisma.googleCalendarIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        calendarId: null,
        calendarSummary: null,
        connectedByEmail: null,
        connectedAt: null,
        pendingOAuthState: null,
        pendingOAuthStateExpiresAt: null,
      },
    });
  }

  async listCalendars() {
    const client = await this.getApiClient();
    return client.listCalendars();
  }

  async setCalendar(calendarId: string) {
    const client = await this.getApiClient();
    const calendars = await client.listCalendars();
    const match = calendars.find((c) => c.id === calendarId);
    if (!match) {
      throw new BadRequestException('Calendar not found for this account');
    }
    await this.prisma.googleCalendarIntegration.update({
      where: { id: INTEGRATION_ID },
      data: {
        calendarId: match.id,
        calendarSummary: match.summary,
      },
    });
    return this.getStatus();
  }

  async getBusyWindows(timeMin: Date, timeMax: Date, timeZone: string): Promise<SlotWindow[]> {
    if (!(await this.isConnected())) {
      this.logger.debug('Google Calendar not connected — skipping free/busy');
      return [];
    }
    try {
      const row = await this.ensureIntegrationRow();
      const client = await this.getApiClient();

      let calendarIds: string[] = [];
      try {
        const calendars = await client.listCalendars();
        calendarIds = calendars.map((c) => c.id);
        this.logger.debug(`Google Calendar free/busy: checking ${calendarIds.length} calendar(s)`);
      } catch (err) {
        this.logger.warn(
          `Could not list Google calendars for free/busy: ${err instanceof Error ? err.message : err}`,
        );
      }

      if (!calendarIds.length && row.calendarId) {
        calendarIds = [row.calendarId];
      }

      const busy = await client.queryFreeBusy(calendarIds, timeMin, timeMax, timeZone);
      this.logger.debug(`Google Calendar free/busy: ${busy.length} busy block(s) in range`);
      return busy;
    } catch (err) {
      this.logger.warn(
        `Google Calendar free/busy failed: ${err instanceof Error ? err.message : err}`,
      );
      return [];
    }
  }

  async createBookingEvent(params: {
    booking: Booking;
    hostEmail: string;
    hostName: string;
    timeZone: string;
  }): Promise<string | null> {
    if (!(await this.isConnected())) return null;

    const { booking, hostEmail, hostName, timeZone } = params;
    const descriptionParts = [
      `Guest: ${booking.guestName}`,
      `Email: ${booking.guestEmail}`,
    ];
    if (booking.guestOrg) descriptionParts.push(`Organization: ${booking.guestOrg}`);
    if (booking.guestMessage) descriptionParts.push('', booking.guestMessage);

    try {
      const row = await this.ensureIntegrationRow();
      const client = await this.getApiClient();
      const event = await client.createDiscoveryEvent({
        calendarId: row.calendarId!,
        startAt: booking.startAt,
        endAt: booking.endAt,
        title: EVENT_TITLE,
        description: descriptionParts.join('\n'),
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
        hostEmail,
        hostName,
        timeZone,
      });
      return event.id;
    } catch (err) {
      this.logger.warn(
        `Google Calendar event create failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async deleteBookingEvent(googleEventId: string | null | undefined): Promise<void> {
    if (!googleEventId || !(await this.isConnected())) return;
    try {
      const row = await this.ensureIntegrationRow();
      const client = await this.getApiClient();
      await client.deleteEvent(row.calendarId!, googleEventId);
    } catch (err) {
      this.logger.warn(
        `Google Calendar event delete failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async getApiClient(): Promise<GoogleCalendarApiClient> {
    const row = await this.ensureIntegrationRow();
    if (!row.accessTokenEnc || !row.refreshTokenEnc) {
      throw new UnauthorizedException('Google Calendar is not connected');
    }

    const config = await this.resolveOAuthConfig();
    let accessToken = decryptSecret(row.accessTokenEnc);
    const refreshToken = decryptSecret(row.refreshTokenEnc);
    const needsRefresh =
      !row.tokenExpiresAt ||
      row.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS;

    if (needsRefresh) {
      const refreshed = await refreshGoogleToken(config, refreshToken);
      accessToken = refreshed.access_token;
      const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await this.prisma.googleCalendarIntegration.update({
        where: { id: INTEGRATION_ID },
        data: {
          accessTokenEnc: encryptSecret(refreshed.access_token),
          ...(refreshed.refresh_token
            ? { refreshTokenEnc: encryptSecret(refreshed.refresh_token) }
            : {}),
          tokenExpiresAt: expiresAt,
        },
      });
    }

    return new GoogleCalendarApiClient(accessToken);
  }

  private async resolveOAuthConfig(): Promise<GoogleOAuthConfig> {
    const row = await this.ensureIntegrationRow();
    if (!row.clientId?.trim() || !row.clientSecretEnc || !row.redirectUri?.trim()) {
      throw new BadGatewayException(
        'Google Calendar app credentials are not configured — add them in Settings',
      );
    }
    return {
      clientId: row.clientId.trim(),
      clientSecret: decryptSecret(row.clientSecretEnc),
      redirectUri: row.redirectUri.trim(),
    };
  }

  private async ensureIntegrationRow() {
    const existing = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: INTEGRATION_ID },
    });
    if (existing) return existing;

    try {
      return await this.prisma.googleCalendarIntegration.create({
        data: { id: INTEGRATION_ID },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.googleCalendarIntegration.findUniqueOrThrow({
          where: { id: INTEGRATION_ID },
        });
      }
      throw err;
    }
  }
}
