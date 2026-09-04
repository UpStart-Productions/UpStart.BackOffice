import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CognitoModule } from './cognito/cognito.module';
import { CommonModule } from './common/common.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ExpensesModule } from './expenses/expenses.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';
import { LeadsModule } from './leads/leads.module';
import { PortalModule } from './portal/portal.module';
import { ServiceKeysModule } from './service-keys/service-keys.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { AsanaModule } from './asana/asana.module';
import { BookingModule } from './booking/booking.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';
import { SearchModule } from './search/search.module';
import { NetworkModule } from './network/network.module';
import { OrganizationProfileModule } from './organization-profile/organization-profile.module';
import { PayModule } from './pay/pay.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    PrismaModule,
    StorageModule,
    UploadsModule,
    CommonModule,
    AuthModule,
    CognitoModule,
    MailModule,
    UsersModule,
    ClientsModule,
    ProjectsModule,
    TimeEntriesModule,
    ExpensesModule,
    InvoicesModule,
    LeadsModule,
    ArtifactsModule,
    PortalModule,
    ServiceKeysModule,
    AsanaModule,
    BookingModule,
    GoogleCalendarModule,
    SearchModule,
    NetworkModule,
    OrganizationProfileModule,
    PayModule,
    AccountingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
