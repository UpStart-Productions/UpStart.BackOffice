import { Module } from '@nestjs/common';
import { ServiceKeysModule } from '../service-keys/service-keys.module';
import { LeadsController } from './leads.controller';

@Module({
  imports:     [ServiceKeysModule],
  controllers: [LeadsController],
})
export class LeadsModule {}
