import { Module } from '@nestjs/common';
import { OrganizationProfileController } from './organization-profile.controller';
import { OrganizationProfileService } from './organization-profile.service';

@Module({
  controllers: [OrganizationProfileController],
  providers: [OrganizationProfileService],
  exports: [OrganizationProfileService],
})
export class OrganizationProfileModule {}
