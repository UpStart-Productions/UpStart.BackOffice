import { Module } from '@nestjs/common';
import { NotificationAudienceService } from './notification-audience.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDeliveryService, NotificationAudienceService],
  exports: [NotificationsService, NotificationDeliveryService, NotificationAudienceService],
})
export class NotificationsModule {}
