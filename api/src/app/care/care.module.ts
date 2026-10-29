import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CareAccessService } from './care-access.service';
import { CareFormsController } from './care-forms.controller';
import { CareLinksService } from './care-links.service';
import { CareNotifyService } from './care-notify.service';
import { CarePublicController } from './care-public.controller';
import { CarePublicService } from './care-public.service';
import { CareRecordsController } from './care-records.controller';

/** Care module (per-tenant): Intake form and Care profile, records per organization, public links. */
@Module({
  imports: [NotificationsModule],
  controllers: [CareFormsController, CareRecordsController, CarePublicController],
  providers: [CareAccessService, CareLinksService, CareNotifyService, CarePublicService],
})
export class CareModule {}
