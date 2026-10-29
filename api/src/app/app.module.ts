import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ClientFieldsModule } from './client-fields/client-fields.module';
import { CognitoModule } from './cognito/cognito.module';
import { CommonModule } from './common/common.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { AccessModule } from './access/access.module';
import { RolesModule } from './roles/roles.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { ExpensePaymentMethodsModule } from './expense-payment-methods/expense-payment-methods.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';
import { LeadsModule } from './leads/leads.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { PortalModule } from './portal/portal.module';
import { ServiceKeysModule } from './service-keys/service-keys.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { AsanaModule } from './asana/asana.module';
import { BookingModule } from './booking/booking.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SearchModule } from './search/search.module';
import { OrganizationProfileModule } from './organization-profile/organization-profile.module';
import { PayModule } from './pay/pay.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TaskManagerModule } from './task-manager/task-manager.module';
import { InvitesModule } from './invites/invites.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
import { CommunicationsModule } from './communications/communications.module';
import { HelpAgentModule } from './help-agent/help-agent.module';
import { SupportModule } from './support/support.module';
import { CrmTagsModule } from './crm-tags/crm-tags.module';
import { RecordAttributionMiddleware } from './common/record-attribution.middleware';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    PrismaModule,
    TenancyModule,
    AccessModule,
    RolesModule,
    StorageModule,
    UploadsModule,
    CommonModule,
    AuthModule,
    CognitoModule,
    MailModule,
    UsersModule,
    ClientsModule,
    ClientFieldsModule,
    ProjectsModule,
    TimeEntriesModule,
    ExpensesModule,
    ExpenseCategoriesModule,
    ExpensePaymentMethodsModule,
    InvoicesModule,
    LeadsModule,
    PipelinesModule,
    ArtifactsModule,
    PortalModule,
    ServiceKeysModule,
    AsanaModule,
    BookingModule,
    GoogleCalendarModule,
    SearchModule,
    OrganizationProfileModule,
    PayModule,
    AccountingModule,
    NotificationsModule,
    TaskManagerModule,
    InvitesModule,
    PasswordResetModule,
    CommunicationsModule,
    HelpAgentModule,
    SupportModule,
    CrmTagsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RecordAttributionMiddleware, RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
