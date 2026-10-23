import { Module } from '@nestjs/common';
import { CognitoModule } from '../cognito/cognito.module';
import { InvitesModule } from '../invites/invites.module';
import { UsersController } from './users.controller';

@Module({
  imports: [CognitoModule, InvitesModule],
  controllers: [UsersController],
})
export class UsersModule {}
