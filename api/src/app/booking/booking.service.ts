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
  BookingStatus,
  BookingType,
  LeadSource,
  LeadStage,
  Prisma,
} from '@prisma/client';
import { addDays, parseISO } from 'date-fns';
import { buildBookingEmailHtml, escapeHtml } from '../mail/email-layout';
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
import { UpsertBookingTypeDto } from './dto/upsert-booking-type.dto';
import {
  normalizeWebsiteDomain,
  normalizeWebsiteForStorage,
} from '../leads/lead-website.util';

export const DEFAULT_BOOKING_SLUG = 'upstart-discovery';

type BookingTypeWithRules = BookingType & {
  availabilityRules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  host: { email: string; name: string | null; firstName: string | null };
};

function normalizePublicPageUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async getPublicMeta(slug: string = DEFAULT_BOOKING_SLUG) {
    const type = await this.requireActiveType(slug);
    return {
      slug: type.slug,
      name: type.name,
      brand: type.brand,
      durationMin: type.durationMin,
      timezone: type.timezone,
      maxDaysAhead: type.maxDaysAhead,
      hostName: type.host.name ?? type.host.firstName ?? 'UpStart',
      isBillable: type.isBillable,
      priceCents: type.priceCents,
      currency: type.currency,
      paymentRequired: type.paymentRequired,
    };
  }

  async getSlots(
    slug: string,
    fromIso: string,
    toIso: string,
    guestTimezone?: string,
  ) {
    const type = await this.requireActiveType(slug);
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

    const calendarBusy = await this.googleCalendar.getBusyWindows(from, to, type.timezone);
    const blocked = [...booked, ...calendarBusy];

    const slots = generateSlotsForRange({
      from,
      to,
      timeZone: type.timezone,
      rules: type.availabilityRules,
      durationMin: type.durationMin,
      minNoticeHours: type.minNoticeHours,
      maxDaysAhead: type.maxDaysAhead,
      booked: blocked,
    });

    const displayTz = guestTimezone?.trim() || type.timezone;

    return {
      slug: type.slug,
      timezone: type.timezone,
      displayTimezone: displayTz,
      durationMin: type.durationMin,
      slots: slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        label: formatSlotLabel(s.startAt, displayTz),
        dateKey: dateKeyInTimezone(s.startAt, displayTz),
      })),
    };
  }

  async createBooking(slug: string, dto: CreateBookingDto) {
    const type = await this.requireActiveType(slug);

    if (type.paymentRequired) {
      throw new BadRequestException('This booking type requires payment (not yet supported)');
    }

    const startAt = parseISO(dto.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('Invalid startAt');
    }
    const endAt = new Date(startAt.getTime() + type.durationMin * 60_000);

    const dayStart = addDays(startAt, -1);
    const dayEnd = addDays(startAt, 1);
    const { slots } = await this.getSlots(
      slug,
      dayStart.toISOString(),
      dayEnd.toISOString(),
      dto.guestTimezone,
    );
    const valid = slots.some((s) => s.startAt === startAt.toISOString());
    if (!valid) {
      throw new BadRequestException('That time is no longer available');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: { status: BookingStatus.CONFIRMED, startAt },
      });
      if (conflict) throw new ConflictException('That time was just booked');

      const lead = type.createLead
        ? await this.upsertLead(tx, dto, startAt, type)
        : null;

      return tx.booking.create({
        data: {
          bookingTypeId: type.id,
          startAt,
          endAt,
          guestName: dto.guestName.trim(),
          guestEmail: dto.guestEmail.trim().toLowerCase(),
          guestOrg: dto.guestOrg?.trim() || null,
          guestMessage: dto.guestMessage?.trim() || null,
          guestTimezone: dto.guestTimezone?.trim() || null,
          leadId: lead?.id ?? null,
        },
        include: { lead: true, bookingType: true },
      });
    });

    void this.sendConfirmationEmails(booking, type);
    void this.syncGoogleCalendarEvent(booking, type);

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

  async deleteBooking(id: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.status === BookingStatus.CONFIRMED && booking.googleEventId) {
      void this.googleCalendar.deleteBookingEvent(booking.googleEventId);
    }

    await this.prisma.booking.delete({ where: { id } });
    return { deleted: true };
  }

  async getByToken(token: string) {
    const booking = await this.prisma.booking.findUnique({ where: { cancelToken: token } });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.toPublicBooking(booking);
  }

  async listBookings(status?: BookingStatus, bookingTypeId?: string) {
    return this.prisma.booking.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(bookingTypeId ? { bookingTypeId } : {}),
      },
      orderBy: { startAt: 'asc' },
      include: {
        lead: { select: { id: true, organization: true, stage: true } },
        bookingType: { select: { id: true, slug: true, name: true, brand: true } },
      },
    });
  }

  async listBookingTypes() {
    const types = await this.prisma.bookingType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        host: { select: { email: true, name: true, firstName: true } },
        availabilityRules: true,
        _count: { select: { bookings: true } },
      },
    });
    return types.map((t) => this.toBookingTypeDto(t));
  }

  async getBookingType(id: string) {
    const type = await this.prisma.bookingType.findUnique({
      where: { id },
      include: {
        host: { select: { email: true, name: true, firstName: true } },
        availabilityRules: true,
        _count: { select: { bookings: true } },
      },
    });
    if (!type) throw new NotFoundException('Booking type not found');
    return this.toBookingTypeDto(type);
  }

  async createBookingType(dto: UpsertBookingTypeDto) {
    this.validateAvailabilityRules(dto.availabilityRules);
    const hostUserId = dto.hostUserId ?? (await this.defaultHostUserId());
    await this.assertHostUser(hostUserId);

    const slug = normalizeSlug(dto.slug);
    const existing = await this.prisma.bookingType.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('A booking type with this slug already exists');

    const type = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bookingType.create({
        data: {
          slug,
          name: dto.name.trim(),
          brand: dto.brand?.trim() || null,
          isActive: dto.isActive ?? true,
          hostUserId,
          durationMin: dto.durationMin ?? 30,
          minNoticeHours: dto.minNoticeHours ?? 4,
          maxDaysAhead: dto.maxDaysAhead ?? 60,
          timezone: dto.timezone ?? 'America/Los_Angeles',
          publicPageUrl: normalizePublicPageUrl(
            dto.publicPageUrl ?? 'http://localhost:4321/book',
          ),
          calendarEventTitle: dto.calendarEventTitle?.trim() || dto.name.trim(),
          createLead: dto.createLead ?? true,
          leadStage: dto.leadStage ?? LeadStage.DISCOVERY,
          leadSource: dto.leadSource ?? LeadSource.INBOUND,
          pipelineNoteTitle: dto.pipelineNoteTitle?.trim() || null,
          priceCents: dto.priceCents ?? null,
          currency: dto.currency ?? 'USD',
          isBillable: dto.isBillable ?? false,
          paymentRequired: dto.paymentRequired ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      if (dto.availabilityRules?.length) {
        await tx.bookingAvailabilityRule.createMany({
          data: dto.availabilityRules.map((r) => ({
            bookingTypeId: created.id,
            dayOfWeek: r.dayOfWeek,
            startMinute: r.startMinute,
            endMinute: r.endMinute,
          })),
        });
      }

      return created;
    });

    return this.getBookingType(type.id);
  }

  async updateBookingType(id: string, dto: UpsertBookingTypeDto) {
    this.validateAvailabilityRules(dto.availabilityRules);
    const current = await this.prisma.bookingType.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Booking type not found');

    const slug = normalizeSlug(dto.slug);
    if (slug !== current.slug) {
      const conflict = await this.prisma.bookingType.findUnique({ where: { slug } });
      if (conflict) throw new ConflictException('A booking type with this slug already exists');
    }

    if (dto.hostUserId) await this.assertHostUser(dto.hostUserId);

    await this.prisma.$transaction(async (tx) => {
      await tx.bookingType.update({
        where: { id },
        data: {
          slug,
          name: dto.name.trim(),
          brand: dto.brand?.trim() || null,
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.hostUserId !== undefined && { hostUserId: dto.hostUserId }),
          ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
          ...(dto.minNoticeHours !== undefined && { minNoticeHours: dto.minNoticeHours }),
          ...(dto.maxDaysAhead !== undefined && { maxDaysAhead: dto.maxDaysAhead }),
          ...(dto.timezone !== undefined && { timezone: dto.timezone }),
          ...(dto.publicPageUrl !== undefined && {
            publicPageUrl: normalizePublicPageUrl(dto.publicPageUrl),
          }),
          ...(dto.calendarEventTitle !== undefined && {
            calendarEventTitle: dto.calendarEventTitle.trim(),
          }),
          ...(dto.createLead !== undefined && { createLead: dto.createLead }),
          ...(dto.leadStage !== undefined && { leadStage: dto.leadStage }),
          ...(dto.leadSource !== undefined && { leadSource: dto.leadSource }),
          ...(dto.pipelineNoteTitle !== undefined && {
            pipelineNoteTitle: dto.pipelineNoteTitle?.trim() || null,
          }),
          ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.isBillable !== undefined && { isBillable: dto.isBillable }),
          ...(dto.paymentRequired !== undefined && { paymentRequired: dto.paymentRequired }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });

      if (dto.availabilityRules) {
        await tx.bookingAvailabilityRule.deleteMany({ where: { bookingTypeId: id } });
        if (dto.availabilityRules.length > 0) {
          await tx.bookingAvailabilityRule.createMany({
            data: dto.availabilityRules.map((r) => ({
              bookingTypeId: id,
              dayOfWeek: r.dayOfWeek,
              startMinute: r.startMinute,
              endMinute: r.endMinute,
            })),
          });
        }
      }
    });

    return this.getBookingType(id);
  }

  async deleteBookingType(id: string) {
    const type = await this.prisma.bookingType.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });
    if (!type) throw new NotFoundException('Booking type not found');
    if (type._count.bookings > 0) {
      throw new BadRequestException(
        'Cannot delete a booking type that has bookings — deactivate it instead',
      );
    }
    await this.prisma.bookingType.delete({ where: { id } });
    return { deleted: true };
  }

  private async requireActiveType(slug: string): Promise<BookingTypeWithRules> {
    const normalized = normalizeSlug(slug);
    const type = await this.prisma.bookingType.findUnique({
      where: { slug: normalized },
      include: {
        availabilityRules: true,
        host: { select: { email: true, name: true, firstName: true } },
      },
    });
    if (!type || !type.isActive) {
      throw new NotFoundException('Booking type not found');
    }
    return type;
  }

  private validateAvailabilityRules(
    rules: UpsertBookingTypeDto['availabilityRules'],
  ) {
    if (!rules) return;
    for (const rule of rules) {
      if (rule.startMinute >= rule.endMinute) {
        throw new BadRequestException('Availability end must be after start');
      }
    }
  }

  private async assertHostUser(hostUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: hostUserId } });
    if (!user) throw new BadRequestException('Host user not found');
  }

  private async defaultHostUserId(): Promise<string> {
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
    type: BookingType,
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
    const noteTitle = type.pipelineNoteTitle ?? type.name;
    const artifacts: Prisma.ArtifactCreateWithoutLeadInput[] = [
      {
        type: ArtifactType.NOTE,
        title: `${noteTitle} — ${callDate}`,
        content: `<p>${escapeHtml(type.name)} booked via ${escapeHtml(type.publicPageUrl)}.</p>`,
      },
    ];

    const guestMessage = dto.guestMessage?.trim();
    if (guestMessage) {
      artifacts.push({
        type: ArtifactType.NOTE,
        title: `${noteTitle} note`,
        content: `<p>${escapeHtml(guestMessage)}</p>`,
      });
    }

    const leadFields = {
      organization: org,
      primaryContact: dto.guestName.trim(),
      email,
      ...(website ? { website } : {}),
      stage: type.leadStage,
      source: type.leadSource,
      nextAction: `${type.name} scheduled`,
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
          stage: lead.stage === LeadStage.NEW_LEAD ? type.leadStage : lead.stage,
          source: lead.source ?? type.leadSource,
          nextAction: `${type.name} scheduled`,
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

  private async syncGoogleCalendarEvent(booking: Booking, type: BookingTypeWithRules) {
    const hostName = type.host.name ?? type.host.firstName ?? 'UpStart';
    const googleEventId = await this.googleCalendar.createBookingEvent({
      booking,
      hostEmail: type.host.email,
      hostName,
      timeZone: type.timezone,
      title: type.calendarEventTitle,
    });
    if (googleEventId) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: { googleEventId },
      });
    }
  }

  private async sendConfirmationEmails(booking: Booking, type: BookingTypeWithRules) {
    const displayTz = booking.guestTimezone ?? type.timezone;
    const when = formatSlotLabel(booking.startAt, displayTz);
    const cancelUrl = `${normalizePublicPageUrl(type.publicPageUrl)}?cancel=${booking.cancelToken}`;
    const hostName = type.host.name ?? type.host.firstName ?? 'Host';
    const fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || 'hello@heyupstart.com';

    const guestHtml = buildBookingEmailHtml({
      title: 'Booking confirmed',
      greeting: `Hi ${booking.guestName},`,
      intro: `Your ${type.name} is confirmed.`,
      facts: [
        { label: 'When', value: when },
        { label: 'Meeting', value: type.name },
      ],
      extraHtml: `<p style="margin:20px 0 0;font-size:14px;color:#6b6b6b;"><a href="${escapeHtml(cancelUrl)}" style="color:#5469d4;font-weight:600;text-decoration:none;">Cancel or rebook this meeting.</a></p>`,
    });

    const hostHtml = buildBookingEmailHtml({
      title: 'New booking',
      greeting: `Hi ${hostName},`,
      intro: `${booking.guestName}${booking.guestOrg ? ` (${booking.guestOrg})` : ''} booked ${type.name}.`,
      facts: [
        { label: 'When', value: when },
        { label: 'Guest', value: booking.guestName },
      ],
      extraHtml: `${booking.guestMessage ? `<p style="margin:20px 0 0;padding-left:12px;border-left:3px solid #7c3aed;color:#6b6b6b;font-size:14px;line-height:1.5;">${escapeHtml(booking.guestMessage)}</p>` : ''}<p style="margin:20px 0 0;font-size:14px;color:#6b6b6b;">Guest email: <a href="mailto:${escapeHtml(booking.guestEmail)}" style="color:#5469d4;font-weight:600;text-decoration:none;">${escapeHtml(booking.guestEmail)}</a></p>`,
    });

    const ics = buildBookingIcs({
      uid: `booking-${booking.id}@${fromEmail.split('@')[1] ?? 'example.com'}`,
      startAt: booking.startAt,
      endAt: booking.endAt,
      title: type.calendarEventTitle,
      description: booking.guestMessage ?? type.name,
      organizerEmail: fromEmail,
      organizerName: hostName,
      attendeeEmail: booking.guestEmail,
      attendeeName: booking.guestName,
    });

    const guestResult = await this.mail.sendWithAttachment({
      to: booking.guestEmail,
      subject: `Confirmed: ${type.name} on ${when}`,
      html: guestHtml,
      attachment: {
        filename: 'booking.ics',
        content: Buffer.from(ics, 'utf8'),
        contentType: 'text/calendar; method=REQUEST',
      },
    });

    if (!guestResult.sent) {
      this.logger.warn(`Guest confirmation email failed: ${guestResult.error}`);
    }

    const hostResult = await this.mail.sendRaw({
      to: type.host.email,
      subject: `New booking: ${type.name} — ${booking.guestName} — ${when}`,
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

  private toBookingTypeDto(
    type: BookingType & {
      availabilityRules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
      host: { email: string; name: string | null; firstName: string | null };
      _count?: { bookings: number };
    },
  ) {
    return {
      id: type.id,
      slug: type.slug,
      name: type.name,
      brand: type.brand,
      isActive: type.isActive,
      hostUserId: type.hostUserId,
      hostEmail: type.host.email,
      hostName: type.host.name ?? type.host.firstName,
      durationMin: type.durationMin,
      minNoticeHours: type.minNoticeHours,
      maxDaysAhead: type.maxDaysAhead,
      timezone: type.timezone,
      publicPageUrl: type.publicPageUrl,
      calendarEventTitle: type.calendarEventTitle,
      createLead: type.createLead,
      leadStage: type.leadStage,
      leadSource: type.leadSource,
      pipelineNoteTitle: type.pipelineNoteTitle,
      priceCents: type.priceCents,
      currency: type.currency,
      isBillable: type.isBillable,
      paymentRequired: type.paymentRequired,
      sortOrder: type.sortOrder,
      bookingCount: type._count?.bookings ?? 0,
      availabilityRules: type.availabilityRules.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
      })),
    };
  }
}
