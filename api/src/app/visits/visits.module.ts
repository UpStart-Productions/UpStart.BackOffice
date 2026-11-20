import { Module } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VisitReportsController } from './visit-reports.controller';
import { VisitTypesController } from './visit-types.controller';
import { VisitsController } from './visits.controller';

/** Schedule (core): visits, visit types and visit reports. Visit forms are client forms (forms/client-forms). */
@Module({
  imports: [NotificationsModule, FormsModule],
  controllers: [VisitTypesController, VisitReportsController, VisitsController],
})
export class VisitsModule {}
