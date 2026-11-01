import { Module } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CareClientsController } from './care-clients.controller';
import { CareReportsController } from './care-reports.controller';
import { CareShiftsController } from './care-shifts.controller';
import { CareVisitsController } from './care-visits.controller';

/**
 * Care module (per-tenant): who is in care, visits (tied to time, with the visit checklist from Forms) and the
 * schedule. Intake and profile forms are ordinary client forms in Forms.
 */
@Module({
  imports: [NotificationsModule, FormsModule],
  controllers: [CareClientsController, CareReportsController, CareVisitsController, CareShiftsController],
})
export class CareModule {}
