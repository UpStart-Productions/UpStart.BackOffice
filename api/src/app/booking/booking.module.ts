import { Module } from '@nestjs/common';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { BookingAdminController } from './booking-admin.controller';
import { BookingPublicController } from './booking-public.controller';
import { BookingServiceController } from './booking-service.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [GoogleCalendarModule, ServiceKeysModule],
  controllers: [BookingPublicController, BookingAdminController, BookingServiceController],
  providers: [BookingService],
})
export class BookingModule {}
