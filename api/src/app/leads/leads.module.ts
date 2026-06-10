import { Module } from '@nestjs/common';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { LeadsController } from './leads.controller';
import { LeadsAutomationController } from './leads-automation.controller';
import { LeadsIngestController } from './leads-ingest.controller';

@Module({
  imports:     [ServiceKeysModule],
  // LeadsAutomationController must come before LeadsController so that
  // /leads/automation/* matches before LeadsController's /leads/:id route.
  controllers: [LeadsAutomationController, LeadsController, LeadsIngestController],
})
export class LeadsModule {}
