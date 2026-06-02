import { Global, Module } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import { DevAuthGuard } from './dev-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequireWorkspaceAdminGuard } from './require-workspace-admin.guard';
import { RequireSuperGuard } from './require-super.guard';

@Global()
@Module({
  providers: [
    DevAuthGuard,
    JwtAuthGuard,
    AppAuthGuard,
    RequireWorkspaceAdminGuard,
    RequireSuperGuard,
  ],
  exports: [
    DevAuthGuard,
    JwtAuthGuard,
    AppAuthGuard,
    RequireWorkspaceAdminGuard,
    RequireSuperGuard,
  ],
})
export class AuthModule {}
