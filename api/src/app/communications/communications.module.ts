import { Module } from '@nestjs/common';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { CaptureSettingsController } from './capture-settings.controller';
import { CaptureSettingsService } from './capture-settings.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsIngestController } from './communications-ingest.controller';
import { CommunicationsIngestService } from './communications-ingest.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { InboundAliasService } from './inbound-alias.service';
import { InboundRawEmailService } from './inbound-raw-email.service';
import { InteractionsService } from './interactions.service';

// PrismaModule and StorageModule are @Global, so they need no import here.
@Module({
  imports: [ServiceKeysModule],
  controllers: [
    CommunicationsIngestController,
    CommunicationsController,
    ContactsController,
    CaptureSettingsController,
  ],
  providers: [
    InboundAliasService,
    InboundRawEmailService,
    CommunicationsIngestService,
    InteractionsService,
    ContactsService,
    CaptureSettingsService,
  ],
  exports: [InboundAliasService],
})
export class CommunicationsModule {}
