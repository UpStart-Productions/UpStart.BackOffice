import { Global, Module } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireAdminGuard } from './require-admin.guard';
import { StaffAuthGuard } from './staff-auth.guard';

@Global()
@Module({
  providers: [
    DevAuthGuard,
    JwtAuthGuard,
    AppAuthGuard,
    StaffAuthGuard,
    RequireAdminGuard,
  ],
  exports: [
    DevAuthGuard,
    JwtAuthGuard,
    AppAuthGuard,
    StaffAuthGuard,
    RequireAdminGuard,
  ],
})
export class AuthModule {}
