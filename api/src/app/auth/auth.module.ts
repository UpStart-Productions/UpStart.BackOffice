import { Global, Module } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireSuperGuard } from './require-super.guard';

@Global()
@Module({
  providers: [DevAuthGuard, JwtAuthGuard, AppAuthGuard, RequireSuperGuard],
  exports: [DevAuthGuard, JwtAuthGuard, AppAuthGuard, RequireSuperGuard],
})
export class AuthModule {}
