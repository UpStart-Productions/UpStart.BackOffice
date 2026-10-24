import { Global, Module } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireAdminGuard } from './require-admin.guard';

@Global()
@Module({
  providers: [DevAuthGuard, JwtAuthGuard, AppAuthGuard, RequireAdminGuard],
  exports: [DevAuthGuard, JwtAuthGuard, AppAuthGuard, RequireAdminGuard],
})
export class AuthModule {}
