import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantsController } from './tenants.controller';
import { PublicTenantService } from './public-tenant.service';
import { TenantInterceptor } from './tenant.interceptor';

@Global()
@Module({
  controllers: [TenantsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }, PublicTenantService],
  exports: [PublicTenantService],
})
export class TenancyModule {}
