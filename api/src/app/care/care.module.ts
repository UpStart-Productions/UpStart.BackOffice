import { Module } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CareAccessService } from './care-access.service';
import { CareFormDestination } from './care-destination';
import { CareFormsController } from './care-forms.controller';
import { CareNotifyService } from './care-notify.service';
import { CareRecordsController } from './care-records.controller';
import { CareShiftsController } from './care-shifts.controller';
import { CareVisitsController } from './care-visits.controller';

/**
 * Care module (per-tenant): Intake form, Care profile and Visit log on the form engine, visits (tied to time),
 * the schedule, and where Care's public form submissions go.
 */
@Module({
  imports: [NotificationsModule, FormsModule],
  controllers: [CareFormsController, CareRecordsController, CareVisitsController, CareShiftsController],
  providers: [CareAccessService, CareNotifyService, CareFormDestination],
})
export class CareModule {}
