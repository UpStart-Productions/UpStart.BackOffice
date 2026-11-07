import { Module } from '@nestjs/common';
import { NotificationAudienceService } from './notification-audience.service';
import { PipelineTrackerNotifyService } from './pipeline-tracker-notify.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliveryService,
    NotificationAudienceService,
    PipelineTrackerNotifyService,
  ],
  exports: [
    NotificationsService,
    NotificationDeliveryService,
    NotificationAudienceService,
    PipelineTrackerNotifyService,
  ],
})
export class NotificationsModule {}
