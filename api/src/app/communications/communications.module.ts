import { Module } from '@nestjs/common';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { CommunicationsIngestController } from './communications-ingest.controller';
import { CommunicationsIngestService } from './communications-ingest.service';
import { InboundAliasService } from './inbound-alias.service';
import { InboundRawEmailService } from './inbound-raw-email.service';

// PrismaModule and StorageModule are @Global, so they need no import here.
@Module({
  imports: [ServiceKeysModule],
  controllers: [CommunicationsIngestController],
  providers: [InboundAliasService, InboundRawEmailService, CommunicationsIngestService],
  exports: [InboundAliasService],
})
export class CommunicationsModule {}
