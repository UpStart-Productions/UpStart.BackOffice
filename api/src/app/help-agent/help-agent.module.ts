import { Module } from '@nestjs/common';
import { RequireSuperGuard } from '../tenancy/require-super.guard';
import { HelpAgentController } from './help-agent.controller';
import { HelpAgentService } from './help-agent.service';

@Module({
  controllers: [HelpAgentController],
  providers: [HelpAgentService, RequireSuperGuard],
  exports: [HelpAgentService],
})
export class HelpAgentModule {}
