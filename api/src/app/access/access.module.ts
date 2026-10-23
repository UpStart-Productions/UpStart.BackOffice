import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AreaGuard } from './area.guard';

@Global()
@Module({ providers: [AccessService, AreaGuard], exports: [AccessService, AreaGuard] })
export class AccessModule {}
