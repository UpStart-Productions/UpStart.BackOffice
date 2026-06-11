import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { BookingService } from './booking.service';
import { UpsertBookingTypeDto } from './dto/upsert-booking-type.dto';

@ApiTags('booking')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('booking/admin')
export class BookingAdminController {
  constructor(private readonly booking: BookingService) {}

  @Get('bookings')
  list(
    @Query('status') status?: BookingStatus,
    @Query('bookingTypeId') bookingTypeId?: string,
  ) {
    return this.booking.listBookings(status, bookingTypeId);
  }

  @Post('cancel/:id')
  async cancel(@Param('id') id: string) {
    const bookings = await this.booking.listBookings();
    const match = bookings.find((b) => b.id === id);
    if (!match) throw new NotFoundException('Booking not found');
    return this.booking.cancelByToken(match.cancelToken);
  }

  @Delete('bookings/:id')
  deleteBooking(@Param('id') id: string) {
    return this.booking.deleteBooking(id);
  }

  @Get('types')
  @UseGuards(RequireAdminGuard)
  listTypes() {
    return this.booking.listBookingTypes();
  }

  @Get('types/:id')
  @UseGuards(RequireAdminGuard)
  getType(@Param('id') id: string) {
    return this.booking.getBookingType(id);
  }

  @Post('types')
  @UseGuards(RequireAdminGuard)
  createType(@Body() dto: UpsertBookingTypeDto) {
    return this.booking.createBookingType(dto);
  }

  @Put('types/:id')
  @UseGuards(RequireAdminGuard)
  updateType(@Param('id') id: string, @Body() dto: UpsertBookingTypeDto) {
    return this.booking.updateBookingType(id, dto);
  }

  @Delete('types/:id')
  @UseGuards(RequireAdminGuard)
  deleteType(@Param('id') id: string) {
    return this.booking.deleteBookingType(id);
  }
}
