import { Module } from '@nestjs/common';
import { ClientFieldsController } from './client-fields.controller';

@Module({ controllers: [ClientFieldsController] })
export class ClientFieldsModule {}
