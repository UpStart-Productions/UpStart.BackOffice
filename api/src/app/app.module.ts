import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CognitoModule } from './cognito/cognito.module';
import { CommonModule } from './common/common.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';
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
    InvoicesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
