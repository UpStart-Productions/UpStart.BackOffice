import { Module } from '@nestjs/common';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { LeadsController } from './leads.controller';
import { LeadsIngestController } from './leads-ingest.controller';

@Module({
  imports:     [ServiceKeysModule],
  controllers: [LeadsController, LeadsIngestController],
})
export class LeadsModule {}
