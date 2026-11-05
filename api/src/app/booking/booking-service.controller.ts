import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { bookingGuestDetails } from './booking-guest-email.util';

/** How long after booking it can be read this way (the website emails right after booking). */
const READ_WINDOW_MS = 24 * 60 * 60 * 1000;

export type BookingServiceDto = {
  id: string;
  /** True while Back Office still emails the guest itself; the caller should not send a second confirmation. */
  sendGuestConfirmation: boolean;
  organizationName: string;
  meetingName: string;
  when: string;
  timeZone: string;
  timeZoneLabel: string;
  startAt: string;
  endAt: string;
  durationMin: number;
  guest: { name: string; firstName: string; email: string; organization: string };
  hostName: string;
  cancelUrl: string;
  calendarLinks: { google: string; outlook: string };
  ics: string;
};

/**
 * Bookings for services (e.g. the website's email sender, which sends the guest confirmation for booking types
 * with "Send guest confirmation email" off): read with a service key (x-api-key), only in the key's tenant, only
 * confirmed bookings and only within a day of booking. The booking id isn't a secret on its own.
 */
@ApiTags('booking')
@Controller('service/bookings')
@UseGuards(ServiceKeyGuard)
export class BookingServiceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async booking(@Param('id') id: string): Promise<BookingServiceDto> {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: { bookingType: { include: { host: { select: { name: true, firstName: true } } } } },
    });
    if (!b || b.status !== BookingStatus.CONFIRMED || Date.now() - b.createdAt.getTime() > READ_WINDOW_MS) {
      throw new NotFoundException('Booking not found');
    }
    const type = b.bookingType;
    const fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || 'hello@heyupstart.com';
    const details = bookingGuestDetails({ booking: b, type, fromEmail });
    const profile = await this.prisma.organizationProfile.findFirst({ select: { companyName: true } });
    const name = b.guestName.trim();
    return {
      id: b.id,
      sendGuestConfirmation: type.sendGuestConfirmation,
      organizationName: profile?.companyName?.trim() ?? '',
      meetingName: type.name,
      when: details.when,
      timeZone: details.timeZone,
      timeZoneLabel: details.timeZoneLabel,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      durationMin: type.durationMin,
      guest: { name, firstName: name.split(/\s+/)[0] ?? '', email: b.guestEmail, organization: b.guestOrg ?? '' },
      hostName: details.hostName,
      cancelUrl: details.cancelUrl,
      calendarLinks: details.calendarLinks,
      ics: details.ics,
    };
  }
}
