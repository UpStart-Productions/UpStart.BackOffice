import { Module } from '@nestjs/common';
import { NetworkCompaniesController } from './network-companies.controller';
import { NetworkContactsController } from './network-contacts.controller';

@Module({
  controllers: [NetworkCompaniesController, NetworkContactsController],
})
export class NetworkModule {}
