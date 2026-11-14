import { Module } from '@nestjs/common';
import { OrganizationProfileController } from './organization-profile.controller';
import { OrganizationProfileService } from './organization-profile.service';
import { WeatherService } from './weather.service';

@Module({
  controllers: [OrganizationProfileController],
  providers: [OrganizationProfileService, WeatherService],
  exports: [OrganizationProfileService],
})
export class OrganizationProfileModule {}
