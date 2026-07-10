import { Module } from '@nestjs/common';
import { NetworkCompaniesController } from './network-companies.controller';
import { NetworkContactsController } from './network-contacts.controller';
import { NetworkContactAvatarService } from './network-contact-avatar.service';

@Module({
  controllers: [NetworkCompaniesController, NetworkContactsController],
  providers: [NetworkContactAvatarService],
})
export class NetworkModule {}
