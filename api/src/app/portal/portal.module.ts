import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalSessionService } from './portal-session.service';
import { PortalSessionGuard } from './portal-session.guard';

@Module({
  controllers: [PortalController],
  providers: [PortalSessionService, PortalSessionGuard],
  exports: [PortalSessionService],
})
export class PortalModule {}
