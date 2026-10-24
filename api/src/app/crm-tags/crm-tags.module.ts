import { Module } from '@nestjs/common';
import { CrmTagsController } from './crm-tags.controller';

@Module({ controllers: [CrmTagsController] })
export class CrmTagsModule {}
