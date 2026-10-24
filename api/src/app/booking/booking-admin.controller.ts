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
import { BookingService } from './booking.service';
import { UpsertBookingTypeDto } from './dto/upsert-booking-type.dto';
import { AccessGuard, Area, Action } from '../access/access.guard';

@ApiTags('booking')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('bookings')
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

  @Action('edit')
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
  listTypes() {
    return this.booking.listBookingTypes();
  }

  @Get('types/:id')
  getType(@Param('id') id: string) {
    return this.booking.getBookingType(id);
  }

  @Action('setup')
  @Post('types')
  createType(@Body() dto: UpsertBookingTypeDto) {
    return this.booking.createBookingType(dto);
  }

  @Action('setup')
  @Put('types/:id')
  updateType(@Param('id') id: string, @Body() dto: UpsertBookingTypeDto) {
    return this.booking.updateBookingType(id, dto);
  }

  @Action('setup')
  @Delete('types/:id')
  deleteType(@Param('id') id: string) {
    return this.booking.deleteBookingType(id);
  }
}
