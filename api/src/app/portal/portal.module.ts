import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PortalController } from './portal.controller';
import { PortalSessionGuard } from './portal-session.guard';
import { PortalSessionService } from './portal-session.service';

@Module({
  imports: [InvoicesModule],
  controllers: [PortalController],
  providers: [PortalSessionService, PortalSessionGuard],
  exports: [PortalSessionService],
})
export class PortalModule {}
