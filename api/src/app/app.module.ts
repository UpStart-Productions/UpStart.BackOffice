import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CommonModule } from './common/common.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { UsersModule } from './users/users.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { WorkspaceMiddleware } from './workspace/workspace.middleware';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AuthModule,
    MailModule,
    WorkspaceModule,
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
      .forRoutes({ path: '*', method: RequestMethod.ALL })
      .apply(WorkspaceMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
