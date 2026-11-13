import { Module, forwardRef } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PayModule } from '../pay/pay.module';
import { StorageModule } from '../storage/storage.module';
import { PortalController } from './portal.controller';
import { PortalSessionGuard } from './portal-session.guard';
import { PortalSessionService } from './portal-session.service';

@Module({
  imports: [StorageModule, PayModule, forwardRef(() => InvoicesModule)],
  controllers: [PortalController],
  providers: [PortalSessionService, PortalSessionGuard],
  exports: [PortalSessionService],
})
export class PortalModule {}
