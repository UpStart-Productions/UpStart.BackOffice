import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

/** Public discovery-chat booking — no auth (heyupstart.com). */
@ApiTags('booking')
@Controller('booking')
export class BookingPublicController {
  constructor(private readonly booking: BookingService) {}

  @Get('meta')
  meta() {
    return this.booking.getPublicMeta();
  }

  @Get('slots')
  slots(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tz') tz?: string,
  ) {
    const fromIso = from ?? new Date().toISOString();
    const toIso = to ?? new Date(Date.now() + 14 * 86400_000).toISOString();
    return this.booking.getSlots(fromIso, toIso, tz);
  }

  @Post()
  create(@Body() body: CreateBookingDto) {
    return this.booking.createBooking(body);
  }

  @Get('by-token/:token')
  byToken(@Param('token') token: string) {
    return this.booking.getByToken(token);
  }

  @Post('cancel/:token')
  cancel(@Param('token') token: string) {
    return this.booking.cancelByToken(token);
  }
}
