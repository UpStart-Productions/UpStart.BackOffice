import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisitReportsController } from './visit-reports.controller';
import { VisitTypesController } from './visit-types.controller';
import { VisitsController } from './visits.controller';

/** Schedule (core): visits, visit types and visit reports. Visit forms are client forms (forms/client-forms). */
@Module({
  imports: [NotificationsModule],
  controllers: [VisitTypesController, VisitReportsController, VisitsController],
})
export class VisitsModule {}
