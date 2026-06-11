import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DEFAULT_BOOKING_SLUG, BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

/** Public booking — no auth (website widgets). */
@ApiTags('booking')
@Controller('booking')
export class BookingPublicController {
  constructor(private readonly booking: BookingService) {}

  /** @deprecated Use GET /booking/:slug/meta */
  @Get('meta')
  legacyMeta() {
    return this.booking.getPublicMeta(DEFAULT_BOOKING_SLUG);
  }

  /** @deprecated Use GET /booking/:slug/slots */
  @Get('slots')
  legacySlots(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tz') tz?: string,
  ) {
    const fromIso = from ?? new Date().toISOString();
    const toIso = to ?? new Date(Date.now() + 14 * 86400_000).toISOString();
    return this.booking.getSlots(DEFAULT_BOOKING_SLUG, fromIso, toIso, tz);
  }

  /** @deprecated Use POST /booking/:slug */
  @Post()
  legacyCreate(@Body() body: CreateBookingDto) {
    return this.booking.createBooking(DEFAULT_BOOKING_SLUG, body);
  }

  @Get('by-token/:token')
  byToken(@Param('token') token: string) {
    return this.booking.getByToken(token);
  }

  @Post('cancel/:token')
  cancel(@Param('token') token: string) {
    return this.booking.cancelByToken(token);
  }

  @Get(':slug/meta')
  meta(@Param('slug') slug: string) {
    return this.booking.getPublicMeta(slug);
  }

  @Get(':slug/slots')
  slots(
    @Param('slug') slug: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tz') tz?: string,
  ) {
    const fromIso = from ?? new Date().toISOString();
    const toIso = to ?? new Date(Date.now() + 14 * 86400_000).toISOString();
    return this.booking.getSlots(slug, fromIso, toIso, tz);
  }

  @Post(':slug')
  create(@Param('slug') slug: string, @Body() body: CreateBookingDto) {
    return this.booking.createBooking(slug, body);
  }
}
