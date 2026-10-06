import { Global, Module } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireAdminGuard } from './require-admin.guard';
import { StaffAuthGuard } from './staff-auth.guard';
import { TaskManagerAuthGuard } from './task-manager-auth.guard';

@Global()
@Module({
  providers: [
    DevAuthGuard,
    JwtAuthGuard,
    AppAuthGuard,
    StaffAuthGuard,
    RequireAdminGuard,
    TaskManagerAuthGuard,
  ],
  exports: [
    DevAuthGuard,
    JwtAuthGuard,
    AppAuthGuard,
    StaffAuthGuard,
    RequireAdminGuard,
    TaskManagerAuthGuard,
  ],
})
export class AuthModule {}
