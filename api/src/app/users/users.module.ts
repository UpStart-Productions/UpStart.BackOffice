import { Module } from '@nestjs/common';
import { CognitoModule } from '../cognito/cognito.module';
import { UsersController } from './users.controller';

@Module({
  imports: [CognitoModule],
  controllers: [UsersController],
})
export class UsersModule {}
