import { Module } from '@nestjs/common';
import { RequireSuperGuard } from '../tenancy/require-super.guard';
import { HelpAgentController } from './help-agent.controller';
import { HelpAgentService } from './help-agent.service';
import { HelpAgentThreadsController } from './help-agent-threads.controller';
import { HelpAgentThreadsService } from './help-agent-threads.service';

@Module({
  controllers: [HelpAgentController, HelpAgentThreadsController],
  providers: [HelpAgentService, HelpAgentThreadsService, RequireSuperGuard],
  exports: [HelpAgentService],
})
export class HelpAgentModule {}
