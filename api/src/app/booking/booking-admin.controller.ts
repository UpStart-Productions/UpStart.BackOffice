import {
  Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { BookingService } from './booking.service';
import { UpdateBookingSettingsDto } from './dto/update-booking-settings.dto';

@ApiTags('booking')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('booking/admin')
export class BookingAdminController {
  constructor(private readonly booking: BookingService) {}

  @Get('bookings')
  list(@Query('status') status?: BookingStatus) {
    return this.booking.listBookings(status);
  }

  @Get('settings')
  @UseGuards(RequireAdminGuard)
  settings() {
    return this.booking.getSettings();
  }

  @Post('settings')
  @UseGuards(RequireAdminGuard)
  updateSettings(@Body() dto: UpdateBookingSettingsDto) {
    return this.booking.updateSettings(dto);
  }

  @Post('cancel/:id')
  async cancel(@Param('id') id: string) {
    const booking = await this.booking.listBookings();
    const match = booking.find((b) => b.id === id);
    if (!match) throw new NotFoundException('Booking not found');
    return this.booking.cancelByToken(match.cancelToken);
  }
}
