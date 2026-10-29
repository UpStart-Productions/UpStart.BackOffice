import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CareAccessService } from './care-access.service';
import { CareFormsController } from './care-forms.controller';
import { CareLinksService } from './care-links.service';
import { CareNotifyService } from './care-notify.service';
import { CarePublicController } from './care-public.controller';
import { CarePublicService } from './care-public.service';
import { CareRecordsController } from './care-records.controller';
import { CareShiftsController } from './care-shifts.controller';
import { CareVisitsController } from './care-visits.controller';

/** Care module (per-tenant): Intake form and Care profile, visits (tied to time), schedule, public links. */
@Module({
  imports: [NotificationsModule],
  controllers: [CareFormsController, CareRecordsController, CareVisitsController, CareShiftsController, CarePublicController],
  providers: [CareAccessService, CareLinksService, CareNotifyService, CarePublicService],
})
export class CareModule {}
