import { Module } from '@nestjs/common';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { BookingAdminController } from './booking-admin.controller';
import { BookingPublicController } from './booking-public.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [GoogleCalendarModule],
  controllers: [BookingPublicController, BookingAdminController],
  providers: [BookingService],
})
export class BookingModule {}
