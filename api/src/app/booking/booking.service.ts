import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ArtifactType,
  Booking,
  BookingSettings,
  BookingStatus,
  LeadSource,
  LeadStage,
  Prisma,
} from '@prisma/client';
import { addDays, parseISO } from 'date-fns';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { buildBookingIcs } from './booking-ics.util';
import {
  dateKeyInTimezone,
  formatSlotLabel,
  generateSlotsForRange,
} from './booking-slots.util';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingSettingsDto } from './dto/update-booking-settings.dto';
import {
  normalizeWebsiteDomain,
  normalizeWebsiteForStorage,
} from '../leads/lead-website.util';

const SETTINGS_ID = 'default';
const EVENT_TITLE = 'Discovery Chat with UpStart Productions';
const DEFAULT_PUBLIC_PAGE_URL = 'https://heyupstart.com/book-discovery-chat';

function normalizePublicPageUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async getPublicMeta() {
    const settings = await this.ensureSettings();
    return {
      durationMin: settings.durationMin,
      timezone: settings.timezone,
      maxDaysAhead: settings.maxDaysAhead,
      hostName: settings.host.name ?? settings.host.firstName ?? 'UpStart',
    };
  }

  async getSlots(fromIso: string, toIso: string, guestTimezone?: string) {
    const settings = await this.ensureSettings();
    const from = parseISO(fromIso);
    const to = parseISO(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new BadRequestException('Invalid date range');
    }

    const booked = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startAt: { gte: from, lte: to },
      },
      select: { startAt: true, endAt: true },
    });

    const calendarBusy = await this.googleCalendar.getBusyWindows(from, to, settings.timezone);
    const blocked = [...booked, ...calendarBusy];

    const slots = generateSlotsForRange({
      from,
      to,
      timeZone: settings.timezone,
      rules: settings.availabilityRules,
      durationMin: settings.durationMin,
      minNoticeHours: settings.minNoticeHours,
      maxDaysAhead: settings.maxDaysAhead,
      booked: blocked,
    });

    const displayTz = guestTimezone?.trim() || settings.timezone;

    return {
      timezone: settings.timezone,
      displayTimezone: displayTz,
      durationMin: settings.durationMin,
      slots: slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        label: formatSlotLabel(s.startAt, displayTz),
        dateKey: dateKeyInTimezone(s.startAt, displayTz),
      })),
    };
  }

  async createBooking(dto: CreateBookingDto) {
    const settings = await this.ensureSettings();
    const startAt = parseISO(dto.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('Invalid startAt');
    }
    const endAt = new Date(startAt.getTime() + settings.durationMin * 60_000);

    const dayStart = addDays(startAt, -1);
    const dayEnd = addDays(startAt, 1);
    const { slots } = await this.getSlots(dayStart.toISOString(), dayEnd.toISOString(), dto.guestTimezone);
    const valid = slots.some((s) => s.startAt === startAt.toISOString());
    if (!valid) {
      throw new BadRequestException('That time is no longer available');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: { status: BookingStatus.CONFIRMED, startAt },
      });
      if (conflict) throw new ConflictException('That time was just booked');

      const lead = await this.upsertLead(tx, dto, startAt);

      return tx.booking.create({
        data: {
          startAt,
          endAt,
          guestName: dto.guestName.trim(),
          guestEmail: dto.guestEmail.trim().toLowerCase(),
          guestOrg: dto.guestOrg?.trim() || null,
          guestMessage: dto.guestMessage?.trim() || null,
          guestTimezone: dto.guestTimezone?.trim() || null,
          leadId: lead.id,
        },
        include: { lead: true },
      });
    });

    void this.sendConfirmationEmails(booking, settings);
    void this.syncGoogleCalendarEvent(booking, settings);

    return this.toPublicBooking(booking);
  }

  async cancelByToken(token: string) {
    const booking = await this.prisma.booking.findUnique({ where: { cancelToken: token } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === BookingStatus.CANCELLED) {
      return this.toPublicBooking(booking);
    }

    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    });

    void this.googleCalendar.deleteBookingEvent(booking.googleEventId);

    return this.toPublicBooking(updated);
  }

  async getByToken(token: string) {
    const booking = await this.prisma.booking.findUnique({ where: { cancelToken: token } });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.toPublicBooking(booking);
  }

  async listBookings(status?: BookingStatus) {
    return this.prisma.booking.findMany({
      where: status ? { status } : undefined,
      orderBy: { startAt: 'asc' },
      include: {
        lead: { select: { id: true, organization: true, stage: true } },
      },
    });
  }

  async getSettings() {
    const settings = await this.ensureSettings();
    return this.toSettingsDto(settings);
  }

  async updateSettings(dto: UpdateBookingSettingsDto) {
    if (dto.hostUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.hostUserId } });
      if (!user) throw new BadRequestException('Host user not found');
    }

    if (dto.availabilityRules) {
      for (const rule of dto.availabilityRules) {
        if (rule.startMinute >= rule.endMinute) {
          throw new BadRequestException('Availability end must be after start');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingSettings.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          hostUserId: dto.hostUserId ?? (await this.defaultHostUserId()),
          durationMin: dto.durationMin ?? 30,
          bufferMin: dto.bufferMin ?? 0,
          minNoticeHours: dto.minNoticeHours ?? 4,
          maxDaysAhead: dto.maxDaysAhead ?? 60,
          timezone: dto.timezone ?? 'America/Los_Angeles',
          publicPageUrl: normalizePublicPageUrl(dto.publicPageUrl ?? DEFAULT_PUBLIC_PAGE_URL),
        },
        update: {
          ...(dto.hostUserId !== undefined && { hostUserId: dto.hostUserId }),
          ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
          ...(dto.bufferMin !== undefined && { bufferMin: dto.bufferMin }),
          ...(dto.minNoticeHours !== undefined && { minNoticeHours: dto.minNoticeHours }),
          ...(dto.maxDaysAhead !== undefined && { maxDaysAhead: dto.maxDaysAhead }),
          ...(dto.timezone !== undefined && { timezone: dto.timezone }),
          ...(dto.publicPageUrl !== undefined && {
            publicPageUrl: normalizePublicPageUrl(dto.publicPageUrl),
          }),
        },
      });

      if (dto.availabilityRules) {
        await tx.bookingAvailabilityRule.deleteMany({ where: { settingsId: SETTINGS_ID } });
        if (dto.availabilityRules.length > 0) {
          await tx.bookingAvailabilityRule.createMany({
            data: dto.availabilityRules.map((r) => ({
              settingsId: SETTINGS_ID,
              dayOfWeek: r.dayOfWeek,
              startMinute: r.startMinute,
              endMinute: r.endMinute,
            })),
          });
        }
      }
    });

    return this.getSettings();
  }

  private async ensureSettings(): Promise<
    BookingSettings & {
      availabilityRules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
      host: { email: string; name: string | null; firstName: string | null };
    }
  > {
    let settings = await this.prisma.bookingSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: {
        availabilityRules: true,
        host: { select: { email: true, name: true, firstName: true } },
      },
    });

    if (!settings) {
      const hostUserId = await this.defaultHostUserId();
      settings = await this.prisma.bookingSettings.create({
        data: {
          id: SETTINGS_ID,
          hostUserId,
          availabilityRules: {
            create: [
              { dayOfWeek: 2, startMinute: 9 * 60, endMinute: 12 * 60 },
              { dayOfWeek: 2, startMinute: 13 * 60, endMinute: 17 * 60 },
              { dayOfWeek: 4, startMinute: 9 * 60, endMinute: 12 * 60 },
              { dayOfWeek: 4, startMinute: 13 * 60, endMinute: 17 * 60 },
            ],
          },
        },
        include: {
          availabilityRules: true,
          host: { select: { email: true, name: true, firstName: true } },
        },
      });
    }

    return settings;
  }

  private async defaultHostUserId(): Promise<string> {
    const jeff = await this.prisma.user.findFirst({
      where: { email: 'jeff@heyupstart.com' },
      select: { id: true },
    });
    if (jeff) return jeff.id;
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) throw new BadRequestException('No host user configured');
    return admin.id;
  }

  private async upsertLead(
    tx: Prisma.TransactionClient,
    dto: CreateBookingDto,
    startAt: Date,
  ) {
    const email = dto.guestEmail.trim().toLowerCase();
    const org = dto.guestOrg?.trim() || dto.guestName.trim();
    const website = dto.guestWebsite?.trim()
      ? normalizeWebsiteForStorage(dto.guestWebsite)
      : undefined;
    const domain = website ? normalizeWebsiteDomain(website) : '';

    let lead = domain
      ? await tx.lead.findFirst({
          where: { website: { contains: domain, mode: 'insensitive' } },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (!lead) {
      lead = await tx.lead.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        orderBy: { updatedAt: 'desc' },
      });
    }

    const callDate = startAt.toISOString().slice(0, 10);
    const artifacts: Prisma.ArtifactCreateWithoutLeadInput[] = [
      {
        type: ArtifactType.NOTE,
        title: `Discovery call — ${callDate}`,
        content: '<p>Discovery call booked via heyupstart.com.</p>',
      },
    ];

    const guestMessage = dto.guestMessage?.trim();
    if (guestMessage) {
      artifacts.push({
        type: ArtifactType.NOTE,
        title: 'Discovery call note',
        content: `<p>${escapeHtml(guestMessage)}</p>`,
      });
    }

    const leadFields = {
      organization: org,
      primaryContact: dto.guestName.trim(),
      email,
      ...(website ? { website } : {}),
      stage: LeadStage.DISCOVERY as LeadStage,
      source: LeadSource.INBOUND,
      nextAction: 'Discovery call scheduled',
      nextActionDate: startAt,
      lastContactDate: new Date(),
    };

    if (lead) {
      return tx.lead.update({
        where: { id: lead.id },
        data: {
          organization: org || lead.organization,
          primaryContact: dto.guestName.trim(),
          email: lead.email ?? email,
          ...(website ? { website: lead.website ?? website } : {}),
          stage: lead.stage === LeadStage.NEW_LEAD ? LeadStage.DISCOVERY : lead.stage,
          source: lead.source ?? LeadSource.INBOUND,
          nextAction: 'Discovery call scheduled',
          nextActionDate: startAt,
          lastContactDate: new Date(),
          artifacts: { create: artifacts },
        },
      });
    }

    return tx.lead.create({
      data: {
        ...leadFields,
        artifacts: { create: artifacts },
      },
    });
  }

  private async syncGoogleCalendarEvent(
    booking: Booking,
    settings: BookingSettings & { host: { email: string; name: string | null; firstName: string | null } },
  ) {
    const hostName = settings.host.name ?? settings.host.firstName ?? 'UpStart';
    const googleEventId = await this.googleCalendar.createBookingEvent({
      booking,
      hostEmail: settings.host.email,
      hostName,
      timeZone: settings.timezone,
    });
    if (googleEventId) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { googleEventId },
      });
    }
  }

  private async sendConfirmationEmails(
    booking: Booking,
    settings: BookingSettings & { host: { email: string; name: string | null; firstName: string | null } },
  ) {
    const displayTz = booking.guestTimezone ?? settings.timezone;
    const when = formatSlotLabel(booking.startAt, displayTz);
    const cancelUrl = `${normalizePublicPageUrl(settings.publicPageUrl)}?cancel=${booking.cancelToken}`;
    const hostName = settings.host.name ?? settings.host.firstName ?? 'Jeff Denton';
    const fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || 'hello@heyupstart.com';

    const guestHtml = buildBookingEmailHtml({
      greeting: `Hi ${booking.guestName},`,
      body: `Your discovery chat with UpStart Productions is confirmed for <strong>${when}</strong>.`,
      footer: `Need to cancel? <a href="${cancelUrl}">Cancel this booking</a>.`,
    });

    const hostHtml = buildBookingEmailHtml({
      greeting: `Hi ${hostName},`,
      body: `<strong>${booking.guestName}</strong>${booking.guestOrg ? ` (${booking.guestOrg})` : ''} booked a discovery chat for <strong>${when}</strong>.`,
      extra: booking.guestMessage ? `<p style="color:#6b6b6b;border-left:3px solid #7c3aed;padding-left:12px;">${escapeHtml(booking.guestMessage)}</p>` : undefined,
      footer: `Guest email: <a href="mailto:${booking.guestEmail}">${booking.guestEmail}</a>`,
    });

    const ics = buildBookingIcs({
      uid: `booking-${booking.id}@heyupstart.com`,
      startAt: booking.startAt,
      endAt: booking.endAt,
      title: EVENT_TITLE,
      description: booking.guestMessage ?? 'Discovery chat with UpStart Productions',
      organizerEmail: fromEmail,
      organizerName: hostName,
      attendeeEmail: booking.guestEmail,
      attendeeName: booking.guestName,
    });

    const guestResult = await this.mail.sendWithAttachment({
      to: booking.guestEmail,
      subject: `Confirmed: Discovery chat on ${when}`,
      html: guestHtml,
      attachment: {
        filename: 'discovery-chat.ics',
        content: Buffer.from(ics, 'utf8'),
        contentType: 'text/calendar; method=REQUEST',
      },
    });

    if (!guestResult.sent) {
      this.logger.warn(`Guest confirmation email failed: ${guestResult.error}`);
    }

    const hostResult = await this.mail.sendRaw({
      to: settings.host.email,
      subject: `New discovery chat: ${booking.guestName} — ${when}`,
      html: hostHtml,
    });

    if (!hostResult.sent) {
      this.logger.warn(`Host notification email failed: ${hostResult.error}`);
    }
  }

  private toPublicBooking(booking: Booking) {
    return {
      id: booking.id,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestOrg: booking.guestOrg,
      cancelToken: booking.cancelToken,
    };
  }

  private toSettingsDto(
    settings: BookingSettings & {
      availabilityRules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
      host: { email: string; name: string | null; firstName: string | null; id?: string };
    },
  ) {
    return {
      hostUserId: settings.hostUserId,
      hostEmail: settings.host.email,
      hostName: settings.host.name ?? settings.host.firstName,
      durationMin: settings.durationMin,
      bufferMin: settings.bufferMin,
      minNoticeHours: settings.minNoticeHours,
      maxDaysAhead: settings.maxDaysAhead,
      timezone: settings.timezone,
      publicPageUrl: settings.publicPageUrl,
      availabilityRules: settings.availabilityRules.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildBookingEmailHtml(params: {
  greeting: string;
  body: string;
  extra?: string;
  footer: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fcfcfb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fefefd;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;">
    <div style="background:#7c3aed;padding:16px 32px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#fff;letter-spacing:0.02em;">UpStart Productions</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#2d2d2d;">${params.greeting}</p>
      <p style="color:#2d2d2d;">${params.body}</p>
      ${params.extra ?? ''}
      <p style="color:#6b6b6b;font-size:14px;margin-top:28px;">${params.footer}</p>
    </div>
  </div>
</body>
</html>`;
}
